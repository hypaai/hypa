import { MODEL_OPTIONS_BY_CAPABILITY as modelsConfig } from "@hypa/config/models";

export type SharedLanguageInfo = {
  code: string;
  name: string;
};

type ConfiguredModel = {
  name: string;
  languages?: string[];
  languageCodes?: string[];
  voices?: Record<string, string[]>;
};

const languageInfoByName: Record<string, SharedLanguageInfo> = {};
const languageInfoByCode: Record<string, SharedLanguageInfo> = {};
const modelGroups = ["AC", "MT", "TTS", "ASR"] as const;

function languageBaseCode(code: string): string {
  return code.split(/[-_]/, 1)[0];
}

function languageCodesAreCompatible(
  canonicalCode: string,
  providerCode: string,
): boolean {
  return (
    canonicalCode === providerCode ||
    languageBaseCode(canonicalCode) === languageBaseCode(providerCode)
  );
}

for (const group of modelGroups) {
  const providerMap = modelsConfig[group] as Record<string, ConfiguredModel[]>;
  for (const models of Object.values(providerMap)) {
    for (const model of models) {
      const names = model.languages ?? [];
      const codes = model.languageCodes ?? [];
      if (names.length !== codes.length) {
        throw new Error(
          `${group} model ${model.name} must define matching languages and languageCodes`,
        );
      }

      names.forEach((rawName, index) => {
        const name = rawName.trim();
        const code = codes[index]?.trim().toLowerCase() ?? "";
        if (!name || !code) return;

        const nameKey = name.toLowerCase();
        const existingByName = languageInfoByName[nameKey];
        const existingByCode = languageInfoByCode[code];
        if (
          existingByName &&
          !languageCodesAreCompatible(existingByName.code, code)
        ) {
          throw new Error(
            `Language ${name} maps to both ${existingByName.code} and ${code}`,
          );
        }
        if (existingByCode && existingByCode.name.toLowerCase() !== nameKey) {
          throw new Error(
            `Language code ${code} maps to both ${existingByCode.name} and ${name}`,
          );
        }

        const language = existingByName ?? existingByCode ?? { code, name };
        languageInfoByName[nameKey] = language;
        languageInfoByCode[code] = language;
      });
    }
  }
}

export const LANGUAGE_INFO_BY_NAME = languageInfoByName;
export const LANGUAGE_INFO_BY_CODE = languageInfoByCode;

export const LEGACY_LANGUAGE_CODES: Record<string, string> = {
  tiv: "tv",
  ann: "an",
  efi: "ef",
  ibb: "ib",
  idu: "id",
  "en-us": "en",
};

export const KEYBOARD_LAYOUT_READY_CODES = ["en", "yo", "igl", "ig", "ha"] as const;
