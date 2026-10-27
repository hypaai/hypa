import Foundation

enum InferenceTask: String, CaseIterable {
  case predict = "predict"
  case correct = "correct"
  case correct_block = "correct_block"
  case grammar = "grammar"
}

enum InferenceHost: String {
  case app = "app"
  case keyboard = "keyboard"
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
  static let overridesEntryKey = "inference.overrides"

  static let samplingByTask: [InferenceTask: InferenceSampling] = [
    .predict: InferenceSampling(
      maxTokens: 6,
      temperature: 1,
      topK: 20,
      topP: 0.9,
      minP: 0.05,
      repeatPenalty: 1.05,
      repeatLastN: 32,
      seed: -1,
      stop: ["</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>", "\n"],
      maxInputChars: 400,
      candidateCount: 3
    ),
    .correct: InferenceSampling(
      maxTokens: 8,
      temperature: 0.3,
      topK: 20,
      topP: 0.9,
      minP: 0.05,
      repeatPenalty: 1,
      repeatLastN: 32,
      seed: -1,
      stop: ["</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>", "\n"],
      maxInputChars: 400,
      candidateCount: 3
    ),
    .correct_block: InferenceSampling(
      maxTokens: 96,
      temperature: 1,
      topK: 40,
      topP: 0.95,
      minP: 0.05,
      repeatPenalty: 1,
      repeatLastN: 64,
      seed: -1,
      stop: ["</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>"],
      maxInputChars: 240,
      candidateCount: 1
    ),
    .grammar: InferenceSampling(
      maxTokens: 192,
      temperature: 1,
      topK: 40,
      topP: 0.95,
      minP: 0.05,
      repeatPenalty: 1,
      repeatLastN: 64,
      seed: -1,
      stop: ["</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>", "<|im_end|>", "<|EOT|>"],
      maxInputChars: 600,
      candidateCount: 1
    ),
  ]

  static let runtimeByHost: [InferenceHost: InferenceRuntime] = [
    .app: InferenceRuntime(
      contextSize: 2048,
      batchSize: 512,
      threads: 0,
      gpuLayers: 0,
      useMmap: true,
      useMlock: false
    ),
    .keyboard: InferenceRuntime(
      contextSize: 1024,
      batchSize: 128,
      threads: 2,
      gpuLayers: 0,
      useMmap: true,
      useMlock: false
    ),
  ]

  private static let systemPromptByTask: [InferenceTask: String] = [
    .predict: "You are Hypa Keyboard. Predict the next word.",
    .correct: "You are Hypa Keyboard. Correct the last word.",
    .correct_block: "You are Hypa Keyboard. Correct the text block.",
    .grammar: "You are Hypa Keyboard. Correct grammar, missing words, spelling, and sentence errors.",
  ]

  private static let userPromptByTask: [InferenceTask: String] = [
    .predict: "{input}",
    .correct: "{input}",
    .correct_block: "{input}",
    .grammar: "{input}",
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
    let trimmed = user.replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression)
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
