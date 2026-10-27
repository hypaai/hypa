package com.hypaintelligence.hypaintelligence.prediction

import com.hypaintelligence.hypaintelligence.context.CursorContext
import com.hypaintelligence.hypaintelligence.textdata.PersonalVocabulary

class PersonalProvider(private val personal: PersonalVocabulary) : PredictionProvider {
  private companion object {
    const val CONTINUATION_NGRAM_SCORE = 1f
  }

  override fun provide(context: CursorContext, limit: Int): List<Candidate> {
    if (context.currentWord.isNotEmpty()) {
      return personal
        .prefix(context.currentWord, limit)
        .map { word ->
          Candidate(
            text = word,
            sources = setOf(CandidateSource.PERSONAL),
            personalScore = personal.usageWeight(word),
            prefixScore = 1f,
          )
        }
        .withoutEcho(context)
    }

    return personal
      .following(context.previousWord, limit)
      .map { learned ->
        Candidate(
          text = learned.word,
          sources = setOf(CandidateSource.PERSONAL),
          personalScore = learned.weight,
          ngramScore = CONTINUATION_NGRAM_SCORE,
        )
      }
      .withoutEcho(context)
  }

  private fun List<Candidate>.withoutEcho(context: CursorContext): List<Candidate> =
    filterNot { it.text.equals(context.previousWord, ignoreCase = true) }
}
