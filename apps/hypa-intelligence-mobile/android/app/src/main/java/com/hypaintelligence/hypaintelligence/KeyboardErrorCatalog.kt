package com.hypaintelligence.hypaintelligence

import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

class KeyboardRequestException(
  val statusCode: Int? = null,
  val catalogMessage: String? = null,
  val body: String? = null,
) : RuntimeException()

object KeyboardErrorCatalog {
  const val serviceDown = "Service down"
  const val noInternet = "No internet"
  const val timedOut = "Timed out"
  const val cantReachServer = "Can't reach server"
  const val connectionLost = "Connection lost"
  const val invalidRequest = "Invalid request"
  const val signInRequired = "Sign in required"
  const val subscriptionNeeded = "Subscription needed"
  const val accessDenied = "Access denied"
  const val notFound = "Not found"
  const val textTooLong = "Text too long"
  const val tokenLimit = "Token limit"
  const val tooManyRequests = "Too many requests"
  const val serverError = "Server error"
  const val typeOrSelectText = "Type or select text"
  const val noWord = "No word"
  const val noTranslation = "No translation"
  const val noResult = "No result"
  const val noAudio = "No audio"
  const val playbackFailed = "Playback failed"
  const val noVoice = "No voice"
  const val micNeeded = "Mic needed"
  const val recordingFailed = "Recording failed"
  const val noSpeech = "No speech"
  const val pinLimitReached = "5-pin limit reached"
  const val tryAgain = "Try again"

  fun apiCode(code: Int): String? =
    when (code) {
      10014 -> tokenLimit
      else -> null
    }

  fun http(code: Int, body: String?): String =
    body?.let { apiErrorCode(it) }?.let(::apiCode) ?: http(code)

  private fun apiErrorCode(body: String): Int? =
    runCatching { org.json.JSONObject(body).optInt("code").takeIf { it != 0 } }.getOrNull()

  fun http(code: Int): String =
    when (code) {
      400, 422 -> invalidRequest
      401 -> signInRequired
      402 -> subscriptionNeeded
      403 -> accessDenied
      404 -> notFound
      408, 504 -> timedOut
      413 -> textTooLong
      429 -> tooManyRequests
      500 -> serverError
      502, 503 -> serviceDown
      else -> tryAgain
    }

  fun from(error: Throwable): String {
    var current: Throwable? = error
    while (current != null) {
      when (current) {
        is KeyboardRequestException ->
          return current.statusCode?.let { http(it, current.body) }
            ?: current.catalogMessage
            ?: tryAgain
        is SocketTimeoutException,
        is InterruptedIOException ->
          return timedOut
        is UnknownHostException ->
          return noInternet
        is ConnectException,
        is SSLException ->
          return cantReachServer
        is SocketException ->
          return connectionLost
      }
      current = current.cause
    }
    return tryAgain
  }
}
