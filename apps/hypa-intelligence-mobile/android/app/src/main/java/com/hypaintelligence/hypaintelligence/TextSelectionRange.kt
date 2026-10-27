package com.hypaintelligence.hypaintelligence

import java.text.BreakIterator
import java.util.Locale

internal data class TextSelectionRange(val start: Int, val end: Int)

internal data class TextEditingDocumentSnapshot(
  val text: String,
  val selectionStart: Int,
  val selectionEnd: Int,
  val startOffset: Int = 0,
) {
  fun absoluteOffset(localOffset: Int): Int =
    startOffset + localOffset.coerceIn(0, text.length)
}

internal object TextSelectionRanges {
  fun caretBefore(text: String, caret: Int, locale: Locale = Locale.getDefault()): Int {
    val safeCaret = caret.coerceIn(0, text.length)
    if (safeCaret == 0) return 0
    return BreakIterator.getCharacterInstance(locale).run {
      setText(text)
      preceding(safeCaret).takeUnless { it == BreakIterator.DONE } ?: 0
    }
  }

  fun caretAfter(text: String, caret: Int, locale: Locale = Locale.getDefault()): Int {
    val safeCaret = caret.coerceIn(0, text.length)
    if (safeCaret == text.length) return text.length
    return BreakIterator.getCharacterInstance(locale).run {
      setText(text)
      following(safeCaret).takeUnless { it == BreakIterator.DONE } ?: text.length
    }
  }

  fun character(text: String, caret: Int, locale: Locale = Locale.getDefault()): TextSelectionRange? {
    if (text.isEmpty()) return null

    val safeCaret = caret.coerceIn(0, text.length)
    val iterator = BreakIterator.getCharacterInstance(locale).apply { setText(text) }
    if (safeCaret == text.length) {
      val start = iterator.preceding(safeCaret).takeUnless { it == BreakIterator.DONE } ?: return null
      return TextSelectionRange(start, safeCaret)
    }

    val end = iterator.following(safeCaret).takeUnless { it == BreakIterator.DONE } ?: text.length
    return TextSelectionRange(safeCaret, end)
  }

  fun word(text: String, caret: Int, locale: Locale = Locale.getDefault()): TextSelectionRange? {
    if (text.isEmpty()) return null

    val safeCaret = caret.coerceIn(0, text.length)
    val probe = wordProbe(text, safeCaret) ?: return character(text, safeCaret, locale)
    val iterator = BreakIterator.getWordInstance(locale).apply { setText(text) }
    val start = iterator.preceding(probe + 1).takeUnless { it == BreakIterator.DONE } ?: 0
    val end = iterator.following(probe).takeUnless { it == BreakIterator.DONE } ?: text.length
    return if (text.substring(start, end).any(Char::isLetterOrDigit)) {
      TextSelectionRange(start, end)
    } else {
      character(text, safeCaret, locale)
    }
  }

  fun line(text: String, caret: Int): TextSelectionRange? {
    if (text.isEmpty()) return null

    val safeCaret = caret.coerceIn(0, text.length)
    val start = text.lastIndexOf('\n', safeCaret - 1).let { it + 1 }
    val end = text.indexOf('\n', safeCaret).let { if (it == -1) text.length else it }
    if (start < end) return TextSelectionRange(start, end)

    return when {
      end < text.length -> TextSelectionRange(end, end + 1)
      start > 0 -> TextSelectionRange(start - 1, start)
      else -> null
    }
  }

  private fun wordProbe(text: String, caret: Int): Int? {
    if (caret < text.length && text[caret].isLetterOrDigit()) return caret
    if (caret > 0 && text[caret - 1].isLetterOrDigit()) return caret - 1
    val next = (caret until text.length).firstOrNull { text[it].isLetterOrDigit() }
    if (next != null) return next
    return (caret - 1 downTo 0).firstOrNull { text[it].isLetterOrDigit() }
  }
}
