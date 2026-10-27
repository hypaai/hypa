package com.hypaintelligence.hypaintelligence.emoji

object GraphemeText {
  private const val ZWJ = 0x200D

  fun lastClusterLength(text: String): Int {
    if (text.isEmpty()) return 0
    return text.length - lastClusterStart(text)
  }

  fun clusterCount(text: String): Int {
    var index = 0
    var count = 0
    while (index < text.length) {
      index = clusterEnd(text, index)
      count++
    }
    return count
  }

  fun offsetByClusters(text: String, from: Int, steps: Int): Int {
    var offset = from.coerceIn(0, text.length)
    if (steps == 0) return offset
    val boundaries = mutableListOf(0)
    var index = 0
    while (index < text.length) {
      index = clusterEnd(text, index)
      boundaries.add(index)
    }
    repeat(kotlin.math.abs(steps)) {
      offset = if (steps > 0) boundaries.firstOrNull { it > offset } ?: text.length
      else boundaries.lastOrNull { it < offset } ?: 0
    }
    return offset
  }

  private fun lastClusterStart(text: String): Int {
    var index = 0
    var start = 0
    while (index < text.length) {
      start = index
      index = clusterEnd(text, index)
    }
    return start
  }

  private fun clusterEnd(text: String, from: Int): Int {
    var index = from
    val first = text.codePointAt(index)
    index += Character.charCount(first)

    if (isRegionalIndicator(first)) {
      if (index < text.length) {
        val next = text.codePointAt(index)
        if (isRegionalIndicator(next)) index += Character.charCount(next)
      }
      return index
    }

    while (index < text.length) {
      val cp = text.codePointAt(index)
      if (isExtend(cp)) {
        index += Character.charCount(cp)
        continue
      }
      if (cp == ZWJ) {
        val afterZwj = index + Character.charCount(cp)
        if (afterZwj >= text.length) break
        val joined = text.codePointAt(afterZwj)
        if (!isExtendedPictographic(joined)) break
        index = afterZwj + Character.charCount(joined)
        continue
      }
      break
    }
    return index
  }

  private fun isRegionalIndicator(cp: Int): Boolean = cp in 0x1F1E6..0x1F1FF

  private fun isExtend(cp: Int): Boolean {
    if (cp in 0xFE00..0xFE0F) return true
    if (cp in 0x1F3FB..0x1F3FF) return true
    if (cp in 0xE0020..0xE007F) return true
    return when (Character.getType(cp).toByte()) {
      Character.NON_SPACING_MARK,
      Character.COMBINING_SPACING_MARK,
      Character.ENCLOSING_MARK,
      -> true
      else -> false
    }
  }

  private fun isExtendedPictographic(cp: Int): Boolean =
    cp in 0x1F000..0x1FAFF ||
      cp in 0x2600..0x27BF ||
      cp in 0x2B00..0x2BFF ||
      cp in 0x2190..0x21FF ||
      cp in 0x2300..0x23FF ||
      cp == 0x00A9 ||
      cp == 0x00AE ||
      cp == 0x2122
}
