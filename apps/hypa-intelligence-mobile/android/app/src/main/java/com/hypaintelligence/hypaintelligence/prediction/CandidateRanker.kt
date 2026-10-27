package com.hypaintelligence.hypaintelligence.prediction

data class RankingWeights(
  val personal: Float = 0.40f,
  val ngram: Float = 0.35f,
  val prefix: Float = 0.25f,
)

class CandidateRanker(private val weights: RankingWeights = RankingWeights()) {
  fun rank(pool: List<Candidate>): List<Candidate> {
    val merged = LinkedHashMap<String, Candidate>(pool.size)
    for (candidate in pool) {
      if (candidate.text.isEmpty()) continue
      merged.merge(candidate.text.lowercase(), candidate) { a, b -> a.mergedWith(b) }
    }
    return merged.values.sortedWith(
      compareByDescending<Candidate> { score(it) }.thenBy { it.text.lowercase() },
    )
  }

  fun score(candidate: Candidate): Float =
    candidate.personalScore * weights.personal +
      candidate.ngramScore * weights.ngram +
      candidate.prefixScore * weights.prefix
}
