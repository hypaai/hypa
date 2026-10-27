import Foundation

enum KeyboardNeighbors {
  private static let rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"].map(Array.init)

  private static let neighbors: [Character: Set<Character>] = {
    var map: [Character: Set<Character>] = [:]
    for (rowIndex, row) in rows.enumerated() {
      for (column, character) in row.enumerated() {
        var adjacent = Set<Character>()
        if column > 0 { adjacent.insert(row[column - 1]) }
        if column + 1 < row.count { adjacent.insert(row[column + 1]) }
        for otherIndex in [rowIndex - 1, rowIndex + 1] where rows.indices.contains(otherIndex) {
          let other = rows[otherIndex]
          for offset in -1...1 where other.indices.contains(column + offset) {
            adjacent.insert(other[column + offset])
          }
        }
        map[character] = adjacent
      }
    }
    return map
  }()

  static var keys: Set<Character> { Set(neighbors.keys) }

  static func of(_ character: Character) -> Set<Character> {
    neighbors[Character(character.lowercased())] ?? []
  }
}

enum TypoCandidates {
  private static let collapseDoubleFactor: Float = 0.9
  private static let collapseSingleFactor: Float = 0.85
  private static let deletionFactor: Float = 0.85
  private static let transpositionFactor: Float = 0.95
  private static let insertionFactor: Float = 0.85
  private static let substitutionFactor: Float = 1

  private static let dottedPairs: [Character: Character] = [
    "ẹ": "e", "ọ": "o", "ṣ": "s", "e": "ẹ", "o": "ọ", "s": "ṣ",
  ]

  private static let substitutes: [Character: [Character]] = {
    var map: [Character: [Character]] = [:]
    for key in KeyboardNeighbors.keys.union(dottedPairs.keys) {
      var options = KeyboardNeighbors.of(key)
      if let dotted = dottedPairs[key] { options.insert(dotted) }
      if !options.isEmpty { map[key] = Array(options) }
    }
    return map
  }()

  static func generate(
    _ word: String, alphabet: [Character], consider: (String, Float) -> Void
  ) {
    var buffer = Array(word)
    let length = buffer.count
    if length == 0 { return }

    var collapsed = collapseRuns(buffer, maxRun: 2)
    if collapsed.count != length { consider(String(collapsed), collapseDoubleFactor) }
    collapsed = collapseRuns(buffer, maxRun: 1)
    if collapsed.count != length { consider(String(collapsed), collapseSingleFactor) }

    if length > 1 {
      for index in 0..<length {
        var shorter = buffer
        shorter.remove(at: index)
        consider(String(shorter), deletionFactor)
      }
    }

    if length > 1 {
      for index in 0..<(length - 1) {
        buffer.swapAt(index, index + 1)
        consider(String(buffer), transpositionFactor)
        buffer.swapAt(index, index + 1)
      }
    }

    for index in 0..<length {
      let typed = buffer[index]
      guard let options = substitutes[typed] else { continue }
      for option in options where option != typed {
        buffer[index] = option
        consider(String(buffer), substitutionFactor)
      }
      buffer[index] = typed
    }

    for index in 0...length {
      var longer = buffer
      longer.insert(buffer.first ?? "a", at: index)
      for character in alphabet {
        longer[index] = character
        consider(String(longer), insertionFactor)
      }
    }
  }

  private static func collapseRuns(_ characters: [Character], maxRun: Int) -> [Character] {
    var out: [Character] = []
    out.reserveCapacity(characters.count)
    var runCharacter: Character?
    var runLength = 0
    for character in characters {
      if character == runCharacter {
        runLength += 1
      } else {
        runCharacter = character
        runLength = 1
      }
      if runLength <= maxRun { out.append(character) }
    }
    return out
  }
}

enum SplitCandidates {
  static let minHalf = 2
  static let minSplitLength = 6
  static let maxSplitLength = 20
  private static let concatenationFactor: Float = 0.90
  private static let strayKeyFactor: Float = 0.80

  private static let spaceMisses: Set<Character> = ["v", "b", "n", "m", "c"]

