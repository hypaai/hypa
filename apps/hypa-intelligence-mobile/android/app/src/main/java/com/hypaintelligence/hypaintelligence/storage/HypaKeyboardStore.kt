package com.hypaintelligence.hypaintelligence.storage

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import com.hypaintelligence.hypaintelligence.KeyboardLanguageCatalog
import com.hypaintelligence.hypaintelligence.KeyboardTool
import org.json.JSONObject

object HypaKeyboardStore {
  const val PREFS_NAME: String = "hypa_keyboard_store"
  const val KEY_SETTINGS_JSON: String = "settings_json"

  fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun defaultSettingsJson(): String =
    JSONObject()
      .put("languageId", "en")
      .put("name", "")
      .put("token", "")
      .put("translationProvider", KeyboardLanguageCatalog.defaultProviderName)
      .put("translationModel", KeyboardLanguageCatalog.defaultTranslationModelName)
      .put("dictionaryProvider", KeyboardLanguageCatalog.defaultProviderName)
      .put("dictionaryModel", KeyboardLanguageCatalog.defaultDictionaryModelName)
      .put("ttsProvider", KeyboardLanguageCatalog.defaultProviderName)
      .put("ttsModel", KeyboardLanguageCatalog.defaultTtsModelName)
      .put("sttProvider", KeyboardLanguageCatalog.defaultProviderName)
      .put("sttModel", KeyboardLanguageCatalog.defaultSttModelName)
      .put("voice", KeyboardLanguageCatalog.defaultVoice)
      .put("ttsLanguage", "en")
      .put("dictionaryLanguage", "English")
      .put("translateSourceLanguage", KeyboardLanguageCatalog.autoDetect.name)
      .put("translateTargetLanguage", "Yoruba")
      .put("longPressDurationMs", 500)
      .put("toolOrder", JSONArray(KeyboardTool.entries.map { it.name }))
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
      .put("soundEnabled", true)
      .put("predictiveBarEnabled", true)
      .put("autocorrectEnabled", true)
      .put("hapticsEnabled", true)
      .put("vibrationStrength", 100)
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
}
