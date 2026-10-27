import Foundation

enum TextNormalizer {
  private static let strippedMarks: Set<Unicode.Scalar> = [
    "\u{0301}",
    "\u{0300}",
    "\u{0304}",
  ]

  static func normalize(_ word: String) -> String {
    let lower = word.lowercased()
    if lower.allSatisfy({ $0.isASCII }) { return lower }
    var scalars = String.UnicodeScalarView()
    for scalar in lower.decomposedStringWithCanonicalMapping.unicodeScalars
    where !strippedMarks.contains(scalar) {
      scalars.append(scalar)
    }
    return String(scalars).precomposedStringWithCanonicalMapping
  }
}

struct SortedWordBytes {
  private let bytes: [UInt8]
  private let starts: [Int]

  init(bytes: [UInt8], starts: [Int]) {
    self.bytes = bytes
    self.starts = starts
  }

  var count: Int { starts.count - 1 }

  func contains(_ word: String) -> Bool {
    let needle = Array(word.utf8)
    guard !needle.isEmpty, needle.allSatisfy({ $0 < 128 }) else { return false }
    let index = lowerBound(needle)
    return index < count && compare(at: index, with: needle) == 0
  }

  func countWithPrefix(_ prefix: String) -> Int {
    let needle = Array(prefix.utf8)
    guard needle.allSatisfy({ $0 < 128 }) else { return 0 }
    return lowerBound(needle + [UInt8.max]) - lowerBound(needle)
  }

  func shortestWithPrefix(_ prefix: String, want: Int, scanCap: Int) -> [String] {
    let needle = Array(prefix.utf8)
    guard !needle.isEmpty, want > 0, needle.allSatisfy({ $0 < 128 }) else { return [] }

    var bestIndex = [Int](repeating: 0, count: want)
    var bestLength = [Int](repeating: 0, count: want)
    var held = 0

    var index = lowerBound(needle)
    var scanned = 0
    while index < count, scanned < scanCap, startsWith(index, needle) {
      let length = starts[index + 1] - starts[index]
      if held < want || length < bestLength[held - 1] {
        var slot = held < want ? held : want - 1
        if held < want { held += 1 }
        while slot > 0, bestLength[slot - 1] > length {
          bestLength[slot] = bestLength[slot - 1]
          bestIndex[slot] = bestIndex[slot - 1]
          slot -= 1
        }
        bestLength[slot] = length
        bestIndex[slot] = index
      }
      scanned += 1
      index += 1
    }
    return (0..<held).map { word(at: bestIndex[$0]) }
  }

  private func startsWith(_ index: Int, _ prefix: [UInt8]) -> Bool {
    let from = starts[index]
    if starts[index + 1] - from < prefix.count { return false }
    for i in prefix.indices where bytes[from + i] != prefix[i] { return false }
    return true
  }

  private func word(at index: Int) -> String {
    String(decoding: bytes[starts[index]..<starts[index + 1]], as: UTF8.self)
  }

  private func lowerBound(_ needle: [UInt8]) -> Int {
    var low = 0
    var high = count
    while low < high {
      let mid = (low + high) / 2
      if compare(at: mid, with: needle) < 0 { low = mid + 1 } else { high = mid }
    }
    return low
  }

  private func compare(at index: Int, with needle: [UInt8]) -> Int {
    var position = starts[index]
    let end = starts[index + 1]
    var i = 0
    while position < end, i < needle.count {
      if bytes[position] != needle[i] { return Int(bytes[position]) - Int(needle[i]) }
      position += 1
      i += 1
    }
    return (end - starts[index]) - needle.count
  }
}

private struct PackedWordBuilder {
  private var bytes: [UInt8] = []
  private var starts: [Int] = [0]
  private var sorted = true

  var isEmpty: Bool { starts.count == 1 }

  init() {
    bytes.reserveCapacity(1 << 16)
    starts.reserveCapacity(1 << 13)
  }

