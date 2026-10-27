package com.hypaintelligence.hypaintelligence.emoji

import android.content.Context
import android.util.Log
import androidx.emoji2.text.DefaultEmojiCompatConfig
import androidx.emoji2.text.EmojiCompat

object EmojiCompatBootstrap {
  private const val TAG = "EmojiCompatBootstrap"

  fun initialize(context: Context) {
    if (EmojiCompat.isConfigured()) return
    runCatching {
      val config = DefaultEmojiCompatConfig.create(context.applicationContext)
      if (config == null) {
        Log.i(TAG, "No downloadable emoji font provider; using the device's own emoji font")
        return
      }
      config.setReplaceAll(false)
      EmojiCompat.init(config)
    }.onFailure { Log.w(TAG, "EmojiCompat unavailable", it) }
  }
}
