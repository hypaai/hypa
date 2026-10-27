import Foundation

enum CandidateSource {
  case personal
  case corpus
  case neural
}

enum PredictionMode {
  case localOnly
  case hybrid
}

struct Candidate {
  let text: String
  var sources: Set<CandidateSource>
  var personalScore: Float = 0
  var prefixScore: Float = 0
  var ngramScore: Float = 0

  func merged(with other: Candidate) -> Candidate {
    Candidate(
      text: text,
      sources: sources.union(other.sources),
      personalScore: max(personalScore, other.personalScore),
      prefixScore: max(prefixScore, other.prefixScore),
      ngramScore: max(ngramScore, other.ngramScore))
  }
}

struct RankingWeights {
  let personal: Float = 0.40
  let ngram: Float = 0.35
  let prefix: Float = 0.25
}

struct CandidateRanker {
  private let weights = RankingWeights()

  func rank(_ pool: [Candidate]) -> [Candidate] {
    var merged: [String: Candidate] = [:]
    var order: [String] = []
    for candidate in pool where !candidate.text.isEmpty {
      let key = candidate.text.lowercased()
      if let existing = merged[key] {
        merged[key] = existing.merged(with: candidate)
      } else {
        merged[key] = candidate
        order.append(key)
      }
    }
    var scored: [(candidate: Candidate, score: Float, key: String)] = []
    scored.reserveCapacity(order.count)
    for key in order {
      guard let candidate = merged[key] else { continue }
      scored.append((candidate, score(candidate), key))
    }
    scored.sort { $0.score == $1.score ? $0.key < $1.key : $0.score > $1.score }
    return scored.map { $0.candidate }
  }

  func score(_ candidate: Candidate) -> Float {
    candidate.personalScore * weights.personal
      + candidate.ngramScore * weights.ngram
      + candidate.prefixScore * weights.prefix
  }
}

protocol PredictionProvider {
  func provide(context: CursorContext, limit: Int) -> [Candidate]
}

struct PersonalProvider: PredictionProvider {
  private let continuationNgramScore: Float = 1

  let personal: PersonalVocabulary

  func provide(context: CursorContext, limit: Int) -> [Candidate] {
    if !context.currentWord.isEmpty {
      return withoutEcho(
        personal.prefix(context.currentWord, limit: limit).map { word in
          Candidate(
            text: word,
            sources: [.personal],
            personalScore: personal.usageWeight(word),
            prefixScore: 1)
        }, context: context)
    }

    return withoutEcho(
      personal.following(context.previousWord, limit: limit).map { learned in
        Candidate(
          text: learned.word,
          sources: [.personal],
          personalScore: learned.weight,
          ngramScore: continuationNgramScore)
      }, context: context)
  }

  private func withoutEcho(_ candidates: [Candidate], context: CursorContext) -> [Candidate] {
    candidates.filter { $0.text.caseInsensitiveCompare(context.previousWord) != .orderedSame }
  }
}

struct CorpusProvider: PredictionProvider {
  private let contextDepth = 12

  let corpus: CorpusStore
  let personal: PersonalVocabulary

  func provide(context: CursorContext, limit: Int) -> [Candidate] {
    guard corpus.isReady, !context.currentWord.isEmpty else { return [] }

    let typed = TextNormalizer.normalize(context.currentWord)
    guard !typed.isEmpty else { return [] }

    var expected: [String: Float] = [:]
    for learned in personal.following(context.previousWord, limit: contextDepth) {
      expected[TextNormalizer.normalize(learned.word)] = learned.weight
    }

    return corpus.prefix(typed, limit: limit).map { word in
      let normalized = TextNormalizer.normalize(word)
      return Candidate(
        text: word,
        sources: [.corpus],
        personalScore: personal.usageWeight(word),
        prefixScore: Float(typed.count) / Float(max(normalized.count, 1)),
        ngramScore: expected[normalized] ?? 0)
    }
  }
}

final class FuzzyProvider: PredictionProvider {
  private static let minWordLength = 3
  private static let maxWordLength = 16
  private static let maxPrefixScore: Float = 0.5
  private static let contextDepth = 12

  private let corpus: CorpusStore
  private let personal: PersonalVocabulary
  private let onRepairsReady: () -> Void
  private let worker = DispatchQueue(label: "hypa-fuzzy", qos: .userInitiated)

  private let requestedLock = NSLock()
  private var requestedKey: String?

  private var memoKey: String?
  private var memoAlphabet: [Character] = []
  private var memoRepairs: [Repair] = []

  init(corpus: CorpusStore, personal: PersonalVocabulary, onRepairsReady: @escaping () -> Void) {
    self.corpus = corpus
    self.personal = personal
    self.onRepairsReady = onRepairsReady
  }