  mutating func add(_ word: String) {
    let start = bytes.count
    bytes.append(contentsOf: word.utf8)
    if sorted, starts.count > 1,
      compare(starts[starts.count - 2], start, start, bytes.count) > 0
    {
      sorted = false
    }
    starts.append(bytes.count)
  }

  func build() -> SortedWordBytes? {
    if isEmpty { return nil }
    if sorted { return SortedWordBytes(bytes: bytes, starts: starts) }

    var words: [String] = []
    words.reserveCapacity(starts.count - 1)
    for index in 0..<(starts.count - 1) {
      words.append(String(decoding: bytes[starts[index]..<starts[index + 1]], as: UTF8.self))
    }
    words.sort { Array($0.utf8).lexicographicallyPrecedes(Array($1.utf8)) }

    var sortedBytes: [UInt8] = []
    sortedBytes.reserveCapacity(bytes.count)
    var sortedStarts: [Int] = [0]
    sortedStarts.reserveCapacity(words.count + 1)
    for word in words {
      sortedBytes.append(contentsOf: word.utf8)
      sortedStarts.append(sortedBytes.count)
    }
    return SortedWordBytes(bytes: sortedBytes, starts: sortedStarts)
  }

  private func compare(_ aFrom: Int, _ aTo: Int, _ bFrom: Int, _ bTo: Int) -> Int {
    var a = aFrom
    var b = bFrom
    while a < aTo, b < bTo {
      if bytes[a] != bytes[b] { return Int(bytes[a]) - Int(bytes[b]) }
      a += 1
      b += 1
    }
    return (aTo - aFrom) - (bTo - bFrom)
  }
}

final class LanguagePack {
  let languageCode: String
  let alphabet: [Character]

  private let plain: SortedWordBytes?
  private let common: SortedWordBytes?
  private let accentedKeys: [String]
  private let accentedValues: [String]
  private let accented: [String: String]

  private init(
    languageCode: String,
    plain: SortedWordBytes?,
    common: SortedWordBytes?,
    accented: [String: String],
    alphabet: Set<Character>
  ) {
    self.languageCode = languageCode
    self.plain = plain
    self.common = common
    self.accented = accented
    self.accentedKeys = accented.keys.sorted {
      Array($0.utf8).lexicographicallyPrecedes(Array($1.utf8))
    }
    self.accentedValues = self.accentedKeys.map { accented[$0] ?? $0 }
    self.alphabet = alphabet.sorted()
  }

  func contains(_ normalized: String) -> Bool {
    accented[normalized] != nil || plain?.contains(normalized) == true
  }

  func isCommon(_ normalized: String) -> Bool {
    common?.contains(normalized) == true
  }

  func commonWithPrefix(_ prefix: String) -> Int {
    common?.countWithPrefix(prefix) ?? 0
  }

  func canonical(_ normalized: String) -> String? {
    if let marked = accented[normalized] { return marked }
    return plain?.contains(normalized) == true ? normalized : nil
  }

  func prefix(_ normalized: String, limit: Int) -> [String] {
    if normalized.isEmpty { return [] }
    var matches = plain?.shortestWithPrefix(normalized, want: limit, scanCap: limit * scanHeadroom) ?? []

    var index = accentedLowerBound(normalized)
    while index < accentedKeys.count, accentedKeys[index].hasPrefix(normalized) {
      matches.append(accentedValues[index])
      index += 1
    }

    matches.removeAll { TextNormalizer.normalize($0) == normalized }
    matches.sort { $0.count == $1.count ? $0 < $1 : $0.count < $1.count }
    return Array(matches.prefix(limit))
  }