  static func generate(
    _ word: String,
    isCommon: (String) -> Bool,
    consider: (_ left: String, _ right: String, _ factor: Float) -> Void
  ) {
    let n = word.count
    guard n >= minSplitLength, n <= maxSplitLength else { return }
    guard !word.contains("'") else { return }

    for i in minHalf...(n - minHalf) {
      let left = String(word.prefix(i))
      let right = String(word.suffix(n - i))
      consider(left, right, concatenationFactor)
    }

    for i in minHalf...(n - minHalf - 1) {
      let dropped = word[word.index(word.startIndex, offsetBy: i)]
      guard spaceMisses.contains(dropped) else { continue }
      let left = String(word.prefix(i))
      let right = String(word.suffix(n - i - 1))
      consider(left, right, strayKeyFactor)
    }
  }
}

enum CorrectionAction {
  case keep
  case autoCorrect
}

struct CorrectionDecision {
  let original: String
  let action: CorrectionAction
  let replacement: String?
  let confidence: Float

  static func keep(_ original: String) -> CorrectionDecision {
    CorrectionDecision(original: original, action: .keep, replacement: nil, confidence: 0)
  }
}

struct AppliedCorrection {
  let original: String
  let replacement: String
}

final class CorrectionLedger {
  private static let maxRejected = 200
  private static let maxCorrectedBlocks = 40

  private(set) var undoable: AppliedCorrection?

  private var rejected: [String] = []
  private var correctedBlocks: [String] = []

  func recordWordCorrection(original: String, replacement: String) {
    undoable = AppliedCorrection(original: original, replacement: replacement)
  }

  func settle() {
    undoable = nil
  }

  func rejectUndoable() -> AppliedCorrection? {
    guard let applied = undoable else { return nil }
    undoable = nil
    reject(applied.original)
    return applied
  }

  func reject(_ word: String) {
    let key = TextNormalizer.normalize(word)
    guard !key.isEmpty, !rejected.contains(key) else { return }
    if rejected.count >= Self.maxRejected { rejected.removeFirst() }
    rejected.append(key)
  }

  func isRejected(_ word: String) -> Bool {
    rejected.contains(TextNormalizer.normalize(word))
  }

  func shouldCorrectBlock(_ block: String) -> Bool {
    !correctedBlocks.contains(block.trimmingCharacters(in: .whitespacesAndNewlines))
  }

  func markBlockCorrected(_ block: String) {
    let key = block.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !key.isEmpty else { return }
    if correctedBlocks.count >= Self.maxCorrectedBlocks { correctedBlocks.removeFirst() }
    correctedBlocks.append(key)
  }

  func forgetBlock(_ block: String) {
    let key = block.trimmingCharacters(in: .whitespacesAndNewlines)
    correctedBlocks.removeAll { $0 == key }
  }

  func reset() {
    undoable = nil
    rejected.removeAll()
    correctedBlocks.removeAll()
  }
}

final class BlockCorrector {
  private static let minBlockChars = 12
  private static let maxBlockChars = 200

  private let neural: TinyKeysService
  private let scheduler: InferenceScheduler
  private let ledger: CorrectionLedger
  private let onCorrected: (String, String) -> Void

  init(
    neural: TinyKeysService,
    scheduler: InferenceScheduler,
    ledger: CorrectionLedger,
    onCorrected: @escaping (String, String) -> Void
  ) {
    self.neural = neural
    self.scheduler = scheduler
    self.ledger = ledger
    self.onCorrected = onCorrected
  }

  func correct(sentence: String) {
    let block = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
    guard block.count >= Self.minBlockChars, block.count <= Self.maxBlockChars else { return }
    guard ledger.shouldCorrectBlock(block) else { return }
    ledger.markBlockCorrected(block)

    scheduler.schedule(.correction) { [weak self] in
      guard let self else { return }
      guard let result = self.neural.correctBlock(block) else {
        DispatchQueue.main.async { self.ledger.forgetBlock(block) }
        return
      }

      let corrected = result.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !corrected.isEmpty, corrected != block else { return }
      DispatchQueue.main.async { self.onCorrected(block, corrected) }
    }
  }
}

enum WordDiff {
  struct Change {
    let from: [String]
    let to: [String]
  }

