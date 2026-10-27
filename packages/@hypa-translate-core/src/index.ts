import {
  MODEL_OPTIONS_BY_CAPABILITY,
  MODELS_BY_CAPABILITY as modelsJson,
  supportsExplanation,
} from "@hypa/config/models";
import { hydrateTranslationThinking } from "./thinking";

export { attachThinking, parseTranslation } from "./thinking";

type ModelGroup = "AC" | "MT" | "TTS" | "ASR" | "OCR";

const AUTO_ROUTER_PROVIDER = "auto";

type ConfigModel = {
  name: string;
  displayName?: string;
  default?: boolean;
  reasoning?: boolean;
};

type ModelsConfig = Record<ModelGroup, Record<string, ConfigModel[]>>;

const modelsConfig = modelsJson as ModelsConfig;
const modelOptionsConfig = MODEL_OPTIONS_BY_CAPABILITY as ModelsConfig;

export const hasThinking = (modelName?: string) => {
  const normalized = modelName?.trim();
  if (!normalized) return false;
  if (normalized.toLowerCase() === "auto") return true;

  return getProviderModels("MT", "hypaai").some(
    (model) => model.name === normalized && model.reasoning === true,
  );
};

export const normalizeVoice = (voice?: string, fallback = "Juliet") =>
  !voice || voice.toLowerCase().trim() === "auto" ? fallback : voice;

const findProviderForModel = (
  group: ModelGroup,
  modelName?: string,
): string | undefined => {
  const normalized = modelName?.trim().toLowerCase();
  if (!normalized) return undefined;

  const providerMap = modelsConfig[group] || {};
  for (const [provider, models] of Object.entries(providerMap)) {
    if (models.some((model) => model.name.toLowerCase() === normalized)) {
      return provider;
    }
  }
  return undefined;
};

export const getProvider = (
  modelName: string | undefined,
  fallback: string,
  group: ModelGroup,
) => findProviderForModel(group, modelName) ?? fallback;

const getProviderModels = (group: ModelGroup, provider?: string) => {
  const providerMap = modelsConfig[group] || {};
  return provider
    ? providerMap[provider] || []
    : Object.values(providerMap).flat();
};

const getDefaultModelName = (group: ModelGroup, preferredProvider?: string) => {
  const preferredModels = getProviderModels(group, preferredProvider);
  const defaultPreferred = preferredModels.find((model) => model.default)?.name;
  if (defaultPreferred) return defaultPreferred;

  const allModels = getProviderModels(group);
  return (
    allModels.find((model) => model.default)?.name ||
    preferredModels[0]?.name ||
    allModels[0]?.name ||
    ""
  );
};

const getDefaultMtModelName = () => {
  const preferredModels = modelOptionsConfig.MT?.hypaai || [];
  return (
    preferredModels.find((model) => model.default)?.name ||
    getDefaultModelName("MT", "hypaai")
  );
};

export const TRANSLATE_ENDPOINTS = {
  mt: "/v2/translate/mt",
  mtThinking: "/v2/translate/mt/thinking",
  tts: "/v2/translate/tts",
  stt: "/v2/translate/stt",
  ocr: "/v2/translate/ocr",
  history: "/v2/translate/history",
  stats: "/v2/translate/stats",
  dictionary: "/v2/dictionary",
  profile: "/profile/me",
} as const;

