import ExpoModulesCore
import UIKit

private let appGroupId = "group.com.hypaintelligence.hypaintelligence"
private let keyboardLoadedKey = "ios_keyboard_loaded"
private let keyboardFullAccessKey = "ios_keyboard_full_access"

public class HypaKeyboardInputMethodPickerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HypaKeyboardInputMethodPicker")

    Function("isHypaKeyboardEnabled") { () -> Bool in
      let bundleIdentifier = Bundle.main.bundleIdentifier ?? ""
      let keyboards = UserDefaults.standard.array(forKey: "AppleKeyboards") as? [String] ?? []
      return keyboards.contains { keyboard in
        keyboard.contains(bundleIdentifier) && keyboard.localizedCaseInsensitiveContains("Hypa")
      }
    }

    Function("isHypaKeyboardSelected") { () -> Bool in
      false
    }

    Function("hasHypaKeyboardBeenOpened") { () -> Bool in
      keyboardDefaults().bool(forKey: keyboardLoadedKey)
    }

    Function("isHypaKeyboardFullAccessGranted") { () -> Bool in
      keyboardDefaults().bool(forKey: keyboardFullAccessKey)
    }

    AsyncFunction("showInputMethodPicker") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
          promise.reject("E_OPEN_SETTINGS_URL", "Unable to create Settings URL.")
          return
        }

        UIApplication.shared.open(url) { success in
          if success {
            promise.resolve(nil)
          } else {
            promise.reject("E_OPEN_SETTINGS", "Unable to open keyboard settings.")
          }
        }
      }
    }
  }
}

private func keyboardDefaults() -> UserDefaults {
  UserDefaults(suiteName: appGroupId) ?? .standard
}
