package com.hypaintelligence.hypaintelligence.emoji

import com.hypaintelligence.hypaintelligence.textdata.TextNormalizer

class EmojiSearchIndex(groups: List<EmojiGroup>) {
  private data class TokenEntry(val emojiIndex: Int, val position: Int)
  private data class Match(val index: Int, val weight: Float, val position: Int)
  private val entries = groups.flatMap { it.entries }
  private val tokens = mutableMapOf<String, MutableList<TokenEntry>>()
  private val sortedTokens: List<String>

  init {
    entries.forEachIndexed { index, entry ->
      TextNormalizer.normalize(entry.name).split(' ').filter { it.isNotEmpty() }
        .forEachIndexed { position, word ->
          tokens.getOrPut(word) { mutableListOf() }.add(TokenEntry(index, position))
        }
    }
    sortedTokens = tokens.keys.sorted()
  }

  fun search(query: String, recents: List<String>, limit: Int): List<EmojiEntry> {
    val q = TextNormalizer.normalize(query)
    if (q.isEmpty() || limit <= 0) return emptyList()
    var low = 0
    var high = sortedTokens.size
    while (low < high) {
      val mid = (low + high) / 2
      if (sortedTokens[mid] < q) low = mid + 1 else high = mid
    }
    val matches = mutableMapOf<Int, Match>()
    for (i in low until sortedTokens.size) {
      val token = sortedTokens[i]
      if (!token.startsWith(q)) break
      val weight = if (token == q) 1.0f else 0.6f
      for (entry in tokens.getValue(token)) {
        val current = matches[entry.emojiIndex]
        if (current == null || current.weight < weight) {
          matches[entry.emojiIndex] = Match(entry.emojiIndex, weight, entry.position)
        }
      }
    }
    return matches.values.sortedWith(
      compareBy<Match> { recents.indexOf(entries[it.index].sequence).takeIf { rank -> rank >= 0 } ?: Int.MAX_VALUE }
        .thenByDescending { it.weight }
        .thenBy { it.position }
        .thenBy { entries[it.index].name.length }
        .thenBy { it.index }
    ).take(limit).map { entries[it.index] }
  }
}