  private func accentedLowerBound(_ value: String) -> Int {
    let needle = Array(value.utf8)
    var low = 0
    var high = accentedKeys.count
    while low < high {
      let mid = (low + high) / 2
      if Array(accentedKeys[mid].utf8).lexicographicallyPrecedes(needle) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }

  private let scanHeadroom = 40

  static func load(languageCode: String) -> LanguagePack? {
    let bundleText = { (name: String) -> String? in
      guard
        let url = Bundle.main.url(
          forResource: name, withExtension: "txt",
          subdirectory: "text-data/\(languageCode)")
      else { return nil }
      return try? String(contentsOf: url, encoding: .utf8)
    }

    guard let wordsText = bundleText("words") else { return nil }
    let commonText = bundleText("common")
    
    return parse(languageCode: languageCode, text: wordsText, commonText: commonText)
  }

  static func parse(languageCode: String, text: String, commonText: String? = nil) -> LanguagePack? {
    var plain = PackedWordBuilder()
    var common = PackedWordBuilder()
    var accented: [String: String] = [:]
    var alphabet = Set<Character>()

    for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
      if line.isEmpty || line.hasPrefix("#") { continue }
      let word = line.trimmingCharacters(in: .whitespaces).precomposedStringWithCanonicalMapping
      if word.isEmpty { continue }
      let key = TextNormalizer.normalize(word)
      if key.isEmpty { continue }
      alphabet.formUnion(key)
      if key == word, word.allSatisfy({ $0.isASCII }) {
        plain.add(word)
      } else if accented[key] == nil {
        accented[key] = word
      }
    }
    
    if let commonText {
      for line in commonText.split(separator: "\n", omittingEmptySubsequences: false) {
        if line.isEmpty || line.hasPrefix("#") { continue }
        let word = line.trimmingCharacters(in: .whitespaces).precomposedStringWithCanonicalMapping
        if word.isEmpty { continue }
        let key = TextNormalizer.normalize(word)
        if key.isEmpty { continue }
        if key == word, word.allSatisfy({ $0.isASCII }) {
          common.add(word)
        }
      }
    }

    if plain.isEmpty, accented.isEmpty { return nil }
    return LanguagePack(
      languageCode: languageCode, plain: plain.build(), common: common.build(), accented: accented, alphabet: alphabet)
  }
}

final class CorpusStore {
  private let loader = DispatchQueue(label: "hypa-textdata", qos: .utility)
  private let lock = NSLock()

  private var packs: [LanguagePack] = []
  private var loadedCodes: [String] = []
  private var cachedAlphabet: [Character] = []

  func setLanguage(_ languageCode: String) {
    let primary = languageCode.lowercased().isEmpty ? "en" : languageCode.lowercased()
    let wanted = primary == "en" ? ["en"] : [primary, "en"]

    lock.lock()
    if wanted == loadedCodes {
      lock.unlock()
      return
    }
    loadedCodes = wanted
    packs = []
    cachedAlphabet = []
    lock.unlock()

    loader.async { [weak self] in
      let primaryPack = LanguagePack.load(languageCode: primary)
      let loaded = primaryPack.map { [$0] + wanted.dropFirst().compactMap { LanguagePack.load(languageCode: $0) } } ?? []
      guard let self else { return }
      self.lock.lock()
      defer { self.lock.unlock() }
      guard self.loadedCodes == wanted else { return }
      self.packs = loaded
      self.cachedAlphabet = Array(Set(loaded.flatMap { $0.alphabet })).sorted()
    }
  }

  var isReady: Bool {
    lock.lock()
    defer { lock.unlock() }
    return !packs.isEmpty
  }

  private func snapshot() -> [LanguagePack] {
    lock.lock()
    defer { lock.unlock() }
    return packs
  }

  func contains(_ normalized: String) -> Bool {
    snapshot().contains { $0.contains(normalized) }
  }

  func isCommon(_ normalized: String) -> Bool {
    snapshot().contains { $0.isCommon(normalized) }
  }

  func commonWithPrefix(_ normalized: String) -> Int {
    snapshot().reduce(0) { $0 + $1.commonWithPrefix(normalized) }
  }

  func commonRank(_ normalized: String) -> Float {
    isCommon(normalized) ? 0.75 : 0.0
  }

