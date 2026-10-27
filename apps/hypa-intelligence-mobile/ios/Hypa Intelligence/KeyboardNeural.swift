import Foundation
import os.log

final class TinyKeysService {
  private static let log = OSLog(subsystem: "hypa.keyboard", category: "TinyKeys")
  private static let maxInputChars = 256
  private static let maxContextWords = 10
  private static let maxWordTokens = 4
  private static let maxRewriteTokens = 160
  private static let wordBreaks: Set<Character> = ["Ġ", "Ċ", "ĉ", "č"]

  private enum Task: String {
    case predict = "You are Hypa Keyboard. Predict the next word."
    case complete = "You are Hypa Keyboard. Complete the current word."
    case correct = "You are Hypa Keyboard. Correct the last word."
    case correctBlock = "You are Hypa Keyboard. Correct the text block."
    case grammar = "You are Hypa Keyboard. Correct grammar, missing words, spelling, and sentence errors."
  }

  private let lock = NSLock()
  private let cancelLock = NSLock()
  private var env: ORTEnv?
  private var session: ORTSession?
  private var outputName = "logits"
  private var tokenizer: TinyKeysTokenizer?
  private var _cancelled = false

  private var cancelled: Bool {
    get { cancelLock.lock(); defer { cancelLock.unlock() }; return _cancelled }
    set { cancelLock.lock(); _cancelled = newValue; cancelLock.unlock() }
  }

  var isReady: Bool {
    lock.lock()
    defer { lock.unlock() }
    return session != nil
  }

  func load() {
    lock.lock()
    defer { lock.unlock() }
    if session != nil { return }
    let startedAt = Date()
    do {
      guard
        let modelURL = Bundle.main.url(forResource: "model.int8", withExtension: "onnx"),
        let tokenizerURL = Bundle.main.url(forResource: "tokenizer", withExtension: "json")
      else { throw NSError(domain: "TinyKeys", code: 1, userInfo: [NSLocalizedDescriptionKey: "model missing from bundle"]) }
      tokenizer = try TinyKeysTokenizer(data: Data(contentsOf: tokenizerURL))
      let env = try ORTEnv(loggingLevel: .warning)
      let options = try ORTSessionOptions()
      try options.setIntraOpNumThreads(1)
      try options.setGraphOptimizationLevel(.all)
      try options.addConfigEntry(withKey: "session.intra_op.allow_spinning", value: "0")
      try options.addConfigEntry(withKey: "session.inter_op.allow_spinning", value: "0")
      let session = try ORTSession(env: env, modelPath: modelURL.path, sessionOptions: options)
      outputName = try session.outputNames().first ?? "logits"
      self.env = env
      self.session = session
      os_log("loaded in %ldms", log: Self.log, Int(Date().timeIntervalSince(startedAt) * 1000))
    } catch {
      os_log("load failed: %{public}@", log: Self.log, type: .error, "\(error)")
      tokenizer = nil
    }
  }

  func unload() {
    cancelled = true
    lock.lock()
    session = nil
    env = nil
    tokenizer = nil
    lock.unlock()
  }

  func cancel() {
    cancelled = true
  }

  func predict(_ text: String, n: Int = 3, accept: (String) -> Bool = { _ in true }) -> [String] {
    words(.predict, trimmedEnd(text) + " ", n, accept)
  }

  func complete(_ text: String, n: Int = 3, accept: (String) -> Bool = { _ in true }) -> [String] {
    words(.complete, text, n, accept)
  }

  func correct(_ word: String, n: Int = 3, accept: (String) -> Bool = { _ in true }) -> [String] {
    words(.correct, word, n, accept)
  }

  func correctBlock(_ text: String) -> String? { rewrite(.correctBlock, text) }

  func grammar(_ text: String) -> String? { rewrite(.grammar, text) }

  private func trimmedEnd(_ text: String) -> String {
    String(text.reversed().drop(while: { $0.isWhitespace }).reversed())
  }

  private func lastWords(_ text: String) -> String {
    var count = 0
    var index = text.endIndex
    var inWord = false
    while index > text.startIndex {
      let previous = text.index(before: index)
      if text[previous].isWhitespace {
        if inWord, count == Self.maxContextWords { return String(text[index...]) }
        inWord = false
      } else if !inWord {
        inWord = true
        count += 1
      }
      index = previous
    }
    return text
  }

  private func words(_ task: Task, _ text: String, _ n: Int, _ accept: (String) -> Bool) -> [String] {
    withModel(task, lastWords(text)) { tok, prompt in
      var found: [String] = []
      let top = topIds(try logits(prompt), n + 2)
      for first in top {
        if found.count >= n || cancelled { break }
        if first == tok.eot { continue }
        let word = tok.decode(try extendWord(tok, prompt, first))
          .trimmingCharacters(in: .whitespacesAndNewlines)
        if !word.isEmpty, !found.contains(where: { $0.caseInsensitiveCompare(word) == .orderedSame }),
          accept(word)
        {
          found.append(word)
        }
      }
      return found
    } ?? []
  }

