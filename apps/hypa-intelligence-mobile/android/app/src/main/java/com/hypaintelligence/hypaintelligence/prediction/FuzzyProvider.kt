package com.hypaintelligence.hypaintelligence.prediction

import android.os.Handler
import android.os.Looper
import com.hypaintelligence.hypaintelligence.concurrent.KeyboardThreads
import com.hypaintelligence.hypaintelligence.context.CursorContext
import com.hypaintelligence.hypaintelligence.correction.TypoCandidates
import com.hypaintelligence.hypaintelligence.textdata.CorpusStore
import com.hypaintelligence.hypaintelligence.textdata.PersonalVocabulary
import com.hypaintelligence.hypaintelligence.textdata.TextNormalizer
import java.util.concurrent.Executors

class FuzzyProvider(
  private val corpus: CorpusStore,
  private val personal: PersonalVocabulary,
  private val onRepairsReady: () -> Unit,
) : PredictionProvider {
  private companion object {
    const val MIN_WORD_LENGTH = 3

    const val MAX_WORD_LENGTH = 16

    const val MAX_PREFIX_SCORE = 0.5f

    const val CONTEXT_DEPTH = 12

    const val SECOND_EDIT_MIN_LENGTH = 4
    const val SECOND_EDIT_FACTOR = 0.6f
    const val ENOUGH_REPAIRS = 3
  }

  private val worker = Executors.newSingleThreadExecutor(KeyboardThreads.compute("hypa-fuzzy"))
  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile private var requestedKey: String? = null

  private var memoKey: String? = null
  private var memoAlphabet: CharArray? = null
  private var memoRepairs: List<Repair> = emptyList()

  override fun provide(context: CursorContext, limit: Int): List<Candidate> {
    val typed = context.currentWord
    if (typed.length < MIN_WORD_LENGTH || typed.length > MAX_WORD_LENGTH) return emptyList()
    if (!corpus.isReady) return emptyList()
    if (!typed.all { it.isLetter() || it == '\'' }) return emptyList()

    val normalized = TextNormalizer.normalize(typed)

    val alphabet = corpus.alphabet()
    if (normalized != memoKey || alphabet !== memoAlphabet) {
      requestSweep(normalized, alphabet)
      return emptyList()
    }

    val contextScores = contextScores(context.previousWord)
    return memoRepairs.take(limit).map { repair ->
      Candidate(
        text = matchCapitalization(typed, repair.canonical),
        sources = setOf(CandidateSource.CORPUS),
        personalScore = repair.familiarity,
        prefixScore = repair.typoFactor * MAX_PREFIX_SCORE,
        ngramScore = contextScores[repair.normalized] ?: 0f,
      )
    }
  }

  private fun requestSweep(normalized: String, alphabet: CharArray) {
    if (normalized == requestedKey) return
    requestedKey = normalized
    worker.execute {
      if (normalized != requestedKey) return@execute
      val repairs = sweep(normalized, alphabet, corpus.contains(normalized) || personal.contains(normalized))
      mainHandler.post {
        memoKey = normalized
        memoAlphabet = alphabet
        memoRepairs = repairs
        onRepairsReady()
      }
    }
  }

  private fun sweep(normalized: String, alphabet: CharArray, typedIsWord: Boolean): List<Repair> {
    val repairs = HashMap<String, Repair>()
    val firstEdits = HashMap<String, Float>()

    fun consider(candidate: String, typoFactor: Float) {
      if (candidate.length < 2 || candidate == normalized) return
      val canonical = corpus.canonical(candidate) ?: return
      if (typedIsWord && !corpus.isCommon(candidate) && !personal.contains(candidate)) return
      val known = repairs[candidate]
      if (known == null || known.typoFactor < typoFactor) {
        repairs[candidate] = Repair(canonical, candidate, personal.usageWeight(candidate), typoFactor)
      }
    }

    TypoCandidates.generate(normalized, alphabet) { candidate, typoFactor ->
      if ((firstEdits[candidate] ?: 0f) < typoFactor) firstEdits[candidate] = typoFactor
      consider(candidate, typoFactor)
    }
    if (repairs.size < ENOUGH_REPAIRS && normalized.length >= SECOND_EDIT_MIN_LENGTH) {
      for ((edited, factor) in firstEdits) {
        if (normalized != requestedKey) break
        TypoCandidates.generate(edited, alphabet) { candidate, typoFactor ->
          consider(candidate, factor * typoFactor * SECOND_EDIT_FACTOR)
        }
      }
    }
    return repairs.values.sortedWith(
      compareByDescending<Repair> { it.familiarity }.thenByDescending { it.typoFactor },
    )
  }

  private fun contextScores(previousWord: String): Map<String, Float> {
    if (previousWord.isEmpty()) return emptyMap()
    return personal.following(previousWord, CONTEXT_DEPTH).associate {
      TextNormalizer.normalize(it.word) to it.weight
    }
  }

  private fun matchCapitalization(original: String, replacement: String): String =
    if (original.firstOrNull()?.isUpperCase() == true) {
      replacement.replaceFirstChar { it.uppercaseChar() }
    } else {
      replacement
    }

  private class Repair(
    val canonical: String,
    val normalized: String,
    val familiarity: Float,
    val typoFactor: Float,
  )
}
