package com.hypaintelligence.hypaintelligence.neural

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.util.Log
import java.io.File
import java.nio.LongBuffer

class TinyKeysService(context: Context) {
  private companion object {
    const val TAG = "TinyKeys"
    const val ASSET_DIR = "tiny-keys"
    const val MAX_INPUT_CHARS = 256
    const val MAX_CONTEXT_WORDS = 10
    val WORD = Regex("\\S+")
    const val MAX_WORD_TOKENS = 4
    const val MAX_REWRITE_TOKENS = 160
    const val WORD_BREAKS = "ĠĊĉč"
  }

  private enum class Task(val system: String) {
    PREDICT("You are Hypa Keyboard. Predict the next word."),
    COMPLETE("You are Hypa Keyboard. Complete the current word."),
    CORRECT("You are Hypa Keyboard. Correct the last word."),
    CORRECT_BLOCK("You are Hypa Keyboard. Correct the text block."),
    GRAMMAR("You are Hypa Keyboard. Correct grammar, missing words, spelling, and sentence errors."),
  }

  private val appContext = context.applicationContext
  private val env = OrtEnvironment.getEnvironment().apply { setTelemetry(false) }
  private val lock = Any()
  private var session: OrtSession? = null
  private var tokenizer: TinyKeysTokenizer? = null
  @Volatile private var cancelled = false

  val isReady: Boolean
    get() = session != null

  fun load() {
    synchronized(lock) {
      if (session != null) return
      val startedAt = System.currentTimeMillis()
      runCatching {
          tokenizer =
            TinyKeysTokenizer(appContext.assets.open("$ASSET_DIR/tokenizer.json").bufferedReader().use { it.readText() })
          session =
            env.createSession(
              modelFile().path,
              OrtSession.SessionOptions().apply {
                setIntraOpNumThreads(1)
                setInterOpNumThreads(1)
                setExecutionMode(OrtSession.SessionOptions.ExecutionMode.SEQUENTIAL)
                addConfigEntry("session.intra_op.allow_spinning", "0")
                addConfigEntry("session.inter_op.allow_spinning", "0")
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
              },
            )
          Log.i(TAG, "loaded in ${System.currentTimeMillis() - startedAt}ms")
        }
        .onFailure {
          Log.e(TAG, "load failed", it)
          tokenizer = null
        }
    }
  }

  fun unload() {
    cancelled = true
    synchronized(lock) {
      session?.close()
      session = null
      tokenizer = null
    }
  }

  fun cancel() {
    cancelled = true
  }

  fun predict(text: String, n: Int = 3, accept: (String) -> Boolean = { true }): List<String> =
    words(Task.PREDICT, text.trimEnd() + " ", n, accept)

  fun complete(text: String, n: Int = 3, accept: (String) -> Boolean = { true }): List<String> =
    words(Task.COMPLETE, text, n, accept)

  fun correct(word: String, n: Int = 3, accept: (String) -> Boolean = { true }): List<String> =
    words(Task.CORRECT, word, n, accept)

  fun correctBlock(text: String): String? = rewrite(Task.CORRECT_BLOCK, text)

  fun grammar(text: String): String? = rewrite(Task.GRAMMAR, text)

  private fun lastWords(text: String): String {
    val words = WORD.findAll(text).toList()
    return if (words.size <= MAX_CONTEXT_WORDS) text else text.substring(words[words.size - MAX_CONTEXT_WORDS].range.first)
  }

  private fun words(task: Task, text: String, n: Int, accept: (String) -> Boolean): List<String> =
    withModel(task, lastWords(text)) { tok, prompt ->
      val found = ArrayList<String>(n)
      for (first in topIds(logits(prompt), n + 2)) {
        if (found.size >= n || cancelled) break
        if (first == tok.eot) continue
        val word = tok.decode(extendWord(tok, prompt, first)).trim()
        if (word.isNotEmpty() && found.none { it.equals(word, ignoreCase = true) } && accept(word)) found += word
      }
      found
    } ?: emptyList()

  private fun extendWord(tok: TinyKeysTokenizer, prompt: IntArray, first: Int): List<Int> {
    val out = arrayListOf(first)
    while (out.size < MAX_WORD_TOKENS && !cancelled) {
      val next = argmax(logits(prompt + out))
      if (next == tok.eot || endsWord(tok.token(next))) break
      out += next
    }
    return out
  }

  private fun endsWord(token: String): Boolean =
    token.first() in WORD_BREAKS ||
      token.all { it.code in 33..126 && !it.isLetterOrDigit() && it != '\'' && it != '-' }

  private fun rewrite(task: Task, text: String): String? =
    withModel(task, text.trim()) { tok, prompt ->
      val limit = minOf(tok.encode(text).size * 3 / 2 + 8, MAX_REWRITE_TOKENS)
      val out = ArrayList<Int>()
      while (!cancelled) {
        val next = argmax(logits(prompt + out))
        if (next == tok.eot) return@withModel tok.decode(out).trim().ifEmpty { null }
        if (out.size >= limit) return@withModel null
        out += next
      }
      null
    }

  private fun <T> withModel(task: Task, text: String, work: (TinyKeysTokenizer, IntArray) -> T): T? {
    cancelled = false
    synchronized(lock) {
      val tok = tokenizer ?: return null
      if (session == null || text.isBlank()) return null
      val startedAt = System.currentTimeMillis()
      return runCatching { work(tok, tok.chat(task.system, text.takeLast(MAX_INPUT_CHARS))) }
        .onSuccess { Log.d(TAG, "${task.name} \"$text\" -> $it in ${System.currentTimeMillis() - startedAt}ms cancelled=$cancelled") }
        .onFailure { Log.e(TAG, "${task.name} failed", it) }
        .getOrNull()
    }
  }

  private fun logits(ids: IntArray): FloatArray {
    val shape = longArrayOf(1, ids.size.toLong())
    val inputIds = LongBuffer.wrap(LongArray(ids.size) { ids[it].toLong() })
    val mask = LongBuffer.wrap(LongArray(ids.size) { 1L })
    OnnxTensor.createTensor(env, inputIds, shape).use { idsTensor ->
      OnnxTensor.createTensor(env, mask, shape).use { maskTensor ->
        session!!.run(mapOf("input_ids" to idsTensor, "attention_mask" to maskTensor)).use { result ->
          val logits = result[0] as OnnxTensor
          val vocab = logits.info.shape[2].toInt()
          val buffer = logits.floatBuffer
          buffer.position((ids.size - 1) * vocab)
          return FloatArray(vocab).also { buffer.get(it) }
        }
      }
    }
  }

  private fun argmax(values: FloatArray): Int {
    var best = 0
    for (i in 1 until values.size) if (values[i] > values[best]) best = i
    return best
  }

  private fun topIds(values: FloatArray, n: Int): List<Int> =
    values.indices.sortedByDescending { values[it] }.take(n)

  private fun modelFile(): File {
    val stamp = appContext.packageManager.getPackageInfo(appContext.packageName, 0).lastUpdateTime
    val dir = File(appContext.noBackupFilesDir, ASSET_DIR).apply { mkdirs() }
    val file = File(dir, "$stamp.onnx")
    if (file.exists()) return file
    dir.listFiles()?.forEach { it.delete() }
    val partial = File(dir, "$stamp.part")
    appContext.assets.open("$ASSET_DIR/model.int8.onnx").use { input -> partial.outputStream().use { input.copyTo(it) } }
    partial.renameTo(file)
    return file
  }
}
