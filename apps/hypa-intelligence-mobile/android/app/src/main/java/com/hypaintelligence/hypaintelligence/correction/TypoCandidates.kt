package com.hypaintelligence.hypaintelligence.correction

object TypoCandidates {
  private const val COLLAPSE_DOUBLE_FACTOR = 0.9f
  private const val COLLAPSE_SINGLE_FACTOR = 0.85f
  private const val DELETION_FACTOR = 0.85f
  private const val TRANSPOSITION_FACTOR = 0.95f
  private const val INSERTION_FACTOR = 0.85f
  private const val SUBSTITUTION_FACTOR = 1f

  private val dottedPairs =
    mapOf('ẹ' to 'e', 'ọ' to 'o', 'ṣ' to 's', 'e' to 'ẹ', 'o' to 'ọ', 's' to 'ṣ')

  private val substitutes: Map<Char, CharArray> =
    buildMap {
      val keys = KeyboardNeighbors.keys + dottedPairs.keys
      for (key in keys) {
        val options = KeyboardNeighbors.of(key) + setOfNotNull(dottedPairs[key])
        if (options.isNotEmpty()) put(key, options.toCharArray())
      }
    }

  fun generate(word: String, alphabet: CharArray, consider: (String, Float) -> Unit) {
    val length = word.length
    if (length == 0) return
    val buffer = word.toCharArray()

    var collapsed = collapseRuns(word, 2)
    if (collapsed != word) consider(collapsed, COLLAPSE_DOUBLE_FACTOR)
    collapsed = collapseRuns(word, 1)
    if (collapsed != word) consider(collapsed, COLLAPSE_SINGLE_FACTOR)

    if (length > 1) {
      val shorter = CharArray(length - 1)
      for (i in 0 until length) {
        var out = 0
        for (j in 0 until length) {
          if (j != i) shorter[out++] = buffer[j]
        }
        consider(String(shorter), DELETION_FACTOR)
      }
    }

    for (i in 0 until length - 1) {
      val tmp = buffer[i]
      buffer[i] = buffer[i + 1]
      buffer[i + 1] = tmp
      consider(String(buffer), TRANSPOSITION_FACTOR)
      buffer[i + 1] = buffer[i]
      buffer[i] = tmp
    }

    for (i in 0 until length) {
      val typed = buffer[i]
      val options = substitutes[typed] ?: continue
      for (c in options) {
        if (c == typed) continue
        buffer[i] = c
        consider(String(buffer), SUBSTITUTION_FACTOR)
      }
      buffer[i] = typed
    }

    val longer = CharArray(length + 1)
    for (i in 0..length) {
      for (j in 0 until i) longer[j] = buffer[j]
      for (j in i until length) longer[j + 1] = buffer[j]
      for (c in alphabet) {
        longer[i] = c
        consider(String(longer), INSERTION_FACTOR)
      }
    }
  }

  private fun collapseRuns(word: String, maxRun: Int): String {
    val out = StringBuilder(word.length)
    var runChar = ' '
    var runLength = 0
    for (c in word) {
      if (c == runChar) runLength++ else {
        runChar = c
        runLength = 1
      }
      if (runLength <= maxRun) out.append(c)
    }
    return out.toString()
  }
}
