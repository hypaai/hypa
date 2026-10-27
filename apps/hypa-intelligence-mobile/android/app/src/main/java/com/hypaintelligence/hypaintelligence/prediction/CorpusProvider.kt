package com.hypaintelligence.hypaintelligence.prediction

import com.hypaintelligence.hypaintelligence.context.CursorContext
import com.hypaintelligence.hypaintelligence.textdata.CorpusStore
import com.hypaintelligence.hypaintelligence.textdata.PersonalVocabulary
import com.hypaintelligence.hypaintelligence.textdata.TextNormalizer

class CorpusProvider(
  private val corpus: CorpusStore,
  private val personal: PersonalVocabulary,
) : PredictionProvider {
  private companion object {
    const val CONTEXT_DEPTH = 12
    const val PREFIX_SCAN = 64
  }

  override fun provide(context: CursorContext, limit: Int): List<Candidate> {
    if (!corpus.isReady || context.currentWord.isEmpty()) return emptyList()

    val typed = TextNormalizer.normalize(context.currentWord)
    if (typed.isEmpty()) return emptyList()

    val expected =
      personal.following(context.previousWord, CONTEXT_DEPTH).associate {
        TextNormalizer.normalize(it.word) to it.weight
      }

    return corpus
      .prefix(typed, PREFIX_SCAN)
      .sortedByDescending { corpus.isCommon(TextNormalizer.normalize(it)) || personal.contains(it) }
      .take(limit)
      .map { word ->
        Candidate(
          text = word,
          sources = setOf(CandidateSource.CORPUS),
          personalScore = personal.usageWeight(word),
          prefixScore = typed.length.toFloat() / TextNormalizer.normalize(word).length,
          ngramScore = expected[TextNormalizer.normalize(word)] ?: 0f,
        )
      }
  }
}
