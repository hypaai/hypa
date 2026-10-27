package com.hypaintelligence.hypaintelligence.context

import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import com.hypaintelligence.hypaintelligence.emoji.GraphemeText

class ContextEngine(
  private val inputSupplier: () -> InputConnection?,
) {
  companion object {
    const val BUFFER_CHARS = 256
    private val SENTENCE_ENDINGS = charArrayOf('.', '!', '?', '\n')

    fun sentenceOf(text: String): String =
      text.substring(text.lastIndexOfAny(SENTENCE_ENDINGS) + 1).trimStart()

  }

  private val buffer = StringBuilder(BUFFER_CHARS)
  private var mode = ContextMode.NORMAL
  private var language = "en"
  private var version = 0L
  private var expectedCursor = -1
  private var cached: CursorContext? = null

  val contextMode: ContextMode
    get() = mode

  fun setLanguage(code: String) {
    if (language == code) return
    language = code
    cached = null
  }

  fun bindEditorInfo(info: EditorInfo?) {
    mode = ContextDetector.detect(info)
    expectedCursor = -1
    cached = null
    resync()
  }

  fun applyInsertedText(text: String) {
    buffer.append(text)
    if (buffer.length > BUFFER_CHARS) buffer.delete(0, buffer.length - BUFFER_CHARS)
    if (expectedCursor >= 0) expectedCursor += text.length
    version++
  }

  fun lastGraphemeLength(): Int =
    if (buffer.isEmpty()) 1 else GraphemeText.lastClusterLength(buffer.toString()).coerceAtLeast(1)

  fun applyBackspace(units: Int = 1) {
    if (buffer.isEmpty()) {
      resync()
      return
    }
    val removed = units.coerceIn(1, buffer.length)
    buffer.delete(buffer.length - removed, buffer.length)
    if (expectedCursor > 0) expectedCursor = (expectedCursor - removed).coerceAtLeast(0)
    version++
  }

  fun applyDeletedBeforeCursor(count: Int) {
    val n = count.coerceAtMost(buffer.length)
    buffer.delete(buffer.length - n, buffer.length)
    if (expectedCursor >= 0) expectedCursor = (expectedCursor - count).coerceAtLeast(0)
    version++
  }

  fun onSelectionChanged(selectionStart: Int, selectionEnd: Int): Boolean {
    if (selectionStart < 0) {
      expectedCursor = -1
      return false
    }
    if (selectionStart == expectedCursor && selectionStart == selectionEnd) return false
    expectedCursor = selectionStart
    resync()
    return true
  }

  fun resync() {
    val before = inputSupplier()?.getTextBeforeCursor(BUFFER_CHARS, 0)?.toString().orEmpty()
    buffer.setLength(0)
    buffer.append(before)
    version++
  }

  fun snapshot(): CursorContext {
    cached?.let { if (it.version == version) return it }
    return build().also { cached = it }
  }

  private fun build(): CursorContext {
    val end = buffer.length

    var wordStart = end
    while (wordStart > 0 && isWordChar(buffer[wordStart - 1])) wordStart--

    var previousEnd = wordStart
    while (previousEnd > 0 && buffer[previousEnd - 1].isWhitespace()) previousEnd--
    var previousStart = previousEnd
    while (previousStart > 0 && isWordChar(buffer[previousStart - 1])) previousStart--

    val text = buffer.toString()
    return CursorContext(
      version = version,
      textBeforeCursor = text,
      currentWord = text.substring(wordStart, end),
      previousWord = text.substring(previousStart, previousEnd),
      sentence = sentenceOf(text),
      language = language,
      mode = mode,
    )
  }

  private fun isWordChar(c: Char): Boolean =
    c.isLetter() || c == '\'' || Character.getType(c) == Character.NON_SPACING_MARK.toInt()
}
