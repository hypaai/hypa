package com.hypaintelligence.hypaintelligence.modes.dictionary

data class DictionaryDefinitionItem(
  val partOfSpeech: String?,
  val text: String,
  val context: String?,
)

data class DictionaryUsageItem(
  val partOfSpeech: String,
  val example: String,
)

data class DictionaryResultCardData(
  val word: String,
  val language: String,
  val pronunciation: String?,
  val partOfSpeech: String?,
  val definitions: List<DictionaryDefinitionItem>,
  val usageExamples: List<DictionaryUsageItem>,
  val synonyms: List<String>,
  val antonyms: List<String>,
  val exampleSentences: List<String>,
  val culturalContext: String?,
  val funFact: String?,
)
