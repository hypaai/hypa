package com.hypaintelligence.hypaintelligence.prediction

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.hypaintelligence.hypaintelligence.context.CursorContext
import com.hypaintelligence.hypaintelligence.correction.WordDiff
import com.hypaintelligence.hypaintelligence.neural.TinyKeysService

class PredictionOrchestrator(
  private val neural: TinyKeysService,
  private val scheduler: InferenceScheduler,
  private val providers: List<PredictionProvider>,
  private val maxSuggestions: Int,
  private val mode: PredictionMode,
  private val isKnownWord: (String) -> Boolean,
  private val isDictionaryWord: (String) -> Boolean,
  private val emojisFor: (String) -> List<String>,
  private val listener: (SuggestionUiState) -> Unit,
) {
  private companion object {
    const val MIN_WORD_CHARS = 3
    const val MAX_WORD_CHARS = 24
    val REPEATED_LETTERS = Regex("(\\p{L})\\1\\1", RegexOption.IGNORE_CASE)
  }

  private val ranker = CandidateRanker()
  private val mainHandler = Handler(Looper.getMainLooper())

  private var latestContext: CursorContext? = null
  private var lastNeuralKey: String? = null
  private var lastNeuralWords: List<String> = emptyList()
  private var lastNeuralTyped = ""
  private var lastPublished: SuggestionUiState? = null

  fun onContextChanged(context: CursorContext) {
    latestContext = context
    if (!context.mode.allowsPrediction) {
      publish(SuggestionUiState.HIDDEN)
      return
    }
    publishSlots(context)
    if (mode != PredictionMode.LOCAL_ONLY) scheduleNeural(context)
  }

  fun modelCorrection(word: String): String? =
    if (lastNeuralTyped != word) null else lastNeuralWords.firstOrNull { !it.startsWith(word, ignoreCase = true) }

  fun refresh() {
    val context = latestContext ?: return
    if (context.mode.allowsPrediction) publishSlots(context)
  }

  fun reset() {
    latestContext = null
    lastNeuralKey = null
    lastNeuralWords = emptyList()
    lastNeuralTyped = ""
    lastPublished = null
    scheduler.cancelPending()
  }

  fun shutdown() {
    scheduler.shutdown()
  }

  private fun publishSlots(context: CursorContext) {
    val typed = context.currentWord
    val model =
      if (mode == PredictionMode.LOCAL_ONLY || neuralKey(context) != lastNeuralKey) emptyList() else lastNeuralWords

    if (typed.isEmpty()) {
      val lead = model.take(maxSuggestions - 1)
      val local = localWords(context, lead, maxSuggestions - lead.size)
      val emojis = if (local.isEmpty()) emojisFor(context.previousWord) else emptyList()
      val modelWords = if (local.isEmpty() && emojis.isEmpty()) model.take(maxSuggestions) else lead
      publish(
        SuggestionUiState(visible = true, candidates = modelWords + local, emojis = emojis, modelWords = modelWords.toSet()),
      )
      return
    }

    val emojis = emojisFor(typed)
    val wordSlots = if (emojis.isEmpty()) maxSuggestions else maxSuggestions - 1
    val local = localWords(context, model, wordSlots)
    val modelSlots = if (hasFullDictionary(context) || local.isEmpty()) wordSlots else (wordSlots - 1).coerceAtLeast(1)
    val modelWords = model.take(modelSlots)
    val words = modelWords + local.take(wordSlots - modelWords.size)
    val candidates = if (words.isEmpty() && emojis.isEmpty() && hasWordShape(typed, context)) listOf(typed) else words
    publish(
      SuggestionUiState(visible = true, candidates = candidates, emojis = emojis, modelWords = modelWords.toSet()),
    )
  }

  private fun localWords(context: CursorContext, exclude: List<String>, limit: Int): List<String> {
    if (mode == PredictionMode.NEURAL_ONLY || limit <= 0) return emptyList()
    val pool = ArrayList<Candidate>(maxSuggestions * 3)
    for (provider in providers) {
      pool.addAll(provider.provide(context, maxSuggestions * 2))
    }
    val ranked =
      ranker
        .rank(pool)
        .map { it.text }
        .filterNot { it.equals(context.currentWord, ignoreCase = true) }
        .filter { hasWordShape(it, context) }
        .filterNot { word -> exclude.any { it.equals(word, ignoreCase = true) } }
    return (ranked.filter(isKnownWord) + ranked.filter(isDictionaryWord)).distinct().take(limit)
  }

  private fun scheduleNeural(context: CursorContext) {
    val text = context.sentence.ifBlank { context.previousWord }
    if (text.isBlank()) return

    if (context.currentWord.length == 1) {
      scheduler.cancelPredictions()
      return
    }

    val key = neuralKey(context)
    if (key == lastNeuralKey) return

    scheduler.schedule(InferencePriority.PREDICTION) {
      val typed = context.currentWord
      val words =
        if (typed.isEmpty()) {
          neural.predict(text, maxSuggestions) { isSensible(it, context) && !it.equals(context.previousWord, ignoreCase = true) }
        } else {
          neural
            .complete(text, maxSuggestions) {
              (it.equals(typed, ignoreCase = true) || (isCloseTo(typed, it) && isSensible(it, context))).also { ok ->
                Log.d("TinyKeys", "complete candidate \"$it\" for \"$typed\" accepted=$ok")
              }
            }
            .map {
              when {
                it.equals(typed, ignoreCase = true) -> typed
                typed.first().isUpperCase() -> it.replaceFirstChar(Char::uppercaseChar)
                else -> it
              }
            }
        }

      val engineWasReady = neural.isReady
      mainHandler.post {
        if (engineWasReady) {
          lastNeuralKey = key
          lastNeuralWords = words
          lastNeuralTyped = typed
        }
        val current = latestContext
        if (words.isNotEmpty() && current != null && neuralKey(current) == key) {
          publishSlots(current)
        }
      }
    }
  }

  private fun isCloseTo(typed: String, word: String): Boolean {
    val a = typed.lowercase()
    val b = word.lowercase()
    if (a == b) return false
    if (b.startsWith(a)) return true
    if (isKnownWord(typed) || a.first() != b.first()) return false
    return WordDiff.distance(a, b) <= if (a.length < 5) 1 else 2
  }

  private fun isSensible(word: String, context: CursorContext): Boolean =
    hasWordShape(word, context) && (!hasFullDictionary(context) || isKnownWord(word))

  private fun hasFullDictionary(context: CursorContext): Boolean = context.language.equals("en", ignoreCase = true)

  private fun hasWordShape(word: String, context: CursorContext): Boolean =
    word.length in (if (context.currentWord.isEmpty()) 1 else MIN_WORD_CHARS)..MAX_WORD_CHARS &&
      word.first().isLetter() &&
      word.all { it.isLetter() || it == '\'' || it == '-' || Character.getType(it) == Character.NON_SPACING_MARK.toInt() } &&
      !REPEATED_LETTERS.containsMatchIn(word)

  private fun neuralKey(context: CursorContext): String =
    context.currentWord + ' ' + context.sentence + ' ' + context.previousWord

  private fun publish(state: SuggestionUiState) {
    if (state == lastPublished) return
    lastPublished = state
    listener(state)
  }
}
