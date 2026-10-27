package expo.modules.hypakeyboardstorage

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HypaKeyboardStorageModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HypaKeyboardStorage")

    Events("settingsChanged", "debugLog", "sharedStoreChanged")

    Function("getSharedStoreJson") {
      val ctx =
        appContext.reactContext?.applicationContext
          ?: throw IllegalStateException("HypaKeyboardStorage: React context not ready")
      HypaKeyboardSharedStoreFile.getSharedStoreJson(ctx)
    }

    AsyncFunction("setSharedStoreJson") { json: String ->
      val ctx =
        appContext.reactContext?.applicationContext
          ?: throw IllegalStateException("HypaKeyboardStorage: React context not ready")
      HypaKeyboardSharedStoreFile.setSharedStoreJson(ctx, json)
      sendEvent("sharedStoreChanged", mapOf("source" to "js"))
    }

    Function("getSettingsJson") {
      val ctx =
        appContext.reactContext?.applicationContext
          ?: throw IllegalStateException("HypaKeyboardStorage: React context not ready")
      HypaKeyboardSharedPrefs.getSettingsJson(ctx)
    }

    AsyncFunction("setSettingsJson") { json: String ->
      val ctx =
        appContext.reactContext?.applicationContext
          ?: throw IllegalStateException("HypaKeyboardStorage: React context not ready")
      HypaKeyboardSharedPrefs.setSettingsJson(ctx, json)
      sendEvent("settingsChanged", mapOf("source" to "js"))
    }

    Function("drainDebugEvents") {
      val ctx =
        appContext.reactContext?.applicationContext
          ?: throw IllegalStateException("HypaKeyboardStorage: React context not ready")
      val events = HypaKeyboardSharedPrefs.drainDebugEvents(ctx)
      events.forEach { sendEvent("debugLog", it) }
      events
    }
  }
}
