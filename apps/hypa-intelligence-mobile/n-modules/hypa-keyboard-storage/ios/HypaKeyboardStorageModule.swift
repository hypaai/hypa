import ExpoModulesCore

private let appGroupId = "group.com.hypaintelligence.hypaintelligence"
private let legacyAppGroupId = "group.com.hypaintelligence.keyboard"
private let prefsKey = "settings_json"
private let debugEventsKey = "keyboard_storage_debug_events"
private let sharedStoreFileName = "hypa_shared_store.json"

private func sharedContainerURL() -> URL? {
  let manager = FileManager.default
  return manager.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
    ?? manager.containerURL(forSecurityApplicationGroupIdentifier: legacyAppGroupId)
}

private func sharedStoreURL() -> URL? {
  sharedContainerURL()?.appendingPathComponent(sharedStoreFileName)
}

private func emptySharedStoreJson() -> String {
  "{\"version\":1,\"updatedAt\":0,\"entries\":{},\"lexicon\":[]}"
}

private func debugPayload(_ message: String, groupId: String, source: String) -> [String: Any] {
  [
    "message": message,
    "groupId": groupId,
    "source": source,
    "timestamp": Date().timeIntervalSince1970
  ]
}

private func appendKeyboardStorageDebug(_ payload: [String: Any]) {
  guard let defaults = UserDefaults(suiteName: appGroupId) ?? UserDefaults(suiteName: legacyAppGroupId) else {
    return
  }

  var events = defaults.array(forKey: debugEventsKey) as? [[String: Any]] ?? []
  events.append(payload)
  if events.count > 50 {
    events = Array(events.suffix(50))
  }
  defaults.set(events, forKey: debugEventsKey)
  defaults.synchronize()
}

private func defaultSettingsJson() -> String {
  """
  {"languageId":"en","name":"","token":"","translationProvider":"\(HypaKeyboardGeneratedDefaults.provider)","translationModel":"\(HypaKeyboardGeneratedDefaults.translationModel)","dictionaryProvider":"\(HypaKeyboardGeneratedDefaults.provider)","dictionaryModel":"\(HypaKeyboardGeneratedDefaults.dictionaryModel)","ttsProvider":"\(HypaKeyboardGeneratedDefaults.provider)","ttsModel":"\(HypaKeyboardGeneratedDefaults.ttsModel)","sttProvider":"\(HypaKeyboardGeneratedDefaults.provider)","sttModel":"\(HypaKeyboardGeneratedDefaults.sttModel)","voice":"\(HypaKeyboardGeneratedDefaults.voice)","ttsLanguage":"en","dictionaryLanguage":"English","translateSourceLanguage":"\(HypaKeyboardGeneratedDefaults.translateSourceLanguage)","translateTargetLanguage":"Yoruba","longPressDurationMs":500,"usageStats":{"wordsSaved":0,"wordsTyped":0,"streakDays":0,"lastActiveDate":""},"appearance":"system","themeDark":{"surface":"#1A1A1A","toolbar":"#515151","key":"#515151","keyPressed":"#444444","label":"#FFFFFF","accent":"#515151","pill":"#FFFFFF","pillLabel":"#111111"},"themeLight":{"surface":"#D1D5DB","toolbar":"#FFFFFF","key":"#FFFFFF","keyPressed":"#E5E7EB","label":"#111111","accent":"#6B7280","pill":"#111111","pillLabel":"#FFFFFF"},"predictiveBarEnabled":true,"autocorrectEnabled":true,"hapticsEnabled":true,"vibrationStrength":255,"fontSize":24,"keyboardHeight":260}
  """
}

