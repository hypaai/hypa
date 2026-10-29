export const TEXT_OUTPUT_TOKENS = 1024;

export function textOutputTokens(requested?: number): number {
  return requested !== undefined && Number.isFinite(requested) && requested > 0
    ? Math.min(TEXT_OUTPUT_TOKENS, Math.max(1, Math.floor(requested)))
    : TEXT_OUTPUT_TOKENS;
}

export const MODEL_REQUEST_TIMEOUT_MS = 180_000;
export const LAB_TURN_TIMEOUT_MS = 900_000;
export const TEXT_TOOL_TIMEOUT_MS = 120_000;
export const SPEECH_TOOL_TIMEOUT_MS = 300_000;
export const AUDIO_DOWNLOAD_TIMEOUT_MS = 30_000;

export const AUTO_ROUTING_TIMEOUTS = {
  MT: { attemptMs: 24_000, deadlineMs: 70_000 },
  ASR: { attemptMs: 150_000, deadlineMs: 450_000 },
  TTS: { attemptMs: 150_000, deadlineMs: 450_000 },
} as const;
