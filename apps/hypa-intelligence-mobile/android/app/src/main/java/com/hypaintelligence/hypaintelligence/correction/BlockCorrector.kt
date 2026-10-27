package com.hypaintelligence.hypaintelligence.correction

import android.os.Handler
import android.os.Looper
import com.hypaintelligence.hypaintelligence.neural.TinyKeysService
import com.hypaintelligence.hypaintelligence.prediction.InferencePriority
import com.hypaintelligence.hypaintelligence.prediction.InferenceScheduler

class BlockCorrector(
  private val neural: TinyKeysService,
  private val scheduler: InferenceScheduler,
  private val ledger: CorrectionLedger,
  private val onCorrected: (original: String, corrected: String) -> Unit,
) {
  private companion object {
    const val MIN_BLOCK_CHARS = 12

    const val MAX_BLOCK_CHARS = 200
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  fun correct(sentence: String) {
    val block = sentence.trim()
    if (block.length < MIN_BLOCK_CHARS || block.length > MAX_BLOCK_CHARS) return
    if (!ledger.shouldCorrectBlock(block)) return
    ledger.markBlockCorrected(block)

    scheduler.schedule(InferencePriority.CORRECTION) {
      val result = neural.correctBlock(block)
      if (result == null) {
        mainHandler.post { ledger.forgetBlock(block) }
        return@schedule
      }

      val corrected = result.trim()
      if (corrected.isNotEmpty() && corrected != block) {
        mainHandler.post { onCorrected(block, corrected) }
      }
    }
  }
}
