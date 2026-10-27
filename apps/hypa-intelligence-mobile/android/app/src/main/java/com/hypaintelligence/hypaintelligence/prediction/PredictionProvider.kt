package com.hypaintelligence.hypaintelligence.prediction

import com.hypaintelligence.hypaintelligence.context.CursorContext

interface PredictionProvider {
  fun provide(context: CursorContext, limit: Int): List<Candidate>
}
