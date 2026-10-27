package com.hypaintelligence.hypaintelligence.modes.translate

import com.hypaintelligence.hypaintelligence.KeyboardErrorCatalog
import com.hypaintelligence.hypaintelligence.KeyboardLanguageCatalog
import com.hypaintelligence.hypaintelligence.KeyboardRequestException
import com.hypaintelligence.hypaintelligence.TranslationLanguage
import com.hypaintelligence.hypaintelligence.modes.HypaApi
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import org.json.JSONObject

class TranslationService {
  companion object {
    fun isAutoDetectLanguage(value: String): Boolean {
      val normalized =
        value.trim().replace("-", " ").replace("_", " ").lowercase(Locale.US).replace(Regex("\\s+"), " ")
      return normalized.isEmpty() ||
        normalized == "auto" ||
        normalized == "auto detect" ||
        normalized == "auto detected" ||
        normalized == "autodetect"
    }

    fun resolveDetectedSourceLanguage(
      detected: String?,
      languages: List<TranslationLanguage>,
    ): TranslationLanguage? {
      val name = detected?.trim().orEmpty()
      if (name.isEmpty() || isAutoDetectLanguage(name)) return null
      val supported = languages.filter { !isAutoDetectLanguage(it.name) }
      supported.firstOrNull { it.name.equals(name, ignoreCase = true) }?.let { return it }
      return supported
        .filter { name.startsWith(it.name, ignoreCase = true) }
        .maxByOrNull { it.name.length }
    }
  }

  fun translate(
    token: String,
    sourceText: String,
    sourceLanguageName: String,
    targetLanguageName: String,
    provider: String,
    model: String,
  ): TranslationPayload {
    val requestId = "keyboard-android-${System.currentTimeMillis()}"
    val serviceModel = KeyboardLanguageCatalog.resolveTranslation(provider, model)
    val payload =
      JSONObject()
        .put("text", sourceText)
        .put("provider", serviceModel.provider)
        .put("model", serviceModel.model)
        .put("stream", false)
        .put("target_lang", targetLanguageName)
        .put("temperature", 0.8)
        .put("top_p", 0.95)
        .put("top_k", 50)
        .put("max_tokens", 3000)
        .put("thinking", false)
        .put("client_request_id", requestId)

    if (!isAutoDetectLanguage(sourceLanguageName)) {
      payload.put("source_lang", sourceLanguageName)
    }

    val endpoint = HypaApi.url("/v2/translate/mt")
    HypaApi.logRequest("MT", endpoint)
    val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 15000
      readTimeout = 30000
      doOutput = true
      setRequestProperty("Content-Type", HypaApi.JSON_UTF8)
      setRequestProperty("Accept", HypaApi.TEXT_OR_JSON_UTF8)
      if (token.isNotBlank()) {
        setRequestProperty("Authorization", "Bearer $token")
      }
    }

    return try {
      OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }

      val statusCode = connection.responseCode
      val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
      val body =
        BufferedReader(InputStreamReader(stream ?: connection.inputStream, Charsets.UTF_8)).use { reader ->
          reader.readText()
        }
      HypaApi.logResponse("MT", statusCode, body)

      if (statusCode !in 200..299) {
        throw KeyboardRequestException(statusCode)
      }

