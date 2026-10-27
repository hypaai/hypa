import prompts from "./json/prompts.json" with { type: "json" };

type PromptTemplate = string;

type ProviderUserPrompt =
  | PromptTemplate
  | {
      auto?: PromptTemplate;
      explicit?: PromptTemplate;
    };

type ProviderPrompt = {
  system?: PromptTemplate;
  user?: ProviderUserPrompt;
  thinkingPrefix?: string;
};

type PromptMessageTemplate = {
  role: "system" | "user" | "assistant";
  content: PromptTemplate;
};

type MtProviderPrompt = ProviderPrompt & {
  default?: ProviderPrompt;
  [model: string]: unknown;
};

type PromptConfig = {
  MT: {
    providers: Record<string, MtProviderPrompt>;
    thinkingExplanation: ProviderPrompt;
    nonHypaThinkingExplanation: PromptMessageTemplate[];
    nonHypaLanguageDetection: PromptMessageTemplate[];
  };
  DICTIONARY: {
    nonHypaExample: PromptMessageTemplate[];
  };
  ASR: {
    providers: Record<string, ProviderPrompt>;
  };
  LAB: Record<string, Record<string, string>>;
};

const promptConfig = prompts as PromptConfig;

type PromptValues = Record<string, string | undefined>;

export function textTemplate(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function renderPrompt(
  template: string,
  values: PromptValues = {},
): string {
  return template.replace(
    /\$?\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (_, key: string) => values[key] ?? "",
  );
}

export function getProviderPrompt(
  type: "MT" | "ASR",
  provider: string,
): ProviderPrompt | undefined {
  return type === "MT"
    ? getMtPrompt(provider)
    : promptConfig.ASR.providers[provider];
}

export function getMtPrompt(
  provider: string,
  model?: string,
): ProviderPrompt | undefined {
  const providerPrompt = promptConfig.MT.providers[provider];
  if (!providerPrompt) return undefined;

  const modelPrompt = model ? providerPrompt[model] : undefined;
  if (modelPrompt && typeof modelPrompt === "object") {
    return modelPrompt as ProviderPrompt;
  }

  return providerPrompt.default ?? providerPrompt;
}

export function getMtThinkingPrompt(): ProviderPrompt {
  return promptConfig.MT.thinkingExplanation;
}

export function getNonHypaMtThinkingPrompt(): PromptMessageTemplate[] {
  return promptConfig.MT.nonHypaThinkingExplanation;
}

export function getNonHypaLanguageDetectionPrompt(): PromptMessageTemplate[] {
  return promptConfig.MT.nonHypaLanguageDetection;
}

export function getNonHypaDictionaryPrompt(): PromptMessageTemplate[] {
  return promptConfig.DICTIONARY.nonHypaExample;
}

export function getLabPrompt(
  section: string,
  prompt: string,
): string | undefined {
  return promptConfig.LAB[section]?.[prompt];
}

export { promptConfig };