  func provide(context: CursorContext, limit: Int) -> [Candidate] {
    let typed = context.currentWord
    guard typed.count >= Self.minWordLength, typed.count <= Self.maxWordLength else { return [] }
    guard corpus.isReady else { return [] }
    guard typed.allSatisfy({ $0.isLetter || $0 == "'" }) else { return [] }

    let normalized = TextNormalizer.normalize(typed)
    if corpus.contains(normalized) || personal.contains(normalized) { return [] }

    let alphabet = corpus.alphabet()
    if normalized != memoKey || alphabet != memoAlphabet {
      requestSweep(normalized: normalized, alphabet: alphabet)
      return []
    }

    let contextScores = self.contextScores(previousWord: context.previousWord)
    return memoRepairs.prefix(limit).map { repair in
      Candidate(
        text: matchCapitalization(of: typed, replacement: repair.canonical),
        sources: [.corpus],
        personalScore: repair.familiarity,
        prefixScore: repair.typoFactor * Self.maxPrefixScore,
        ngramScore: contextScores[repair.normalized] ?? 0)
    }
  }

  func reset() {
    memoKey = nil
    memoAlphabet = []
    memoRepairs = []
    requestedLock.lock()
    requestedKey = nil
    requestedLock.unlock()
  }

  private func requestSweep(normalized: String, alphabet: [Character]) {
    requestedLock.lock()
    if normalized == requestedKey {
      requestedLock.unlock()
      return
    }
    requestedKey = normalized
    requestedLock.unlock()

    worker.async { [weak self] in
      guard let self else { return }
      self.requestedLock.lock()
      let stale = normalized != self.requestedKey
      self.requestedLock.unlock()
      if stale { return }

      let repairs = self.sweep(normalized: normalized, alphabet: alphabet)
      DispatchQueue.main.async {
        self.memoKey = normalized
        self.memoAlphabet = alphabet
        self.memoRepairs = repairs
        self.onRepairsReady()
      }
    }
  }

  private func sweep(normalized: String, alphabet: [Character]) -> [Repair] {
    var repairs: [Repair] = []
    var seen = Set<String>()

    TypoCandidates.generate(normalized, alphabet: alphabet) { candidate, typoFactor in
      guard candidate.count >= 2, candidate != normalized, seen.insert(candidate).inserted else {
        return
      }
      guard let canonical = corpus.canonical(candidate) else { return }
      repairs.append(
        Repair(
          canonical: canonical,
          normalized: candidate,
          familiarity: personal.usageWeight(candidate),
          typoFactor: typoFactor))
    }
    return repairs.sorted {
      $0.familiarity == $1.familiarity
        ? $0.typoFactor > $1.typoFactor : $0.familiarity > $1.familiarity
    }
  }

  private func contextScores(previousWord: String) -> [String: Float] {
    guard !previousWord.isEmpty else { return [:] }
    var scores: [String: Float] = [:]
    for learned in personal.following(previousWord, limit: Self.contextDepth) {
      scores[TextNormalizer.normalize(learned.word)] = learned.weight
    }
    return scores
  }

  private struct Repair {
    let canonical: String
    let normalized: String
    let familiarity: Float
    let typoFactor: Float
  }
}

struct SuggestionUiState: Equatable {
  let visible: Bool
  let candidates: [String]
  var modelWords: Set<String> = []

  static let hidden = SuggestionUiState(visible: false, candidates: [])
}

final class PredictionOrchestrator {
  private static let minWordChars = 3
  private static let maxWordChars = 24

  private let neural: TinyKeysService
  private let scheduler: InferenceScheduler
  private let providers: [PredictionProvider]
  private let maxSuggestions: Int
  private let mode: PredictionMode
  private let isKnownWord: (String) -> Bool
  private let listener: (SuggestionUiState) -> Void
  private let ranker = CandidateRanker()

  private var latestContext: CursorContext?
  private var lastNeuralKey: String?
  private var lastNeuralWords: [String] = []
  private var lastNeuralTyped = ""
  private var lastPublished: SuggestionUiState?

  init(
    neural: TinyKeysService,
    scheduler: InferenceScheduler,
    providers: [PredictionProvider],
    maxSuggestions: Int,
    mode: PredictionMode,
    isKnownWord: @escaping (String) -> Bool,
    listener: @escaping (SuggestionUiState) -> Void
  ) {
    self.neural = neural
    self.scheduler = scheduler
    self.providers = providers
    self.maxSuggestions = maxSuggestions
    self.mode = mode
    self.isKnownWord = isKnownWord
    self.listener = listener
  }

  func onContextChanged(_ context: CursorContext) {
    latestContext = context
    guard context.mode.allowsPrediction else {
      publish(.hidden)
      return
    }
    publishSlots(context)
    if mode != .localOnly { scheduleNeural(context) }
  }

  func modelCorrection(_ word: String) -> String? {
    guard lastNeuralTyped == word else { return nil }
    return lastNeuralWords.first { !$0.lowercased().hasPrefix(word.lowercased()) }
  }

  func refresh() {
    guard let context = latestContext, context.mode.allowsPrediction else { return }
    publishSlots(context)
  }