      extractTranslatedText(body).copy(clientRequestId = requestId)
    } finally {
      connection.disconnect()
    }
  }

  fun generateThinking(
    token: String,
    sourceText: String,
    translatedText: String,
    sourceLanguageName: String,
    targetLanguageName: String,
    provider: String,
    model: String,
    clientRequestId: String? = null,
  ): String {
    val requestId =
      clientRequestId?.trim()?.takeIf { it.isNotEmpty() }
        ?: "keyboard-android-thinking-${System.currentTimeMillis()}"
    val serviceModel = KeyboardLanguageCatalog.resolveTranslation(provider, model)
    val payload =
      JSONObject()
        .put("source_text", sourceText)
        .put("target_text", translatedText)
        .put("source_lang", sourceLanguageName)
        .put("target_lang", targetLanguageName)
        .put("provider", serviceModel.provider)
        .put("model", serviceModel.model)
        .put("stream", false)
        .put("temperature", 0.3)
        .put("top_p", 0.5)
        .put("top_k", 1)
        .put("max_tokens", 800)
        .put("client_request_id", requestId)

    val endpoint = HypaApi.url("/v2/translate/mt/thinking")
    HypaApi.logRequest("MT-thinking", endpoint)
    val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 15000
      readTimeout = 30000
      doOutput = true
      setRequestProperty("Content-Type", HypaApi.JSON_UTF8)
      setRequestProperty("Accept", HypaApi.JSON_UTF8)
      if (token.isNotBlank()) {
        setRequestProperty("Authorization", "Bearer $token")
      }
    }

    return try {
      OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
        writer.write(payload.toString())
      }

      val statusCode = connection.responseCode
      val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
      val body =
        BufferedReader(InputStreamReader(stream ?: connection.inputStream, Charsets.UTF_8)).use { reader ->
          reader.readText()
        }
      HypaApi.logResponse("MT-thinking", statusCode, body)

      if (statusCode !in 200..299) {
        throw KeyboardRequestException(statusCode)
      }

      extractThinkingText(body)
        ?: throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.tryAgain)
    } finally {
      connection.disconnect()
    }
  }

  private fun extractTranslatedText(body: String): TranslationPayload {
    if (hasSseError(body)) {
      throw KeyboardRequestException()
    }

    val jsonBody = HypaApi.extractJsonBody(body)
    val json = runCatching { JSONObject(jsonBody) }.getOrNull()
    if (json == null) {
      val parsed = splitThinkingAndAnswer(body.trim())
      if (HypaApi.isInvalidGeneratedText(parsed.second)) {
        throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.noTranslation)
      }
      return TranslationPayload(parsed.second, parsed.first, null)
    }
    val data = detectedLanguageObject(json)
    val detected = detectedLanguage(json, data)
    val choices = json.optJSONArray("choices") ?: data?.optJSONArray("choices")
    val choiceContent =
      choices
        ?.optJSONObject(0)
        ?.optJSONObject("message")
        ?.optString("content")
        .orEmpty()

    if (choiceContent.isNotBlank()) {
      val parsed = splitThinkingAndAnswer(choiceContent)
      if (HypaApi.isInvalidGeneratedText(parsed.second)) {
        throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.noTranslation)
      }
      return TranslationPayload(parsed.second, parsed.first, detected)
    }

    val directCandidates =
      listOf(
        json.optString("translated_text"),
        json.optString("translation"),
        json.optString("output"),
        json.optString("text"),
        data?.optString("translated_text").orEmpty(),
        data?.optString("translation").orEmpty(),
        data?.optString("output").orEmpty(),
        data?.optString("text").orEmpty(),
      )

    val directText =
      directCandidates.firstOrNull { it.isNotBlank() }?.trim()
        ?: throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.noTranslation)
    val parsed = splitThinkingAndAnswer(directText)
    if (HypaApi.isInvalidGeneratedText(parsed.second)) {
      throw KeyboardRequestException(catalogMessage = KeyboardErrorCatalog.noTranslation)
    }
    return TranslationPayload(parsed.second, parsed.first, detected)
  }

  private fun detectedLanguageObject(json: JSONObject): JSONObject? {
    json.optJSONObject("data")?.let { return it }
    val raw = json.opt("data") as? String ?: return null
    return runCatching { JSONObject(raw) }.getOrNull()
  }

  private fun detectedLanguage(json: JSONObject, data: JSONObject?): String? {
    val keys =
      listOf(
        "detected_source_lang",
        "detectedSourceLanguage",
        "source_language_detected",
        "language",
        "source_language",
        "detected_language",
      )
    for (source in listOfNotNull(json, data)) {
      for (key in keys) {
        val value = source.opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.trim()
        if (!value.isNullOrBlank() && !isAutoDetectLanguage(value)) return value
      }
    }
    return null
  }

  private fun extractThinkingText(body: String): String? {
    val jsonBody = HypaApi.extractJsonBody(body)
    val json = runCatching { JSONObject(jsonBody) }.getOrNull()
    if (json == null) {
      return body.trim().takeIf { it.isNotBlank() }
    }
    val data = detectedLanguageObject(json)
    val keys = listOf("thinking", "content", "text", "output")
    for (source in listOfNotNull(json, data)) {
      for (key in keys) {
        val value = source.opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.trim()
        if (!value.isNullOrBlank()) return value
      }
    }
    val choices = json.optJSONArray("choices") ?: data?.optJSONArray("choices")
    val choiceContent =
      choices
        ?.optJSONObject(0)
        ?.optJSONObject("message")
        ?.optString("content")
        .orEmpty()
        .trim()
    return choiceContent.takeIf { it.isNotBlank() }
  }

  private fun hasSseError(body: String): Boolean {
    var currentEventType = "message"
    body.lineSequence().forEach { rawLine ->
      val line = rawLine.trim()
      if (line.isBlank()) return@forEach
      when {
        line.startsWith("event:") -> {
          currentEventType = line.removePrefix("event:").trim().lowercase(Locale.US).ifBlank { "message" }
        }
        line.startsWith("data:") -> {
          val data = line.removePrefix("data:").trim()
          if (data.isNotBlank() && data != "[DONE]" && currentEventType == "error") return true
        }
      }
    }
    return false
  }

  private fun splitThinkingAndAnswer(content: String): Pair<String?, String> {
    val thinkingRegex = Regex("<think>(.*?)</think>", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))
    val match = thinkingRegex.find(content)
    val thinking = match?.groupValues?.getOrNull(1)?.trim().takeUnless { it.isNullOrBlank() }
    val withoutThinking = content.replace(thinkingRegex, "").trim()
    val cleaned =
      withoutThinking
        .lineSequence()
        .filterNot { it.trim().startsWith("id:") || it.trim().startsWith("data:") }
        .joinToString("\n")
        .trim()
        .trim('"')
    return thinking to cleaned
  }
}
