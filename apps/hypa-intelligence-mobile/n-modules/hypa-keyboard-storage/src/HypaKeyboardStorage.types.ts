export type KeyboardLanguageId = 'en' | string;

export type KeyboardThemeColors = {
  surface: string;
  toolbar: string;
  key: string;
  keyPressed: string;
  label: string;
  accent: string;
  pill: string;
  pillLabel: string;
};

export type KeyboardUsageStats = {
  wordsSaved: number;
  wordsTyped: number;
  streakDays: number;
  lastActiveDate: string;
};

export type KeyboardTranslationHistoryItem = {
  id: string;
  sourceLanguage: string;
  targetLanguage: string;
  originalText: string;
  translatedText: string;
  bookmarked?: boolean;
  liked?: boolean | null;
  timestamp?: string;
};

export type KeyboardSettings = {
  languageId: KeyboardLanguageId;
  name: string;
  token: string;
  translationProvider: string;
  translationModel: string;
  dictionaryProvider: string;
  dictionaryModel: string;
  ttsProvider: string;
  ttsModel: string;
  sttProvider: string;
  sttModel: string;
  voice: string;
  ttsLanguage: string;
  dictionaryLanguage: string;
  translateSourceLanguage: string;
  translateTargetLanguage: string;
  aiDataSharingConsent: boolean;
  autoSpeakTranslations: boolean;
  autoSpeakTranslationsKeyboard: boolean;
  autoTranslateOnLanguageChange: boolean;
  autoTranslateOnLanguageChangePage: boolean;
  autoLookupOnLanguageChange: boolean;
  autoLookupOnLanguageChangePage: boolean;
  historyItemsToKeep: number;
  translationHistory: KeyboardTranslationHistoryItem[];
  longPressDurationMs: number;
  toolOrder: string[];
  usageStats: KeyboardUsageStats;
  appearance: 'system' | 'light' | 'dark';
  themeLight: KeyboardThemeColors;
  themeDark: KeyboardThemeColors;
  soundEnabled: boolean;
  predictiveBarEnabled: boolean;
  autocorrectEnabled: boolean;
  hapticsEnabled: boolean;
  vibrationStrength: number;
  fontSize: number;
  keyboardHeight: number;
};

export type SharedLexiconEntry = {
  w: string;
  r: number;
};

export type SharedStore = {
  version: number;
  updatedAt: number;
  entries: Record<string, string>;
  lexicon: SharedLexiconEntry[];
};

export type HypaKeyboardStorageModuleEvents = {
  settingsChanged: (event: { source: string }) => void;
  sharedStoreChanged: (event: { source: string }) => void;
  debugLog: (event: {
    message: string;
    groupId: string;
    source: string;
    timestamp: number;
  }) => void;
};
