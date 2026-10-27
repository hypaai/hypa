package com.hypaintelligence.hypaintelligence.input

data class KeyboardActionResult(
  val commitText: String? = null,
  val rebuild: Boolean = false,
  val refreshLetterLabels: Boolean = false,
)

class KeyboardActionEngine(
  private val typingEngine: KeyboardTypingEngine,
) {
  fun openSymbols(): KeyboardActionResult {
    typingEngine.openSymbols()
    return KeyboardActionResult(rebuild = true)
  }

  fun toggleSymbolPage(): KeyboardActionResult {
    typingEngine.toggleSymbolPage()
    return KeyboardActionResult(rebuild = true)
  }

  fun returnToAlphabet(): KeyboardActionResult {
    val beforeBoard = typingEngine.currentBoardMode()
    val beforePage = typingEngine.symbolPage
    typingEngine.returnToAlphabet()
    val needsRebuild =
      beforeBoard != typingEngine.currentBoardMode() || beforePage != typingEngine.symbolPage
    return KeyboardActionResult(rebuild = needsRebuild)
  }

  fun spaceLeavesSymbols(): KeyboardActionResult =
    if (typingEngine.currentBoardMode() == KeyboardBoardMode.SYMBOLS) {
      returnToAlphabet()
    } else {
      KeyboardActionResult()
    }

  fun toggleShift(nowMs: Long): KeyboardActionResult {
    typingEngine.toggleShift(nowMs)
    return KeyboardActionResult(refreshLetterLabels = true)
  }

  fun commitLetter(lower: String, upper: String): KeyboardActionResult {
    val shouldRefreshLabels = typingEngine.shiftOnce || typingEngine.autoShift
    val out = typingEngine.commitLetter(lower, upper)
    return KeyboardActionResult(commitText = out, refreshLetterLabels = shouldRefreshLabels)
  }

  fun commitText(text: String): KeyboardActionResult = KeyboardActionResult(commitText = text)

  fun emailAwareCommaOrAt(): KeyboardActionResult =
    KeyboardActionResult(commitText = if (typingEngine.forceEmail) "@" else ",")

  fun keyboardBoardMode(): KeyboardBoardMode = typingEngine.currentBoardMode()
}
