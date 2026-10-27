import {
  CAPABILITIES,
  MODELS_BY_CAPABILITY,
  getModelLanguageOptions,
  getModelRate,
  type CapabilityMap,
  type CapabilityModel,
  type ModelCapability,
  type ModelRate,
} from "@hypa/config/models";

function perUnit(amount = 0): number {
  const [coefficient, exponent] = amount.toExponential().split("e");
  return Number(`${coefficient}e${Number(exponent) - 6}`);
}

function toLegacyRates(rate: ModelRate): {
  rates: {
    input: number;
    output: number;
    audioInput?: number;
    audioOutput?: number;
  };
  charge_type: "tokens" | "audio_minutes" | "character_count";
} {
  const tokenFields =
    rate.inputPerMillionTokens !== undefined ||
    rate.outputPerMillionTokens !== undefined ||
    rate.inputPerMillionAudioTokens !== undefined ||
    rate.outputPerMillionAudioTokens !== undefined;
  const characterFields = rate.perMillionCharacters !== undefined;
  const audioFields = rate.perAudioMinute !== undefined;
  if (
    Number(tokenFields) + Number(characterFields) + Number(audioFields) !==
    1
  ) {
    throw new Error("Cannot mix token, character, and duration billing units");
  }
  if (audioFields)
    return {
      rates: { input: rate.perAudioMinute! / 60, output: 0 },
      charge_type: "audio_minutes",
    };
  if (characterFields)
    return {
      rates: { input: perUnit(rate.perMillionCharacters), output: 0 },
      charge_type: "character_count",
    };
  return {
    rates: {
      input: perUnit(rate.inputPerMillionTokens),
      output: perUnit(rate.outputPerMillionTokens),
      ...(rate.inputPerMillionAudioTokens !== undefined
        ? { audioInput: perUnit(rate.inputPerMillionAudioTokens) }
        : {}),
      ...(rate.outputPerMillionAudioTokens !== undefined
        ? { audioOutput: perUnit(rate.outputPerMillionAudioTokens) }
        : {}),
    },
    charge_type: "tokens",
  };
}

function toLegacyModel(model: CapabilityModel, capability: ModelCapability) {
  const result = {
    name: model.name,
    displayName: model.displayName,
    default: model.default,
    base_apiURL: model.baseApiUrl,
    reasoning: model.reasoning,
    reasoningEffort: model.reasoningEffort,
    fixedTemperature: model.fixedTemperature,
    ...getModelLanguageOptions(model),
    voices: model.voices,
    celeb_voices: model.celebrityVoices,
    api_key_env: model.apiKeyEnv,
    served_model_name: model.servedModelName,
    timeout_ms: model.timeoutMs,
    requiresSourceLanguage: model.requiresSourceLanguage,
    voiceEnrollmentFee: getModelRate(model, capability).voiceEnrollmentFee,
    ...toLegacyRates(getModelRate(model, capability)),
  };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    if (result[key] === undefined) Reflect.deleteProperty(result, key);
  }
  return result;
}

export type LegacyModel = ReturnType<typeof toLegacyModel>;

export const LEGACY_MODELS_BY_CAPABILITY = Object.fromEntries(
  CAPABILITIES.map((capability) => [capability, Object.fromEntries(
    Object.entries(MODELS_BY_CAPABILITY[capability]).map(([provider, models]) => [
      provider, models.map((model) => toLegacyModel(model, capability)),
    ]),
  )]),
) as CapabilityMap<LegacyModel>;
