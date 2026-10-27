export type InferenceTask = 'predict' | 'correct' | 'correct_block' | 'grammar';

type InferenceHost = 'app' | 'keyboard';

export type InferenceSampling = {
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
  minP: number;
  repeatPenalty: number;
  repeatLastN: number;
  seed: number;
  stop: string[];
  maxInputChars: number;
  candidateCount: number;
};

export type InferenceRuntime = {
  contextSize: number;
  batchSize: number;
  threads: number;
  gpuLayers: number;
  useMmap: boolean;
  useMlock: boolean;
};

export const INFERENCE_OVERRIDES_ENTRY_KEY = 'inference.overrides';

const STOP_TOKENS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
];

export const SAMPLING_BY_TASK: Record<InferenceTask, InferenceSampling> = {
  predict: {
    maxTokens: 6,
    temperature: 1,
    topK: 20,
    topP: 0.9,
    minP: 0.05,
    repeatPenalty: 1.05,
    repeatLastN: 32,
    seed: -1,
    stop: [...STOP_TOKENS, '\n'],
    maxInputChars: 400,
    candidateCount: 3,
  },
  correct: {
    maxTokens: 8,
    temperature: 0.3,
    topK: 20,
    topP: 0.9,
    minP: 0.05,
    repeatPenalty: 1.0,
    repeatLastN: 32,
    seed: -1,
    stop: [...STOP_TOKENS, '\n'],
    maxInputChars: 400,
    candidateCount: 3,
  },
  correct_block: {
    maxTokens: 96,
    temperature: 1,
    topK: 40,
    topP: 0.95,
    minP: 0.05,
    repeatPenalty: 1.0,
    repeatLastN: 64,
    seed: -1,
    stop: STOP_TOKENS,
    maxInputChars: 240,
    candidateCount: 1,
  },
  grammar: {
    maxTokens: 192,
    temperature: 1,
    topK: 40,
    topP: 0.95,
    minP: 0.05,
    repeatPenalty: 1.0,
    repeatLastN: 64,
    seed: -1,
    stop: STOP_TOKENS,
    maxInputChars: 600,
    candidateCount: 1,
  },
};

export const RUNTIME_BY_HOST: Record<InferenceHost, InferenceRuntime> = {
  app: {
    contextSize: 2048,
    batchSize: 512,
    threads: 0,
    gpuLayers: 0,
    useMmap: true,
    useMlock: false,
  },
  keyboard: {
    contextSize: 1024,
    batchSize: 128,
    threads: 2,
    gpuLayers: 0,
    useMmap: true,
    useMlock: false,
  },
};

export const PROMPTS: Record<InferenceTask, { system: string; user: string }> = {
  predict: {
    system: 'You are Hypa Keyboard. Predict the next word.',
    user: '{input}',
  },
  correct: {
    system: 'You are Hypa Keyboard. Correct the last word.',
    user: '{input}',
  },
  correct_block: {
    system: 'You are Hypa Keyboard. Correct the text block.',
    user: '{input}',
  },
  grammar: {
    system:
      'You are Hypa Keyboard. Correct grammar, missing words, spelling, and sentence errors.',
    user: '{input}',
  },
};