  static func distance(_ a: String, _ b: String) -> Int {
    let a = Array(a)
    let b = Array(b)
    var d = [[Int]](repeating: [Int](repeating: 0, count: b.count + 1), count: a.count + 1)
    for i in 0...a.count { d[i][0] = i }
    for j in 0...b.count { d[0][j] = j }
    guard !a.isEmpty, !b.isEmpty else { return d[a.count][b.count] }
    for i in 1...a.count {
      for j in 1...b.count {
        let cost = a[i - 1] == b[j - 1] ? 0 : 1
        d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
        if i > 1, j > 1, a[i - 1] == b[j - 2], a[i - 2] == b[j - 1] {
          d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
        }
      }
    }
    return d[a.count][b.count]
  }

  static func isSmallFix(_ change: Change) -> Bool {
    func isLetter(_ c: Character) -> Bool { c.isLetter || c.isNumber || c == "'" }
    guard change.from.count == change.to.count else { return false }
    return zip(change.from, change.to).allSatisfy { a, b in
      let x = String(a.lowercased().filter(isLetter))
      let y = String(b.lowercased().filter(isLetter))
      return a.filter { !isLetter($0) } == b.filter { !isLetter($0) }
        && (x == y || (!x.isEmpty && !y.isEmpty && distance(x, y) <= (x.count < 5 ? 1 : 2)))
    }
  }

  static func words(_ text: String) -> [String] {
    text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
  }

  static func changes(_ original: String, _ corrected: String) -> [Change] {
    let a = words(original)
    let b = words(corrected)
    var common = [[Int]](repeating: [Int](repeating: 0, count: b.count + 1), count: a.count + 1)
    for i in a.indices.reversed() {
      for j in b.indices.reversed() {
        common[i][j] = a[i] == b[j] ? common[i + 1][j + 1] + 1 : max(common[i + 1][j], common[i][j + 1])
      }
    }

    var changes: [Change] = []
    var from: [String] = []
    var to: [String] = []
    func flush() {
      if from.isEmpty && to.isEmpty { return }
      changes.append(Change(from: from, to: to))
      from = []
      to = []
    }

    var i = 0
    var j = 0
    while i < a.count || j < b.count {
      if i < a.count, j < b.count, a[i] == b[j] {
        flush()
        i += 1
        j += 1
      } else if j < b.count, i == a.count || common[i][j + 1] >= common[i + 1][j] {
        to.append(b[j])
        j += 1
      } else {
        from.append(a[i])
        i += 1
      }
    }
    flush()
    return changes
  }
}

final class AutocorrectEngine {
  private static let minWordLength = 3
  private static let contextDepth = 12

  private let corpus: CorpusStore
  private let personal: PersonalVocabulary

  init(corpus: CorpusStore, personal: PersonalVocabulary) {
    self.corpus = corpus
    self.personal = personal
  }

  private static let minSplitScore: Float = 0.45
  private static let splitMargin: Float = 1.3
static func hasApostropheEnding(_ word: String) -> Bool {
    word.range(of: "'\\p{L}{0,2}$", options: .regularExpression) != nil
  }

