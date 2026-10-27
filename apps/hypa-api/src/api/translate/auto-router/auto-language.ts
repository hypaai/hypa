import { BadRequestException } from '@nestjs/common';
import {
  LANGUAGE_INFO_BY_CODE,
  LANGUAGE_INFO_BY_NAME,
} from '@hypa/config/language-metadata';
import { AUTO_ROUTER_MODEL } from '@hypa/config/models';

const AUTO_LANGUAGES = new Set(
  AUTO_ROUTER_MODEL.languages.map((language) => language.toLowerCase()),
);

export function canonicalLanguage(value: string): string | null {
  const key = value.trim().toLowerCase();
  return (
    LANGUAGE_INFO_BY_NAME[key]?.name ?? LANGUAGE_INFO_BY_CODE[key]?.name ?? null
  );
}

export function autoLanguage(value: string): string | null {
  const language = canonicalLanguage(value);
  return language && AUTO_LANGUAGES.has(language.toLowerCase())
    ? language
    : null;
}

export function normalizeAutoLanguagePair(input: {
  sourceLang: string | null;
  targetLang: string;
}): { sourceLang: string | null; targetLang: string } {
  const source = input.sourceLang?.trim();
  const autoDetect = !source || /^auto(?:[ -]?detect)?$/i.test(source);
  const sourceLang = autoDetect ? null : autoLanguage(source);
  const targetLang = autoLanguage(input.targetLang);
  if (!targetLang || (!autoDetect && !sourceLang)) {
    throw new BadRequestException('No MT model supports this language pair');
  }
  return { sourceLang, targetLang };
}
