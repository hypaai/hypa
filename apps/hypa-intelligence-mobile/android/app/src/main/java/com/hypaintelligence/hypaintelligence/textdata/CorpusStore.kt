package com.hypaintelligence.hypaintelligence.textdata

import android.content.Context
import com.hypaintelligence.hypaintelligence.concurrent.KeyboardThreads
import java.util.concurrent.Executors

class CorpusStore(context: Context) {
  private val appContext = context.applicationContext
  private val loader = Executors.newSingleThreadExecutor(KeyboardThreads.io("hypa-textdata"))

  @Volatile private var packs: List<LanguagePack> = emptyList()
  @Volatile private var loadedCodes: Set<String> = emptySet()
  @Volatile private var cachedAlphabet: CharArray = CharArray(0)
  @Volatile private var alphabetPacks: List<LanguagePack> = emptyList()

  @Synchronized fun setLanguage(languageCode: String) {
    val wanted = linkedSetOf(languageCode.lowercase().ifBlank { "en" }, "en")
    if (wanted == loadedCodes) return
    loadedCodes = wanted
    packs = emptyList()
    loader.execute {
      val primary = LanguagePack.load(appContext.assets, wanted.first())
      val loaded = if (primary == null) emptyList() else
        listOf(primary) + wanted.drop(1).mapNotNull { LanguagePack.load(appContext.assets, it) }
      synchronized(this) {
        if (loadedCodes == wanted) packs = loaded
      }
    }
  }

  val isReady: Boolean
    get() = packs.isNotEmpty()

  fun contains(normalized: String): Boolean = packs.any { it.contains(normalized) }

  fun isCommon(normalized: String): Boolean = packs.any { it.isCommon(normalized) }

  fun commonWithPrefix(normalized: String): Int = packs.sumOf { it.commonWithPrefix(normalized) }

  fun canonical(normalized: String): String? =
    packs.firstNotNullOfOrNull { it.canonical(normalized) }

  fun prefix(normalized: String, limit: Int): List<String> =
    packs
      .flatMap { it.prefix(normalized, limit) }
      .distinctBy { TextNormalizer.normalize(it) }
      .sortedWith(compareBy<String> { it.length }.thenBy { it })
      .take(limit)

  fun alphabet(): CharArray {
    val current = packs
    if (current !== alphabetPacks) {
      cachedAlphabet = current.flatMapTo(mutableSetOf()) { it.alphabet }.toCharArray()
      alphabetPacks = current
    }
    return cachedAlphabet
  }
}
