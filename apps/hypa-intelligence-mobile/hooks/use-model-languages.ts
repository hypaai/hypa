import { useMemo } from 'react';

import { useSettings } from '@/context/settings-context';
import {
  getDictionaryLanguages,
  getKeyboardLayoutLanguages,
  getTranslationSourceLanguages,
  getTranslationTargetLanguages,
  languageNameToCode,
  toLanguageInfos,
} from '@/lib/model-languages';
import type { LanguagePreset } from '@/constants/app';

export function useTranslationSourceLanguages(): string[] {
  const { models } = useSettings();
  return useMemo(
    () => getTranslationSourceLanguages(models.translationModel),
    [models.translationModel]
  );
}

export function useTranslationTargetLanguages(): string[] {
  const { models } = useSettings();
  return useMemo(
    () => getTranslationTargetLanguages(models.translationModel),
    [models.translationModel]
  );
}

export function useDictionaryModelLanguages(): string[] {
  const { models } = useSettings();
  return useMemo(() => getDictionaryLanguages(models.dictionaryModel), [models.dictionaryModel]);
}

export function useKeyboardLayoutLanguages(): LanguagePreset[] {
  const { models } = useSettings();
  return useMemo(() => {
    const names = getKeyboardLayoutLanguages(models.translationModel);
    return names.map((name) => ({
      id: languageNameToCode(name),
      name,
      nativeName: name,
    }));
  }, [models.translationModel]);
}

export function useTranslationSourceLanguagePresets(): LanguagePreset[] {
  const names = useTranslationSourceLanguages();
  return useMemo(
    () =>
      toLanguageInfos(names).map((language) => ({
        id: language.code,
        name: language.name,
        nativeName: language.name,
      })),
    [names]
  );
}

export function useTranslationTargetLanguagePresets(): LanguagePreset[] {
  const names = useTranslationTargetLanguages();
  return useMemo(
    () =>
      toLanguageInfos(names).map((language) => ({
        id: language.code,
        name: language.name,
        nativeName: language.name,
      })),
    [names]
  );
}
