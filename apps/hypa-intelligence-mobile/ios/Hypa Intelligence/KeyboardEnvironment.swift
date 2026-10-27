import Foundation

let appGroupId = "group.com.hypaintelligence.hypaintelligence"
let legacyAppGroupId = "group.com.hypaintelligence.keyboard"
let prefsKey = "settings_json"
let keyboardStorageDebugEventsKey = "keyboard_storage_debug_events"
let keyboardLoadedKey = "ios_keyboard_loaded"
let keyboardFullAccessKey = "ios_keyboard_full_access"
let keyboardFullAccessCheckedAtKey = "ios_keyboard_full_access_checked_at"

private let isKeyboardDevMode: Bool = {
  #if DEBUG
    return true
  #else
    return false
  #endif
}()

func devLog(_ format: String, _ args: CVarArg...) {
  guard isKeyboardDevMode else { return }
  NSLog("[HypaKeyboard] " + format, args)
}

func appendKeyboardStorageDebug(_ message: String, groupId: String) {
  let payload: [String: Any] = [
    "message": message,
    "groupId": groupId,
    "source": "keyboard-extension",
    "timestamp": Date().timeIntervalSince1970
  ]
  guard let defaults = UserDefaults(suiteName: appGroupId) ?? UserDefaults(suiteName: legacyAppGroupId) else {
    return
  }

  var events = defaults.array(forKey: keyboardStorageDebugEventsKey) as? [[String: Any]] ?? []
  events.append(payload)
  if events.count > 50 {
    events = Array(events.suffix(50))
  }
  defaults.set(events, forKey: keyboardStorageDebugEventsKey)
  defaults.synchronize()
  devLog("%@", message)
}

func keyboardSharedDefaults(reason: String) -> (defaults: UserDefaults, groupId: String) {
  if let defaults = UserDefaults(suiteName: appGroupId) {
    appendKeyboardStorageDebug("reading storage from \(appGroupId) for \(reason)", groupId: appGroupId)
    return (defaults, appGroupId)
  }

  if let defaults = UserDefaults(suiteName: legacyAppGroupId) {
    appendKeyboardStorageDebug("primary group unavailable, reading storage from \(legacyAppGroupId) for \(reason)", groupId: legacyAppGroupId)
    return (defaults, legacyAppGroupId)
  }

  appendKeyboardStorageDebug("all App Groups unavailable, reading standard UserDefaults for \(reason)", groupId: "standard")
  return (.standard, "standard")
}

private let keyboardApiBase: String = {
  let fallback = "https://api.hypaintelligence.com"
  guard
    let url = Bundle.main.url(forResource: "HypaEnvironment", withExtension: "plist"),
    let data = try? Data(contentsOf: url),
    let values = try? PropertyListSerialization.propertyList(from: data, format: nil)
      as? [String: Any],
    let configured = values["HypaAPIBaseURL"] as? String
  else {
    return fallback
  }

  let trimmed = configured.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty
    ? fallback : trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
}()

func keyboardDataContainerURL() -> URL {
  let manager = FileManager.default
  let directory = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
  try? manager.createDirectory(at: directory, withIntermediateDirectories: true)
  return directory
}

func apiURL(_ path: String) -> URL? {
  URL(string: keyboardApiBase + path)
}

func defaultSettingsJson() -> String {
  """
  {"languageId":"\(KeyboardLanguageCatalog.defaultSourceLanguage.code)","name":"","token":"","translationProvider":"\(KeyboardLanguageCatalog.defaultProviderName)","translationModel":"\(KeyboardLanguageCatalog.defaultTranslationModelName)","dictionaryProvider":"\(KeyboardLanguageCatalog.defaultProviderName)","dictionaryModel":"\(KeyboardLanguageCatalog.defaultDictionaryModelName)","ttsProvider":"\(KeyboardLanguageCatalog.defaultProviderName)","ttsModel":"\(KeyboardLanguageCatalog.defaultTtsModelName)","sttProvider":"\(KeyboardLanguageCatalog.defaultProviderName)","sttModel":"\(KeyboardLanguageCatalog.defaultSttModelName)","voice":"\(KeyboardLanguageCatalog.defaultVoice)","ttsLanguage":"\(KeyboardLanguageCatalog.defaultSourceLanguage.code)","dictionaryLanguage":"\(KeyboardLanguageCatalog.defaultDictionaryLanguage.name)","translateSourceLanguage":"\(KeyboardLanguageCatalog.autoDetect.name)","translateTargetLanguage":"\(KeyboardLanguageCatalog.defaultTargetLanguage.name)","longPressDurationMs":500,"usageStats":{"wordsSaved":0,"wordsTyped":0,"streakDays":0,"lastActiveDate":""},"appearance":"system","themeDark":{"surface":"#1A1A1A","toolbar":"#515151","key":"#515151","keyPressed":"#444444","label":"#FFFFFF","accent":"#515151","pill":"#FFFFFF","pillLabel":"#111111"},"themeLight":{"surface":"#D1D5DB","toolbar":"#FFFFFF","key":"#FFFFFF","keyPressed":"#E5E7EB","label":"#111111","accent":"#6B7280","pill":"#111111","pillLabel":"#FFFFFF"},"hapticsEnabled":true,"predictiveBarEnabled":true,"autocorrectEnabled":true,"vibrationStrength":100,"fontSize":24,"keyboardHeight":260}
  """
}
