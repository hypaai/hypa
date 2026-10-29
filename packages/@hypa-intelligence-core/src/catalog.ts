import { LANGUAGE_CATALOG } from "@hypa/config/language-metadata";
import type { Language } from "./types.ts";

export const LANGUAGES: Language[] = LANGUAGE_CATALOG as Language[];

const byKey = new Map<string, Language>();
for (const language of LANGUAGES) {
  byKey.set(language.name.toLowerCase(), language);
  byKey.set(language.code.toLowerCase(), language);
}

export const resolveLanguage = (value: string): Language | undefined => {
  const key = value.trim().toLowerCase();
  return byKey.get(key);
};

export const canonicalLanguage = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return resolveLanguage(trimmed)?.name ?? trimmed;
};

export const defaultVoiceFor = (language: string): string =>
  resolveLanguage(language)?.voices[0] ?? "";