  func reset() {
    latestContext = nil
    lastNeuralKey = nil
    lastNeuralWords = []
    lastNeuralTyped = ""
    lastPublished = nil
    scheduler.cancelPending()
  }

  private func publishSlots(_ context: CursorContext) {
    let model = mode == .localOnly || neuralKey(context) != lastNeuralKey ? [] : lastNeuralWords

    let modelWords: [String]
    let local: [String]
    if context.currentWord.isEmpty {
      let lead = Array(model.prefix(maxSuggestions - 1))
      local = localWords(context, excluding: lead, limit: maxSuggestions - lead.count)
      modelWords = local.isEmpty ? Array(model.prefix(maxSuggestions)) : lead
    } else {
      let pool = localWords(context, excluding: model, limit: maxSuggestions)
      let modelSlots = hasFullDictionary(context) || pool.isEmpty ? maxSuggestions : max(maxSuggestions - 1, 1)
      modelWords = Array(model.prefix(modelSlots))
      local = Array(pool.prefix(maxSuggestions - modelWords.count))
    }

    publish(
      SuggestionUiState(
        visible: true, candidates: modelWords + local, modelWords: Set(modelWords)))
  }

  private func localWords(_ context: CursorContext, excluding: [String], limit: Int) -> [String] {
    guard limit > 0 else { return [] }
    var pool: [Candidate] = []
    pool.reserveCapacity(maxSuggestions * 3)
    for provider in providers {
      pool.append(contentsOf: provider.provide(context: context, limit: maxSuggestions * 2))
    }
    return Array(
      ranker
        .rank(pool)
        .lazy
        .map { $0.text }
        .filter { $0.caseInsensitiveCompare(context.currentWord) != .orderedSame }
        .filter { word in !excluding.contains { $0.caseInsensitiveCompare(word) == .orderedSame } }
        .prefix(limit))
  }

  private func scheduleNeural(_ context: CursorContext) {
    let text = context.sentence.trimmingCharacters(in: .whitespaces).isEmpty
      ? context.previousWord : context.sentence
    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return }

    if context.currentWord.count == 1 {
      scheduler.cancelPredictions()
      return
    }

    let key = neuralKey(context)
    if key == lastNeuralKey { return }

    scheduler.schedule(.prediction) { [weak self] in
      guard let self else { return }
      let typed = context.currentWord
      let words: [String]
      if typed.isEmpty {
        words = self.neural.predict(text, n: self.maxSuggestions) {
          self.isSensible($0, context)
            && $0.caseInsensitiveCompare(context.previousWord) != .orderedSame
        }
      } else {
        words = self.neural.complete(text, n: self.maxSuggestions) {
          $0.caseInsensitiveCompare(typed) == .orderedSame
            || (self.isClose(typed, $0) && self.isSensible($0, context))
        }
        .map { word in
          if word.caseInsensitiveCompare(typed) == .orderedSame { return typed }
          guard typed.first?.isUppercase == true else { return word }
          return word.prefix(1).uppercased() + word.dropFirst()
        }
      }
      let engineWasReady = self.neural.isReady

      DispatchQueue.main.async {
        if engineWasReady {
          self.lastNeuralKey = key
          self.lastNeuralWords = words
          self.lastNeuralTyped = typed
        }
        guard !words.isEmpty, let current = self.latestContext,
          self.neuralKey(current) == key
        else { return }
        self.publishSlots(current)
      }
    }
  }

  private func isClose(_ typed: String, _ word: String) -> Bool {
    let a = typed.lowercased()
    let b = word.lowercased()
    if a == b { return false }
    if b.hasPrefix(a) { return true }
    if isKnownWord(typed) || a.first != b.first { return false }
    return WordDiff.distance(a, b) <= (a.count < 5 ? 1 : 2)
  }

  private func isSensible(_ word: String, _ context: CursorContext) -> Bool {
    hasWordShape(word, context) && (!hasFullDictionary(context) || isKnownWord(word))
  }

  private func hasFullDictionary(_ context: CursorContext) -> Bool {
    context.language.caseInsensitiveCompare("en") == .orderedSame
  }

  private func hasWordShape(_ word: String, _ context: CursorContext) -> Bool {
    let minChars = context.currentWord.isEmpty ? 1 : Self.minWordChars
    guard (minChars...Self.maxWordChars).contains(word.count), word.first?.isLetter == true,
      word.allSatisfy({ $0.isLetter || $0 == "'" || $0 == "-" })
    else { return false }
    let letters = Array(word.lowercased())
    return !letters.indices.dropFirst(2).contains {
      letters[$0].isLetter && letters[$0] == letters[$0 - 1] && letters[$0] == letters[$0 - 2]
    }
  }

  private func neuralKey(_ context: CursorContext) -> String {
    context.currentWord + " " + context.sentence + " " + context.previousWord
  }

  private func publish(_ state: SuggestionUiState) {
    if state == lastPublished { return }
    lastPublished = state
    listener(state)
  }
}
