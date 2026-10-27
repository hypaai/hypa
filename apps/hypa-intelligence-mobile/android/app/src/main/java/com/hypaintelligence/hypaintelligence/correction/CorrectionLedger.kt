package com.hypaintelligence.hypaintelligence.correction

import com.hypaintelligence.hypaintelligence.textdata.TextNormalizer

data class AppliedCorrection(val original: String, val replacement: String)

class CorrectionLedger {
  private companion object {
    const val MAX_REJECTED = 200
    const val MAX_CORRECTED_BLOCKS = 40
  }

  var undoable: AppliedCorrection? = null
    private set

  private val rejected = LinkedHashSet<String>()
  private val correctedBlocks = LinkedHashSet<String>()

  fun recordWordCorrection(original: String, replacement: String) {
    undoable = AppliedCorrection(original, replacement)
  }

  fun settle() {
    undoable = null
  }

  fun rejectUndoable(): AppliedCorrection? {
    val applied = undoable ?: return null
    undoable = null
    reject(applied.original)
    return applied
  }

  fun reject(word: String) {
    val key = TextNormalizer.normalize(word)
    if (key.isEmpty()) return
    if (rejected.size >= MAX_REJECTED) rejected.removeOldest()
    rejected.add(key)
  }

  fun isRejected(word: String): Boolean = TextNormalizer.normalize(word) in rejected

  fun shouldCorrectBlock(block: String): Boolean = block.trim() !in correctedBlocks

  fun forgetBlock(block: String) {
    correctedBlocks.remove(block.trim())
  }

  fun markBlockCorrected(block: String) {
    val key = block.trim()
    if (key.isEmpty()) return
    if (correctedBlocks.size >= MAX_CORRECTED_BLOCKS) correctedBlocks.removeOldest()
    correctedBlocks.add(key)
  }

  fun reset() {
    undoable = null
    rejected.clear()
    correctedBlocks.clear()
  }

  private fun LinkedHashSet<String>.removeOldest() {
    val iterator = iterator()
    if (iterator.hasNext()) {
      iterator.next()
      iterator.remove()
    }
  }
}
