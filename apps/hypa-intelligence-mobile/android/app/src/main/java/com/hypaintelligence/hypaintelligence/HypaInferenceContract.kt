package com.hypaintelligence.hypaintelligence

enum class InferenceTask(val id: String) {
  PREDICT("predict"),
  CORRECT("correct"),
  CORRECT_BLOCK("correct_block"),
  GRAMMAR("grammar");

  companion object {
    fun fromId(id: String): InferenceTask? = entries.firstOrNull { it.id == id }
  }
}

enum class InferenceHost(val id: String) {
  APP("app"),
  KEYBOARD("keyboard")
}

data class InferenceSampling(
  val maxTokens: Int,
  val temperature: Float,
  val topK: Int,
  val topP: Float,
  val minP: Float,
  val repeatPenalty: Float,
  val repeatLastN: Int,
  val seed: Int,
  val stop: List<String>,
  val maxInputChars: Int,
  val candidateCount: Int,
)

data class InferenceRuntime(
  val contextSize: Int,
  val batchSize: Int,
  val threads: Int,
  val gpuLayers: Int,
  val useMmap: Boolean,
  val useMlock: Boolean,
)

data class InferenceMessage(val role: String, val content: String)

data class InferenceRequest(
  val task: InferenceTask,
  val input: String,
)

data class InferenceResult(
  val candidates: List<String>,
  val tokensPredicted: Int,
  val tokensPerSecond: Double,
  val durationMs: Long,
  val truncated: Boolean,
)

object HypaInferenceContract {
  const val OVERRIDES_ENTRY_KEY = "inference.overrides"

  val samplingByTask: Map<InferenceTask, InferenceSampling> = mapOf(
    InferenceTask.PREDICT to InferenceSampling(
      maxTokens = 6,
      temperature = 1f,
      topK = 20,
      topP = 0.9f,
      minP = 0.05f,
      repeatPenalty = 1.05f,
      repeatLastN = 32,
      seed = -1,
      stop = listOf("</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>", "\n"),
      maxInputChars = 400,
      candidateCount = 3,
    ),
    InferenceTask.CORRECT to InferenceSampling(
      maxTokens = 8,
      temperature = 0.3f,
      topK = 20,
      topP = 0.9f,
      minP = 0.05f,
      repeatPenalty = 1f,
      repeatLastN = 32,
      seed = -1,
      stop = listOf("</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>", "\n"),
      maxInputChars = 400,
      candidateCount = 3,
    ),
    InferenceTask.CORRECT_BLOCK to InferenceSampling(
      maxTokens = 96,
      temperature = 1f,
      topK = 40,
      topP = 0.95f,
      minP = 0.05f,
      repeatPenalty = 1f,
      repeatLastN = 64,
      seed = -1,
      stop = listOf("</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>"),
      maxInputChars = 240,
      candidateCount = 1,
    ),
    InferenceTask.GRAMMAR to InferenceSampling(
      maxTokens = 192,
      temperature = 1f,
      topK = 40,
      topP = 0.95f,
      minP = 0.05f,
      repeatPenalty = 1f,
      repeatLastN = 64,
      seed = -1,
      stop = listOf("</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>"),
      maxInputChars = 600,
      candidateCount = 1,
    ),
  )

  val runtimeByHost: Map<InferenceHost, InferenceRuntime> = mapOf(
    InferenceHost.APP to InferenceRuntime(
      contextSize = 2048,
      batchSize = 512,
      threads = 0,
      gpuLayers = 0,
      useMmap = true,
      useMlock = false,
    ),
    InferenceHost.KEYBOARD to InferenceRuntime(
      contextSize = 1024,
      batchSize = 128,
      threads = 2,
      gpuLayers = 0,
      useMmap = true,
      useMlock = false,
    ),
  )

  private val systemPromptByTask: Map<InferenceTask, String> = mapOf(
    InferenceTask.PREDICT to "You are Hypa Keyboard. Predict the next word.",
    InferenceTask.CORRECT to "You are Hypa Keyboard. Correct the last word.",
    InferenceTask.CORRECT_BLOCK to "You are Hypa Keyboard. Correct the text block.",
    InferenceTask.GRAMMAR to "You are Hypa Keyboard. Correct grammar, missing words, spelling, and sentence errors.",
  )

  private val userPromptByTask: Map<InferenceTask, String> = mapOf(
    InferenceTask.PREDICT to "{input}",
    InferenceTask.CORRECT to "{input}",
    InferenceTask.CORRECT_BLOCK to "{input}",
    InferenceTask.GRAMMAR to "{input}",
  )

  fun sampling(task: InferenceTask): InferenceSampling = samplingByTask.getValue(task)

  fun runtime(host: InferenceHost): InferenceRuntime = runtimeByHost.getValue(host)

  fun isWordTask(task: InferenceTask): Boolean =
    task == InferenceTask.PREDICT || task == InferenceTask.CORRECT

  fun renderMessages(request: InferenceRequest): List<InferenceMessage> {
    val budget = sampling(request.task).maxInputChars
    val input = request.input.takeLast(budget)
    fun fill(template: String) = template.replace("{input}", input)

    val user = fill(userPromptByTask.getValue(request.task))
    val content = if (request.task == InferenceTask.PREDICT) user.trimEnd() + " " else user

    return listOf(
      InferenceMessage("system", fill(systemPromptByTask.getValue(request.task))),
      InferenceMessage("user", content),
    )
  }

  fun normalizeOutput(request: InferenceRequest, raw: String): String {
    val text = raw.trim()
    if (!isWordTask(request.task)) return text

    val first = text.split(Regex("\\s+")).firstOrNull().orEmpty()
    return first.filter { it.isLetter() || it == '\'' || it == '-' }
  }

  fun normalizeCandidates(
    request: InferenceRequest,
    raws: List<String>,
    limit: Int,
  ): List<String> {
    val candidates = mutableListOf<String>()
    for (raw in raws) {
      val candidate = normalizeOutput(request, raw)
      if (candidate.isEmpty()) continue
      if (candidates.any { it.equals(candidate, ignoreCase = true) }) continue
      candidates.add(candidate)
      if (candidates.size >= limit) break
    }
    return candidates
  }
}
