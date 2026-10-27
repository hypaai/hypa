package com.hypaintelligence.hypaintelligence.correction

import com.hypaintelligence.hypaintelligence.textdata.CorpusStore
import com.hypaintelligence.hypaintelligence.textdata.PersonalVocabulary
import com.hypaintelligence.hypaintelligence.textdata.TextNormalizer

class AutocorrectEngine(
  private val corpus: CorpusStore,
  private val personal: PersonalVocabulary,
) {
  companion object {
    private const val MIN_WORD_LENGTH = 3

    private const val CONTEXT_DEPTH = 12

    private val APOSTROPHE_ENDING = Regex("'\\p{L}{0,2}$")

    fun hasApostropheEnding(word: String): Boolean = APOSTROPHE_ENDING.containsMatchIn(word)
  }

  fun evaluate(word: String, previousWord: String): CorrectionDecision {
    if (!word.all { it.isLetter() || it == '\'' } || hasApostropheEnding(word)) return CorrectionDecision.keep(word)
    if (!corpus.isReady) return CorrectionDecision.keep(word)

    val normalized = TextNormalizer.normalize(word)
    missingApostrophe(normalized)?.let {
      return CorrectionDecision(word, CorrectionAction.AUTO_CORRECT, matchCapitalization(word, it), 1f)
    }
    if (word.length < MIN_WORD_LENGTH) return CorrectionDecision.keep(word)
    if (personal.contains(word) || corpus.contains(normalized)) return CorrectionDecision.keep(word)

    val expected =
      personal.following(previousWord, CONTEXT_DEPTH).associate {
        TextNormalizer.normalize(it.word) to it.weight
      }

    val candidates = ArrayList<Candidate>()
    val seen = HashSet<String>()
    TypoCandidates.generate(normalized, corpus.alphabet()) { candidate, typoFactor ->
      if (candidate.length >= 2 && candidate != normalized && seen.add(candidate)) {
        val canonical = corpus.canonical(candidate)
        if (canonical != null) {
          val familiarity =
            maxOf(personal.usageWeight(candidate), expected[candidate] ?: 0f)
          candidates.add(Candidate(canonical, typoFactor, familiarity))
        }
      }
    }
    if (candidates.isEmpty()) return CorrectionDecision.keep(word)

    val known = candidates.filter { it.familiarity > 0f }
    val best =
      if (known.isNotEmpty()) known.maxByOrNull { it.familiarity * it.typoFactor }!!
      else unambiguousBest(candidates) ?: return CorrectionDecision.keep(word)

    val replacement = matchCapitalization(word, best.text)
    return CorrectionDecision(
      word,
      CorrectionAction.AUTO_CORRECT,
      replacement,
      best.typoFactor,
    )
  }

  private fun missingApostrophe(normalized: String): String? {
    if ('\'' in normalized || corpus.isCommon(normalized)) return null
    for (i in 1 until normalized.length) {
      val candidate = normalized.substring(0, i) + '\'' + normalized.substring(i)
      if (corpus.isCommon(candidate)) return corpus.canonical(candidate)
    }
    return null
  }

  private fun unambiguousBest(candidates: List<Candidate>): Candidate? {
    val top = candidates.maxOf { it.typoFactor }
    val tied = candidates.filter { it.typoFactor == top }
    return tied.singleOrNull()
  }

  private fun matchCapitalization(original: String, replacement: String): String =
    if (original.firstOrNull()?.isUpperCase() == true) {
      replacement.replaceFirstChar { it.uppercaseChar() }
    } else {
      replacement
    }

  private class Candidate(val text: String, val typoFactor: Float, val familiarity: Float)
}
