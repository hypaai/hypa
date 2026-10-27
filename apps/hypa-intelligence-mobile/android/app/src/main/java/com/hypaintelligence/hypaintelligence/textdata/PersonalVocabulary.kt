package com.hypaintelligence.hypaintelligence.textdata

import android.content.Context
import com.hypaintelligence.hypaintelligence.concurrent.KeyboardThreads
import java.io.File
import java.util.TreeMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class PersonalVocabulary(context: Context) {
  private companion object {
    const val FILE_NAME = "hypa_personal.txt"
    const val HEADER = "# hypa personal lexicon v1"
    const val WORDS_SECTION = "[words]"
    const val PAIRS_SECTION = "[pairs]"

    const val PROTECT_MIN_USES = 2

    const val MIN_LEARN_LENGTH = 2

    const val MAX_WORDS = 5000
    const val MAX_PAIRS = 20000

    const val FLUSH_DELAY_MS = 5000L
  }

  private val storeFile = File(context.applicationContext.filesDir, FILE_NAME)

  private var words = TreeMap<String, Int>()
  private var following = HashMap<String, HashMap<String, Int>>()

  private var pairCount = 0
  private var highestCount = 0
  private var flushScheduled = false

  @Volatile private var loaded = false

  private val io = Executors.newSingleThreadScheduledExecutor(KeyboardThreads.io("hypa-personal"))

  init {
    io.execute { load() }
  }

  val isReady: Boolean
    get() = loaded

  @Synchronized
  fun contains(word: String): Boolean =
    (words[TextNormalizer.normalize(word)] ?: 0) >= PROTECT_MIN_USES

  @Synchronized
  fun usageWeight(word: String): Float {
    if (highestCount <= 0) return 0f
    val count = words[TextNormalizer.normalize(word)] ?: return 0f
    return count / highestCount.toFloat()
  }

  @Synchronized
  fun prefix(prefix: String, limit: Int): List<String> {
    val needle = TextNormalizer.normalize(prefix)
    if (needle.isEmpty() || words.isEmpty()) return emptyList()
    return words
      .tailMap(needle, true)
      .entries
      .asSequence()
      .takeWhile { it.key.startsWith(needle) }
      .filter { it.key != needle }
      .rank(limit)
  }

  @Synchronized
  fun countWithPrefix(prefix: String): Int {
    val needle = TextNormalizer.normalize(prefix)
    return words.subMap(needle, needle + Char.MAX_VALUE).count { it.value >= PROTECT_MIN_USES }
  }

  @Synchronized
  fun following(word: String, limit: Int): List<LearnedWord> {
    val key = TextNormalizer.normalize(word)
    if (key.isEmpty()) return emptyList()
    return following[key]?.entries?.asSequence()?.weighted(limit).orEmpty()
  }

  fun record(previousWord: String, word: String) {
    io.execute { applyRecord(previousWord, word) }
  }

  @Synchronized
  private fun applyRecord(previousWord: String, word: String) {
    val key = learnable(word) ?: return
    if (!words.containsKey(key) && words.size >= MAX_WORDS) return
    val count = (words[key] ?: 0) + 1
    words[key] = count
    if (count > highestCount) highestCount = count

    val left = learnable(previousWord)
    if (left != null) {
      val nexts = following.getOrPut(left) { HashMap() }
      val existing = nexts[key]
      if (existing != null || pairCount < MAX_PAIRS) {
        nexts[key] = (existing ?: 0) + 1
        if (existing == null) pairCount++
      }
    }
    scheduleFlush()
  }

  private fun learnable(word: String): String? {
    val key = TextNormalizer.normalize(word.trim())
    if (key.length < MIN_LEARN_LENGTH) return null
    if (!key.all { it.isLetter() || it == '\'' }) return null
    return key
  }

  private fun Sequence<Map.Entry<String, Int>>.ranked(limit: Int): List<Map.Entry<String, Int>> =
    sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
      .take(limit)
      .toList()

  private fun Sequence<Map.Entry<String, Int>>.rank(limit: Int): List<String> =
    ranked(limit).map { it.key }

  private fun Sequence<Map.Entry<String, Int>>.weighted(limit: Int): List<LearnedWord> {
    val top = ranked(limit)
    val highest = top.firstOrNull()?.value?.toFloat() ?: return emptyList()
    return top.map { LearnedWord(it.key, it.value / highest) }
  }

  private fun scheduleFlush() {
    if (flushScheduled) return
    flushScheduled = true
    io.schedule({ flush() }, FLUSH_DELAY_MS, TimeUnit.MILLISECONDS)
  }

  private fun load() {
    val text = runCatching { storeFile.readText() }.getOrNull()
    val parsed = if (text != null) parse(text) else Parsed()
    synchronized(this) {
      words = parsed.words
      following = parsed.following
      pairCount = parsed.pairCount
      highestCount = parsed.highestCount
      loaded = true
    }
  }

  private fun parse(text: String): Parsed {
    val parsed = Parsed()
    var inPairs = false
    for (line in text.lineSequence()) {
      if (line.isBlank() || line.startsWith("#")) continue
      if (line == WORDS_SECTION) {
        inPairs = false
        continue
      }
      if (line == PAIRS_SECTION) {
        inPairs = true
        continue
      }
      val parts = line.split('\t')
      if (inPairs) {
        if (parts.size != 3) continue
        val count = parts[2].toIntOrNull() ?: continue
        parsed.following.getOrPut(parts[0]) { HashMap() }[parts[1]] = count
        parsed.pairCount++
      } else {
        if (parts.size != 2) continue
        val count = parts[1].toIntOrNull() ?: continue
        parsed.words[parts[0]] = count
        if (count > parsed.highestCount) parsed.highestCount = count
      }
    }
    return parsed
  }

  private class Parsed {
    val words = TreeMap<String, Int>()
    val following = HashMap<String, HashMap<String, Int>>()
    var pairCount = 0
    var highestCount = 0
  }

  private fun flush() {
    flushScheduled = false
    if (!loaded) return

    val temp = File(storeFile.parentFile, "$FILE_NAME.tmp")
    val wrote =
      runCatching {
        temp.bufferedWriter().use { out ->
          out.append(HEADER).append('\n')
          out.append(WORDS_SECTION).append('\n')
          for ((word, count) in words) {
            out.append(word).append('\t').append(count.toString()).append('\n')
          }
          out.append(PAIRS_SECTION).append('\n')
          for ((left, nexts) in following) {
            for ((right, count) in nexts) {
              out.append(left).append('\t').append(right).append('\t').append(count.toString())
                .append('\n')
            }
          }
        }
      }.isSuccess

    if (!wrote || !temp.renameTo(storeFile)) temp.delete()
  }
}