  private func extendWord(_ tok: TinyKeysTokenizer, _ prompt: [Int], _ first: Int) throws -> [Int] {
    var out = [first]
    while out.count < Self.maxWordTokens, !cancelled {
      let next = argmax(try logits(prompt + out))
      if next == tok.eot || endsWord(tok.token(next)) { break }
      out.append(next)
    }
    return out
  }

  private func endsWord(_ token: String) -> Bool {
    guard let first = token.first else { return true }
    return Self.wordBreaks.contains(first)
      || token.unicodeScalars.allSatisfy {
        (33...126).contains($0.value) && !CharacterSet.alphanumerics.contains($0) && $0 != "'"
          && $0 != "-"
      }
  }

  private func rewrite(_ task: Task, _ text: String) -> String? {
    withModel(task, text.trimmingCharacters(in: .whitespacesAndNewlines)) { tok, prompt in
      let limit = min(tok.encode(text).count * 3 / 2 + 8, Self.maxRewriteTokens)
      var out: [Int] = []
      while !cancelled {
        let next = argmax(try logits(prompt + out))
        if next == tok.eot {
          let result = tok.decode(out).trimmingCharacters(in: .whitespacesAndNewlines)
          return result.isEmpty ? nil : result
        }
        if out.count >= limit { return nil }
        out.append(next)
      }
      return nil
    } ?? nil
  }

  private func withModel<T>(
    _ task: Task, _ text: String, _ work: (TinyKeysTokenizer, [Int]) throws -> T
  ) -> T? {
    cancelled = false
    lock.lock()
    defer { lock.unlock() }
    guard let tok = tokenizer, session != nil,
      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return nil }
    let startedAt = Date()
    do {
      let result = try work(tok, tok.chat(system: task.rawValue, user: String(text.suffix(Self.maxInputChars))))
      os_log(
        "%{public}@ \"%{public}@\" -> %{public}@ in %ldms", log: Self.log, type: .debug,
        "\(task)", text, "\(result)", Int(Date().timeIntervalSince(startedAt) * 1000))
      return result
    } catch {
      os_log("%{public}@ failed: %{public}@", log: Self.log, type: .error, "\(task)", "\(error)")
      return nil
    }
  }

  private func logits(_ ids: [Int]) throws -> [Float] {
    guard let session else { throw CancellationError() }
    let shape: [NSNumber] = [1, NSNumber(value: ids.count)]
    var idValues = ids.map { Int64($0) }
    var maskValues = [Int64](repeating: 1, count: ids.count)
    let idTensor = try ORTValue(
      tensorData: NSMutableData(bytes: &idValues, length: idValues.count * 8),
      elementType: .int64, shape: shape)
    let maskTensor = try ORTValue(
      tensorData: NSMutableData(bytes: &maskValues, length: maskValues.count * 8),
      elementType: .int64, shape: shape)
    let outputs = try session.run(
      withInputs: ["input_ids": idTensor, "attention_mask": maskTensor],
      outputNames: [outputName], runOptions: nil)
    guard let output = outputs[outputName] else { throw CancellationError() }
    let vocab = try output.tensorTypeAndShapeInfo().shape[2].intValue
    let floats = try output.tensorData().bytes.assumingMemoryBound(to: Float.self)
    return Array(UnsafeBufferPointer(start: floats + (ids.count - 1) * vocab, count: vocab))
  }

  private func argmax(_ values: [Float]) -> Int {
    var best = 0
    for i in 1..<values.count where values[i] > values[best] { best = i }
    return best
  }

  private func topIds(_ values: [Float], _ n: Int) -> [Int] {
    Array(values.indices.sorted { values[$0] > values[$1] }.prefix(n))
  }
}

final class TinyKeysTokenizer {
  private static let ws =
    "\\t\\n\\u000B\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000"
  private static let pattern = try! NSRegularExpression(
    pattern:
      "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\(ws)\\p{L}\\p{N}]+|[\(ws)]+(?![^\(ws)])|[\(ws)]+"
  )

  private static let byteToScalar: [Unicode.Scalar] = {
    var extra: UInt32 = 0
    return (0...255).map { b -> Unicode.Scalar in
      let printable = (33...126).contains(b) || (161...172).contains(b) || (174...255).contains(b)
      if printable { return Unicode.Scalar(UInt8(b)) }
      defer { extra += 1 }
      return Unicode.Scalar(256 + extra)!
    }
  }()
  private static let scalarToByte: [Unicode.Scalar: UInt8] = Dictionary(
    uniqueKeysWithValues: byteToScalar.enumerated().map { ($1, UInt8($0)) })

  private var vocab: [String: Int] = [:]
  private var ranks: [String: Int] = [:]
  private var special: [String: Int] = [:]
  private var tokens: [String] = []

