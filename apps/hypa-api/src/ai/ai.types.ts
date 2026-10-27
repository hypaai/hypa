export interface ChatMessage {
  role: 'user' | 'system' | 'assistant';
  content: string;
}

export interface AiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_text_tokens?: number;
  input_audio_tokens?: number;
  output_audio_tokens?: number;
  billable_seconds?: number;
  character_count?: number;
  provider_character_cost?: number;
}

export interface StreamChunk {
  delta: string;
  fullContent: string;
  complete: boolean;
  raw?: unknown;
  usage?: AiUsage;
  finishReason?: string | null;
}

export interface ChatSyncResult {
  content: string;
  usage: AiUsage;
}

export interface HypaAiTtsRawResult {
  audio_b64: string;
  sample_rate: number;
  input_ids_len: number;
  gen_ids_len: number;
  error?: string;
}
