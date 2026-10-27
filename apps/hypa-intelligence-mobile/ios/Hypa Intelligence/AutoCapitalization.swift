import UIKit

enum AutoCapMode {
  case none
  case sentences
  case words
  case characters

  func appliesAt(_ textBeforeCursor: String) -> Bool {
    switch self {
    case .none: return false
    case .characters: return true
    case .words: return textBeforeCursor.last?.isWhitespace ?? true
    case .sentences: return startsNewSentence(textBeforeCursor)
    }
  }

  var allowsProseAssists: Bool { self == .sentences }

  static func detect(proxy: UITextDocumentProxy) -> AutoCapMode {
    switch ContextMode.detect(proxy) {
    case .search, .email, .url, .password, .number, .phone:
      return .none
    case .allCaps:
      return .characters
    case .normal:
      switch proxy.autocapitalizationType ?? .sentences {
      case .allCharacters: return .characters
      case .words: return .words
      case .none: return .none
      case .sentences: return .sentences
      @unknown default: return .sentences
      }
    }
  }

  static func twoInitialCapsFix(_ word: String, locale: Locale = .current) -> String? {
    let chars = Array(word)
    guard chars.count >= 3 else { return nil }
    guard chars[0].isUppercase, chars[1].isUppercase, chars[2].isLowercase else { return nil }
    guard chars.dropFirst(2).allSatisfy({ !$0.isUppercase }) else { return nil }
    return String(chars[0]) + String(chars[1]).lowercased(with: locale) + String(chars.dropFirst(2))
  }

  private static let abbreviations: Set<String> = [
    "mr", "mrs", "ms", "mx", "dr", "prof", "sr", "jr", "st",
    "vs", "etc", "approx", "dept", "fig", "inc", "ltd",
    "e.g", "i.e", "a.m", "p.m", "u.s",
  ]

  private static let closingWrappers: Set<Character> = ["\"", "'", "’", "”", ")", "]", "}", "»", "›"]

  private func startsNewSentence(_ before: String) -> Bool {
    let spaceless = String(before.reversed().drop(while: { $0 == " " || $0 == "\t" }).reversed())
    guard let last = spaceless.last else { return true }
    if last == "\n" { return true }
    let sentence = String(spaceless.reversed().drop(while: { Self.closingWrappers.contains($0) }).reversed())
    guard let ending = sentence.last else { return false }
    if ending == "!" || ending == "?" { return true }
    return ending == "." && !endsWithAbbreviation(sentence)
  }

  private func endsWithAbbreviation(_ sentence: String) -> Bool {
    let tail = sentence.reversed().prefix { $0.isLetter || $0 == "." }
    let token = String(tail.reversed())
      .trimmingCharacters(in: CharacterSet(charactersIn: "."))
      .lowercased()
    return Self.abbreviations.contains(token)
  }
}
