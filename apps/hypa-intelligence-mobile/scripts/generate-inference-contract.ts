// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INFERENCE_OVERRIDES_ENTRY_KEY,
  type InferenceRuntime,
  type InferenceSampling,
  type InferenceTask,
  PROMPTS,
  RUNTIME_BY_HOST,
  SAMPLING_BY_TASK,
} from '../lib/llm/inference-contract';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appRoot, '../..');

const tasks = Object.keys(SAMPLING_BY_TASK) as InferenceTask[];
const hosts = Object.keys(RUNTIME_BY_HOST) as Array<keyof typeof RUNTIME_BY_HOST>;

const quote = (value: string) =>
  JSON.stringify(value);

const listOf = (values: string[]) => `listOf(${values.map(quote).join(', ')})`;
const swiftList = (values: string[]) => `[${values.map(quote).join(', ')}]`;

const kotlinSampling = (sampling: InferenceSampling) =>
  `InferenceSampling(
      maxTokens = ${sampling.maxTokens},
      temperature = ${sampling.temperature}f,
      topK = ${sampling.topK},
      topP = ${sampling.topP}f,
      minP = ${sampling.minP}f,
      repeatPenalty = ${sampling.repeatPenalty}f,
      repeatLastN = ${sampling.repeatLastN},
      seed = ${sampling.seed},
      stop = ${listOf(sampling.stop)},
      maxInputChars = ${sampling.maxInputChars},
      candidateCount = ${sampling.candidateCount},
    )`;

const kotlinRuntime = (runtime: InferenceRuntime) =>
  `InferenceRuntime(
      contextSize = ${runtime.contextSize},
      batchSize = ${runtime.batchSize},
      threads = ${runtime.threads},
      gpuLayers = ${runtime.gpuLayers},
      useMmap = ${runtime.useMmap},
      useMlock = ${runtime.useMlock},
    )`;

const swiftSampling = (sampling: InferenceSampling) =>
  `InferenceSampling(
      maxTokens: ${sampling.maxTokens},
      temperature: ${sampling.temperature},
      topK: ${sampling.topK},
      topP: ${sampling.topP},
      minP: ${sampling.minP},
      repeatPenalty: ${sampling.repeatPenalty},
      repeatLastN: ${sampling.repeatLastN},
      seed: ${sampling.seed},
      stop: ${swiftList(sampling.stop)},
      maxInputChars: ${sampling.maxInputChars},
      candidateCount: ${sampling.candidateCount}
    )`;

const swiftRuntime = (runtime: InferenceRuntime) =>
  `InferenceRuntime(
      contextSize: ${runtime.contextSize},
      batchSize: ${runtime.batchSize},
      threads: ${runtime.threads},
      gpuLayers: ${runtime.gpuLayers},
      useMmap: ${runtime.useMmap},
      useMlock: ${runtime.useMlock}
    )`;

const kotlin = `package com.hypaintelligence.hypaintelligence

enum class InferenceTask(val id: String) {
${tasks.map((task) => `  ${task.toUpperCase()}(${quote(task)})`).join(',\n')};

  companion object {
    fun fromId(id: String): InferenceTask? = entries.firstOrNull { it.id == id }
  }
}

enum class InferenceHost(val id: String) {
${hosts.map((host) => `  ${host.toUpperCase()}(${quote(host)})`).join(',\n')}
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
  const val OVERRIDES_ENTRY_KEY = ${quote(INFERENCE_OVERRIDES_ENTRY_KEY)}

  val samplingByTask: Map<InferenceTask, InferenceSampling> = mapOf(
${tasks
  .map((task) => `    InferenceTask.${task.toUpperCase()} to ${kotlinSampling(SAMPLING_BY_TASK[task])},`)
  .join('\n')}
  )

  val runtimeByHost: Map<InferenceHost, InferenceRuntime> = mapOf(
${hosts
  .map((host) => `    InferenceHost.${host.toUpperCase()} to ${kotlinRuntime(RUNTIME_BY_HOST[host])},`)
  .join('\n')}
  )

  private val systemPromptByTask: Map<InferenceTask, String> = mapOf(
${tasks.map((task) => `    InferenceTask.${task.toUpperCase()} to ${quote(PROMPTS[task].system)},`).join('\n')}
  )

  private val userPromptByTask: Map<InferenceTask, String> = mapOf(
${tasks.map((task) => `    InferenceTask.${task.toUpperCase()} to ${quote(PROMPTS[task].user)},`).join('\n')}
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

    val first = text.split(Regex("\\\\s+")).firstOrNull().orEmpty()
    return first.filter { it.isLetter() || it == '\\'' || it == '-' }
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
`;

