package com.hypaintelligence.hypaintelligence.ui

import com.hypaintelligence.hypaintelligence.KeyboardLanguageCatalog
import java.util.Locale

data class AlphabetLayout(
  val first: List<String>,
  val second: List<String>,
  val third: List<String>,
)

data class SymbolLayout(
  val first: List<String>,
  val second: List<String>,
  val third: List<String>,
  val toggleLabel: String,
)

class KeyboardLayoutEngine {
  private companion object {
    val DOTTED_I_LANGUAGES = setOf("tr", "az")

    val PUNCTUATION_POPUPS: Map<String, List<String>> =
      mapOf(
        "-" to listOf("–", "—", "·"),
        "$" to listOf("€", "£", "¥", "₹"),
        "?" to listOf("¿"),
        "!" to listOf("¡"),
        "'" to listOf("‘", "’"),
        "\"" to listOf("“", "”", "«", "»"),
        "%" to listOf("‰"),
        "=" to listOf("≠", "≈"),
        "<" to listOf("≤"),
        ">" to listOf("≥"),
        "+" to listOf("±"),
        "/" to listOf("\\"),
      )
  }

  fun caseLocale(languageCode: String): Locale =
    if (languageCode.take(2).lowercase(Locale.ROOT) in DOTTED_I_LANGUAGES) {
      Locale.forLanguageTag(languageCode)
    } else {
      Locale.ROOT
    }

  fun alphabetLayout(languageCode: String): AlphabetLayout {
    val rows = KeyboardLanguageCatalog.alphabetRows(languageCode)
    val first = rows.getOrNull(0).orEmpty().ifEmpty { "qwertyuiop".map { it.toString() } }
    val second = rows.getOrNull(1).orEmpty().ifEmpty { "asdfghjkl".map { it.toString() } }
    val third = rows.getOrNull(2).orEmpty().ifEmpty { "zxcvbnm".map { it.toString() } }
    return AlphabetLayout(first = first, second = second, third = third)
  }

  fun alternateKeys(languageCode: String, key: String, shifted: Boolean = false, capsLocked: Boolean = false): List<String> =
    KeyboardLanguageCatalog.alternateKeys(languageCode, key, shifted, capsLocked)

  fun punctuationAlternates(symbol: String): List<String> =
    PUNCTUATION_POPUPS[symbol].orEmpty()

  fun symbolLayout(symbolPage: Int): SymbolLayout =
    if (symbolPage == 0) {
      SymbolLayout(
        first = "1234567890".map { it.toString() },
        second = "-/:;()\$&@\"".map { it.toString() },
        third = listOf(".", ",", "?", "!", "'"),
        toggleLabel = "#+=",
      )
    } else {
      SymbolLayout(
        first = "[]{}#%^*+=".map { it.toString() },
        second = listOf("_", "\\", "|", "~", "<", ">", "€", "£", "¥"),
        third = listOf(".", ",", "?", "!", "`"),
        toggleLabel = "123",
      )
    }

  fun numericRows(): List<List<String>> =
    listOf(
      listOf("1", "2", "3", "-"),
      listOf("4", "5", "6", "+"),
      listOf("7", "8", "9", ","),
      listOf("(", "0", ")", "."),
    )
}
