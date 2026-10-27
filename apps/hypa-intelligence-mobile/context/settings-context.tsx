import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useKeyboardSettings } from "@/hooks/use-keyboard-settings";
import {
  DEFAULT_KEYBOARD_SETTINGS,
  startKeyboardStorageDebugLogging,
  type KeyboardSettings,
} from "@/lib/keyboard-settings";
import { queryClient } from "@/lib/query-client";
import { VERSION_BUILD } from "@/constants/app";
import {
  AUTO_DETECT_LANGUAGE,
  getTranslationSourceLanguages,
  getTranslationTargetLanguages,
  getTtsCelebrityVoices,
  getTtsLabelledVoices,
  getTtsVoicesForLanguage,
  getTtsVoicesForModel,
  languageNameToCode,
  resolveModelDependentLanguageSettings,
  resolveValidLanguageSelection,
} from "@/lib/model-languages";

type ThemePreference = "system" | "light" | "dark";

type SettingsUpdater<T> = (updates: Partial<T>) => void;

type GeneralSettings = {
  feedbackEmail: string;
  helpCenterUrl: string;
  aboutVersion: string;
};

type LanguageSettings = {
  sourceLang: string;
  targetLang: string;
};

type VoiceSettings = {
  speechInput: string;
  voice: string;
  speed: number;
  pitch: number;
};

type AppearanceSettings = {
  audioControlEnabled: boolean;
  theme: ThemePreference;
};

interface BehaviorSettings {
  autoPlayAudio: boolean;
  aiDataSharingConsent: boolean;
  autoTranslateOnLanguageChangePage: boolean;
}

interface AppModels {
  translationModel: string;
  dictionaryModel: string;
  ttsModel: string;
  asrModel: string;
  ocrModel: string;
}

type Language = { code: string; name: string; nativeName?: string };

