package com.hypaintelligence.hypaintelligence.input

import android.os.SystemClock
import android.text.InputType
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection

fun sendsKeyEvents(inputType: Int): Boolean =
  when (inputType and InputType.TYPE_MASK_CLASS) {
    InputType.TYPE_CLASS_NUMBER, InputType.TYPE_CLASS_PHONE, InputType.TYPE_CLASS_DATETIME -> true
    else -> false
  }

fun keyCodeOf(text: String): Int? {
  val ch = text.singleOrNull() ?: return null
  return when (ch) {
    in '0'..'9' -> KeyEvent.KEYCODE_0 + (ch - '0')
    '.' -> KeyEvent.KEYCODE_PERIOD
    ',' -> KeyEvent.KEYCODE_COMMA
    '-' -> KeyEvent.KEYCODE_MINUS
    else -> null
  }
}

class KeyboardTextEngine(
  private val inputSupplier: () -> InputConnection?,
) {
  var fieldTakesKeyEvents = false
    private set

  fun bindEditorInfo(info: EditorInfo?) {
    fieldTakesKeyEvents = info != null && sendsKeyEvents(info.inputType)
  }

  fun commitText(text: String): Boolean {
    val input = inputSupplier() ?: return false
    if (fieldTakesKeyEvents) {
      val keyCode = keyCodeOf(text)
      if (keyCode != null) {
        input.finishComposingText()
        if (sendKey(input, keyCode)) return true
      }
    }
    return commitText(input, text)
  }

  fun commitText(input: InputConnection, text: String): Boolean {
    if (text.length <= COMMIT_TEXT_CHUNK_SIZE) {
      return input.commitText(text, 1)
    }

    return withInputBatch(input) {
      input.finishComposingText()
      commitTextInChunks(input, text)
    }
  }

  fun replaceSurroundingText(
    input: InputConnection,
    beforeLength: Int,
    afterLength: Int,
    replacement: String,
  ): Boolean =
    withInputBatch(input) {
      input.finishComposingText()
      val deleted =
        if (beforeLength > 0 || afterLength > 0) {
          input.deleteSurroundingText(beforeLength, afterLength)
        } else {
          true
        }
      deleted && commitTextInChunks(input, replacement)
    }

  fun replaceRecentCommittedText(original: String, replacement: String): Boolean {
    val input = inputSupplier() ?: return false
    if (replacement.isEmpty() && fieldTakesKeyEvents && keyCodeOf(original) != null) {
      return sendKey(input, KeyEvent.KEYCODE_DEL)
    }
    val beforeCursor = input.getTextBeforeCursor(original.length, 0)?.toString().orEmpty()
    return if (beforeCursor == original) {
      replaceSurroundingText(input, original.length, 0, replacement)
    } else {
      commitText(input, replacement)
    }
  }

  fun deleteOneCharacter(units: Int, hasSelection: Boolean): Boolean {
    val input = inputSupplier() ?: return false
    if (hasSelection) {
      return commitText(input, "")
    }
    return input.deleteSurroundingText(units.coerceAtLeast(1), 0)
  }

  private fun sendKey(input: InputConnection, keyCode: Int): Boolean {
    val now = SystemClock.uptimeMillis()
    if (!input.sendKeyEvent(keyEvent(now, KeyEvent.ACTION_DOWN, keyCode))) return false
    input.sendKeyEvent(keyEvent(now, KeyEvent.ACTION_UP, keyCode))
    return true
  }

  private fun keyEvent(time: Long, action: Int, keyCode: Int): KeyEvent =
    KeyEvent(
      time,
      time,
      action,
      keyCode,
      0,
      0,
      KeyCharacterMap.VIRTUAL_KEYBOARD,
      0,
      KeyEvent.FLAG_SOFT_KEYBOARD or KeyEvent.FLAG_KEEP_TOUCH_MODE,
    )

  private inline fun withInputBatch(input: InputConnection, block: () -> Boolean): Boolean {
    val batchStarted = input.beginBatchEdit()
    return try {
      block()
    } finally {
      if (batchStarted) input.endBatchEdit()
    }
  }

  private fun commitTextInChunks(input: InputConnection, text: String): Boolean {
    if (text.length <= COMMIT_TEXT_CHUNK_SIZE) {
      return input.commitText(text, 1)
    }

    var start = 0
    while (start < text.length) {
      val end = chunkEnd(text, start)
      if (!input.commitText(text.substring(start, end), 1)) {
        return false
      }
      start = end
    }
    return true
  }

  private fun chunkEnd(text: String, start: Int): Int {
    val end = (start + COMMIT_TEXT_CHUNK_SIZE).coerceAtMost(text.length)
    return if (
      end < text.length &&
        end > start &&
        Character.isHighSurrogate(text[end - 1]) &&
        Character.isLowSurrogate(text[end])
    ) {
      end + 1
    } else {
      end
    }
  }

  private companion object {
    private const val COMMIT_TEXT_CHUNK_SIZE = 80
  }
}
