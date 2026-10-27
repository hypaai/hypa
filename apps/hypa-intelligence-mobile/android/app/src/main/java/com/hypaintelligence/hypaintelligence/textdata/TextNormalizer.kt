package com.hypaintelligence.hypaintelligence.textdata

import java.text.Normalizer

object TextNormalizer {
  private const val COMBINING_ACUTE = '́'
  private const val COMBINING_GRAVE = '̀'
  private const val COMBINING_MACRON = '̄'

  fun normalize(word: String): String {
    val lower = word.lowercase()
    if (lower.all { it.code < 128 }) return lower
    val decomposed = Normalizer.normalize(lower, Normalizer.Form.NFD)
    val stripped =
      decomposed.filterNot { it == COMBINING_ACUTE || it == COMBINING_GRAVE || it == COMBINING_MACRON }
    return Normalizer.normalize(stripped, Normalizer.Form.NFC)
  }
}
