import UIKit

struct KeyboardTheme {
  let surface: UIColor
  let toolbar: UIColor
  let key: UIColor
  let keyPressed: UIColor
  let label: UIColor
  let accent: UIColor
  let pill: UIColor
  let pillLabel: UIColor
}

enum KeyboardAppearance: String {
  case system, light, dark
}

struct KeyboardSettings {
  let themeLight: KeyboardTheme
  let themeDark: KeyboardTheme
  let appearance: KeyboardAppearance
  var interfaceStyle: UIUserInterfaceStyle = .dark

  var theme: KeyboardTheme {
    switch appearance {
    case .light: return themeLight
    case .dark: return themeDark
    case .system: return interfaceStyle == .light ? themeLight : themeDark
    }
  }

  let hapticsEnabled: Bool
  let longPressDurationMs: Int
  let predictiveBarEnabled: Bool
  let autocorrectEnabled: Bool
  let fontSize: CGFloat
  let keyboardHeight: CGFloat
  let languageId: String
  let name: String
  let token: String
  let translationProvider: String
  let translationModel: String
  let dictionaryProvider: String
  let dictionaryModel: String
  let ttsProvider: String
  let ttsModel: String
  let sttProvider: String
  let sttModel: String
  let voice: String
  let ttsLanguage: String
  let translateSourceLanguage: String
  let translateTargetLanguage: String
  let dictionaryLanguage: String
  let autoSpeakTranslationsKeyboard: Bool
  let autoTranslateOnLanguageChange: Bool
  let autoLookupOnLanguageChange: Bool

  func updating(
    voice: String? = nil,
    languageId: String? = nil,
    ttsLanguage: String? = nil,
    translateSourceLanguage: String? = nil,
    translateTargetLanguage: String? = nil,
    dictionaryLanguage: String? = nil
  ) -> KeyboardSettings {
    KeyboardSettings(
      themeLight: themeLight,
      themeDark: themeDark,
      appearance: appearance,
      interfaceStyle: interfaceStyle,
      hapticsEnabled: hapticsEnabled,
      longPressDurationMs: longPressDurationMs,
      predictiveBarEnabled: predictiveBarEnabled,
      autocorrectEnabled: autocorrectEnabled,
      fontSize: fontSize,
      keyboardHeight: keyboardHeight,
      languageId: languageId ?? self.languageId,
      name: name,
      token: token,
      translationProvider: translationProvider,
      translationModel: translationModel,
      dictionaryProvider: dictionaryProvider,
      dictionaryModel: dictionaryModel,
      ttsProvider: ttsProvider,
      ttsModel: ttsModel,
      sttProvider: sttProvider,
      sttModel: sttModel,
      voice: voice ?? self.voice,
      ttsLanguage: ttsLanguage ?? self.ttsLanguage,
      translateSourceLanguage: translateSourceLanguage ?? self.translateSourceLanguage,
      translateTargetLanguage: translateTargetLanguage ?? self.translateTargetLanguage,
      dictionaryLanguage: dictionaryLanguage ?? self.dictionaryLanguage,
      autoSpeakTranslationsKeyboard: autoSpeakTranslationsKeyboard,
      autoTranslateOnLanguageChange: autoTranslateOnLanguageChange,
      autoLookupOnLanguageChange: autoLookupOnLanguageChange
    )
  }
}

struct TranslationLanguage: Equatable {
  let code: String
  let name: String
}

struct TranslationPayload {
  let translatedText: String
  let thinkingText: String?
  let detectedLanguage: String?
}

struct DictionaryDefinitionItem {
  let partOfSpeech: String?
  let text: String
  let context: String?
}

struct DictionaryUsageItem {
  let partOfSpeech: String
  let example: String
}

struct DictionaryResultCardData {
  let word: String
  let language: String
  let pronunciation: String?
  let partOfSpeech: String?
  let definitions: [DictionaryDefinitionItem]
  let usageExamples: [DictionaryUsageItem]
  let synonyms: [String]
  let antonyms: [String]
  let exampleSentences: [String]
  let culturalContext: String?
  let funFact: String?
}

enum KeyboardBoardMode {
  case alphabet
  case symbols
  case symbolsExtended
  case numeric

  var isSymbolBoard: Bool { self == .symbols || self == .symbolsExtended }
}

enum FeatureMode {
  case keyboard
  case emoji
  case translate
  case languagePicker
  case thinkingView
  case dictionary
  case dictionaryLanguagePicker
  case dictionaryResult
  case clipboard
  case keyboardLanguagePicker
  case loginRequired
  case stt
  case tts
  case ttsLanguagePicker
  case sttLanguagePicker
  case textEditing
}
