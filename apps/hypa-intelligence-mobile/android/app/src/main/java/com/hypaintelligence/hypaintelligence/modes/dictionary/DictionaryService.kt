package com.hypaintelligence.hypaintelligence.modes.dictionary

import com.hypaintelligence.hypaintelligence.KeyboardErrorCatalog
import com.hypaintelligence.hypaintelligence.KeyboardLanguageCatalog
import com.hypaintelligence.hypaintelligence.KeyboardRequestException
import com.hypaintelligence.hypaintelligence.modes.HypaApi
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class DictionaryService {
  private val client by lazy {
    OkHttpClient.Builder()
      .connectTimeout(HypaApi.CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .writeTimeout(HypaApi.WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .readTimeout(HypaApi.READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .build()
  }

  fun lookup(
    word: String,
    languageName: String,
    provider: String,
    model: String,
    token: String,
  ): DictionaryResultCardData {
    val serviceModel = KeyboardLanguageCatalog.resolveDictionary(provider, model)
    val payload =
      JSONObject()
        .put("word", word)
        .put("language", languageName)
        .put("provider", serviceModel.provider)
        .put("model_name", serviceModel.model)

    val request = Request.Builder()
      .url(HypaApi.url("/dictionary"))
      .addHeader("Accept", HypaApi.JSON_UTF8)
      .apply {
        if (token.isNotBlank()) {
          addHeader("Authorization", "Bearer $token")
        }
      }
      .post(payload.toString().toRequestBody(HypaApi.JSON_UTF8.toMediaType()))
      .build()

    client.newCall(request).execute().use { response ->
      val bodyStr = response.body?.string().orEmpty()
      HypaApi.logResponse("Dictionary", response.code, bodyStr)
      if (!response.isSuccessful) {
        throw KeyboardRequestException(response.code)
      }
      return parseResult(bodyStr, word, languageName)
        ?: throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.noResult)
    }
  }

  private fun parseResult(
    body: String,
    fallbackWord: String,
    fallbackLanguage: String,
  ): DictionaryResultCardData? {
    val jsonBody = HypaApi.extractJsonBody(body)
    val root = runCatching { JSONObject(jsonBody) }.getOrNull() ?: return null
    val payload = root.optJSONObject("data") ?: root
    val word = payload.optString("word").trim().ifEmpty { fallbackWord }
    val language = payload.optString("language").trim().ifEmpty { fallbackLanguage }
    val pronunciation =
      payload.optString("phonetic").trim().ifEmpty {
        payload.optString("pronunciation").trim()
      }.ifBlank { null }

    val definitions = parseDefinitionItems(payload.optJSONArray("definitions"))
    val usageExamples =
      parseUsageItems(
        payload.optJSONArray("usage")
          ?: payload.optJSONArray("usageExamples")
          ?: payload.optJSONArray("usageexamples"),
      )
    val exampleSentences = parseStringArray(payload.optJSONArray("exampleSentences"))
    val synonyms = parseStringArray(payload.optJSONArray("syms") ?: payload.optJSONArray("synonyms"))
    val antonyms = parseStringArray(payload.optJSONArray("antm") ?: payload.optJSONArray("antonyms"))

    val partOfSpeech =
      payload.optString("partOfSpeech").trim().ifEmpty {
        definitions.firstOrNull()?.partOfSpeech.orEmpty()
      }.ifBlank { null }
    val fallbackDefinitionText =
      payload.optString("definition").trim().ifEmpty {
        payload.optString("meaning").trim().ifEmpty { body.trim() }
      }
    val resolvedDefinitions =
      if (definitions.isEmpty() && fallbackDefinitionText.isNotBlank()) {
        listOf(DictionaryDefinitionItem(partOfSpeech, fallbackDefinitionText, null))
      } else {
        definitions
      }
    val resolvedUsage =
      if (usageExamples.isEmpty() && exampleSentences.isNotEmpty()) {
        exampleSentences.map { DictionaryUsageItem("", it) }
      } else {
        usageExamples
      }

    return DictionaryResultCardData(
      word = word,
      language = language,
      pronunciation = pronunciation,
      partOfSpeech = partOfSpeech,
      definitions = resolvedDefinitions,
      usageExamples = resolvedUsage,
      synonyms = synonyms,
      antonyms = antonyms,
      exampleSentences = exampleSentences,
      culturalContext =
        parseSectionText(payload.optJSONArray("cultural_context"))
          ?: payload.optString("culturalContext").trim().ifBlank { null },
      funFact =
        parseSectionText(payload.optJSONArray("fun_facts"))
          ?: payload.optString("funFact").trim().ifBlank { null },
    )
  }

  private fun parseDefinitionItems(items: JSONArray?): List<DictionaryDefinitionItem> =
    buildList {
      if (items == null) return@buildList
      for (index in 0 until items.length()) {
        val item = items.optJSONObject(index) ?: continue
        val text =
          item.optString("text").trim().ifEmpty {
            item.optString("definition").trim()
          }
        if (text.isBlank()) continue
        val partOfSpeech =
          item.optString("partOfSpeech").trim().ifEmpty {
            item.optString("type").trim()
          }.ifBlank { null }
        val context = item.optString("context").trim().ifBlank { null }
        add(DictionaryDefinitionItem(partOfSpeech, text, context))
      }
    }

  private fun parseUsageItems(items: JSONArray?): List<DictionaryUsageItem> =
    buildList {
      if (items == null) return@buildList
      for (index in 0 until items.length()) {
        val item = items.optJSONObject(index) ?: continue
        val example =
          item.optString("example").trim().ifEmpty {
            item.optString("text").trim()
          }
        if (example.isBlank()) continue
        val partOfSpeech =
          item.optString("partOfSpeech").trim().ifEmpty {
            item.optString("type").trim()
          }
        add(DictionaryUsageItem(partOfSpeech, example))
      }
    }

  private fun parseStringArray(items: JSONArray?): List<String> =
    buildList {
      if (items == null) return@buildList
      for (index in 0 until items.length()) {
        val value = items.optString(index).trim()
        if (value.isNotBlank()) add(value)
      }
    }

  private fun parseSectionText(items: JSONArray?): String? {
    val parts =
      buildList {
        if (items == null) return@buildList
        for (index in 0 until items.length()) {
          val item = items.optJSONObject(index) ?: continue
          val text =
            item.optString("text").trim().ifEmpty {
              item.optString("definition").trim()
            }
          if (text.isNotBlank()) add(text)
        }
      }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(". ")
  }
}
