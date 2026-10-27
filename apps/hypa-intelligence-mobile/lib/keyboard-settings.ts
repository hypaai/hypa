import type { KeyboardLanguageId, KeyboardSettings, KeyboardTranslationHistoryItem } from 'hypa-keyboard-storage';

import {
  addSettingsChangedListener,
  getSettingsJson,
  setSettingsJson,
  startKeyboardStorageDebugLogging,
} from 'hypa-keyboard-storage';
import {
  APPEARANCES,
  DEFAULT_DICTIONARY_MODEL,
  DEFAULT_MODEL_PROVIDER,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TRANSLATION_MODEL,
  THEME_PRESETS,
  type Appearance,
} from '@/constants/app';
import { AUTO_DETECT_LANGUAGE, resolveProviderModelForGroup } from '@/lib/model-languages';

export { KeyboardSettings };

export { addSettingsChangedListener, getSettingsJson, startKeyboardStorageDebugLogging };

export const DEFAULT_KEYBOARD_SETTINGS: KeyboardSettings = {
  languageId: 'en' satisfies KeyboardLanguageId,
  name: '',
  token: '',
  translationProvider: DEFAULT_MODEL_PROVIDER,
  translationModel: DEFAULT_TRANSLATION_MODEL,
  dictionaryProvider: DEFAULT_MODEL_PROVIDER,
  dictionaryModel: DEFAULT_DICTIONARY_MODEL,
  ttsProvider: DEFAULT_MODEL_PROVIDER,
  ttsModel: DEFAULT_TTS_MODEL,
  sttProvider: DEFAULT_MODEL_PROVIDER,
  sttModel: DEFAULT_STT_MODEL,
  voice: 'Eniola',
  ttsLanguage: 'en',
  dictionaryLanguage: 'English',
  translateSourceLanguage: AUTO_DETECT_LANGUAGE,
  translateTargetLanguage: 'Yoruba',
  aiDataSharingConsent: false,
  autoSpeakTranslations: false,
  autoSpeakTranslationsKeyboard: false,
  autoTranslateOnLanguageChange: true,
  autoTranslateOnLanguageChangePage: true,
  autoLookupOnLanguageChange: true,
  autoLookupOnLanguageChangePage: true,
  historyItemsToKeep: 50,
  translationHistory: [],
  longPressDurationMs: 500,
  toolOrder: [
    'TRANSLATE',
    'VOICE',
    'SPEAK',
    'DICTIONARY',
    'CLIPBOARD',
    'LANGUAGES',
    'EMOJI',
    'SETTINGS',
  ],
  usageStats: {
    wordsSaved: 0,
    wordsTyped: 0,
    streakDays: 0,
    lastActiveDate: '',
  },
  appearance: 'system',
  themeDark: THEME_PRESETS[0].dark,
  themeLight: THEME_PRESETS[0].light,
  soundEnabled: true,
  predictiveBarEnabled: true,
  autocorrectEnabled: true,
  hapticsEnabled: true,
  vibrationStrength: 100,
  fontSize: 15,
  keyboardHeight: 260,
};

function savedServiceModel(
  group: 'AC' | 'MT' | 'TTS' | 'ASR',
  provider: string | undefined,
  model: string | undefined,
  fallbackProvider: string,
  fallbackModel: string,
) {
  const savedModel = typeof model === 'string' ? model.trim() : '';
  if (!savedModel) return { provider: fallbackProvider, model: fallbackModel };
  const savedProvider =
    typeof provider === 'string' && provider.trim() ? provider : fallbackProvider;
  return resolveProviderModelForGroup(group, savedProvider, savedModel);
}