export const createTranslationId = () =>
  `translation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const stripDataUrl = (value: string) =>
  value.includes(",") ? value.split(",").pop() || value : value;

export const extractDataUrlMimeType = (value: string): string | undefined => {
  const match = /^data:([^;,]+)/.exec(value);
  return match?.[1];
};

export const isAutoDetectLanguage = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "-");
  return (
    !normalized ||
    normalized === "auto" ||
    normalized === "auto-detect" ||
    normalized === "autodetect"
  );
};

export const normalizeSourceLanguage = (sourceLang?: string) =>
  isAutoDetectLanguage(sourceLang) ? undefined : sourceLang?.trim();

export const resolveThinkingSourceLanguage = (
  sourceLang?: string | null,
  detectedLanguage?: string | null,
  fallback = "English",
) => {
  if (detectedLanguage && !isAutoDetectLanguage(detectedLanguage)) {
    return detectedLanguage.trim();
  }
  if (sourceLang && !isAutoDetectLanguage(sourceLang)) {
    return sourceLang.trim();
  }
  return fallback;
};

export interface TranslateAPIParams {
  targetLang: string;
  text: string;
  sourceLang?: string;
  llmModel?: string;
  thinkingMode?: boolean;
}

export interface TranslateAPIResponse {
  translation: string;
  language: string | null;
  id?: string | null;
  model?: string | null;
}

export const buildMtRequest = (
  params: TranslateAPIParams,
  translationId = createTranslationId(),
) => {
  const model = params.llmModel?.trim() || getDefaultMtModelName();
  const auto = model.toLowerCase() === "auto";

  return {
    translationId,
    body: {
      provider: auto
        ? AUTO_ROUTER_PROVIDER
        : getProvider(model, "hypaai", "MT"),
      model: auto ? undefined : model,
      text: params.text,
      source_lang: normalizeSourceLanguage(params.sourceLang),
      target_lang: params.targetLang,
      temperature: 0,
      top_p: 0.5,
      top_k: 1,
      max_tokens: 1240,
      stream: false,
      thinking: params.thinkingMode ?? false,
      client_request_id: translationId,
    },
  };
};

export interface TranslateThinkingAPIParams {
  sourceText: string;
  targetText: string;
  sourceLang?: string;
  targetLang: string;
  llmModel?: string;
  translationModel?: string | null;
  detectedLanguage?: string | null;
  translationId?: string | null;
}

export const buildMtThinkingRequest = (params: TranslateThinkingAPIParams) => {
  const routed = params.translationModel?.trim();
  const routedProvider = findProviderForModel("MT", routed);
  const hint =
    routedProvider && supportsExplanation(routedProvider) ? routed : undefined;
  const model = hint || params.llmModel?.trim() || getDefaultMtModelName();
  const auto = Boolean(hint) || model.toLowerCase() === "auto";
  const requestId =
    params.translationId?.trim() ||
    `translation-thinking-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    requestId,
    body: {
      provider: auto
        ? AUTO_ROUTER_PROVIDER
        : getProvider(model, "hypaai", "MT"),
      model: auto ? hint : model,
      source_text: params.sourceText,
      target_text: params.targetText,
      source_lang: resolveThinkingSourceLanguage(
        params.sourceLang,
        params.detectedLanguage,
      ),
      target_lang: params.targetLang,
      stream: false,
      temperature: 0.3,
      top_p: 0.5,
      top_k: 1,
      max_tokens: 800,
      client_request_id: requestId,
    },
  };
};

export const unwrapMtThinkingResponse = (data: unknown): string => {
  if (!data || typeof data !== "object") return "";
  const thinking = (data as { thinking?: unknown }).thinking;
  return typeof thinking === "string" ? thinking.trim() : "";
};

export const mapMtResponse = (
  responseText: string,
  params: Pick<TranslateAPIParams, "sourceLang">,
  translationId: string,
): TranslateAPIResponse => {
  const metadata = extractMtPayloadMetadata(responseText);
  return {
    translation: handleMtEndpointResponse(responseText),
    language:
      metadata.detectedLanguage ||
      (isAutoDetectLanguage(params.sourceLang)
        ? null
        : params.sourceLang || null),
    id: translationId,
    model: extractAutoModel(responseText),
  };
};

export interface TextToSpeechAPIParams {
  text: string;
  voice: string;
  ttsModel?: string;
}

export interface TextToSpeechAPIResponse {
  audio_b64: string;
  audio_sample?: number[];
  sample_rate?: number;
}

export const buildTtsRequest = (
  params: TextToSpeechAPIParams,
  fallbackVoice = "Juliet",
) => {
  const model = params.ttsModel?.trim() || getDefaultModelName("TTS", "hypaai");

  return {
    text: params.text,
    voice: normalizeVoice(params.voice, fallbackVoice),
    model,
    provider: getProvider(model, "hypaai", "TTS"),
    temperature: 0.9,
    top_p: 0.9,
    repetition_penalty: 2,
    max_tokens: 2048,
  };
};

export const unwrapTtsResponse = (data: {
  response?: TextToSpeechAPIResponse;
}): TextToSpeechAPIResponse => data.response || { audio_b64: "" };

export const buildSttRequest = (params: {
  audioBase64: string;
  asrModel?: string;
  sourceLang?: string;
}) => {
  const model = params.asrModel?.trim() || getDefaultModelName("ASR", "hypaai");

  return {
    audio: stripDataUrl(params.audioBase64),
    audio_type: "base64",
    mime_type: extractDataUrlMimeType(params.audioBase64),
    model,
    provider: getProvider(model, "hypaai", "ASR"),
    source_lang: params.sourceLang?.trim() || undefined,
    temperature: 0,
    top_p: 0.5,
    top_k: 1,
    max_tokens: 400,
  };
};

