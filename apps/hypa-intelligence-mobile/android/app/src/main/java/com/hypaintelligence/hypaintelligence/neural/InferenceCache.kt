package com.hypaintelligence.hypaintelligence.neural

object InferenceCache {
  private const val MAX_ENTRIES = 32

  private val cache = object : LinkedHashMap<String, List<String>>(MAX_ENTRIES, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<String>>?): Boolean =
      size > MAX_ENTRIES
  }

  fun get(task: String, input: String): List<String>? = synchronized(cache) {
    cache["$task:$input"]
  }

  fun put(task: String, input: String, candidates: List<String>) {
    if (candidates.isEmpty()) return
    synchronized(cache) { cache["$task:$input"] = candidates }
  }

  fun invalidate() = synchronized(cache) { cache.clear() }
}