  let eot: Int
  private let bos: Int
  private let startHeader: Int
  private let endHeader: Int

  init(data: Data) throws {
    guard
      let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let model = root["model"] as? [String: Any],
      let vocab = model["vocab"] as? [String: Int],
      let merges = model["merges"] as? [[String]],
      let added = root["added_tokens"] as? [[String: Any]]
    else { throw NSError(domain: "TinyKeys", code: 2) }

    self.vocab = vocab
    for token in added {
      if let content = token["content"] as? String, let id = token["id"] as? Int { special[content] = id }
    }
    for (rank, pair) in merges.enumerated() where pair.count == 2 {
      ranks[pair[0] + " " + pair[1]] = rank
    }
    tokens = [String](
      repeating: "", count: max(vocab.values.max() ?? 0, special.values.max() ?? 0) + 1)
    for (token, id) in vocab { tokens[id] = token }
    for (token, id) in special { tokens[id] = token }

    guard let eot = special["<|eot_id|>"], let bos = special["<|begin_of_text|>"],
      let startHeader = special["<|start_header_id|>"], let endHeader = special["<|end_header_id|>"]
    else { throw NSError(domain: "TinyKeys", code: 3) }
    self.eot = eot
    self.bos = bos
    self.startHeader = startHeader
    self.endHeader = endHeader
  }

  func chat(system: String, user: String) -> [Int] {
    [bos] + turn("system", system) + turn("user", user) + header("assistant") + encode("\n\n")
  }

  func encode(_ text: String) -> [Int] {
    let normalized = text.precomposedStringWithCanonicalMapping as NSString
    return Self.pattern.matches(in: normalized as String, range: NSRange(location: 0, length: normalized.length))
      .flatMap { match -> [Int] in
        var mapped = String.UnicodeScalarView()
        for byte in normalized.substring(with: match.range).utf8 { mapped.append(Self.byteToScalar[Int(byte)]) }
        return bpe(mapped).compactMap { vocab[$0] }
      }
  }

  func decode(_ ids: [Int]) -> String {
    var bytes: [UInt8] = []
    for id in ids where special[tokens[id]] == nil {
      for scalar in tokens[id].unicodeScalars {
        if let byte = Self.scalarToByte[scalar] { bytes.append(byte) }
      }
    }
    return String(decoding: bytes, as: UTF8.self)
  }

  func token(_ id: Int) -> String { tokens[id] }

  private func turn(_ role: String, _ content: String) -> [Int] {
    header(role) + encode("\n\n\(content)") + [eot]
  }

  private func header(_ role: String) -> [Int] { [startHeader] + encode(role) + [endHeader] }

  private func bpe(_ word: String.UnicodeScalarView) -> [String] {
    var parts = word.map { String($0) }
    while parts.count > 1 {
      var best = -1
      var bestRank = Int.max
      for i in 0..<(parts.count - 1) {
        if let rank = ranks[parts[i] + " " + parts[i + 1]], rank < bestRank {
          bestRank = rank
          best = i
        }
      }
      if best < 0 { break }
      parts[best] += parts.remove(at: best + 1)
    }
    return parts
  }
}

enum InferencePriority {
  case prediction
  case correction
}

final class InferenceScheduler {
  private static let debounce: TimeInterval = 0.25

  private let onSuperseded: () -> Void
  private let queue = DispatchQueue(label: "hypa-neural", qos: .userInitiated)

  private var debounced: DispatchWorkItem?
  private var debouncedPriority: InferencePriority?
  private var runningPriority: InferencePriority?
  private var pending: (priority: InferencePriority, work: () -> Void)?

  init(onSuperseded: @escaping () -> Void) {
    self.onSuperseded = onSuperseded
  }

  func schedule(_ priority: InferencePriority, work: @escaping () -> Void) {
    clearDebounced()
    let item = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.debounced = nil
      self.debouncedPriority = nil
      guard self.runningPriority != nil else {
        self.dispatch(priority, work)
        return
      }
      self.pending = (priority, work)
      self.onSuperseded()
    }
    debounced = item
    debouncedPriority = priority
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.debounce, execute: item)
  }

  func cancelPredictions() {
    if debouncedPriority == .prediction { clearDebounced() }
    if pending?.priority == .prediction { pending = nil }
    if runningPriority == .prediction { onSuperseded() }
  }

  func cancelPending() {
    clearDebounced()
    pending = nil
    if runningPriority != nil { onSuperseded() }
  }

  private func clearDebounced() {
    debounced?.cancel()
    debounced = nil
    debouncedPriority = nil
  }

  private func dispatch(_ priority: InferencePriority, _ work: @escaping () -> Void) {
    runningPriority = priority
    queue.async { [weak self] in
      work()
      DispatchQueue.main.async {
        guard let self else { return }
        self.runningPriority = nil
        if let next = self.pending {
          self.pending = nil
          self.dispatch(next.priority, next.work)
        }
      }
    }
  }
}
