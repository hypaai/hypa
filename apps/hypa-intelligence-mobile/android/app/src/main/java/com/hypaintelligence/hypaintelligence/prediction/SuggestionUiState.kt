package com.hypaintelligence.hypaintelligence.prediction

data class SuggestionUiState(
  val visible: Boolean,
  val candidates: List<String>,
  val emojis: List<String> = emptyList(),
  val modelWords: Set<String> = emptySet(),
) {
  companion object {
    val HIDDEN = SuggestionUiState(visible = false, candidates = emptyList())
  }
}
