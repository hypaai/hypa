package com.hypaintelligence.hypaintelligence.context

data class CursorContext(
  val version: Long,
  val textBeforeCursor: String,
  val currentWord: String,
  val previousWord: String,
  val sentence: String,
  val language: String,
  val mode: ContextMode,
) {
  val isAtWordBoundary: Boolean
    get() = currentWord.isEmpty()

  val isSentenceStart: Boolean
    get() = sentence.isBlank()
}
