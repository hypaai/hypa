import catalog from "./json/models.json" with { type: "json" };
import languageNames from "./json/language-names.json" with { type: "json" };

export const CAPABILITIES = ["AC", "MT", "TTS", "ASR", "OCR", "ALI", "VC"] as const;
export type ModelCapability = (typeof CAPABILITIES)[number];

export interface ModelRate {
  capabilities: ModelCapability[];
  inputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
  inputPerMillionAudioTokens?: number;
  outputPerMillionAudioTokens?: number;
  perMillionCharacters?: number;
  perAudioMinute?: number;
  voiceEnrollmentFee?: number;
}

interface ModelDefinition {
  name: string;
  displayName?: string;
  capabilities: ModelCapability[];
  defaults?: ModelCapability[];
  baseApiUrl?: string;
  languages: string[];
  rates: ModelRate[];
  reasoning?: boolean;
  reasoningEffort?: string;
  fixedTemperature?: number;
  voices?: Record<string, string[]>;
  celebrityVoices?: string[];
  apiKeyEnv?: string;
  servedModelName?: string;
  timeoutMs?: number;
  requiresSourceLanguage?: boolean;
}

export type ModelsByProvider = Record<string, ModelDefinition[]>;
export type CapabilityModel = ModelDefinition & { default: boolean };
type ModelOption = CapabilityModel & { languageCodes: string[] };
export type CapabilityMap<T> = Record<ModelCapability, Record<string, T[]>>;

const MODELS = catalog.models as ModelsByProvider;

function getLanguageName(code: string): string {
  const name = (languageNames as Record<string, string>)[code];
  if (!name) throw new Error(`Unknown model language code: ${code}`);
  return name;
}

export function getModelLanguageOptions(
  model: Pick<ModelDefinition, "languages">,
) {
  const seen = new Set<string>();
  const languageCodes = model.languages.filter((code) => {
    const name = getLanguageName(code);
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  return { languages: languageCodes.map(getLanguageName), languageCodes };
}

function groupModelsByCapability(models: ModelsByProvider): CapabilityMap<CapabilityModel> {
  const result = Object.fromEntries(CAPABILITIES.map((capability) => [capability, {}])) as CapabilityMap<CapabilityModel>;
  for (const [provider, entries] of Object.entries(models)) {
    for (const entry of entries) {
      for (const capability of entry.capabilities) {
        (result[capability][provider] ??= []).push({
          ...entry,
          default: entry.defaults?.includes(capability) ?? false,
        });
      }
    }
  }
  return result;
}

export const MODELS_BY_CAPABILITY = groupModelsByCapability(MODELS);

export function isContributorModel(provider: string, model: string): boolean {
  return provider === "meta" && model.endsWith("-contributor");
}

const PRODUCT_MODELS_BY_CAPABILITY = groupModelsByCapability(
  Object.fromEntries(Object.entries(MODELS).map(([provider, models]) => [
    provider,
    models.filter((model) => !isContributorModel(provider, model.name)),
  ])),
);

function modelOptions(modelsByCapability: CapabilityMap<CapabilityModel>): CapabilityMap<ModelOption> {
  return Object.fromEntries(
    CAPABILITIES.map((capability) => [
      capability,
      Object.fromEntries(Object.entries(modelsByCapability[capability]).map(([provider, models]) => [
        provider,
        models.map((model): ModelOption => ({
          ...model,
          ...getModelLanguageOptions(model),
        })),
      ])),
    ]),
  ) as CapabilityMap<ModelOption>;
}

const EXPLANATION_PROVIDERS = new Set(["hypaai", "openai", "google"]);

export function supportsExplanation(provider: string): boolean {
  return EXPLANATION_PROVIDERS.has(provider);
}

export function isAutoRoutableModel(provider: string, model: string): boolean {
  return provider !== "custom" && !model.endsWith("-contributor");
}

const mtLanguageCodes = Array.from(
  new Set(
    Object.entries(MODELS_BY_CAPABILITY.MT)
      .flatMap(([provider, models]) =>
        models.filter((model) => isAutoRoutableModel(provider, model.name)),
      )
      .flatMap((model) => model.languages),
  ),
);
const autoRouterLanguages = getModelLanguageOptions({
  languages: mtLanguageCodes,
});

export const AUTO_ROUTER_MODEL: ModelOption = {
  name: "auto",
  displayName: "Auto Router",
  capabilities: ["MT"],
  defaults: [],
  default: true,
  ...autoRouterLanguages,
  rates: [],
};

function withAutoRouter(options: CapabilityMap<ModelOption>): CapabilityMap<ModelOption> {
  options.MT.hypaai = [AUTO_ROUTER_MODEL, ...(options.MT.hypaai ?? [])];
  return options;
}

export const MODEL_OPTIONS_BY_CAPABILITY = withAutoRouter(modelOptions(MODELS_BY_CAPABILITY));
export const PRODUCT_MODEL_OPTIONS_BY_CAPABILITY = withAutoRouter(modelOptions(PRODUCT_MODELS_BY_CAPABILITY));

export function getModelRate(model: ModelDefinition, capability: ModelCapability): ModelRate {
  const matches = model.rates.filter((rate) => rate.capabilities.includes(capability));
  if (!model.capabilities.includes(capability) || matches.length !== 1) {
    throw new Error(`${model.name}: expected exactly one rate for ${capability}`);
  }
  return matches[0];
}

export function isStreamingModel(model?: { baseApiUrl?: string } | null): boolean {
  return /^wss?:\/\//i.test(model?.baseApiUrl ?? "");
}
