package com.hypaintelligence.hypaintelligence.prediction

enum class CandidateSource {
  PERSONAL,
  CORPUS,
  NEURAL,
}

data class Candidate(
  val text: String,
  val sources: Set<CandidateSource>,
  val personalScore: Float = 0f,
  val prefixScore: Float = 0f,
  val ngramScore: Float = 0f,
) {
  fun mergedWith(other: Candidate): Candidate =
    Candidate(
      text = text,
      sources = sources + other.sources,
      personalScore = maxOf(personalScore, other.personalScore),
      prefixScore = maxOf(prefixScore, other.prefixScore),
      ngramScore = maxOf(ngramScore, other.ngramScore),
    )
}
