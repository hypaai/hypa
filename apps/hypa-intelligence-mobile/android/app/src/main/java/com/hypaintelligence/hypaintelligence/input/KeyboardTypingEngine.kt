package com.hypaintelligence.hypaintelligence.input

import android.text.InputType
import android.view.inputmethod.EditorInfo

enum class KeyboardBoardMode {
  ALPHABET,
  SYMBOLS,
  NUMERIC,
}

enum class ReturnAction {
  NEWLINE,
  GO,
  SEARCH,
  SEND,
  DONE,
  NEXT,
  PREVIOUS,
}

enum class ShiftState {
  OFF,
  ONCE,
  LOCKED,
}

fun insertsNewline(info: EditorInfo): Boolean {
  if (info.imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0) return true
  if (info.inputType and InputType.TYPE_MASK_CLASS != InputType.TYPE_CLASS_TEXT) return false
  return info.inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE != 0 ||
    info.inputType and InputType.TYPE_TEXT_FLAG_IME_MULTI_LINE != 0
}

class KeyboardTypingEngine {
  private companion object {
    const val SHIFT_DOUBLE_TAP_MS = 300L
  }

  var mode: KeyboardBoardMode = KeyboardBoardMode.ALPHABET
    private set

  var symbolPage: Int = 0
    private set

  var shiftLocked: Boolean = false
    private set

  var shiftOnce: Boolean = false
    private set

  var autoShift: Boolean = false
    private set

  var forceNumeric: Boolean = false
    private set

  var forceEmail: Boolean = false
    private set

  var wantsDotCom: Boolean = false
    private set

  var capMode: AutoCapMode = AutoCapMode.SENTENCES
    private set

  var returnAction: ReturnAction = ReturnAction.NEWLINE
    private set

  private var autoShiftDismissed = false

  private var lastShiftTapMs = 0L
  private var lastLetterConsumedShiftOnce = false
  private var lastLetterConsumedAutoShift = false

  val allowsProseAssists: Boolean
    get() = capMode == AutoCapMode.SENTENCES

  fun resetSessionState() {
    if (!forceNumeric) {
      mode = KeyboardBoardMode.ALPHABET
      symbolPage = 0
    }
    shiftLocked = false
    shiftOnce = false
    autoShiftDismissed = false
    lastShiftTapMs = 0L
    lastLetterConsumedShiftOnce = false
    lastLetterConsumedAutoShift = false
  }

  fun bindEditorInfo(info: EditorInfo?) {
    val wantsNumeric = wantsNumericField(info)
    val wantsEmail = wantsEmailField(info)
    forceNumeric = wantsNumeric
    forceEmail = wantsEmail
    wantsDotCom = wantsEmail || wantsUriField(info)
    capMode = AutoCapMode.of(info)
    returnAction = returnActionOf(info)
    mode =
      when {
        forceNumeric -> KeyboardBoardMode.NUMERIC
        mode == KeyboardBoardMode.NUMERIC -> KeyboardBoardMode.ALPHABET
        else -> mode
      }
    if (mode != KeyboardBoardMode.SYMBOLS) {
      symbolPage = 0
    }
  }

  fun currentBoardMode(): KeyboardBoardMode =
    when {
      forceNumeric || mode == KeyboardBoardMode.NUMERIC -> KeyboardBoardMode.NUMERIC
      mode == KeyboardBoardMode.SYMBOLS -> KeyboardBoardMode.SYMBOLS
      else -> KeyboardBoardMode.ALPHABET
    }

  fun currentVisualSignature(
    featureModeName: String,
    isAudioMenuOpen: Boolean,
    hasAuthToken: Boolean,
    hasThinkingTrace: Boolean,
    isTranslating: Boolean,
  ): String =
    buildString(64) {
      append(featureModeName)
      append('|')
      append(currentBoardMode().name)
      append('|')
      append(symbolPage)
      append('|')
      append(forceEmail)
      append('|')
      append(isAudioMenuOpen)
      append('|')
      append(hasAuthToken)
      append('|')
      append(hasThinkingTrace)
      append('|')
      append(isTranslating)
      append('|')
      append(returnAction)
    }

