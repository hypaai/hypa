import Foundation

struct EmojiSearchDocumentState {
  let documentID: UUID
  let before: String
  let after: String
  let hasSelection: Bool

  init(documentID: UUID, before: String?, after: String?, selectedText: String?) {
    self.documentID = documentID
    self.before = String((before ?? "").suffix(64))
    self.after = String((after ?? "").prefix(64))
    self.hasSelection = !(selectedText ?? "").isEmpty
  }

  func matches(_ actual: EmojiSearchDocumentState) -> Bool {
    guard documentID == actual.documentID, hasSelection == actual.hasSelection else { return false }
    guard before.isEmpty == actual.before.isEmpty, after.isEmpty == actual.after.isEmpty else { return false }
    let beforeCount = min(before.count, actual.before.count)
    let afterCount = min(after.count, actual.after.count)
    return before.suffix(beforeCount) == actual.before.suffix(beforeCount)
      && after.prefix(afterCount) == actual.after.prefix(afterCount)
  }

  func inserting(_ sequence: String) -> EmojiSearchDocumentState {
    EmojiSearchDocumentState(
      documentID: documentID, before: before + sequence, after: after, selectedText: nil)
  }
}

struct EmojiEntry {
  let sequence: String
  let name: String
  let variants: [String]
  var keywords: [String] = []

  var hasVariants: Bool { !variants.isEmpty }
}

struct EmojiGroup {
  let name: String
  let entries: [EmojiEntry]
}

struct EmojiMatch {
  let entry: EmojiEntry
  let weight: Float
  let tokenPosition: Int
  let indexInAsset: Int
}

final class EmojiSearchIndex {
  private struct TokenEntry {
    let emojiIndex: Int
    let position: Int
  }
  
  private var tokens: [String: [TokenEntry]] = [:]
  private var sortedTokens: [String] = []
  private let allEntries: [EmojiEntry]
  
  init(groups: [EmojiGroup]) {
    var entries: [EmojiEntry] = []
    var tokenMap: [String: [TokenEntry]] = [:]
    
    var index = 0
    for group in groups {
      for entry in group.entries {
        entries.append(entry)
        let normalized = TextNormalizer.normalize(entry.name)
        let words = normalized.split(separator: " ").map(String.init)
        for (pos, word) in words.enumerated() {
          tokenMap[word, default: []].append(TokenEntry(emojiIndex: index, position: pos))
        }
        index += 1
      }
    }
    
    self.allEntries = entries
    self.tokens = tokenMap
    self.sortedTokens = tokenMap.keys.sorted { $0 < $1 }
  }
  
  func search(query: String, recentStore: RecentEmojiStore, limit: Int) -> [(sequence: String, name: String)] {
    let q = TextNormalizer.normalize(query)
    guard !q.isEmpty else { return [] }
    
    var matches: [Int: EmojiMatch] = [:]
    
    let startIndex = lowerBound(q)
    var matchedTokens: [String] = []
    for i in startIndex..<sortedTokens.count {
      let token = sortedTokens[i]
      if token.hasPrefix(q) {
        matchedTokens.append(token)
      } else {
        break
      }
    }
    
    for token in matchedTokens {
      guard let indices = tokens[token] else { continue }
      let weight: Float = (token == q) ? 1.0 : 0.6
      
      for entry in indices {
        let current = matches[entry.emojiIndex]
        if current == nil || current!.weight < weight {
          matches[entry.emojiIndex] = EmojiMatch(
            entry: allEntries[entry.emojiIndex],
            weight: weight,
            tokenPosition: entry.position,
            indexInAsset: entry.emojiIndex
          )
        }
      }
    }
    
    let recents = recentStore.recent()
    
    let sortedMatches = matches.values.sorted { a, b in
      let aRecentIndex = recents.firstIndex(of: a.entry.sequence) ?? Int.max
      let bRecentIndex = recents.firstIndex(of: b.entry.sequence) ?? Int.max
      
      if aRecentIndex != bRecentIndex { return aRecentIndex < bRecentIndex }
      if a.weight != b.weight { return a.weight > b.weight }
      if a.tokenPosition != b.tokenPosition { return a.tokenPosition < b.tokenPosition }
      if a.entry.name.count != b.entry.name.count { return a.entry.name.count < b.entry.name.count }
      return a.indexInAsset < b.indexInAsset
    }
    
    return Array(sortedMatches.prefix(limit)).map { ($0.entry.sequence, $0.entry.name) }
  }
  
