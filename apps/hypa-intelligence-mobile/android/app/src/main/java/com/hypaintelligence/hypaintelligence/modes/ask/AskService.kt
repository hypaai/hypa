package com.hypaintelligence.hypaintelligence.modes.ask

import com.hypaintelligence.hypaintelligence.modes.HypaApi
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class AskHttpException(val status: Int, message: String?) : Exception(message)

/** Talks to the agent endpoint the app chat uses, with surface "keyboard". */
class AskService {
  private val client =
    OkHttpClient.Builder()
      .connectTimeout(HypaApi.CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .writeTimeout(HypaApi.WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      .readTimeout(120, TimeUnit.SECONDS)
      .build()

  @Volatile private var active: Call? = null

  fun cancel() {
    active?.cancel()
    active = null
  }

  /** Blocks while the run streams; each SSE `data:` line is passed to [onEvent]. */
  fun stream(token: String, payload: JSONObject, onEvent: (JSONObject) -> Unit) {
    val request =
      Request.Builder()
        .url(HypaApi.url("/v2/agent"))
        .addHeader("Accept", "text/event-stream")
        .authorized(token)
        .post(payload.toString().toRequestBody(HypaApi.JSON_UTF8.toMediaType()))
        .build()
    val call = client.newCall(request)
    active = call
    call.execute().use { response ->
      if (!response.isSuccessful) {
        throw AskHttpException(response.code, readMessage(response.body?.string()))
      }
      val source = response.body?.source() ?: return
      while (!source.exhausted()) {
        val line = source.readUtf8Line() ?: break
        if (!line.startsWith("data:")) continue
        runCatching { JSONObject(line.removePrefix("data:").trim()) }.getOrNull()?.let(onEvent)
      }
    }
  }

  /** Returns the HTTP status and, on 200, the run's status body. */
  fun status(token: String, requestId: String): Pair<Int, JSONObject?> {
    val request =
      Request.Builder().url(HypaApi.url("/v2/agent/$requestId")).authorized(token).get().build()
    val call = client.newCall(request)
    active = call
    return call.execute().use { response ->
      val body = response.body?.string()
      response.code to if (response.isSuccessful) runCatching { JSONObject(body.orEmpty()) }.getOrNull() else null
    }
  }

  fun download(token: String, url: String): ByteArray? {
    val absolute = if (url.startsWith("http")) url else HypaApi.url(url)
    val request = Request.Builder().url(absolute).authorized(token).get().build()
    return client.newCall(request).execute().use { if (it.isSuccessful) it.body?.bytes() else null }
  }

  private fun Request.Builder.authorized(token: String): Request.Builder =
    apply { if (token.isNotBlank()) addHeader("Authorization", "Bearer $token") }

  private fun readMessage(body: String?): String? {
    val json = runCatching { JSONObject(body.orEmpty()) }.getOrNull() ?: return null
    json.optJSONArray("message")?.let { list ->
      return (0 until list.length()).joinToString(", ") { list.optString(it) }
    }
    return json.optString("message").takeIf { it.isNotBlank() }
  }
}