  fun openSymbols() {
    mode = KeyboardBoardMode.SYMBOLS
    symbolPage = 0
  }

  fun toggleSymbolPage() {
    symbolPage = if (symbolPage == 0) 1 else 0
  }

  fun returnToAlphabet() {
    if (!forceNumeric) {
      mode = KeyboardBoardMode.ALPHABET
      symbolPage = 0
    }
  }

  fun shiftState(): ShiftState =
    when {
      shiftLocked -> ShiftState.LOCKED
      shiftOnce || autoShift -> ShiftState.ONCE
      else -> ShiftState.OFF
    }

  fun isUppercaseActive(): Boolean = shiftState() != ShiftState.OFF

  fun updateAutoCaps(textBeforeCursor: String): Boolean {
    val wanted = capMode.appliesAt(textBeforeCursor)
    if (!wanted) autoShiftDismissed = false
    val next = wanted && !autoShiftDismissed && !shiftLocked && !shiftOnce
    if (autoShift == next) {
      return false
    }
    autoShift = next
    return true
  }

  fun commitLetter(lower: String, upper: String): String {
    val out = if (isUppercaseActive()) upper else lower
    lastLetterConsumedShiftOnce = shiftOnce
    lastLetterConsumedAutoShift = autoShift
    if (shiftOnce || autoShift) {
      shiftOnce = false
      autoShift = false
    }
    return out
  }

  fun restoreShiftAfterCancelledLetter() {
    if (lastLetterConsumedShiftOnce) shiftOnce = true
    if (lastLetterConsumedAutoShift) autoShift = true
    lastLetterConsumedShiftOnce = false
    lastLetterConsumedAutoShift = false
  }

  fun toggleShift(nowMs: Long) {
    val doubleTap = nowMs - lastShiftTapMs <= SHIFT_DOUBLE_TAP_MS
    lastShiftTapMs = nowMs
    when {
      shiftLocked -> {
        shiftLocked = false
        shiftOnce = false
      }
      doubleTap -> {
        shiftLocked = true
        shiftOnce = false
      }
      shiftOnce -> shiftOnce = false
      else -> {
        autoShiftDismissed = autoShift
        shiftOnce = !autoShift
      }
    }
    autoShift = false
  }

  private fun wantsNumericField(info: EditorInfo?): Boolean {
    if (info == null) return false
    val cls = info.inputType and InputType.TYPE_MASK_CLASS
    return cls == InputType.TYPE_CLASS_NUMBER || cls == InputType.TYPE_CLASS_PHONE
  }

  private fun wantsEmailField(info: EditorInfo?): Boolean =
    textVariationOf(info) == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS

  private fun wantsUriField(info: EditorInfo?): Boolean =
    textVariationOf(info) == InputType.TYPE_TEXT_VARIATION_URI

  private fun textVariationOf(info: EditorInfo?): Int? {
    val inputType = info?.inputType ?: return null
    if (inputType and InputType.TYPE_MASK_CLASS != InputType.TYPE_CLASS_TEXT) return null
    return inputType and InputType.TYPE_MASK_VARIATION
  }

  private fun returnActionOf(info: EditorInfo?): ReturnAction {
    if (info == null || insertsNewline(info)) return ReturnAction.NEWLINE
    return when (info.imeOptions and EditorInfo.IME_MASK_ACTION) {
      EditorInfo.IME_ACTION_GO -> ReturnAction.GO
      EditorInfo.IME_ACTION_SEARCH -> ReturnAction.SEARCH
      EditorInfo.IME_ACTION_SEND -> ReturnAction.SEND
      EditorInfo.IME_ACTION_DONE -> ReturnAction.DONE
      EditorInfo.IME_ACTION_NEXT -> ReturnAction.NEXT
      EditorInfo.IME_ACTION_PREVIOUS -> ReturnAction.PREVIOUS
      else -> ReturnAction.NEWLINE
    }
  }
}
