package com.hypaintelligence.hypaintelligence.storage

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

internal data class KeyboardClip(
  val text: String,
  val pinned: Boolean,
  val copiedAtMs: Long,
)

internal object HypaKeyboardClipStore {
  private const val TAG = "HypaKeyboardClipStore"

  private const val PREFS_NAME = "hypa_keyboard_clips"
  private const val KEY_CLIPS_JSON = "clips_json"
  private const val KEY_OPTED_IN = "clipboard_history_opted_in"

  private const val MAX_UNPINNED_CLIPS = 15

  private const val MAX_PINNED_CLIPS = 5

  private const val UNPINNED_TTL_MS = 60L * 60L * 1000L

  var revision: Int = 0
    private set

  private var suppressedClipText: String? = null

  fun optIn(context: Context) {
    prefs(context).edit().putBoolean(KEY_OPTED_IN, true).apply()
  }

  @Synchronized
  fun clips(context: Context): List<KeyboardClip> {
    val stored = read(context)
    val now = System.currentTimeMillis()
    val alive = stored.filter { it.pinned || now - it.copiedAtMs < UNPINNED_TTL_MS }
    if (alive.size != stored.size) write(context, alive)
    return alive
  }

  @Synchronized
  fun record(context: Context, text: String) {
    val text = java.text.Normalizer.normalize(text, java.text.Normalizer.Form.NFC)
    if (text.isBlank()) return
    if (suppressedClipText == text) {
      suppressedClipText = null
      return
    }
    val stored = read(context)
    if (stored.maxByOrNull { it.copiedAtMs }?.text == text) return
    val entry =
      KeyboardClip(
        text = text,
        pinned = stored.firstOrNull { it.text == text }?.pinned ?: false,
        copiedAtMs = System.currentTimeMillis(),
      )
    write(context, listOf(entry) + stored.filter { it.text != text })
    revision += 1
  }

  @Synchronized
  fun setPinned(context: Context, text: String, pinned: Boolean): Boolean {
    val stored = read(context)
    val target = stored.firstOrNull { it.text == text } ?: return false
    if (pinned && !target.pinned && stored.count { it.pinned } >= MAX_PINNED_CLIPS) return false
    val toggledAtMs = if (!pinned && target.pinned) System.currentTimeMillis() else target.copiedAtMs
    write(
      context,
      stored.map {
        if (it.text == text) it.copy(pinned = pinned, copiedAtMs = toggledAtMs) else it
      },
    )
    revision += 1
    return true
  }

  @Synchronized
  fun delete(context: Context, text: String) {
    write(context, read(context).filterNot { it.text == text })
    revision += 1
  }

  fun captureCurrentClip(context: Context) {
    if (!prefs(context).getBoolean(KEY_OPTED_IN, false)) return
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    val text = currentClipText(context, clipboard) ?: return
    record(context, text)
  }

  fun setCurrentClip(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
    runCatching {
      suppressedClipText = text
      clipboard.setPrimaryClip(ClipData.newPlainText(null, text))
    }.onFailure {
      suppressedClipText = null
      Log.w(TAG, "Failed to set current clip", it)
    }
  }

  fun currentClipText(
    context: Context,
    clipboard: ClipboardManager? =
      context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager,
  ): String? =
    runCatching {
      val clip = clipboard?.primaryClip ?: return null
      if (clip.itemCount == 0) return null
      if (clip.description?.extras?.getBoolean(ClipDescription.EXTRA_IS_SENSITIVE) == true) return null
      clip.getItemAt(0)?.coerceToText(context)?.toString()?.takeIf { it.isNotEmpty() }
    }.getOrNull()

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun read(context: Context): List<KeyboardClip> {
    val raw = prefs(context).getString(KEY_CLIPS_JSON, null) ?: return emptyList()
    val array = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
    return buildList {
      for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: continue
        val text = item.optString("text")
        if (text.isEmpty()) continue
        add(KeyboardClip(text, item.optBoolean("pinned"), item.optLong("copiedAtMs")))
      }
    }
  }

  private fun write(context: Context, clips: List<KeyboardClip>) {
    runCatching {
      val pinned =
        clips.filter { it.pinned }.sortedByDescending { it.copiedAtMs }.take(MAX_PINNED_CLIPS)
      val unpinned =
        clips.filterNot { it.pinned }.sortedByDescending { it.copiedAtMs }.take(MAX_UNPINNED_CLIPS)
      val array = JSONArray()
      (pinned + unpinned).forEach {
        array.put(
          JSONObject()
            .put("text", it.text)
            .put("pinned", it.pinned)
            .put("copiedAtMs", it.copiedAtMs),
        )
      }
      prefs(context).edit().putString(KEY_CLIPS_JSON, array.toString()).apply()
    }.onFailure {
      Log.w(TAG, "Failed to persist clips", it)
    }
  }
}
