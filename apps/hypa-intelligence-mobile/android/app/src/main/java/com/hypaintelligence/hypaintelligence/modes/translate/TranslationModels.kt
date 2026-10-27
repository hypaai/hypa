package com.hypaintelligence.hypaintelligence.modes.translate

data class TranslationPayload(
  val translatedText: String,
  val thinkingText: String?,
  val detectedLanguage: String? = null,
  val clientRequestId: String? = null,
)

data class ExplainableTranslation(
  val sourceText: String,
  val translatedText: String,
  val sourceLang: String,
  val targetLang: String,
  val clientRequestId: String? = null,
)

data class LastTranslationState(
  val originalText: String,
  val translatedText: String,
  val translatedStart: Int,
  val translatedEnd: Int,
  val resultingDocument: String,
) {
  val isSelectionScoped: Boolean
    get() = translatedStart != 0 || resultingDocument != translatedText
}