  func canonical(_ normalized: String) -> String? {
    for pack in snapshot() {
      if let match = pack.canonical(normalized) { return match }
    }
    return nil
  }

  func prefix(_ normalized: String, limit: Int) -> [String] {
    var seen = Set<String>()
    var matches: [String] = []
    for pack in snapshot() {
      for word in pack.prefix(normalized, limit: limit)
      where seen.insert(TextNormalizer.normalize(word)).inserted {
        matches.append(word)
      }
    }
    matches.sort { $0.count == $1.count ? $0 < $1 : $0.count < $1.count }
    return Array(matches.prefix(limit))
  }

  func alphabet() -> [Character] {
    lock.lock()
    defer { lock.unlock() }
    return cachedAlphabet
  }
}

struct LearnedWord {
  let word: String
  let weight: Float
}

final class PersonalVocabulary {
  private static let fileName = "hypa_personal.txt"
  private static let header = "# hypa personal lexicon v1"
  private static let wordsSection = "[words]"
  private static let pairsSection = "[pairs]"

  private static let protectMinUses = 2
  private static let minLearnLength = 2
  private static let maxWords = 5000
  private static let maxPairs = 20000
  private static let flushDelay: TimeInterval = 5

  private let storeURL: URL
  private let io = DispatchQueue(label: "hypa-personal", qos: .utility)
  private let lock = NSLock()

  private var counts: [String: Int] = [:]
  private var sortedWords: [String] = []
  private var nextWords: [String: [String: Int]] = [:]
  private var pairCount = 0
  private var highestCount = 0
  private var flushScheduled = false
  private var loaded = false

  init(containerURL: URL) {
    storeURL = containerURL.appendingPathComponent(Self.fileName)
    io.async { [weak self] in self?.load() }
  }

  var isReady: Bool {
    lock.lock()
    defer { lock.unlock() }
    return loaded
  }

  func contains(_ word: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return (counts[TextNormalizer.normalize(word)] ?? 0) >= Self.protectMinUses
  }

  func usageWeight(_ word: String) -> Float {
    lock.lock()
    defer { lock.unlock() }
    guard highestCount > 0, let count = counts[TextNormalizer.normalize(word)] else { return 0 }
    return Float(count) / Float(highestCount)
  }

  func countWithPrefix(_ prefix: String) -> Int {
    let needle = TextNormalizer.normalize(prefix)
    lock.lock()
    defer { lock.unlock() }
    var total = 0
    var index = lowerBound(needle)
    while index < sortedWords.count, sortedWords[index].hasPrefix(needle) {
      if (counts[sortedWords[index]] ?? 0) >= Self.protectMinUses { total += 1 }
      index += 1
    }
    return total
  }

  func prefix(_ prefix: String, limit: Int) -> [String] {
    let needle = TextNormalizer.normalize(prefix)
    guard !needle.isEmpty else { return [] }

    lock.lock()
    defer { lock.unlock() }
    var matches: [(String, Int)] = []
    var index = lowerBound(needle)
    while index < sortedWords.count, sortedWords[index].hasPrefix(needle) {
      let word = sortedWords[index]
      if word != needle { matches.append((word, counts[word] ?? 0)) }
      index += 1
    }
    return ranked(matches, limit: limit).map { $0.0 }
  }

  func following(_ word: String, limit: Int) -> [LearnedWord] {
    let key = TextNormalizer.normalize(word)
    guard !key.isEmpty else { return [] }

    lock.lock()
    defer { lock.unlock() }
    guard let nexts = nextWords[key] else { return [] }
    let top = ranked(Array(nexts), limit: limit)
    guard let highest = top.first?.1, highest > 0 else { return [] }
    return top.map { LearnedWord(word: $0.0, weight: Float($0.1) / Float(highest)) }
  }

  func record(previousWord: String, word: String) {
    io.async { [weak self] in self?.applyRecord(previousWord: previousWord, word: word) }
  }

