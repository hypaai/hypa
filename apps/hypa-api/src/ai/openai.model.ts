const GPT_6_ASTRA_MODEL = 'gpt-6-astra';
export const ASTRA_MIN_COMPLETION_TOKENS = 4000;
export const ASTRA_MAX_COMPLETION_TOKENS = 8000;
export const isGpt6AstraModel = (model?: string): boolean =>
  model === GPT_6_ASTRA_MODEL;