type SettingsContextValue = {
  general: GeneralSettings;
  updateGeneral: SettingsUpdater<GeneralSettings>;
  languages: LanguageSettings;
  updateLanguages: SettingsUpdater<LanguageSettings>;
  appearance: AppearanceSettings;
  updateAppearance: SettingsUpdater<AppearanceSettings>;
  voice: VoiceSettings;
  updateVoice: SettingsUpdater<VoiceSettings>;

  models: AppModels;
  updateModels: SettingsUpdater<AppModels>;
  behavior: BehaviorSettings;
  updateBehavior: SettingsUpdater<BehaviorSettings>;

  voiceSelectionMode: "auto" | "favorites" | "celebrity";
  targetLanguageVoices: Record<string, string>;
  favoriteVoices: string[];
  favoriteCelebrityVoices: string[];
  updateFavoriteVoices: (voices: string[]) => void;
  toggleFavoriteVoice: (voice: string) => void;
  updateFavoriteCelebrityVoices: (voices: string[]) => void;
  toggleFavoriteCelebrityVoice: (voice: string) => void;
  historyItemsToKeep: number;
  updateOtherSettings: (key: string, value: any) => void;
  updateTargetLanguageVoice: (languageCode: string, voice: string) => void;

  resetSettings: () => void;
  clearHistoryData: () => void;
  resetLocalAppData: () => void;
  exportSettings: () => void;
  clearAllData: () => void;

  getAvailableSourceLanguages: () => Language[];
  getAvailableTargetLanguages: () => Language[];
  getAvailableVoices: () => string[];
  getAvailableLabelledVoices: () => { value: string; label: string; language?: string }[];
  getAvailableCelebrityVoices: () => string[];
  getVoicesForLanguage: (languageCode: string) => string[];
  resolvePlaybackVoice: (kind: "input" | "output", languageCode: string, userSelection?: string) => string;

  isLoading: boolean;
  settings: KeyboardSettings | null;
  refreshSettings: () => Promise<KeyboardSettings>;
  setSettings: (settings: KeyboardSettings) => Promise<KeyboardSettings>;
  updateSettings: (
    updater: Partial<KeyboardSettings> | ((current: KeyboardSettings) => KeyboardSettings)
  ) => Promise<KeyboardSettings>;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const toLanguage = (name: string): Language => ({
  code: languageNameToCode(name),
  name,
});

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const keyboard = useKeyboardSettings();
  const resolvedSettings = keyboard.settings ?? DEFAULT_KEYBOARD_SETTINGS;

  useEffect(() => {
    if (!__DEV__) return;
    const subscription = startKeyboardStorageDebugLogging();
    return () => subscription.remove();
  }, []);

  const [voiceSelectionMode] = useState<
    "auto" | "favorites" | "celebrity"
  >("auto");
  const [targetLanguageVoices, setTargetLanguageVoices] = useState<Record<string, string>>({});
  const [favoriteVoices, setFavoriteVoices] = useState<string[]>([]);
  const [favoriteCelebrityVoices, setFavoriteCelebrityVoices] = useState<string[]>([]);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [voiceAdjustments, setVoiceAdjustments] = useState({ speed: 1, pitch: 1 });

  const updateLanguages = useCallback<SettingsUpdater<LanguageSettings>>(
    (updates) => {
      void keyboard.updateSettings((current) => ({
        ...current,
        translateSourceLanguage:
          updates.sourceLang ?? current.translateSourceLanguage,
        translateTargetLanguage:
          updates.targetLang ?? current.translateTargetLanguage,
      }));
    },
    [keyboard]
  );

  const updateAppearance = useCallback<SettingsUpdater<AppearanceSettings>>(
    (updates) => {
      if (typeof updates.audioControlEnabled === "boolean") {
        const autoSpeakTranslations = updates.audioControlEnabled;
        void keyboard.updateSettings((current) => ({
          ...current,
          autoSpeakTranslations,
        }));
      }
      if (updates.theme) {
        setThemePreference(updates.theme);
      }
    },
    [keyboard]
  );

  const updateVoice = useCallback<SettingsUpdater<VoiceSettings>>(
    (updates) => {
      if (updates.voice || updates.speechInput) {
        void keyboard.updateSettings((current) => ({
          ...current,
          voice: updates.voice ?? updates.speechInput ?? current.voice,
        }));
      }
      setVoiceAdjustments((current) => ({
        speed: updates.speed ?? current.speed,
        pitch: updates.pitch ?? current.pitch,
      }));
    },
    [keyboard]
  );

  const updateModels = useCallback<SettingsUpdater<AppModels>>(
    (updates) => {
      void keyboard.updateSettings((current) => {
        const nextTranslationModel = updates.translationModel ?? current.translationModel;
        const nextDictionaryModel = updates.dictionaryModel ?? current.dictionaryModel;
        const nextTtsModel = updates.ttsModel ?? current.ttsModel;
        const languages = resolveModelDependentLanguageSettings({
          translationModel: nextTranslationModel,
          dictionaryModel: nextDictionaryModel,
          ttsModel: nextTtsModel,
          translateSourceLanguage: current.translateSourceLanguage,
          translateTargetLanguage: current.translateTargetLanguage,
          dictionaryLanguage: current.dictionaryLanguage,
          languageId: current.languageId,
          ttsLanguage: current.ttsLanguage,
          voice: current.voice,
          includeVoice: true,
        });

        return {
          ...current,
          translationModel: nextTranslationModel,
          dictionaryModel: nextDictionaryModel,
          ttsModel: nextTtsModel,
          sttModel: updates.asrModel ?? current.sttModel,
          ...languages,
        };
      });
    },
    [keyboard]
  );

  const updateBehavior = useCallback<SettingsUpdater<BehaviorSettings>>(
    (updates) => {
      if (typeof updates.autoPlayAudio === "boolean") {
        const autoSpeakTranslations = updates.autoPlayAudio;
        void keyboard.updateSettings((current) => ({
          ...current,
          autoSpeakTranslations,
        }));
      }
      if (typeof updates.aiDataSharingConsent === "boolean") {
        const aiDataSharingConsent = updates.aiDataSharingConsent;
        void keyboard.updateSettings((current) => ({
          ...current,
          aiDataSharingConsent,
        }));
      }
    },
    [keyboard]
  );

  const updateFavoriteVoices = useCallback((voices: string[]) => {
    setFavoriteVoices(voices);
  }, []);

  const toggleFavoriteVoice = useCallback(
    (voice: string) => {
      setFavoriteVoices((current) =>
        current.includes(voice)
          ? current.filter((item) => item !== voice)
          : [...current, voice]
      );
    },
    []
  );

  const updateFavoriteCelebrityVoices = useCallback((voices: string[]) => {
    setFavoriteCelebrityVoices(voices);
  }, []);

  const toggleFavoriteCelebrityVoice = useCallback(
    (voice: string) => {
      setFavoriteCelebrityVoices((current) =>
        current.includes(voice)
          ? current.filter((item) => item !== voice)
          : [...current, voice]
      );
    },
    []
  );

  const updateOtherSettings = useCallback(
    (key: string, value: any) => {
      void keyboard.updateSettings((current) => ({
        ...current,
        [key]: value,
      } as KeyboardSettings));
    },
    [keyboard]
  );

  const updateTargetLanguageVoice = useCallback(
    (languageCode: string, voice: string) => {
      const key = languageCode.toLowerCase();
      setTargetLanguageVoices((current) => ({
        ...current,
        [key]: voice,
      }));
    },
    []
  );

  const resetSettings = useCallback(() => {
    void keyboard.setSettings(DEFAULT_KEYBOARD_SETTINGS);
  }, [keyboard]);

  const clearHistoryData = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["keyboard-translate-history"] });
    queryClient.removeQueries({ queryKey: ["keyboard-dictionary-history"] });
  }, []);

  const resetLocalAppData = useCallback(() => {
    resetSettings();
    clearHistoryData();
  }, [clearHistoryData, resetSettings]);

  const clearAllData = useCallback(() => {
    resetLocalAppData();
  }, [resetLocalAppData]);

  const exportSettings = useCallback(() => {
    void resolvedSettings;
  }, [resolvedSettings]);

  const getAvailableSourceLanguages = useCallback(
    () => getTranslationSourceLanguages(resolvedSettings.translationModel).map(toLanguage),
    [resolvedSettings.translationModel]
  );
  const getAvailableTargetLanguages = useCallback(
    () => getTranslationTargetLanguages(resolvedSettings.translationModel).map(toLanguage),
    [resolvedSettings.translationModel]
  );

  const validatedLanguages = useMemo(() => {
    const sourceLanguages = getTranslationSourceLanguages(resolvedSettings.translationModel);
    const targetLanguages = getTranslationTargetLanguages(resolvedSettings.translationModel);
    return {
      sourceLang: resolveValidLanguageSelection(
        resolvedSettings.translateSourceLanguage,
        sourceLanguages,
        AUTO_DETECT_LANGUAGE
      ),
      targetLang: resolveValidLanguageSelection(
        resolvedSettings.translateTargetLanguage,
        targetLanguages,
        "Yoruba"
      ),
    };
  }, [
    resolvedSettings.translateSourceLanguage,
    resolvedSettings.translateTargetLanguage,
    resolvedSettings.translationModel,
  ]);

  useEffect(() => {
    const languages = resolveModelDependentLanguageSettings({
      translationModel: resolvedSettings.translationModel,
      dictionaryModel: resolvedSettings.dictionaryModel,
      ttsModel: resolvedSettings.ttsModel,
      translateSourceLanguage: resolvedSettings.translateSourceLanguage,
      translateTargetLanguage: resolvedSettings.translateTargetLanguage,
      dictionaryLanguage: resolvedSettings.dictionaryLanguage,
      languageId: resolvedSettings.languageId,
      ttsLanguage: resolvedSettings.ttsLanguage,
      voice: resolvedSettings.voice,
      includeVoice: true,
    });

    const needsUpdate =
      resolvedSettings.translateSourceLanguage !== languages.translateSourceLanguage ||
      resolvedSettings.translateTargetLanguage !== languages.translateTargetLanguage ||
      resolvedSettings.dictionaryLanguage !== languages.dictionaryLanguage ||
      resolvedSettings.languageId !== languages.languageId ||
      resolvedSettings.ttsLanguage !== languages.ttsLanguage ||
      (languages.voice != null && resolvedSettings.voice !== languages.voice);

    if (!needsUpdate) return;

    void keyboard.updateSettings((current) => ({
      ...current,
      ...languages,
    }));
  }, [
    keyboard.updateSettings,
    resolvedSettings.dictionaryLanguage,
    resolvedSettings.dictionaryModel,
    resolvedSettings.languageId,
    resolvedSettings.translateSourceLanguage,
    resolvedSettings.translateTargetLanguage,
    resolvedSettings.translationModel,
    resolvedSettings.ttsModel,
    resolvedSettings.ttsLanguage,
    resolvedSettings.voice,
  ]);

  const getAvailableVoices = useCallback(() => {
    const voices = getTtsVoicesForModel(resolvedSettings.ttsModel);
    if (voices.length > 0) return voices;
    return resolvedSettings.voice ? [resolvedSettings.voice] : [];
  }, [resolvedSettings.ttsModel, resolvedSettings.voice]);

  const getAvailableLabelledVoices = useCallback(() => {
    const labelled = getTtsLabelledVoices(resolvedSettings.ttsModel);
    if (labelled.length > 0) return labelled;
    return getAvailableVoices().map((voice) => ({ value: voice, label: voice }));
  }, [getAvailableVoices, resolvedSettings.ttsModel]);

  const getAvailableCelebrityVoices = useCallback(
    () => getTtsCelebrityVoices(resolvedSettings.ttsModel),
    [resolvedSettings.ttsModel]
  );

  const getVoicesForLanguage = useCallback(
    (languageCode: string) => getTtsVoicesForLanguage(resolvedSettings.ttsModel, languageCode),
    [resolvedSettings.ttsModel]
  );

  const resolvePlaybackVoice = useCallback(
    (_kind: "input" | "output", languageCode: string, userSelection?: string) => {
      const langKey = languageCode.toLowerCase();
      const available = getVoicesForLanguage(languageCode);
      if (available.length === 0) return "";

      if (voiceSelectionMode === "celebrity") {
        const celebrityVoices = getAvailableCelebrityVoices();
        if (favoriteCelebrityVoices.length > 0) return favoriteCelebrityVoices[0];
        return celebrityVoices[0] ?? resolvedSettings.voice ?? "";
      }

      if (voiceSelectionMode === "favorites" && favoriteVoices.length > 0) {
        return favoriteVoices[0];
      }

      if (userSelection && available.includes(userSelection)) {
        return userSelection;
      }

      const cached = targetLanguageVoices[langKey];
      if (cached && available.includes(cached)) {
        return cached;
      }

      if (resolvedSettings.voice && available.includes(resolvedSettings.voice)) {
        return resolvedSettings.voice;
      }

      return available[0] ?? "";
    },
    [
      favoriteCelebrityVoices,
      favoriteVoices,
      getAvailableCelebrityVoices,
      getVoicesForLanguage,
      resolvedSettings.voice,
      targetLanguageVoices,
      voiceSelectionMode,
    ]
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      general: {
        feedbackEmail: "",
        helpCenterUrl: "",
        aboutVersion: VERSION_BUILD ?? "",
      },
      updateGeneral: () => {},
      languages: validatedLanguages,
      updateLanguages,
      appearance: {
        audioControlEnabled: resolvedSettings.autoSpeakTranslations,
        theme: themePreference,
      },
      updateAppearance,
      voice: {
        speechInput: resolvedSettings.voice,
        voice: resolvedSettings.voice,
        speed: voiceAdjustments.speed,
        pitch: voiceAdjustments.pitch,
      },
      updateVoice,
      models: {
        translationModel: resolvedSettings.translationModel,
        dictionaryModel: resolvedSettings.dictionaryModel,
        ttsModel: resolvedSettings.ttsModel,
        asrModel: resolvedSettings.sttModel,
        ocrModel: "",
      },
      updateModels,
      behavior: {
        autoPlayAudio: resolvedSettings.autoSpeakTranslations,
        aiDataSharingConsent: resolvedSettings.aiDataSharingConsent,
        autoTranslateOnLanguageChangePage: resolvedSettings.autoTranslateOnLanguageChangePage,
      },
      updateBehavior,
      voiceSelectionMode,
      targetLanguageVoices,
      favoriteVoices,
      favoriteCelebrityVoices,
      updateFavoriteVoices,
      toggleFavoriteVoice,
      updateFavoriteCelebrityVoices,
      toggleFavoriteCelebrityVoice,
      historyItemsToKeep: resolvedSettings.historyItemsToKeep,
      updateOtherSettings,
      updateTargetLanguageVoice,
      resetSettings,
      clearHistoryData,
      resetLocalAppData,
      exportSettings,
      clearAllData,
      getAvailableSourceLanguages,
      getAvailableTargetLanguages,
      getAvailableVoices,
      getAvailableLabelledVoices,
      getAvailableCelebrityVoices,
      getVoicesForLanguage,
      resolvePlaybackVoice,
      isLoading: keyboard.isLoading,
      settings: keyboard.settings,
      refreshSettings: keyboard.refreshSettings,
      setSettings: keyboard.setSettings,
      updateSettings: keyboard.updateSettings,
    }),
    [
      clearAllData,
      clearHistoryData,
      exportSettings,
      favoriteCelebrityVoices,
      favoriteVoices,
      getAvailableCelebrityVoices,
      getAvailableLabelledVoices,
      getAvailableSourceLanguages,
      getAvailableTargetLanguages,
      getAvailableVoices,
      getVoicesForLanguage,
      keyboard.isLoading,
      keyboard.refreshSettings,
      keyboard.setSettings,
      keyboard.settings,
      keyboard.updateSettings,
      resetLocalAppData,
      resetSettings,
      resolvedSettings.aiDataSharingConsent,
      resolvedSettings.autoSpeakTranslations,
      resolvedSettings.autoTranslateOnLanguageChangePage,
      resolvedSettings.historyItemsToKeep,
      resolvedSettings.dictionaryModel,
      resolvedSettings.translationModel,
      resolvedSettings.sttModel,
      resolvedSettings.ttsModel,
      resolvedSettings.voice,
      resolvePlaybackVoice,
      targetLanguageVoices,
      themePreference,
      updateAppearance,
      updateBehavior,
      updateLanguages,
      updateModels,
      updateOtherSettings,
      updateTargetLanguageVoice,
      updateVoice,
      validatedLanguages,
      voiceAdjustments.pitch,
      voiceAdjustments.speed,
      voiceSelectionMode,
    ]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
