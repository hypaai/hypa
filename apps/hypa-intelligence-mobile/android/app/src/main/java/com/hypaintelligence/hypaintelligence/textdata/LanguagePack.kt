package com.hypaintelligence.hypaintelligence.textdata

import android.content.res.AssetManager
import java.io.InputStream
import java.util.TreeMap

class LanguagePack private constructor(
  val languageCode: String,
  private val plain: SortedWordBytes?,
  private val accented: TreeMap<String, String>,
  val alphabet: Set<Char>,
  private val common: List<String>? = null,
) {
  fun contains(normalized: String): Boolean =
    accented.containsKey(normalized) || plain?.contains(normalized) == true

  fun isCommon(normalized: String): Boolean = common?.let { it.binarySearch(normalized) >= 0 } ?: contains(normalized)

  fun commonWithPrefix(prefix: String): Int {
    val list = common ?: return 0
    fun lowerBound(key: String) = list.binarySearch(key).let { if (it < 0) -it - 1 else it }
    return lowerBound(prefix + Char.MAX_VALUE) - lowerBound(prefix)
  }

  fun canonical(normalized: String): String? =
    accented[normalized] ?: normalized.takeIf { plain?.contains(it) == true }

  fun prefix(normalized: String, limit: Int): List<String> {
    if (normalized.isEmpty()) return emptyList()
    val matches = ArrayList<String>(limit * 2)
    plain?.shortestWithPrefix(normalized, limit, limit * SCAN_HEADROOM)?.let(matches::addAll)
    accented
      .tailMap(normalized, true)
      .entries
      .asSequence()
      .takeWhile { it.key.startsWith(normalized) }
      .forEach { matches.add(it.value) }

    return matches
      .asSequence()
      .filter { TextNormalizer.normalize(it) != normalized }
      .sortedWith(compareBy<String> { it.length }.thenBy { it })
      .take(limit)
      .toList()
  }

  companion object {
    private const val SCAN_HEADROOM = 40

    fun load(assets: AssetManager, languageCode: String): LanguagePack? =
      runCatching { assets.open("text-data/$languageCode/words.txt") }
        .getOrNull()
        ?.let { parse(languageCode, it) }
        ?.let { pack ->
          val common =
            runCatching { assets.open("text-data/$languageCode/common.txt") }
              .getOrNull()
              ?.bufferedReader(Charsets.UTF_8)
              ?.useLines { lines -> lines.map { TextNormalizer.normalize(it.trim()) }.filter { it.isNotEmpty() }.toSortedSet().toList() }
          if (common == null) pack else LanguagePack(pack.languageCode, pack.plain, pack.accented, pack.alphabet, common)
        }

    internal fun parse(languageCode: String, input: InputStream): LanguagePack? {
      val plain = PackedWordBuilder()
      val accented = TreeMap<String, String>()
      val alphabet = HashSet<Char>()

      val read =
        runCatching {
          input.bufferedReader(Charsets.UTF_8).useLines {
            for (line in it) {
              if (line.isBlank() || line.startsWith("#")) continue
              val word = java.text.Normalizer.normalize(line.trim(), java.text.Normalizer.Form.NFC)
              if (word.isEmpty()) continue
              val key = TextNormalizer.normalize(word)
              if (key.isEmpty()) continue
              key.forEach { c -> alphabet.add(c) }
              if (key == word && word.all { c -> c.code < 128 }) {
                plain.add(word)
              } else {
                accented.putIfAbsent(key, word)
              }
            }
          }
        }
          .isSuccess
      if (!read) return null
      if (plain.isEmpty && accented.isEmpty()) return null

      return LanguagePack(languageCode, plain.build(), accented, alphabet)
    }
  }
}

private class PackedWordBuilder {
  private var bytes = ByteArray(INITIAL_BYTES)
  private var starts = IntArray(INITIAL_WORDS + 1)
  private var count = 0
  private var length = 0
  private var sorted = true

  val isEmpty: Boolean
    get() = count == 0

  fun add(word: String) {
    if (length + word.length > bytes.size) {
      bytes = bytes.copyOf(maxOf(bytes.size * 2, length + word.length))
    }
    if (count + 2 > starts.size) starts = starts.copyOf(starts.size * 2)

    val start = length
    for (c in word) bytes[length++] = c.code.toByte()
    if (sorted && count > 0 && compareEntries(starts[count - 1], start, start, length) > 0) {
      sorted = false
    }
    starts[count++] = start
    starts[count] = length
  }

