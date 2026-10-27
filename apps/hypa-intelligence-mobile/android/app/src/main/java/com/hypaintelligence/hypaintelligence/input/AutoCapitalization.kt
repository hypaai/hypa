package com.hypaintelligence.hypaintelligence.input

import android.text.InputType
import android.view.inputmethod.EditorInfo
import java.util.Locale

fun twoInitialCapsFix(word: String, locale: Locale): String? {
  if (word.length < 3) return null
  if (!word[0].isUpperCase() || !word[1].isUpperCase() || !word[2].isLowerCase()) return null
  if (word.drop(2).any { it.isUpperCase() }) return null
  return word.take(1) + word[1].lowercase(locale) + word.drop(2)
}

enum class AutoCapMode {
  NONE,
  SENTENCES,
  WORDS,
  CHARACTERS,
  ;

  fun appliesAt(textBeforeCursor: String): Boolean =
    when (this) {
      NONE -> false
      CHARACTERS -> true
      WORDS -> textBeforeCursor.lastOrNull()?.isWhitespace() ?: true
      SENTENCES -> startsNewSentence(textBeforeCursor)
    }

  companion object {
    private val ABBREVIATIONS =
      setOf(
        "mr", "mrs", "ms", "mx", "dr", "prof", "sr", "jr", "st",
        "vs", "etc", "approx", "dept", "fig", "inc", "ltd",
        "e.g", "i.e", "a.m", "p.m", "u.s",
      )

    private val CLOSING_WRAPPERS = charArrayOf('"', '\'', '’', '”', ')', ']', '}', '»', '›')

    fun of(info: EditorInfo?): AutoCapMode {
      val inputType = info?.inputType ?: return SENTENCES
      if (!holdsProse(info, inputType)) return NONE
      return declaredMode(inputType) ?: SENTENCES
    }

    private fun declaredMode(inputType: Int): AutoCapMode? =
      when {
        inputType and InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS != 0 -> CHARACTERS
        inputType and InputType.TYPE_TEXT_FLAG_CAP_WORDS != 0 -> WORDS
        inputType and InputType.TYPE_TEXT_FLAG_CAP_SENTENCES != 0 -> SENTENCES
        else -> null
      }

    private fun holdsProse(info: EditorInfo, inputType: Int): Boolean {
      if (inputType and InputType.TYPE_MASK_CLASS != InputType.TYPE_CLASS_TEXT) return false
      if (info.imeOptions and EditorInfo.IME_MASK_ACTION == EditorInfo.IME_ACTION_SEARCH) return false
      return when (inputType and InputType.TYPE_MASK_VARIATION) {
        InputType.TYPE_TEXT_VARIATION_PASSWORD,
        InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
        InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
        InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
        InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS,
        InputType.TYPE_TEXT_VARIATION_URI,
        InputType.TYPE_TEXT_VARIATION_FILTER,
        -> false
        else -> true
      }
    }

    private fun startsNewSentence(before: String): Boolean {
      val spaceless = before.trimEnd(' ', '\t')
      if (spaceless.isEmpty()) return true
      if (spaceless.last() == '\n') return true
      val sentence = spaceless.trimEnd(*CLOSING_WRAPPERS)
      return when (sentence.lastOrNull()) {
        '!', '?' -> true
        '.' -> !endsWithAbbreviation(sentence)
        else -> false
      }
    }

    private fun endsWithAbbreviation(sentence: String): Boolean {
      var start = sentence.length
      while (start > 0 && (sentence[start - 1].isLetter() || sentence[start - 1] == '.')) start--
      val token = sentence.substring(start).trimEnd('.').lowercase()
      return token in ABBREVIATIONS
    }
  }
}
