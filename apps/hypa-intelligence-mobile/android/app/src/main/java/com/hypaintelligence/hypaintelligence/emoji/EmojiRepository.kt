package com.hypaintelligence.hypaintelligence.emoji

import android.content.Context
import com.hypaintelligence.hypaintelligence.textdata.TextNormalizer
import java.util.concurrent.Executors

class EmojiRepository(context: Context) {
  private val appContext = context.applicationContext
  private val loader = Executors.newSingleThreadExecutor { r ->
    Thread(r, "hypa-emoji").apply { isDaemon = true }
  }

  @Volatile private var groups: List<EmojiGroup> = emptyList()
  @Volatile private var version: String = ""
  @Volatile private var searchIndex: EmojiSearchIndex? = null
  @Volatile private var byWord: Map<String, List<String>> = emptyMap()
  @Volatile private var started = false

  val isReady: Boolean
    get() = groups.isNotEmpty()

  val emojiVersion: String
    get() = version

  @Synchronized
  fun warmup(onLoaded: () -> Unit = {}) {
    if (started) return
    started = true
    loader.execute {
      val parsed = runCatching { load() }.getOrNull()
      if (parsed != null) {
        version = parsed.first
        searchIndex = EmojiSearchIndex(parsed.second)
        byWord = wordIndex(parsed.second)
        groups = parsed.second
        onLoaded()
      }
    }
  }

  fun groups(): List<EmojiGroup> = groups

  fun search(query: String, recentStore: RecentEmojiStore, limit: Int): List<EmojiEntry> =
    searchIndex?.search(query, recentStore.recent(), limit).orEmpty()

  fun suggest(word: String, recentStore: RecentEmojiStore, limit: Int): List<String> {
    val matches = byWord[TextNormalizer.normalize(word)] ?: return emptyList()
    val recent = recentStore.recent()
    return matches.sortedBy { recent.indexOf(it).let { rank -> if (rank < 0) Int.MAX_VALUE else rank } }.take(limit)
  }

  private fun wordIndex(groups: List<EmojiGroup>): Map<String, List<String>> {
    val named = HashMap<String, MutableList<String>>()
    val tagged = HashMap<String, MutableList<String>>()
    for (entry in groups.flatMap { it.entries }) {
      val name = TextNormalizer.normalize(entry.name)
      named.getOrPut(name) { ArrayList() }.add(entry.sequence)
      entry.keywords
        .map(TextNormalizer::normalize)
        .filterNot { it == name }
        .forEach { tagged.getOrPut(it) { ArrayList() }.add(entry.sequence) }
    }
    return (tagged.keys + named.keys).associateWith {
      named[it].orEmpty() + tagged[it].orEmpty()
    }
  }

  private fun load(): Pair<String, List<EmojiGroup>> {
    var parsedVersion = ""
    val result = ArrayList<EmojiGroup>(10)
    var name: String? = null
    var entries = ArrayList<EmojiEntry>(512)

    appContext.assets.open(ASSET_PATH).bufferedReader(Charsets.UTF_8).useLines { lines ->
      for (line in lines) {
        if (line.isEmpty() || line.startsWith("#")) continue
        if (line.startsWith("!version\t")) {
          parsedVersion = line.substringAfter('\t')
          continue
        }
        if (line.startsWith("[") && line.endsWith("]")) {
          name?.let { result.add(EmojiGroup(it, entries)) }
          name = line.substring(1, line.length - 1)
          entries = ArrayList(512)
          continue
        }
        val parts = line.split('\t')
        if (parts.size < 2 || parts[0].isEmpty()) continue
        entries.add(
          EmojiEntry(
            sequence = parts[0],
            name = parts[1],
            variants = if (parts.size > 2 && parts[2].isNotEmpty()) parts[2].split(' ') else emptyList(),
            keywords = if (parts.size > 3 && parts[3].isNotEmpty()) parts[3].split(' ') else emptyList(),
          ),
        )
      }
    }
    name?.let { result.add(EmojiGroup(it, entries)) }
    return parsedVersion to result
  }

  private companion object {
    const val ASSET_PATH = "emoji/emoji.txt"
  }
}