  func evaluate(word: String, previousWord: String) -> CorrectionDecision {
    guard word.allSatisfy({ $0.isLetter || $0 == "'" }), !Self.hasApostropheEnding(word) else { return .keep(word) }
    guard corpus.isReady else { return .keep(word) }

    let normalized = TextNormalizer.normalize(word)
    if let contraction = missingApostrophe(normalized) {
      return CorrectionDecision(
        original: word, action: .autoCorrect, replacement: matchCapitalization(of: word, replacement: contraction),
        confidence: 1)
    }
    guard word.count >= Self.minWordLength else { return .keep(word) }
    if personal.contains(word) || corpus.contains(normalized) { return .keep(word) }

    var expected: [String: Float] = [:]
    for learned in personal.following(previousWord, limit: Self.contextDepth) {
      expected[TextNormalizer.normalize(learned.word)] = learned.weight
    }

    var singleCandidates: [Candidate] = []
    var seen = Set<String>()
    TypoCandidates.generate(normalized, alphabet: corpus.alphabet()) { candidate, typoFactor in
      guard candidate.count >= 2, candidate != normalized, seen.insert(candidate).inserted else {
        return
      }
      guard let canonical = corpus.canonical(candidate) else { return }
      let familiarity = max(personal.usageWeight(candidate), expected[candidate] ?? 0)
      singleCandidates.append(
        Candidate(text: canonical, typoFactor: typoFactor, familiarity: familiarity))
    }

    let knownSingle = singleCandidates.filter { $0.familiarity > 0 }
    let singleBest: Candidate?
    if let familiar = knownSingle.max(by: { $0.score < $1.score }) {
      singleBest = familiar
    } else {
      singleBest = unambiguousBest(singleCandidates)
    }
    
    let commonness = { (w: String) -> Float in
      if self.personal.contains(w) { return 1.0 }
      if self.corpus.isCommon(w) { return self.corpus.commonRank(w) }
      return 0.0
    }

    var splitCandidates: [Candidate] = []
    SplitCandidates.generate(normalized, isCommon: self.corpus.isCommon) { left, right, shapeFactor in
      let cLeft = commonness(left)
      let cRight = commonness(right)
      if cLeft > 0 && cRight > 0 {
        let expectedRight = self.personal.following(left, limit: Self.contextDepth)
        let bigramBonus: Float = expectedRight.contains(where: { TextNormalizer.normalize($0.word) == right }) ? 1.25 : 1.0
        let familiarity = cLeft * cRight
        let typoFactor = shapeFactor * bigramBonus
        guard let canonLeft = self.corpus.canonical(left) ?? left as String?,
              let canonRight = self.corpus.canonical(right) ?? right as String? else { return }
        splitCandidates.append(Candidate(text: "\(canonLeft) \(canonRight)", typoFactor: typoFactor, familiarity: familiarity, isSplit: true))
      }
    }
    
    splitCandidates.sort(by: { $0.score > $1.score })
    
    var finalBest: Candidate? = singleBest
    if let bestSplit = splitCandidates.first, bestSplit.score >= Self.minSplitScore {
      let isUnambiguousSplit = splitCandidates.count == 1 || (bestSplit.score >= splitCandidates[1].score * Self.splitMargin)
      if isUnambiguousSplit {
        if let single = singleBest {
          if bestSplit.score > single.score {
            finalBest = bestSplit
          }
        } else {
          finalBest = bestSplit
        }
      }
    }

    guard let best = finalBest else { return .keep(word) }

    let replacement: String
    if best.isSplit, let spaceIndex = best.text.firstIndex(of: " ") {
      let left = String(best.text[..<spaceIndex])
      let right = String(best.text[best.text.index(after: spaceIndex)...])
      replacement = matchCapitalization(of: word, replacement: left) + " " + right
    } else {
      replacement = matchCapitalization(of: word, replacement: best.text)
    }

    return CorrectionDecision(
      original: word,
      action: .autoCorrect,
      replacement: replacement,
      confidence: best.typoFactor)
  }

  private func missingApostrophe(_ normalized: String) -> String? {
    guard !normalized.contains("'"), !corpus.isCommon(normalized) else { return nil }
    for i in 1..<max(normalized.count, 1) {
      var candidate = normalized
      candidate.insert("'", at: candidate.index(candidate.startIndex, offsetBy: i))
      if corpus.isCommon(candidate) { return corpus.canonical(candidate) }
    }
    return nil
  }

  private func unambiguousBest(_ candidates: [Candidate]) -> Candidate? {
    guard let top = candidates.map({ $0.typoFactor }).max() else { return nil }
    let tied = candidates.filter { $0.typoFactor == top }
    return tied.count == 1 ? tied[0] : nil
  }

  private struct Candidate {
    let text: String
    let typoFactor: Float
    let familiarity: Float
    var isSplit: Bool = false
    var score: Float { familiarity > 0 ? familiarity * typoFactor : typoFactor }
  }
}

func matchCapitalization(of original: String, replacement: String) -> String {
  guard original.first?.isUppercase == true, let first = replacement.first else { return replacement }
  return first.uppercased() + replacement.dropFirst()
}
