package com.hypaintelligence.hypaintelligence.emoji

import android.content.Context
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class RecentEmojiStore(context: Context) {
  private companion object {
    const val FILE_NAME = "hypa_recent_emoji.txt"

    const val MAX_ENTRIES = 48
    const val FLUSH_DELAY_MS = 3000L
  }

  private val storeFile = File(context.applicationContext.filesDir, FILE_NAME)

  private val recent = ArrayList<String>(MAX_ENTRIES)
  private var flushScheduled = false

  @Volatile private var loaded = false

  private val io =
    Executors.newSingleThreadScheduledExecutor { r ->
      Thread(r, "hypa-emoji-recent").apply { isDaemon = true }
    }

  init {
    io.execute { load() }
  }

  val isReady: Boolean
    get() = loaded

  @Synchronized
  fun recent(): List<String> = ArrayList(recent)

  fun record(sequence: String) {
    if (sequence.isEmpty()) return
    io.execute { applyRecord(sequence) }
  }

  @Synchronized
  private fun applyRecord(sequence: String) {
    recent.remove(sequence)
    recent.add(0, sequence)
    while (recent.size > MAX_ENTRIES) recent.removeAt(recent.size - 1)
    scheduleFlush()
  }

  private fun scheduleFlush() {
    if (flushScheduled) return
    flushScheduled = true
    io.schedule({ flush() }, FLUSH_DELAY_MS, TimeUnit.MILLISECONDS)
  }

  private fun load() {
    val text = runCatching { storeFile.readText() }.getOrNull()
    synchronized(this) {
      if (text != null) {
        text.lineSequence()
          .filter { it.isNotBlank() && !it.startsWith("#") }
          .take(MAX_ENTRIES)
          .forEach { recent.add(it) }
      }
      loaded = true
    }
  }

  private fun flush() {
    val snapshot: List<String>
    synchronized(this) {
      flushScheduled = false
      if (!loaded) return
      snapshot = ArrayList(recent)
    }
    runCatching { storeFile.writeText(snapshot.joinToString("\n")) }
  }
}