  private func ranked(_ entries: [(String, Int)], limit: Int) -> [(String, Int)] {
    entries
      .sorted { $0.1 == $1.1 ? $0.0 < $1.0 : $0.1 > $1.1 }
      .prefix(limit)
      .map { $0 }
  }

  private func lowerBound(_ value: String) -> Int {
    let needle = Array(value.utf8)
    var low = 0
    var high = sortedWords.count
    while low < high {
      let mid = (low + high) / 2
      if Array(sortedWords[mid].utf8).lexicographicallyPrecedes(needle) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }

  private func applyRecord(previousWord: String, word: String) {
    guard let key = Self.learnable(word) else { return }

    lock.lock()
    if counts[key] == nil, counts.count >= Self.maxWords {
      lock.unlock()
      return
    }
    let count = (counts[key] ?? 0) + 1
    if counts.updateValue(count, forKey: key) == nil {
      sortedWords.insert(key, at: lowerBound(key))
    }
    if count > highestCount { highestCount = count }

    if let left = Self.learnable(previousWord) {
      let existing = nextWords[left]?[key]
      if existing != nil || pairCount < Self.maxPairs {
        nextWords[left, default: [:]][key] = (existing ?? 0) + 1
        if existing == nil { pairCount += 1 }
      }
    }
    let needsFlush = !flushScheduled
    flushScheduled = true
    lock.unlock()

    guard needsFlush else { return }
    io.asyncAfter(deadline: .now() + Self.flushDelay) { [weak self] in self?.flush() }
  }

  private static func learnable(_ word: String) -> String? {
    let key = TextNormalizer.normalize(word.trimmingCharacters(in: .whitespaces))
    guard key.count >= minLearnLength else { return nil }
    guard key.allSatisfy({ $0.isLetter || $0 == "'" }) else { return nil }
    return key
  }

  private func load() {
    let text = try? String(contentsOf: storeURL, encoding: .utf8)
    var parsedCounts: [String: Int] = [:]
    var parsedNextWords: [String: [String: Int]] = [:]
    var parsedPairs = 0
    var parsedHighest = 0

    var inPairs = false
    for line in text?.split(separator: "\n", omittingEmptySubsequences: false) ?? [] {
      if line.isEmpty || line.hasPrefix("#") { continue }
      if line == Self.wordsSection {
        inPairs = false
        continue
      }
      if line == Self.pairsSection {
        inPairs = true
        continue
      }
      let parts = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      if inPairs {
        guard parts.count == 3, let count = Int(parts[2]) else { continue }
        parsedNextWords[parts[0], default: [:]][parts[1]] = count
        parsedPairs += 1
      } else {
        guard parts.count == 2, let count = Int(parts[1]) else { continue }
        parsedCounts[parts[0]] = count
        if count > parsedHighest { parsedHighest = count }
      }
    }

    lock.lock()
    counts = parsedCounts
    sortedWords = parsedCounts.keys.sorted {
      Array($0.utf8).lexicographicallyPrecedes(Array($1.utf8))
    }
    nextWords = parsedNextWords
    pairCount = parsedPairs
    highestCount = parsedHighest
    loaded = true
    lock.unlock()
  }

  private func flush() {
    lock.lock()
    flushScheduled = false
    guard loaded else {
      lock.unlock()
      return
    }
    let wordSnapshot = sortedWords.map { ($0, counts[$0] ?? 0) }
    let pairSnapshot = nextWords
    lock.unlock()

    var out = Self.header + "\n" + Self.wordsSection + "\n"
    for (word, count) in wordSnapshot {
      out += "\(word)\t\(count)\n"
    }
    out += Self.pairsSection + "\n"
    for (left, nexts) in pairSnapshot {
      for (right, count) in nexts {
        out += "\(left)\t\(right)\t\(count)\n"
      }
    }
    try? out.write(to: storeURL, atomically: true, encoding: .utf8)
  }
}