export const unwrapSttResponse = (data: unknown) => {
  const record = data as { response?: { text?: string }; text?: string };
  return record.response?.text || record.text || "";
};

const parseMaybeJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const extractOutput = (value: unknown): string | null => {
  if (typeof value === "string") {
    const nested = parseMaybeJson(value);
    if (nested && typeof nested === "object") return extractOutput(nested);
    return value.trim() || null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, any>;
  const data = record.data;
  const choices = record.choices ?? data?.choices;
  const candidates = [
    choices?.[0]?.message?.content,
    record.translated_text,
    record.translation,
    record.output_text,
    record.output,
    record.text,
    data?.translated_text,
    data?.translation,
    data?.output_text,
    data?.output,
    data?.text,
    data?.response?.text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
};

const extractDetectedLanguage = (value: unknown): string | null => {
  if (typeof value === "string") {
    const nested = parseMaybeJson(value);
    return nested && typeof nested === "object"
      ? extractDetectedLanguage(nested)
      : null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, any>;
  const data = record.data;
  const candidates = [
    record.detected_source_lang,
    record.detectedSourceLanguage,
    record.source_language_detected,
    record.language,
    record.source_language,
    record.detected_language,
    data?.detected_source_lang,
    data?.detectedSourceLanguage,
    data?.source_language_detected,
    data?.language,
    data?.source_language,
    data?.detected_language,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && !isAutoDetectLanguage(candidate)) {
      return candidate.trim();
    }
  }

  return null;
};

const extractMtPayloadMetadata = (responseText: string) => {
  const trimmed = responseText.trim();
  const direct = parseMaybeJson(trimmed);
  const directDetectedLanguage = extractDetectedLanguage(direct);
  if (directDetectedLanguage) {
    return { detectedLanguage: directDetectedLanguage };
  }

  for (const line of responseText.split(/\r?\n/)) {
    const value = line.trim();
    if (!value.startsWith("data:")) continue;
    const dataStr = value.slice(5).trim();
    if (!dataStr || dataStr === "[DONE]") continue;
    const parsed = parseMaybeJson(dataStr);
    const detectedLanguage = extractDetectedLanguage(parsed);
    if (detectedLanguage) return { detectedLanguage };
  }

  return { detectedLanguage: null };
};

const extractAutoModel = (responseText: string): string | null => {
  const payloads = [
    responseText.trim(),
    ...responseText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()),
  ];
  for (const payload of payloads) {
    const parsed = parseMaybeJson(payload) as
      | { auto?: unknown; model?: unknown }
      | null
      | undefined;
    if (parsed?.auto && typeof parsed.model === "string") return parsed.model;
  }
  return null;
};

const readSseEvents = (responseText: string) => {
  const events: Array<{ event?: string; data: string[] }> = [];
  let current: { event?: string; data: string[] } = { data: [] };

  const pushCurrent = () => {
    if (current.event || current.data.length > 0) {
      events.push(current);
      current = { data: [] };
    }
  };

  for (const line of responseText.split(/\r?\n/)) {
    if (!line.trim()) {
      pushCurrent();
      continue;
    }
    if (line.startsWith("event:")) {
      current.event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) current.data.push(line.slice(5).trim());
  }

  pushCurrent();
  return events;
};

export const getMtSseError = (responseText: string) => {
  const errorEvent = readSseEvents(responseText).find(
    (event) => event.event === "error",
  );
  if (!errorEvent) return null;

  const rawMessage = errorEvent.data.join("\n").trim();
  if (!rawMessage) return "Translation failed";
  if (rawMessage === "MODEL_UNAVAILABLE") {
    return "Translation model is temporarily unavailable. Please try again.";
  }
  return rawMessage;
};

export const handleMtEndpointResponse = (responseText: string) => {
  const trimmed = responseText.trim();
  const sseError = getMtSseError(trimmed);
  if (sseError) throw new Error(sseError);

  const direct = parseMaybeJson(trimmed);
  const directOutput = extractOutput(direct);
  if (directOutput) return directOutput;

  for (const line of responseText.split(/\r?\n/)) {
    const value = line.trim();
    if (!value.startsWith("data:")) continue;
    const dataStr = value.slice(5).trim();
    if (!dataStr || dataStr === "[DONE]") continue;
    const parsed = parseMaybeJson(dataStr);
    const output = extractOutput(parsed);
    if (output) return output;
  }

  return trimmed;
};