export function parseKeyboardSettings(json: string): KeyboardSettings {
  try {
    const parsed = JSON.parse(json) as Partial<KeyboardSettings>;
    const parsedUsageStats =
      parsed.usageStats && typeof parsed.usageStats === 'object' ? parsed.usageStats : undefined;
    const translation = savedServiceModel(
      'MT',
      parsed.translationProvider,
      parsed.translationModel,
      DEFAULT_KEYBOARD_SETTINGS.translationProvider,
      DEFAULT_KEYBOARD_SETTINGS.translationModel,
    );
    const dictionary = savedServiceModel(
      'AC',
      parsed.dictionaryProvider,
      parsed.dictionaryModel,
      DEFAULT_KEYBOARD_SETTINGS.dictionaryProvider,
      DEFAULT_KEYBOARD_SETTINGS.dictionaryModel,
    );
    const tts = savedServiceModel(
      'TTS',
      parsed.ttsProvider,
      parsed.ttsModel,
      DEFAULT_KEYBOARD_SETTINGS.ttsProvider,
      DEFAULT_KEYBOARD_SETTINGS.ttsModel,
    );
    const stt = savedServiceModel(
      'ASR',
      parsed.sttProvider,
      parsed.sttModel,
      DEFAULT_KEYBOARD_SETTINGS.sttProvider,
      DEFAULT_KEYBOARD_SETTINGS.sttModel,
    );
    return {
      languageId:
        typeof parsed.languageId === 'string'
          ? parsed.languageId
          : DEFAULT_KEYBOARD_SETTINGS.languageId,
      name: typeof parsed.name === 'string' ? parsed.name : DEFAULT_KEYBOARD_SETTINGS.name,
      token: typeof parsed.token === 'string' ? parsed.token : DEFAULT_KEYBOARD_SETTINGS.token,
      translationProvider: translation.provider,
      translationModel: translation.model,
      dictionaryProvider: dictionary.provider,
      dictionaryModel: dictionary.model,
      ttsProvider: tts.provider,
      ttsModel: tts.model,
      sttProvider: stt.provider,
      sttModel: stt.model,
      voice: typeof parsed.voice === 'string' ? parsed.voice : DEFAULT_KEYBOARD_SETTINGS.voice,
      ttsLanguage:
        typeof parsed.ttsLanguage === 'string' && parsed.ttsLanguage.trim()
          ? parsed.ttsLanguage
          : DEFAULT_KEYBOARD_SETTINGS.ttsLanguage,
      dictionaryLanguage:
        typeof parsed.dictionaryLanguage === 'string'
          ? parsed.dictionaryLanguage
          : DEFAULT_KEYBOARD_SETTINGS.dictionaryLanguage,
      translateSourceLanguage:
        typeof parsed.translateSourceLanguage === 'string'
          ? parsed.translateSourceLanguage
          : DEFAULT_KEYBOARD_SETTINGS.translateSourceLanguage,
      translateTargetLanguage:
        typeof parsed.translateTargetLanguage === 'string'
          ? parsed.translateTargetLanguage
          : DEFAULT_KEYBOARD_SETTINGS.translateTargetLanguage,
      aiDataSharingConsent:
        typeof parsed.aiDataSharingConsent === 'boolean'
          ? parsed.aiDataSharingConsent
          : DEFAULT_KEYBOARD_SETTINGS.aiDataSharingConsent,
      autoSpeakTranslations:
        typeof parsed.autoSpeakTranslations === 'boolean'
          ? parsed.autoSpeakTranslations
          : DEFAULT_KEYBOARD_SETTINGS.autoSpeakTranslations,
      autoSpeakTranslationsKeyboard:
        typeof parsed.autoSpeakTranslationsKeyboard === 'boolean'
          ? parsed.autoSpeakTranslationsKeyboard
          : typeof parsed.autoSpeakTranslations === 'boolean'
            ? parsed.autoSpeakTranslations
            : DEFAULT_KEYBOARD_SETTINGS.autoSpeakTranslationsKeyboard,
      autoTranslateOnLanguageChange:
        typeof parsed.autoTranslateOnLanguageChange === 'boolean'
          ? parsed.autoTranslateOnLanguageChange
          : DEFAULT_KEYBOARD_SETTINGS.autoTranslateOnLanguageChange,
      autoTranslateOnLanguageChangePage:
        typeof parsed.autoTranslateOnLanguageChangePage === 'boolean'
          ? parsed.autoTranslateOnLanguageChangePage
          : DEFAULT_KEYBOARD_SETTINGS.autoTranslateOnLanguageChangePage,
      autoLookupOnLanguageChange:
        typeof parsed.autoLookupOnLanguageChange === 'boolean'
          ? parsed.autoLookupOnLanguageChange
          : DEFAULT_KEYBOARD_SETTINGS.autoLookupOnLanguageChange,
      autoLookupOnLanguageChangePage:
        typeof parsed.autoLookupOnLanguageChangePage === 'boolean'
          ? parsed.autoLookupOnLanguageChangePage
          : DEFAULT_KEYBOARD_SETTINGS.autoLookupOnLanguageChangePage,
      historyItemsToKeep:
        typeof parsed.historyItemsToKeep === 'number' && Number.isFinite(parsed.historyItemsToKeep)
          ? parsed.historyItemsToKeep
          : DEFAULT_KEYBOARD_SETTINGS.historyItemsToKeep,
      translationHistory: Array.isArray(parsed.translationHistory)
        ? parsed.translationHistory
            .filter((item): item is KeyboardTranslationHistoryItem => {
              const record = item as Partial<KeyboardTranslationHistoryItem>;
              return (
                typeof record.id === 'string' &&
                typeof record.sourceLanguage === 'string' &&
                typeof record.targetLanguage === 'string' &&
                typeof record.originalText === 'string' &&
                typeof record.translatedText === 'string'
              );
            })
            .map((item) => ({
              ...item,
              bookmarked: !!item.bookmarked,
              liked: typeof item.liked === 'boolean' || item.liked === null ? item.liked : null,
              timestamp:
                typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
            }))
        : DEFAULT_KEYBOARD_SETTINGS.translationHistory,
      longPressDurationMs:
        typeof parsed.longPressDurationMs === 'number' &&
        Number.isFinite(parsed.longPressDurationMs)
          ? parsed.longPressDurationMs
          : DEFAULT_KEYBOARD_SETTINGS.longPressDurationMs,
      toolOrder: Array.isArray(parsed.toolOrder)
        ? parsed.toolOrder.filter((tool): tool is string => typeof tool === 'string')
        : DEFAULT_KEYBOARD_SETTINGS.toolOrder,
      usageStats: {
        wordsSaved:
          typeof parsedUsageStats?.wordsSaved === 'number' &&
          Number.isFinite(parsedUsageStats.wordsSaved)
            ? parsedUsageStats.wordsSaved
            : DEFAULT_KEYBOARD_SETTINGS.usageStats.wordsSaved,
        wordsTyped:
          typeof parsedUsageStats?.wordsTyped === 'number' &&
          Number.isFinite(parsedUsageStats.wordsTyped)
            ? parsedUsageStats.wordsTyped
            : DEFAULT_KEYBOARD_SETTINGS.usageStats.wordsTyped,
        streakDays:
          typeof parsedUsageStats?.streakDays === 'number' &&
          Number.isFinite(parsedUsageStats.streakDays)
            ? parsedUsageStats.streakDays
            : DEFAULT_KEYBOARD_SETTINGS.usageStats.streakDays,
        lastActiveDate:
          typeof parsedUsageStats?.lastActiveDate === 'string'
            ? parsedUsageStats.lastActiveDate
            : DEFAULT_KEYBOARD_SETTINGS.usageStats.lastActiveDate,
      },
      appearance: APPEARANCES.includes(parsed.appearance as Appearance)
        ? (parsed.appearance as Appearance)
        : DEFAULT_KEYBOARD_SETTINGS.appearance,
      themeDark: { ...DEFAULT_KEYBOARD_SETTINGS.themeDark, ...parsed.themeDark },
      themeLight: { ...DEFAULT_KEYBOARD_SETTINGS.themeLight, ...parsed.themeLight },
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_KEYBOARD_SETTINGS.soundEnabled,
      predictiveBarEnabled:
        typeof parsed.predictiveBarEnabled === 'boolean'
          ? parsed.predictiveBarEnabled
          : DEFAULT_KEYBOARD_SETTINGS.predictiveBarEnabled,
      autocorrectEnabled:
        typeof parsed.autocorrectEnabled === 'boolean'
          ? parsed.autocorrectEnabled
          : DEFAULT_KEYBOARD_SETTINGS.autocorrectEnabled,
      hapticsEnabled:
        typeof parsed.hapticsEnabled === 'boolean'
          ? parsed.hapticsEnabled
          : DEFAULT_KEYBOARD_SETTINGS.hapticsEnabled,
      vibrationStrength:
        typeof parsed.vibrationStrength === 'number' && Number.isFinite(parsed.vibrationStrength)
          ? parsed.vibrationStrength
          : DEFAULT_KEYBOARD_SETTINGS.vibrationStrength,
      fontSize:
        typeof parsed.fontSize === 'number' && Number.isFinite(parsed.fontSize)
          ? parsed.fontSize
          : DEFAULT_KEYBOARD_SETTINGS.fontSize,
      keyboardHeight:
        typeof parsed.keyboardHeight === 'number' && Number.isFinite(parsed.keyboardHeight)
          ? parsed.keyboardHeight
          : DEFAULT_KEYBOARD_SETTINGS.keyboardHeight,
    };
  } catch {
    return DEFAULT_KEYBOARD_SETTINGS;
  }
}

function stringifyKeyboardSettings(settings: KeyboardSettings): string {
  return JSON.stringify(settings);
}

export async function loadKeyboardSettings(): Promise<KeyboardSettings> {
  return parseKeyboardSettings(getSettingsJson());
}

export async function saveKeyboardSettings(settings: KeyboardSettings): Promise<void> {
  const stored = parseKeyboardSettings(getSettingsJson());
  await setSettingsJson(stringifyKeyboardSettings({ ...settings, toolOrder: stored.toolOrder }));
}