private func keyboardDefaults() -> UserDefaults {
  guard let sharedDefaults = UserDefaults(suiteName: appGroupId) else {
    NSLog("[HypaKeyboardStorage] App Group unavailable, falling back to standard UserDefaults")
    appendKeyboardStorageDebug(debugPayload(
      "App Group unavailable, falling back to standard UserDefaults",
      groupId: appGroupId,
      source: "main-app"
    ))
    return UserDefaults.standard
  }

  if sharedDefaults.string(forKey: prefsKey) == nil,
     let legacyJson = legacySettingsJson(),
     !legacyJson.isEmpty {
    sharedDefaults.set(legacyJson, forKey: prefsKey)
    sharedDefaults.synchronize()
    NSLog("[HypaKeyboardStorage] Migrated legacy settings_json=%@", legacyJson)
    appendKeyboardStorageDebug(debugPayload(
      "Migrated legacy settings_json=\(legacyJson)",
      groupId: appGroupId,
      source: "main-app"
    ))
  }

  return sharedDefaults
}

private func legacySettingsJson() -> String? {
  if let appGroupDefaults = UserDefaults(suiteName: legacyAppGroupId),
     let json = appGroupDefaults.string(forKey: prefsKey),
     !json.isEmpty {
    return json
  }

  if let json = UserDefaults.standard.string(forKey: prefsKey), !json.isEmpty {
    return json
  }

  return nil
}

public class HypaKeyboardStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HypaKeyboardStorage")

    Events("settingsChanged", "debugLog", "sharedStoreChanged")

    Function("getSharedStoreJson") { () -> String in
      guard
        let url = sharedStoreURL(),
        let data = try? Data(contentsOf: url),
        let json = String(data: data, encoding: .utf8),
        !json.isEmpty
      else {
        return emptySharedStoreJson()
      }
      return json
    }

    AsyncFunction("setSharedStoreJson") { (json: String) in
      guard let url = sharedStoreURL() else {
        throw Exception(
          name: "SharedStoreUnavailable",
          description: "App Group container \(appGroupId) is unavailable"
        )
      }
      guard let data = json.data(using: .utf8) else {
        throw Exception(name: "SharedStoreEncoding", description: "Shared store JSON is not UTF-8")
      }
      try data.write(to: url, options: .atomic)
      self.sendEvent("sharedStoreChanged", ["source": "js"])
    }

    Function("getSettingsJson") { () -> String in
      let defaults = keyboardDefaults()
      if let existing = defaults.string(forKey: prefsKey), !existing.isEmpty {
        NSLog("[HypaKeyboardStorage] getSettingsJson=%@", existing)
        self.sendEvent("debugLog", debugPayload(
          "getSettingsJson from \(appGroupId)",
          groupId: appGroupId,
          source: "main-app"
        ))
        return existing
      }
      let fallback = defaultSettingsJson()
      NSLog("[HypaKeyboardStorage] getSettingsJson fallback=%@", fallback)
      self.sendEvent("debugLog", debugPayload(
        "getSettingsJson fallback from \(appGroupId)",
        groupId: appGroupId,
        source: "main-app"
      ))
      return fallback
    }

    AsyncFunction("setSettingsJson") { (json: String) in
      let defaults = keyboardDefaults()
      defaults.set(json, forKey: prefsKey)
      defaults.synchronize()
      NSLog("[HypaKeyboardStorage] setSettingsJson=%@", json)
      self.sendEvent("settingsChanged", ["source": "js"])
      self.sendEvent("debugLog", debugPayload(
        "setSettingsJson to \(appGroupId)",
        groupId: appGroupId,
        source: "main-app"
      ))
    }

    Function("drainDebugEvents") { () -> [[String: Any]] in
      let defaults = UserDefaults(suiteName: appGroupId)
        ?? UserDefaults(suiteName: legacyAppGroupId)
        ?? UserDefaults.standard
      let events = defaults.array(forKey: debugEventsKey) as? [[String: Any]] ?? []
      defaults.removeObject(forKey: debugEventsKey)
      defaults.synchronize()
      for event in events {
        self.sendEvent("debugLog", event)
      }
      return events
    }
  }
}
