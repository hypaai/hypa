package com.hypaintelligence.hypaintelligence.modes

import android.util.Log
import com.hypaintelligence.hypaintelligence.BuildConfig
import java.net.URI
import java.util.Locale

object HypaApi {
  private const val TAG = "HypaApi"

  const val JSON_UTF8 = "application/json; charset=utf-8"
  const val TEXT_OR_JSON_UTF8 = "text/plain, application/json; charset=utf-8"
  const val CONNECT_TIMEOUT_SECONDS = 30L
  const val WRITE_TIMEOUT_SECONDS = 45L
  const val READ_TIMEOUT_SECONDS = 90L

  fun url(path: String, baseUrl: String = BuildConfig.HYPA_API_BASE_URL): String {
    val base = baseUrl.trim().ifBlank { "https://api.hypaintelligence.com" }.trimEnd('/')
    val cleanPath = path.trim().ifBlank { "/" }
    return if (cleanPath.startsWith("/")) "$base$cleanPath" else "$base/$cleanPath"
  }

  fun wsUri(path: String): URI {
    val endpoint = url(path, BuildConfig.HYPA_LIVE_BASE_URL.ifBlank { BuildConfig.HYPA_API_BASE_URL })
    val wsEndpoint =
      when {
        endpoint.startsWith("https://", ignoreCase = true) -> "wss://" + endpoint.removePrefix("https://")
        endpoint.startsWith("http://", ignoreCase = true) -> "ws://" + endpoint.removePrefix("http://")
        else -> endpoint
      }
    return URI(wsEndpoint)
  }

  fun logRequest(label: String, endpoint: Any?) {
    Log.i(TAG, "$label request -> $endpoint")
  }

  fun logResponse(label: String, statusCode: Int, body: String?) {
    Log.i(TAG, "$label response $statusCode: ${body.orEmpty().take(700)}")
  }

  fun extractJsonBody(body: String): String {
    val trimmed = body.trim()
    if (trimmed.startsWith("{")) return trimmed
    val dataIndex = trimmed.indexOf("data:")
    if (dataIndex >= 0) {
      val candidate = trimmed.substring(dataIndex + 5).trim()
      if (candidate.startsWith("{")) return candidate
    }
    val jsonStart = trimmed.indexOf('{')
    return if (jsonStart >= 0) trimmed.substring(jsonStart) else trimmed
  }

  fun isInvalidGeneratedText(text: String?): Boolean {
    val normalized = text
      ?.replace(Regex("\\s+"), " ")
      ?.trim()
      ?.lowercase(Locale.US)
      .orEmpty()
    return normalized.isBlank() ||
      normalized.startsWith("error: no translation") ||
      normalized.startsWith("no translation")
  }
}
