import { PRODUCT_MODEL_OPTIONS_BY_CAPABILITY as modelsConfig } from "@hypa/config/models";
import {
  KEYBOARD_LAYOUT_READY_CODES,
  LANGUAGE_INFO_BY_CODE,
  LANGUAGE_INFO_BY_NAME,
  LEGACY_LANGUAGE_CODES,
  type SharedLanguageInfo,
} from '@hypa/config/language-metadata';
import {
  DEFAULT_MODEL_PROVIDER,
  flattenModelsFromProviderMap,
  resolveDefaultModelFromModels,
} from '@hypa/config/settings-resolvers';
import { isAutoDetectLanguage as isAutoDetectLanguageCore } from '@hypa/translate-core';

type ModelLanguageGroup = 'AC' | 'MT' | 'TTS' | 'ASR';

type ConfiguredModel = {
  name: string;
  default?: boolean;
  languages?: string[];
  languageCodes?: string[];
};

type LanguageInfo = SharedLanguageInfo;
export const AUTO_DETECT_LANGUAGE = 'Auto-Detect';
const AUTO_DETECT_CODE = 'auto';

export const isAutoDetectLanguage = isAutoDetectLanguageCore;

export function resolveDetectedSourceLanguage(
  detected: string | null | undefined,
  options: readonly string[]
): string | null {
  const name = detected?.trim().toLowerCase();
  if (!name || isAutoDetectLanguage(name)) return null;

  const supported = options.filter((option) => !isAutoDetectLanguage(option));
  const exact = supported.find((option) => option.toLowerCase() === name);
  if (exact) return exact;

  return (
    supported
      .filter((option) => name.startsWith(option.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

const FALLBACK_LANGUAGES = ['English'];

function modelsForGroup(group: ModelLanguageGroup): ConfiguredModel[] {
  return flattenModelsFromProviderMap(
    (modelsConfig as unknown as Record<string, Record<string, ConfiguredModel[]> | undefined>)[
      group
    ]
  );
}

function sortLanguageNames(names: string[], pinFirst?: string): string[] {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  if (!pinFirst) return sorted;

  const pinLower = pinFirst.toLowerCase();
  const pinned = sorted.filter((name) => name.toLowerCase() === pinLower);
  const rest = sorted.filter((name) => name.toLowerCase() !== pinLower);
  return [...pinned, ...rest];
}

function canonicalLanguageCode(code?: string | null): string {
  const normalized = code?.trim().toLowerCase() ?? '';
  if (!normalized) return '';
  if (
    normalized === AUTO_DETECT_CODE ||
    normalized === 'auto-detect' ||
    normalized === 'auto detect'
  ) {
    return AUTO_DETECT_CODE;
  }
  return LEGACY_LANGUAGE_CODES[normalized] ?? normalized;
}

export function languageNameToCode(name?: string | null): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return '';
  if (isAutoDetectLanguage(trimmed)) {
    return AUTO_DETECT_CODE;
  }
  return (
    LANGUAGE_INFO_BY_NAME[trimmed.toLowerCase()]?.code ?? trimmed.toLowerCase().replace(/\s+/g, '-')
  );
}

export function languageCodeToName(code?: string | null): string {
  const canonical = canonicalLanguageCode(code);
  if (canonical === AUTO_DETECT_CODE) return AUTO_DETECT_LANGUAGE;
  return LANGUAGE_INFO_BY_CODE[canonical]?.name ?? (code?.trim() || '');
}

export function resolveModelName(
  group: ModelLanguageGroup,
  modelName?: string | null,
  preferredProvider = DEFAULT_MODEL_PROVIDER
): string | undefined {
  const models = modelsForGroup(group);
  const normalized = modelName?.trim();
  if (normalized && models.some((model) => model.name === normalized)) {
    return normalized;
  }

  const providerModels =
    ((modelsConfig as unknown as Record<string, Record<string, ConfiguredModel[]> | undefined>)[
      group
    ]?.[preferredProvider] as ConfiguredModel[] | undefined) ?? [];

  return (
    resolveDefaultModelFromModels(providerModels)?.name ??
    resolveDefaultModelFromModels(models)?.name ??
    undefined
  );
}

type ProviderModelSelection = {
  provider: string;
  model: string;
};

export function resolveProviderModelForGroup(
  group: ModelLanguageGroup,
  provider?: string | null,
  modelName?: string | null
): ProviderModelSelection {
  const providerMap =
    (modelsConfig as unknown as Record<string, Record<string, ConfiguredModel[]> | undefined>)[
      group
    ] ?? {};
  const requestedProvider = provider?.trim() || DEFAULT_MODEL_PROVIDER;
  const providerModels = providerMap[requestedProvider] ?? [];
  const requestedModel = modelName?.trim() ?? '';

  if (providerModels.length === 0) {
    return {
      provider: DEFAULT_MODEL_PROVIDER,
      model: providerMap[DEFAULT_MODEL_PROVIDER]?.[0]?.name ?? '',
    };
  }

  if (requestedModel && providerModels.some((model) => model.name === requestedModel)) {
    return { provider: requestedProvider, model: requestedModel };
  }

  return {
    provider: requestedProvider,
    model: providerModels[0]?.name ?? '',
  };
}

function getModelLanguageNames(
  group: ModelLanguageGroup,
  modelName?: string | null
): string[] {
  const models = modelsForGroup(group);
  const activeName = resolveModelName(group, modelName);
  const activeModel = models.find((model) => model.name === activeName) ?? null;

  const fromNames = (activeModel?.languages ?? [])
    .map((language) => language.trim())
    .filter(Boolean);

  const fromCodes = (activeModel?.languageCodes ?? [])
    .map((code) => languageCodeToName(code))
    .filter(Boolean);

  const languages = Array.from(new Set(fromNames.length > 0 ? fromNames : fromCodes));
  if (languages.length === 0) return FALLBACK_LANGUAGES;
  return sortLanguageNames(languages);
}

export function getTranslationTargetLanguages(modelName?: string | null): string[] {
  return getModelLanguageNames('MT', modelName);
}

export function getTranslationSourceLanguages(modelName?: string | null): string[] {
  return sortLanguageNames(
    [AUTO_DETECT_LANGUAGE, ...getTranslationTargetLanguages(modelName)],
    AUTO_DETECT_LANGUAGE
  );
}

export function getDictionaryLanguages(modelName?: string | null): string[] {
  return getModelLanguageNames('AC', modelName);
}

export function getKeyboardLayoutLanguages(modelName?: string | null): string[] {
  return getTranslationTargetLanguages(modelName);
}

const keyboardLayoutReadyCodes = new Set<string>(KEYBOARD_LAYOUT_READY_CODES);

export function hasKeyboardLayout(code?: string | null): boolean {
  return keyboardLayoutReadyCodes.has(canonicalLanguageCode(code));
}

export function getTtsLanguages(modelName?: string | null): string[] {
  return getModelLanguageNames('TTS', modelName);
}

export function toLanguageInfos(names: string[]): LanguageInfo[] {
  return names.map((name) => ({
    code: languageNameToCode(name),
    name,
  }));
}

export function resolveValidLanguageSelection(
  current: string | null | undefined,
  available: readonly string[],
  preferredFallback?: string | null
): string {
  const list = available.map((name) => name.trim()).filter(Boolean);
  if (list.length === 0) {
    return (preferredFallback ?? current ?? 'English').trim() || 'English';
  }

  if (isAutoDetectLanguage(current)) {
    const auto = list.find((name) => isAutoDetectLanguage(name));
    if (auto) return auto;
  }

  const currentNormalized = current?.trim().toLowerCase() ?? '';
  if (currentNormalized) {
    const match = list.find((name) => name.toLowerCase() === currentNormalized);
    if (match) return match;
  }

  if (isAutoDetectLanguage(preferredFallback)) {
    const auto = list.find((name) => isAutoDetectLanguage(name));
    if (auto) return auto;
  }

  const fallbackNormalized = preferredFallback?.trim().toLowerCase() ?? '';
  if (fallbackNormalized) {
    const match = list.find((name) => name.toLowerCase() === fallbackNormalized);
    if (match) return match;
  }

  const english = list.find((name) => name.toLowerCase() === 'english');
  if (english) return english;

  return list[0];
}

export function resolveValidLanguageId(
  currentId: string | null | undefined,
  translationModel?: string | null,
  preferredFallback = 'en'
): string {
  const availableCodes = getKeyboardLayoutLanguages(translationModel)
    .map((name) => languageNameToCode(name))
    .filter((code) => hasKeyboardLayout(code));
  if (availableCodes.length === 0) {
    return preferredFallback;
  }

  const normalized = canonicalLanguageCode(currentId);
  if (normalized && availableCodes.includes(normalized)) {
    return normalized;
  }

  const fallback = canonicalLanguageCode(preferredFallback);
  if (fallback && availableCodes.includes(fallback)) {
    return fallback;
  }

  if (availableCodes.includes('en')) return 'en';
  return availableCodes[0] ?? preferredFallback;
}

type TtsConfiguredModel = ConfiguredModel & {
  voices?: Record<string, string[]>;
  celebrityVoices?: string[];
};

function activeTtsModel(modelName?: string | null): TtsConfiguredModel | null {
  const models = flattenModelsFromProviderMap(
    (modelsConfig as unknown as Record<string, Record<string, TtsConfiguredModel[]> | undefined>)
      .TTS
  );
  const activeName = resolveModelName('TTS', modelName);
  return models.find((model) => model.name === activeName) ?? null;
}

function ttsVoiceKeyForLanguageCode(languageCode?: string | null): string {
  const canonical = canonicalLanguageCode(languageCode);
  const fromCode = LANGUAGE_INFO_BY_CODE[canonical]?.name;
  if (fromCode) return fromCode.trim().toLowerCase();

  const raw = languageCode?.trim().toLowerCase() ?? '';
  const fromName = LANGUAGE_INFO_BY_NAME[canonical]?.name ?? LANGUAGE_INFO_BY_NAME[raw]?.name;
  if (fromName) return fromName.trim().toLowerCase();

  return canonical || raw;
}

function getTtsLanguageCodes(modelName?: string | null): string[] {
  return getTtsLanguages(modelName)
    .map((name) => canonicalLanguageCode(languageNameToCode(name)))
    .filter(Boolean);
}

function resolveValidTtsLanguageCode(
  current: string | null | undefined,
  ttsModel?: string | null,
  preferredFallback?: string | null
): string {
  const availableCodes = getTtsLanguageCodes(ttsModel);
  if (availableCodes.length === 0) {
    return canonicalLanguageCode(preferredFallback) || 'en';
  }

  const normalized = canonicalLanguageCode(current);
  if (normalized && availableCodes.includes(normalized)) {
    return normalized;
  }

  const fallback = canonicalLanguageCode(preferredFallback);
  if (fallback && availableCodes.includes(fallback)) {
    return fallback;
  }

  if (availableCodes.includes('en')) return 'en';
  return availableCodes[0];
}

export function getTtsVoicesForLanguage(
  modelName?: string | null,
  languageCode?: string | null
): string[] {
  const activeModel = activeTtsModel(modelName);
  if (!activeModel) return [];

  const voiceKey = ttsVoiceKeyForLanguageCode(languageCode);
  return uniqueVoiceNames(activeModel.voices?.[voiceKey] ?? []);
}

export function getTtsVoicesForModel(modelName?: string | null): string[] {
  const activeModel = activeTtsModel(modelName);
  if (!activeModel) return [];

  return uniqueVoiceNames(Object.values(activeModel.voices ?? {}).flat());
}

export function getTtsLabelledVoices(
  modelName?: string | null
): { value: string; label: string; language?: string }[] {
  const activeModel = activeTtsModel(modelName);
  if (!activeModel) return [];

  const labelled: { value: string; label: string; language?: string }[] = [];
  const seen = new Set<string>();

  for (const [language, voices] of Object.entries(activeModel.voices ?? {})) {
    const languageLabel = language.trim();
    const displayLanguage = languageLabel
      ? languageLabel.charAt(0).toUpperCase() + languageLabel.slice(1)
      : languageLabel;

    for (const voice of uniqueVoiceNames(voices)) {
      if (seen.has(voice)) continue;
      seen.add(voice);
      labelled.push({
        value: voice,
        label: displayLanguage ? `${voice} — ${displayLanguage}` : voice,
        language: displayLanguage || undefined,
      });
    }
  }

  return labelled;
}

export function getTtsCelebrityVoices(modelName?: string | null): string[] {
  const activeModel = activeTtsModel(modelName);
  if (!activeModel) return [];

  return uniqueVoiceNames(activeModel.celebrityVoices ?? []);
}

function uniqueVoiceNames(voices: readonly string[]): string[] {
  return Array.from(new Set(voices.map((voice) => voice.trim()).filter(Boolean)));
}

function resolveValidVoiceSelection(
  current: string | null | undefined,
  available: readonly string[],
  preferredFallback?: string | null
): string {
  return resolveValidLanguageSelection(current, available, preferredFallback);
}

type ModelDependentLanguageSettings = {
  translateSourceLanguage: string;
  translateTargetLanguage: string;
  dictionaryLanguage: string;
  languageId: string;
  ttsLanguage: string;
  voice?: string;
};

export function resolveModelDependentLanguageSettings(params: {
  translationModel?: string | null;
  dictionaryModel?: string | null;
  ttsModel?: string | null;
  translateSourceLanguage?: string | null;
  translateTargetLanguage?: string | null;
  dictionaryLanguage?: string | null;
  languageId?: string | null;
  ttsLanguage?: string | null;
  voice?: string | null;
  includeVoice?: boolean;
}): ModelDependentLanguageSettings {
  const sourceLanguages = getTranslationSourceLanguages(params.translationModel);
  const targetLanguages = getTranslationTargetLanguages(params.translationModel);
  const dictionaryLanguages = getDictionaryLanguages(params.dictionaryModel);
  const languageId = resolveValidLanguageId(params.languageId, params.translationModel, 'en');
  const ttsLanguage = resolveValidTtsLanguageCode(params.ttsLanguage, params.ttsModel, languageId);

  const resolved: ModelDependentLanguageSettings = {
    translateSourceLanguage: resolveValidLanguageSelection(
      params.translateSourceLanguage,
      sourceLanguages,
      AUTO_DETECT_LANGUAGE
    ),
    translateTargetLanguage: resolveValidLanguageSelection(
      params.translateTargetLanguage,
      targetLanguages,
      'Yoruba'
    ),
    dictionaryLanguage: resolveValidLanguageSelection(
      params.dictionaryLanguage,
      dictionaryLanguages,
      'English'
    ),
    languageId,
    ttsLanguage,
  };

  if (params.includeVoice) {
    const voices = getTtsVoicesForLanguage(params.ttsModel, ttsLanguage);
    resolved.voice =
      voices.length > 0 ? resolveValidVoiceSelection(params.voice, voices, 'Eniola') : 'Eniola';
  }

  return resolved;
}
