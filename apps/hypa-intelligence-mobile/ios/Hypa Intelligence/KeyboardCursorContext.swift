import UIKit

enum ContextMode {
  case normal
  case search
  case email
  case url
  case password
  case number
  case phone
  case allCaps

  var allowsPrediction: Bool {
    self == .normal
  }

  var allowsLearning: Bool {
    self == .normal
  }

  static func allowsMultiLine(_ proxy: UITextDocumentProxy) -> Bool {
    guard detect(proxy) == .normal else { return false }
    if (proxy.documentContextBeforeInput ?? "").contains("\n") { return true }
    if (proxy.documentContextAfterInput ?? "").contains("\n") { return true }
    return proxy.returnKeyType == .default
  }

  static func detect(_ proxy: UITextDocumentProxy) -> ContextMode {
    if proxy.isSecureTextEntry == true { return .password }
    switch proxy.keyboardType {
    case .numberPad, .decimalPad, .asciiCapableNumberPad, .numbersAndPunctuation:
      return .number
    case .phonePad, .namePhonePad:
      return .phone
    case .URL:
      return .url
    case .emailAddress:
      return .email
    case .webSearch:
      return .search
    default:
      if proxy.autocapitalizationType == .allCharacters { return .allCaps }
      switch proxy.returnKeyType {
      case .search, .google, .yahoo: return .search
      default: return .normal
      }
    }
  }
}

struct CursorContext {
  let textBeforeCursor: String
  let currentWord: String
  let previousWord: String
  let sentence: String
  let language: String
  let mode: ContextMode

  static let bufferChars = 256
  private static let sentenceEndings: Set<Character> = [".", "!", "?", "\n"]

  var isAtWordBoundary: Bool { currentWord.isEmpty }
  var isSentenceStart: Bool { sentence.isEmpty }

  var wordBeforePrevious: String {
    let words = sentence.split(separator: " ")
    return words.count >= 2 ? String(words[words.count - 2]) : ""
  }

  static func sentence(of text: String) -> String {
    guard let last = text.lastIndex(where: { sentenceEndings.contains($0) }) else {
      return String(text.drop(while: { $0.isWhitespace }))
    }
    return String(text[text.index(after: last)...].drop(while: { $0.isWhitespace }))
  }

  static func read(from proxy: UITextDocumentProxy, language: String) -> CursorContext {
    let before = String((proxy.documentContextBeforeInput ?? "").suffix(bufferChars))

    var wordStart = before.endIndex
    while wordStart > before.startIndex, isWordCharacter(before[before.index(before: wordStart)]) {
      wordStart = before.index(before: wordStart)
    }

    var previousEnd = wordStart
    while previousEnd > before.startIndex, before[before.index(before: previousEnd)].isWhitespace {
      previousEnd = before.index(before: previousEnd)
    }
    var previousStart = previousEnd
    while previousStart > before.startIndex,
      isWordCharacter(before[before.index(before: previousStart)])
    {
      previousStart = before.index(before: previousStart)
    }

    return CursorContext(
      textBeforeCursor: before,
      currentWord: String(before[wordStart...]),
      previousWord: String(before[previousStart..<previousEnd]),
      sentence: sentence(of: before),
      language: language,
      mode: ContextMode.detect(proxy))
  }

  private static func isWordCharacter(_ character: Character) -> Bool {
    character.isLetter || character == "'"
  }
}