  private func lowerBound(_ value: String) -> Int {
    var low = 0
    var high = sortedTokens.count
    while low < high {
      let mid = (low + high) / 2
      if sortedTokens[mid] < value {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }
}

final class EmojiRepository {
  private static let assetName = "emoji"
  private static let assetSubdirectory = "emoji"

  private let loader = DispatchQueue(label: "hypa-emoji", qos: .userInitiated)
  private let lock = NSLock()

  private var loadedGroups: [EmojiGroup] = []
  private var loadedVersion = ""
  private var searchIndex: EmojiSearchIndex?
  private var byWord: [String: [EmojiEntry]] = [:]
  private var started = false

  var isReady: Bool {
    lock.lock()
    defer { lock.unlock() }
    return !loadedGroups.isEmpty
  }

  var emojiVersion: String {
    lock.lock()
    defer { lock.unlock() }
    return loadedVersion
  }

  func groups() -> [EmojiGroup] {
    lock.lock()
    defer { lock.unlock() }
    return loadedGroups
  }
  
  func search(query: String, recentStore: RecentEmojiStore, limit: Int) -> [(sequence: String, name: String)] {
    lock.lock()
    let index = searchIndex
    lock.unlock()
    return index?.search(query: query, recentStore: recentStore, limit: limit) ?? []
  }

  func suggest(word: String, recentStore: RecentEmojiStore, limit: Int) -> [(sequence: String, name: String)] {
    lock.lock()
    let matches = byWord[TextNormalizer.normalize(word)] ?? []
    lock.unlock()
    let recent = recentStore.recent()
    let rank = { (entry: EmojiEntry) in recent.firstIndex(of: entry.sequence) ?? Int.max }
    return matches.enumerated()
      .sorted { (rank($0.element), $0.offset) < (rank($1.element), $1.offset) }
      .prefix(limit)
      .map { ($0.element.sequence, $0.element.name) }
  }

  private static func wordIndex(_ groups: [EmojiGroup]) -> [String: [EmojiEntry]] {
    var named: [String: [EmojiEntry]] = [:]
    var tagged: [String: [EmojiEntry]] = [:]
    for entry in groups.flatMap(\.entries) {
      let name = TextNormalizer.normalize(entry.name)
      named[name, default: []].append(entry)
      for keyword in entry.keywords.map(TextNormalizer.normalize) where keyword != name {
        tagged[keyword, default: []].append(entry)
      }
    }
    return named.merging(tagged) { $0 + $1 }
  }

  func warmup(onLoaded: @escaping () -> Void = {}) {
    lock.lock()
    if started {
      lock.unlock()
      return
    }
    started = true
    lock.unlock()

    loader.async { [weak self] in
      guard let self, let parsed = Self.load() else { return }
      let index = EmojiSearchIndex(groups: parsed.groups)
      let byWord = Self.wordIndex(parsed.groups)
      self.lock.lock()
      self.byWord = byWord
      self.loadedVersion = parsed.version
      self.loadedGroups = parsed.groups
      self.searchIndex = index
      self.lock.unlock()
      DispatchQueue.main.async(execute: onLoaded)
    }
  }

  private static func load() -> (version: String, groups: [EmojiGroup])? {
    guard
      let url = Bundle.main.url(
        forResource: assetName, withExtension: "txt", subdirectory: assetSubdirectory),
      let text = try? String(contentsOf: url, encoding: .utf8)
    else { return nil }

    var version = ""
    var groups: [EmojiGroup] = []
    var name: String?
    var entries: [EmojiEntry] = []

    for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
      if line.isEmpty || line.hasPrefix("#") { continue }
      if line.hasPrefix("!version\t") {
        version = String(line.dropFirst("!version\t".count))
        continue
      }
      if line.hasPrefix("["), line.hasSuffix("]") {
        if let name { groups.append(EmojiGroup(name: name, entries: entries)) }
        name = String(line.dropFirst().dropLast())
        entries = []
        continue
      }
      let parts = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
      guard parts.count >= 2, !parts[0].isEmpty else { continue }
      entries.append(
        EmojiEntry(
          sequence: parts[0],
          name: parts[1],
          variants: parts.count > 2 && !parts[2].isEmpty
            ? parts[2].split(separator: " ").map(String.init) : [],
          keywords: parts.count > 3 && !parts[3].isEmpty
            ? parts[3].split(separator: " ").map(String.init) : []))
    }
    if let name { groups.append(EmojiGroup(name: name, entries: entries)) }
    return (version, groups)
  }
}

final class RecentEmojiStore {
  private static let fileName = "hypa_recent_emoji.txt"
  private static let maxEntries = 48
  private static let flushDelay: TimeInterval = 3

  private let storeURL: URL
  private let io = DispatchQueue(label: "hypa-emoji-recent", qos: .utility)
  private let lock = NSLock()

  private var entries: [String] = []
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

  func recent() -> [String] {
    lock.lock()
    defer { lock.unlock() }
    return entries
  }

  func record(_ sequence: String) {
    guard !sequence.isEmpty else { return }
    io.async { [weak self] in self?.applyRecord(sequence) }
  }

  private func applyRecord(_ sequence: String) {
    lock.lock()
    entries.removeAll { $0 == sequence }
    entries.insert(sequence, at: 0)
    if entries.count > Self.maxEntries { entries.removeLast(entries.count - Self.maxEntries) }
    let needsFlush = !flushScheduled
    flushScheduled = true
    lock.unlock()

    guard needsFlush else { return }
    io.asyncAfter(deadline: .now() + Self.flushDelay) { [weak self] in self?.flush() }
  }

  private func load() {
    let text = try? String(contentsOf: storeURL, encoding: .utf8)
    let parsed =
      text?
      .split(separator: "\n")
      .filter { !$0.isEmpty && !$0.hasPrefix("#") }
      .prefix(Self.maxEntries)
      .map(String.init) ?? []

    lock.lock()
    entries = parsed
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
    let snapshot = entries
    lock.unlock()

    try? snapshot.joined(separator: "\n").write(to: storeURL, atomically: true, encoding: .utf8)
  }
}