  fun build(): SortedWordBytes? {
    if (count == 0) return null
    val packedBytes = bytes.copyOf(length)
    val packedStarts = starts.copyOf(count + 1)
    if (sorted) return SortedWordBytes(packedBytes, packedStarts)

    val words = ArrayList<String>(count)
    for (index in 0 until count) {
      val from = packedStarts[index]
      val chars = CharArray(packedStarts[index + 1] - from)
      for (i in chars.indices) chars[i] = packedBytes[from + i].toInt().toChar()
      words.add(String(chars))
    }
    words.sort()
    return SortedWordBytes.of(words)
  }

  private fun compareEntries(aFrom: Int, aTo: Int, bFrom: Int, bTo: Int): Int {
    var a = aFrom
    var b = bFrom
    while (a < aTo && b < bTo) {
      val left = bytes[a].toInt() and 0xFF
      val right = bytes[b].toInt() and 0xFF
      if (left != right) return left - right
      a++
      b++
    }
    return (aTo - aFrom) - (bTo - bFrom)
  }

  private companion object {
    const val INITIAL_BYTES = 1 shl 16
    const val INITIAL_WORDS = 1 shl 13
  }
}

class SortedWordBytes internal constructor(
  private val bytes: ByteArray,
  private val starts: IntArray,
) {
  companion object {
    internal fun of(sortedWords: List<String>): SortedWordBytes {
      var total = 0
      for (word in sortedWords) total += word.length
      val bytes = ByteArray(total)
      val starts = IntArray(sortedWords.size + 1)
      var offset = 0
      for ((index, word) in sortedWords.withIndex()) {
        starts[index] = offset
        for (c in word) bytes[offset++] = c.code.toByte()
      }
      starts[sortedWords.size] = offset
      return SortedWordBytes(bytes, starts)
    }
  }

  val size: Int
    get() = starts.size - 1

  fun contains(word: String): Boolean {
    if (word.isEmpty() || word.any { it.code >= 128 }) return false
    val index = lowerBound(word)
    return index < size && compareAt(index, word) == 0
  }

  fun shortestWithPrefix(prefix: String, want: Int, scanCap: Int): List<String> {
    if (prefix.isEmpty() || want <= 0 || prefix.any { it.code >= 128 }) return emptyList()
    val bestIndex = IntArray(want)
    val bestLength = IntArray(want)
    var held = 0

    var index = lowerBound(prefix)
    var scanned = 0
    while (index < size && scanned < scanCap) {
      if (!startsWith(index, prefix)) break
      val length = starts[index + 1] - starts[index]
      if (held < want || length < bestLength[held - 1]) {
        var slot = if (held < want) held++ else want - 1
        while (slot > 0 && bestLength[slot - 1] > length) {
          bestLength[slot] = bestLength[slot - 1]
          bestIndex[slot] = bestIndex[slot - 1]
          slot--
        }
        bestLength[slot] = length
        bestIndex[slot] = index
      }
      scanned++
      index++
    }
    return (0 until held).map { wordAt(bestIndex[it]) }
  }

  fun startsWith(index: Int, prefix: String): Boolean {
    val from = starts[index]
    if (starts[index + 1] - from < prefix.length) return false
    for (i in prefix.indices) {
      if ((bytes[from + i].toInt() and 0xFF) != prefix[i].code) return false
    }
    return true
  }

  fun wordAt(index: Int): String {
    val from = starts[index]
    val to = starts[index + 1]
    val chars = CharArray(to - from)
    for (i in chars.indices) chars[i] = bytes[from + i].toInt().toChar()
    return String(chars)
  }

  fun lowerBound(word: String): Int {
    var low = 0
    var high = size
    while (low < high) {
      val mid = (low + high) ushr 1
      if (compareAt(mid, word) < 0) low = mid + 1 else high = mid
    }
    return low
  }

  fun compareAt(index: Int, word: String): Int {
    var pos = starts[index]
    val end = starts[index + 1]
    var i = 0
    while (pos < end && i < word.length) {
      val stored = bytes[pos].toInt() and 0xFF
      val wanted = word[i].code
      if (stored != wanted) return stored - wanted
      pos++
      i++
    }
    return (end - starts[index]) - word.length
  }
}
