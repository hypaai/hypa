export const GPT_6_ASTRA_MODEL = 'gpt-6-astra';
export const ASTRA_MIN_COMPLETION_TOKENS = 4000;
export const ASTRA_MAX_COMPLETION_TOKENS = 8000;
export const GPT_56_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
] as const;

export const isGpt6AstraModel = (model?: string): boolean =>
  model === GPT_6_ASTRA_MODEL;

export const isGpt56Model = (model?: string): boolean =>
  GPT_56_MODELS.includes(model as (typeof GPT_56_MODELS)[number]);

export const astraCompletionTokens = (requested: number): number =>
  Math.min(ASTRA_MAX_COMPLETION_TOKENS, Math.max(requested, ASTRA_MIN_COMPLETION_TOKENS));
