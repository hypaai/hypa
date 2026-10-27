package expo.modules.hypakeyboardstorage

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

object HypaKeyboardSharedPrefs {
  const val PREFS_NAME: String = "hypa_keyboard_store"
  const val KEY_SETTINGS_JSON: String = "settings_json"
  const val KEY_DEBUG_EVENTS: String = "keyboard_storage_debug_events"
  private const val MAX_DEBUG_EVENTS: Int = 50

  fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun defaultSettingsJson(): String =
    JSONObject()
      .put("languageId", "en")
      .put("name", "")
      .put("token", "")
      .put("translationProvider", HypaKeyboardGeneratedDefaults.provider)
      .put("translationModel", HypaKeyboardGeneratedDefaults.translationModel)
      .put("dictionaryProvider", HypaKeyboardGeneratedDefaults.provider)
      .put("dictionaryModel", HypaKeyboardGeneratedDefaults.dictionaryModel)
      .put("ttsProvider", HypaKeyboardGeneratedDefaults.provider)
      .put("ttsModel", HypaKeyboardGeneratedDefaults.ttsModel)
      .put("sttProvider", HypaKeyboardGeneratedDefaults.provider)
      .put("sttModel", HypaKeyboardGeneratedDefaults.sttModel)
      .put("voice", HypaKeyboardGeneratedDefaults.voice)
      .put("ttsLanguage", "en")
      .put("dictionaryLanguage", "English")
      .put("translateSourceLanguage", HypaKeyboardGeneratedDefaults.translateSourceLanguage)
      .put("translateTargetLanguage", "Yoruba")
      .put("longPressDurationMs", 500)
      .put(
        "usageStats",
        JSONObject()
          .put("wordsSaved", 0)
          .put("wordsTyped", 0)
          .put("streakDays", 0)
          .put("lastActiveDate", ""),
      )
      .put("appearance", "system")
      .put(
        "themeDark",
        JSONObject()
          .put("surface", "#1A1A1A")
          .put("toolbar", "#515151")
          .put("key", "#515151")
          .put("keyPressed", "#444444")
          .put("label", "#FFFFFF")
          .put("accent", "#515151")
          .put("pill", "#FFFFFF")
          .put("pillLabel", "#111111"),
      )
      .put(
        "themeLight",
        JSONObject()
          .put("surface", "#D1D5DB")
          .put("toolbar", "#FFFFFF")
          .put("key", "#FFFFFF")
          .put("keyPressed", "#E5E7EB")
          .put("label", "#111111")
          .put("accent", "#6B7280")
          .put("pill", "#111111")
          .put("pillLabel", "#FFFFFF"),
      )
      .put("predictiveBarEnabled", true)
      .put("autocorrectEnabled", true)
      .put("hapticsEnabled", true)
      .put("vibrationStrength", 255)
      .put("fontSize", 15)
      .put("keyboardHeight", 260)
      .toString()

  fun getSettingsJson(context: Context): String {
    val raw = prefs(context).getString(KEY_SETTINGS_JSON, null)
    return if (raw.isNullOrBlank()) {
      defaultSettingsJson()
    } else {
      raw
    }
  }

  fun setSettingsJson(context: Context, json: String) {
    prefs(context).edit().putString(KEY_SETTINGS_JSON, json).apply()
  }

  fun appendDebugEvent(context: Context, message: String, source: String) {
    val store = prefs(context)
    val events = readDebugEventsArray(store)
    events.put(
      JSONObject()
        .put("message", message)
        .put("groupId", PREFS_NAME)
        .put("source", source)
        .put("timestamp", System.currentTimeMillis() / 1000.0),
    )
    while (events.length() > MAX_DEBUG_EVENTS) {
      events.remove(0)
    }
    store.edit().putString(KEY_DEBUG_EVENTS, events.toString()).apply()
  }

  fun drainDebugEvents(context: Context): List<Map<String, Any>> {
    val store = prefs(context)
    val events = readDebugEventsArray(store)
    store.edit().remove(KEY_DEBUG_EVENTS).apply()

    val drained = ArrayList<Map<String, Any>>(events.length())
    for (i in 0 until events.length()) {
      val event = events.optJSONObject(i) ?: continue
      drained.add(
        mapOf(
          "message" to event.optString("message"),
          "groupId" to event.optString("groupId", PREFS_NAME),
          "source" to event.optString("source"),
          "timestamp" to event.optDouble("timestamp", 0.0),
        ),
      )
    }
    return drained
  }

  private fun readDebugEventsArray(store: SharedPreferences): JSONArray {
    val raw = store.getString(KEY_DEBUG_EVENTS, null) ?: return JSONArray()
    return runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
  }
}
