package com.hypaintelligence.hypaintelligence.neural

import java.io.ByteArrayOutputStream
import java.text.Normalizer
import org.json.JSONObject

class TinyKeysTokenizer(json: String) {
  private companion object {
    const val WS = "\\t\\n\\u000B\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000"
    val PATTERN =
      Regex(
        "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^$WS\\p{L}\\p{N}]+|[$WS]+(?![^$WS])|[$WS]+",
      )

    val BYTE_TO_CHAR =
      CharArray(256).also { table ->
        var extra = 0
        for (b in 0..255) {
          val printable = b in 33..126 || b in 161..172 || b in 174..255
          table[b] = if (printable) b.toChar() else (256 + extra++).toChar()
        }
      }
    val CHAR_TO_BYTE = HashMap<Char, Int>().also { map -> BYTE_TO_CHAR.forEachIndexed { b, c -> map[c] = b } }
  }

  private val vocab = HashMap<String, Int>()
  private val ranks = HashMap<String, Int>()
  private val special = HashMap<String, Int>()
  private val tokens: Array<String>

  val eot: Int
  private val bos: Int
  private val startHeader: Int
  private val endHeader: Int

  init {
    val root = JSONObject(json)
    val model = root.getJSONObject("model")
    val vocabJson = model.getJSONObject("vocab")
    vocabJson.keys().forEach { vocab[it] = vocabJson.getInt(it) }
    val added = root.getJSONArray("added_tokens")
    for (i in 0 until added.length()) {
      val token = added.getJSONObject(i)
      special[token.getString("content")] = token.getInt("id")
    }
    val merges = model.getJSONArray("merges")
    for (i in 0 until merges.length()) {
      val pair = merges.getJSONArray(i)
      ranks[pair.getString(0) + " " + pair.getString(1)] = i
    }
    tokens = Array(maxOf(vocab.values.max(), special.values.max()) + 1) { "" }
    vocab.forEach { (token, id) -> tokens[id] = token }
    special.forEach { (token, id) -> tokens[id] = token }

    eot = special.getValue("<|eot_id|>")
    bos = special.getValue("<|begin_of_text|>")
    startHeader = special.getValue("<|start_header_id|>")
    endHeader = special.getValue("<|end_header_id|>")
  }

  fun chat(system: String, user: String): IntArray =
    buildList {
        add(bos)
        addAll(turn("system", system))
        addAll(turn("user", user))
        addAll(header("assistant"))
        addAll(encode("\n\n"))
      }
      .toIntArray()

  fun encode(text: String): List<Int> =
    PATTERN.findAll(Normalizer.normalize(text, Normalizer.Form.NFC))
      .flatMap { match ->
        val mapped = buildString { match.value.toByteArray(Charsets.UTF_8).forEach { append(BYTE_TO_CHAR[it.toInt() and 0xFF]) } }
        bpe(mapped).map { vocab.getValue(it) }
      }
      .toList()

  fun decode(ids: List<Int>): String {
    val bytes = ByteArrayOutputStream()
    for (id in ids) {
      if (tokens[id] in special) continue
      tokens[id].forEach { bytes.write(CHAR_TO_BYTE.getValue(it)) }
    }
    return String(bytes.toByteArray(), Charsets.UTF_8)
  }

  fun token(id: Int): String = tokens[id]

  private fun turn(role: String, content: String): List<Int> =
    header(role) + encode("\n\n$content") + eot

  private fun header(role: String): List<Int> = listOf(startHeader) + encode(role) + endHeader

  private fun bpe(word: String): List<String> {
    val parts = word.map { it.toString() }.toMutableList()
    while (parts.size > 1) {
      var best = -1
      var bestRank = Int.MAX_VALUE
      for (i in 0 until parts.size - 1) {
        val rank = ranks[parts[i] + " " + parts[i + 1]] ?: continue
        if (rank < bestRank) {
          bestRank = rank
          best = i
        }
      }
      if (best < 0) break
      parts[best] = parts[best] + parts.removeAt(best + 1)
    }
    return parts
  }
}