const swift = `import Foundation

enum InferenceTask: String, CaseIterable {
${tasks.map((task) => `  case ${task} = ${quote(task)}`).join('\n')}
}

enum InferenceHost: String {
${hosts.map((host) => `  case ${host} = ${quote(host)}`).join('\n')}
}

struct InferenceSampling {
  let maxTokens: Int
  let temperature: Float
  let topK: Int
  let topP: Float
  let minP: Float
  let repeatPenalty: Float
  let repeatLastN: Int
  let seed: Int
  let stop: [String]
  let maxInputChars: Int
  let candidateCount: Int
}

struct InferenceRuntime {
  let contextSize: Int
  let batchSize: Int
  let threads: Int
  let gpuLayers: Int
  let useMmap: Bool
  let useMlock: Bool
}

struct InferenceMessage {
  let role: String
  let content: String
}

struct InferenceRequest {
  let task: InferenceTask
  let input: String

  init(task: InferenceTask, input: String) {
    self.task = task
    self.input = input
  }
}

struct InferenceResult {
  let candidates: [String]
  let tokensPredicted: Int
  let tokensPerSecond: Double
  let durationMs: Int
  let truncated: Bool
}

enum HypaInferenceContract {
  static let overridesEntryKey = ${quote(INFERENCE_OVERRIDES_ENTRY_KEY)}

  static let samplingByTask: [InferenceTask: InferenceSampling] = [
${tasks.map((task) => `    .${task}: ${swiftSampling(SAMPLING_BY_TASK[task])},`).join('\n')}
  ]

  static let runtimeByHost: [InferenceHost: InferenceRuntime] = [
${hosts.map((host) => `    .${host}: ${swiftRuntime(RUNTIME_BY_HOST[host])},`).join('\n')}
  ]

  private static let systemPromptByTask: [InferenceTask: String] = [
${tasks.map((task) => `    .${task}: ${quote(PROMPTS[task].system)},`).join('\n')}
  ]

  private static let userPromptByTask: [InferenceTask: String] = [
${tasks.map((task) => `    .${task}: ${quote(PROMPTS[task].user)},`).join('\n')}
  ]

  static func sampling(_ task: InferenceTask) -> InferenceSampling {
    samplingByTask[task]!
  }

  static func runtime(_ host: InferenceHost) -> InferenceRuntime {
    runtimeByHost[host]!
  }

  static func isWordTask(_ task: InferenceTask) -> Bool {
    task == .predict || task == .correct
  }

  static func renderMessages(_ request: InferenceRequest) -> [InferenceMessage] {
    let budget = sampling(request.task).maxInputChars
    let input = String(request.input.suffix(budget))
    func fill(_ template: String) -> String {
      template.replacingOccurrences(of: "{input}", with: input)
    }
    let user = fill(userPromptByTask[request.task]!)
    let trimmed = user.replacingOccurrences(of: "\\\\s+$", with: "", options: .regularExpression)
    let content = request.task == .predict ? trimmed + " " : user

    return [
      InferenceMessage(role: "system", content: fill(systemPromptByTask[request.task]!)),
      InferenceMessage(role: "user", content: content),
    ]
  }

  static func normalizeOutput(_ request: InferenceRequest, _ raw: String) -> String {
    let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if !isWordTask(request.task) { return text }

    let first = text.split(whereSeparator: { $0.isWhitespace }).first.map(String.init) ?? ""
    return String(first.filter { $0.isLetter || $0 == "'" || $0 == "-" })
  }

  static func normalizeCandidates(
    _ request: InferenceRequest, _ raws: [String], _ limit: Int
  ) -> [String] {
    var candidates: [String] = []
    for raw in raws {
      let candidate = normalizeOutput(request, raw)
      if candidate.isEmpty { continue }
      if candidates.contains(where: { $0.lowercased() == candidate.lowercased() }) { continue }
      candidates.append(candidate)
      if candidates.count >= limit { break }
    }
    return candidates
  }
}
`;

const kotlinOutputFile = path.join(
  appRoot,
  'android/app/src/main/java/com/hypaintelligence/hypaintelligence/HypaInferenceContract.kt'
);
const swiftOutputFile = path.join(
  appRoot,
  'ios/Hypa Intelligence/HypaInferenceContract.swift'
);

fs.writeFileSync(kotlinOutputFile, kotlin);
fs.writeFileSync(swiftOutputFile, swift);
console.log(`Wrote ${path.relative(repoRoot, kotlinOutputFile)}`);
console.log(`Wrote ${path.relative(repoRoot, swiftOutputFile)}`);
