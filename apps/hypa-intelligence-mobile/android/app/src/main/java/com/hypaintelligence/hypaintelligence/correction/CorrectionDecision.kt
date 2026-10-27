package com.hypaintelligence.hypaintelligence.correction

enum class CorrectionAction {
  KEEP,
  AUTO_CORRECT,
}

data class CorrectionDecision(
  val original: String,
  val action: CorrectionAction,
  val replacement: String? = null,
  val confidence: Float = 0f,
) {
  companion object {
    fun keep(original: String) = CorrectionDecision(original, CorrectionAction.KEEP)
  }
}
