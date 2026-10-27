import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, View } from 'react-native';
import {
  BookA,
  BrainCircuit,
  Check,
  Clock3,
  Globe,
  Languages,
  Mic,
  Scaling,
  Server,
  SpellCheck,
  Trash2,
  Type,
  Vibrate,
  Volume2,
  WandSparkles,
} from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { isHypaKeyboardEnabled, showInputMethodPicker } from 'hypa-keyboard-input-method-picker';

import { SelectorModal, SettingsItem, StepperItem } from '@/components/modules/settings';
import Body from '@/components/shared/body';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { FONTS } from '@/constants/fonts';
import { DEFAULT_KEYBOARD_SETTINGS, type KeyboardSettings } from '@/lib/keyboard-settings';
import { useDictionaryModelLanguages } from '@/hooks/use-dictionary-model-languages';
import {
  useKeyboardLayoutLanguages,
  useTranslationSourceLanguages,
  useTranslationTargetLanguages,
} from '@/hooks/use-model-languages';
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings';
import { useThemeColors } from '@/hooks/use-theme-color';
import {
  languageCodeToName,
  hasKeyboardLayout,
  getTtsLanguages,
  getTtsVoicesForLanguage,
  languageNameToCode,
  resolveModelDependentLanguageSettings,
  resolveProviderModelForGroup,
  resolveValidLanguageId,
} from '@/lib/model-languages';
import {
  ALL_DICTIONARY_MODELS,
  ALL_LLM_MODELS,
  ALL_STT_MODELS,
  ALL_TTS_MODELS,
  modelsForProviderOrDefault,
  PROVIDERS,
  THEME_PRESETS,
  VERSION_BUILD,
} from '@/constants/app';

const isSameTheme = (left: KeyboardSettings['themeDark'], right: KeyboardSettings['themeDark']) =>
  left.surface === right.surface &&
  left.toolbar === right.toolbar &&
  left.key === right.key &&
  left.keyPressed === right.keyPressed &&
  left.label === right.label &&
  left.accent === right.accent &&
  left.pill === right.pill &&
  left.pillLabel === right.pillLabel;

const Settings = () => {
  const { settings, isLoading: isLoadingSettings, updateSettings } = useKeyboardSettings();
  const dictionaryModelLanguages = useDictionaryModelLanguages();
  const keyboardLanguages = useKeyboardLayoutLanguages();
  const translateSourceLanguages = useTranslationSourceLanguages();
  const translateTargetLanguages = useTranslationTargetLanguages();
  const colors = useThemeColors();
  const resolvedLanguageSettings = useMemo(() => {
    if (!settings) return null;
    return resolveModelDependentLanguageSettings({
      translationModel: settings.translationModel,
      dictionaryModel: settings.dictionaryModel,
      ttsModel: settings.ttsModel,
      translateSourceLanguage: settings.translateSourceLanguage,
      translateTargetLanguage: settings.translateTargetLanguage,
      dictionaryLanguage: settings.dictionaryLanguage,
      languageId: settings.languageId,
      ttsLanguage: settings.ttsLanguage,
      voice: settings.voice,
      includeVoice: true,
    });
  }, [
    settings?.dictionaryLanguage,
    settings?.dictionaryModel,
    settings?.languageId,
    settings?.translateSourceLanguage,
    settings?.translateTargetLanguage,
    settings?.translationModel,
    settings?.ttsModel,
    settings?.ttsLanguage,
    settings?.voice,
  ]);

  const [translationProviderModalVisible, setTranslationProviderModalVisible] = useState(false);
  const [dictionaryProviderModalVisible, setDictionaryProviderModalVisible] = useState(false);
  const [ttsProviderModalVisible, setTtsProviderModalVisible] = useState(false);
  const [sttProviderModalVisible, setSttProviderModalVisible] = useState(false);
  const [translationModelModalVisible, setTranslationModelModalVisible] = useState(false);
  const [dictionaryModelModalVisible, setDictionaryModelModalVisible] = useState(false);
  const [ttsModalVisible, setTtsModalVisible] = useState(false);
  const [sttModalVisible, setSttModalVisible] = useState(false);
  const [ttsLanguageModalVisible, setTtsLanguageModalVisible] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [translateSourceModalVisible, setTranslateSourceModalVisible] = useState(false);
  const [translateTargetModalVisible, setTranslateTargetModalVisible] = useState(false);
  const [dictionaryLanguageModalVisible, setDictionaryLanguageModalVisible] = useState(false);
  const [keyboardLanguageModalVisible, setKeyboardLanguageModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);

  const dismissSelectorModals = useCallback(() => {
    setTranslationProviderModalVisible(false);
    setDictionaryProviderModalVisible(false);
    setTtsProviderModalVisible(false);
    setSttProviderModalVisible(false);
    setTranslationModelModalVisible(false);
    setDictionaryModelModalVisible(false);
    setTtsModalVisible(false);
    setSttModalVisible(false);
    setTtsLanguageModalVisible(false);
    setVoiceModalVisible(false);
    setTranslateSourceModalVisible(false);
    setTranslateTargetModalVisible(false);
    setDictionaryLanguageModalVisible(false);
    setKeyboardLanguageModalVisible(false);
    setThemeModalVisible(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        dismissSelectorModals();
      };
    }, [dismissSelectorModals])
  );

  const updateSetting = async (key: keyof KeyboardSettings, value: any) => {
    if (!settings) return;
    await updateSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear usage data',
      'This will reset your weekly metrics (words saved, streak, words typed). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await updateSetting('usageStats', DEFAULT_KEYBOARD_SETTINGS.usageStats);
            Alert.alert('Done', 'Your usage data has been cleared.');
          },
        },
      ]
    );
  };

  const handleOpenKeyboardSettings = async () => {
    try {
      if (Platform.OS === 'android' && !isHypaKeyboardEnabled()) {
        await Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS');
        return;
      }

      await showInputMethodPicker();
    } catch {
      Alert.alert(
        'Unable to open keyboard settings',
        'Please open your device keyboard settings manually and enable Hypa Keyboard.'
      );
    }
  };

  useEffect(() => {
    if (!settings || !resolvedLanguageSettings) return;

    const next = resolvedLanguageSettings;
    const needsUpdate =
      settings.translateSourceLanguage !== next.translateSourceLanguage ||
      settings.translateTargetLanguage !== next.translateTargetLanguage ||
      settings.dictionaryLanguage !== next.dictionaryLanguage ||
      settings.languageId !== next.languageId ||
      settings.ttsLanguage !== next.ttsLanguage ||
      (next.voice != null && settings.voice !== next.voice);

    if (!needsUpdate) return;

    void updateSettings((current) => ({
      ...current,
      translateSourceLanguage: next.translateSourceLanguage,
      translateTargetLanguage: next.translateTargetLanguage,
      dictionaryLanguage: next.dictionaryLanguage,
      languageId: next.languageId,
      ttsLanguage: next.ttsLanguage,
      ...(next.voice != null ? { voice: next.voice } : {}),
    }));
  }, [resolvedLanguageSettings, settings, updateSettings]);

  if (!settings || isLoadingSettings) {
    return (
      <Body showBackground={false}>
        <View className="flex-1 items-center justify-center">
          <Text
            className="text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.regular }}>
            Loading settings...
          </Text>
        </View>
      </Body>
    );
  }

  const selectedTranslationModel =
    settings.translationModel || DEFAULT_KEYBOARD_SETTINGS.translationModel;
  const selectedDictionaryModel =
    settings.dictionaryModel || DEFAULT_KEYBOARD_SETTINGS.dictionaryModel;
  const selectedTtsModel = settings.ttsModel || DEFAULT_KEYBOARD_SETTINGS.ttsModel;
  const selectedSttModel = settings.sttModel || DEFAULT_KEYBOARD_SETTINGS.sttModel;
  const selectedTranslationProvider = settings.translationProvider;
  const selectedDictionaryProvider = settings.dictionaryProvider;
  const selectedTtsProvider = settings.ttsProvider;
  const selectedSttProvider = settings.sttProvider;
  const translationProviderLabel =
    PROVIDERS.find((p) => p.name === selectedTranslationProvider)?.displayName ??
    selectedTranslationProvider;
  const dictionaryProviderLabel =
    PROVIDERS.find((p) => p.name === selectedDictionaryProvider)?.displayName ??
    selectedDictionaryProvider;
  const ttsProviderLabel =
    PROVIDERS.find((p) => p.name === selectedTtsProvider)?.displayName ?? selectedTtsProvider;
  const sttProviderLabel =
    PROVIDERS.find((p) => p.name === selectedSttProvider)?.displayName ?? selectedSttProvider;
  const translationProviders = PROVIDERS.filter((provider) => {
    return (ALL_LLM_MODELS[provider.name] ?? []).length > 0;
  });
  const dictionaryProviders = PROVIDERS.filter((provider) => {
    return (ALL_DICTIONARY_MODELS[provider.name] ?? []).length > 0;
  });
  const ttsProviders = PROVIDERS.filter((provider) => {
    return (ALL_TTS_MODELS[provider.name] ?? []).length > 0;
  });
  const sttProviders = PROVIDERS.filter((provider) => {
    return (ALL_STT_MODELS[provider.name] ?? []).length > 0;
  });
  const translationModels = modelsForProviderOrDefault(ALL_LLM_MODELS, selectedTranslationProvider);
  const dictionaryModels = modelsForProviderOrDefault(
    ALL_DICTIONARY_MODELS,
    selectedDictionaryProvider
  );
  const ttsModels = modelsForProviderOrDefault(ALL_TTS_MODELS, selectedTtsProvider);
  const sttModels = modelsForProviderOrDefault(ALL_STT_MODELS, selectedSttProvider);
  const ttsLanguages = getTtsLanguages(selectedTtsModel);
  const selectedTtsLanguage =
    resolvedLanguageSettings?.ttsLanguage ||
    settings.ttsLanguage ||
    DEFAULT_KEYBOARD_SETTINGS.ttsLanguage;
  const ttsLanguageLabel = languageCodeToName(selectedTtsLanguage) || selectedTtsLanguage;
  const voices = getTtsVoicesForLanguage(selectedTtsModel, selectedTtsLanguage);
  const translationModelLabel =
    translationModels.find((m) => m.name === selectedTranslationModel)?.displayName ??
    selectedTranslationModel;
  const dictionaryModelLabel =
    dictionaryModels.find((m) => m.name === selectedDictionaryModel)?.displayName ??
    selectedDictionaryModel;
  const selectedVoice =
    resolvedLanguageSettings?.voice || settings.voice || DEFAULT_KEYBOARD_SETTINGS.voice;
  const translateSourceLanguage =
    resolvedLanguageSettings?.translateSourceLanguage ||
    settings.translateSourceLanguage ||
    DEFAULT_KEYBOARD_SETTINGS.translateSourceLanguage;
  const translateTargetLanguage =
    resolvedLanguageSettings?.translateTargetLanguage ||
    settings.translateTargetLanguage ||
    DEFAULT_KEYBOARD_SETTINGS.translateTargetLanguage;
  const dictionaryLanguage =
    resolvedLanguageSettings?.dictionaryLanguage ||
    settings.dictionaryLanguage ||
    DEFAULT_KEYBOARD_SETTINGS.dictionaryLanguage;
  const activeKeyboardLanguageId = resolveValidLanguageId(
    settings.languageId,
    settings.translationModel,
    'en'
  );
  const keyboardLanguageLabel = languageCodeToName(activeKeyboardLanguageId) || 'English';
  const activeThemeId =
    THEME_PRESETS.find(
      (preset) =>
        preset.appearance === settings.appearance && isSameTheme(preset.dark, settings.themeDark)
    )?.id ?? 'custom';
  const activeThemeLabel =
    THEME_PRESETS.find((preset) => preset.id === activeThemeId)?.name ?? 'Custom';
  const ttsLabel =
    ttsModels.find((m) => m.name === selectedTtsModel)?.displayName ?? selectedTtsModel;
  const sttLabel =
    sttModels.find((m) => m.name === selectedSttModel)?.displayName ?? selectedSttModel;

  return (
    <Body
      showBackground={false}
     
      enableScroll={false}
      hideBottomInset={process.env.EXPO_OS !== 'ios'}>
      <View className="flex-1 px-1 pt-4">
        <View className="mb-6 items-center">
          <Text
            className="text-[20px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}>
            Settings
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="mt-2">
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              General Settings
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={BrainCircuit}
                title="AI data processing"
                value="Allow translate and dictionary requests"
                control={
                  <Switch
                    checked={settings.aiDataSharingConsent}
                    onCheckedChange={(val) => updateSetting('aiDataSharingConsent', val)}
                  />
                }
              />
            </View>
          </View>

          <View>
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Typing Experience
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={WandSparkles}
                title="Prediction bar"
                value="Uses the limited nearby text available to Hypa"
                control={
                  <Switch
                    checked={settings.predictiveBarEnabled}
                    onCheckedChange={(val) => updateSetting('predictiveBarEnabled', val)}
                  />
                }
              />
              <SettingsItem
                icon={SpellCheck}
                title="Auto-correct"
                value="Fix typos as you type, and tidy each sentence when you finish it"
                control={
                  <Switch
                    checked={settings.autocorrectEnabled}
                    onCheckedChange={(val) => updateSetting('autocorrectEnabled', val)}
                  />
                }
              />
              <SettingsItem
                icon={Volume2}
                title="Key sound"
                value="Play sound on keypress"
                control={
                  <Switch
                    checked={settings.soundEnabled}
                    onCheckedChange={(val) => updateSetting('soundEnabled', val)}
                  />
                }
              />
              <SettingsItem
                icon={Vibrate}
                title="Haptic feedback"
                value="Vibrate on keypress"
                control={
                  <Switch
                    checked={settings.hapticsEnabled}
                    onCheckedChange={(val) => updateSetting('hapticsEnabled', val)}
                  />
                }
              />
              {settings.hapticsEnabled && Platform.OS === 'android' && (
                <StepperItem
                  icon={Vibrate}
                  title="Vibration strength"
                  value={settings.vibrationStrength}
                  unit="/255"
                  min={50}
                  max={255}
                  step={25}
                  onChange={(val: number) => updateSetting('vibrationStrength', val)}
                />
              )}
              <StepperItem
                icon={Type}
                title="Font size"
                value={settings.fontSize}
                unit="pt"
                min={10}
                max={24}
                step={1}
                onChange={(val: number) => updateSetting('fontSize', val)}
              />
              <StepperItem
                icon={Scaling}
                title="Keyboard height"
                value={settings.keyboardHeight}
                unit="dp"
                min={200}
                max={360}
                step={10}
                onChange={(val: number) => updateSetting('keyboardHeight', val)}
              />
              <StepperItem
                icon={Clock3}
                title="Long-press duration"
                value={settings.longPressDurationMs}
                unit="ms"
                min={150}
                max={500}
                step={25}
                isLast
                onChange={(val: number) => updateSetting('longPressDurationMs', val)}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Keyboard Settings
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={Languages}
                title="Keyboard language"
                value={keyboardLanguageLabel}
                hasChevron
                onPress={() => setKeyboardLanguageModalVisible(true)}
              />
              <SettingsItem
                icon={Type}
                title="Theme"
                value={activeThemeLabel}
                hasChevron
                onPress={() => setThemeModalVisible(true)}
              />

              <SettingsItem
                icon={WandSparkles}
                title="Auto-translate on language change (keyboard)"
                value="Re-translate in the keyboard when you change the target language"
                control={
                  <Switch
                    checked={settings.autoTranslateOnLanguageChange}
                    onCheckedChange={(val) => updateSetting('autoTranslateOnLanguageChange', val)}
                  />
                }
              />
              <SettingsItem
                icon={BookA}
                title="Auto-lookup on language change (keyboard)"
                value="Look the word up again when you change the dictionary language"
                control={
                  <Switch
                    checked={settings.autoLookupOnLanguageChange}
                    onCheckedChange={(val) => updateSetting('autoLookupOnLanguageChange', val)}
                  />
                }
              />
              <SettingsItem
                icon={Volume2}
                title="Auto-speak translations (keyboard)"
                value="Speak the translation aloud after a keyboard translate"
                control={
                  <Switch
                    checked={settings.autoSpeakTranslationsKeyboard}
                    onCheckedChange={(val) =>
                      updateSetting('autoSpeakTranslationsKeyboard', val)
                    }
                  />
                }
              />
              <SettingsItem
                icon={Server}
                title="Open device keyboard settings"
                value="Enable or switch to Hypa Keyboard"
                hasChevron
                isLast
                onPress={handleOpenKeyboardSettings}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Translate
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={Server}
                title="Translate Provider"
                value={translationProviderLabel}
                hasChevron
                onPress={() => setTranslationProviderModalVisible(true)}
              />
              <SettingsItem
                icon={BrainCircuit}
                title="Translation Model"
                value={
                  translationModels.length > 0
                    ? translationModelLabel
                    : 'Not available for this provider'
                }
                hasChevron={translationModels.length > 0}
                onPress={
                  translationModels.length > 0
                    ? () => setTranslationModelModalVisible(true)
                    : undefined
                }
              />
              <SettingsItem
                icon={Languages}
                title="Source Language"
                value={translateSourceLanguage}
                hasChevron
                onPress={() => setTranslateSourceModalVisible(true)}
              />
              <SettingsItem
                icon={Languages}
                title="Target Language"
                value={translateTargetLanguage}
                hasChevron
                onPress={() => setTranslateTargetModalVisible(true)}
              />
              <SettingsItem
                icon={Volume2}
                title="Auto-speak translations (Translate tab)"
                value="Speak translations aloud on the Translate tab"
                control={
                  <Switch
                    checked={settings.autoSpeakTranslations}
                    onCheckedChange={(val) => updateSetting('autoSpeakTranslations', val)}
                  />
                }
              />
              <SettingsItem
                icon={WandSparkles}
                title="Auto-translate on language change (Translate tab)"
                value="Re-translate on the Translate tab when you change the target language"
                control={
                  <Switch
                    checked={settings.autoTranslateOnLanguageChangePage}
                    onCheckedChange={(val) => updateSetting('autoTranslateOnLanguageChangePage', val)}
                  />
                }
              />
              <SettingsItem
                icon={BookA}
                title="Auto-lookup on language change (Dictionary tab)"
                value="Look the word up again when you change the dictionary language"
                control={
                  <Switch
                    checked={settings.autoLookupOnLanguageChangePage}
                    onCheckedChange={(val) => updateSetting('autoLookupOnLanguageChangePage', val)}
                  />
                }
              />
              <StepperItem
                icon={Clock3}
                title="History items"
                value={settings.historyItemsToKeep}
                unit=""
                min={10}
                max={200}
                step={10}
                isLast
                onChange={(val: number) => updateSetting('historyItemsToKeep', val)}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Dictionary
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={Server}
                title="Dictionary Provider"
                value={dictionaryProviderLabel}
                hasChevron
                onPress={() => setDictionaryProviderModalVisible(true)}
              />
              <SettingsItem
                icon={BookA}
                title="Dictionary Model"
                value={
                  dictionaryModels.length > 0
                    ? dictionaryModelLabel
                    : 'Not available for this provider'
                }
                hasChevron={dictionaryModels.length > 0}
                onPress={
                  dictionaryModels.length > 0
                    ? () => setDictionaryModelModalVisible(true)
                    : undefined
                }
              />
              <SettingsItem
                icon={BookA}
                title="Dictionary language"
                value={dictionaryLanguage}
                hasChevron
                isLast
                onPress={() => setDictionaryLanguageModalVisible(true)}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Text-to-Speech (TTS)
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={Server}
                title="TTS Provider"
                value={ttsProviderLabel}
                hasChevron
                onPress={() => setTtsProviderModalVisible(true)}
              />
              <SettingsItem
                icon={Volume2}
                title="TTS Model"
                value={ttsModels.length > 0 ? ttsLabel : 'Not available for this provider'}
                hasChevron={ttsModels.length > 0}
                onPress={ttsModels.length > 0 ? () => setTtsModalVisible(true) : undefined}
              />
              <SettingsItem
                icon={Languages}
                title="Language"
                value={ttsLanguageLabel}
                hasChevron={ttsLanguages.length > 0}
                onPress={
                  ttsLanguages.length > 0 ? () => setTtsLanguageModalVisible(true) : undefined
                }
              />
              <SettingsItem
                icon={Volume2}
                title="Voice"
                value={voices.length > 0 ? selectedVoice : 'Not available for this language'}
                hasChevron={voices.length > 0}
                isLast
                onPress={voices.length > 0 ? () => setVoiceModalVisible(true) : undefined}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Speech-to-Text (STT)
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={Server}
                title="STT Provider"
                value={sttProviderLabel}
                hasChevron
                onPress={() => setSttProviderModalVisible(true)}
              />
              <SettingsItem
                icon={Mic}
                title="STT Model"
                value={sttModels.length > 0 ? sttLabel : 'Not available for this provider'}
                hasChevron={sttModels.length > 0}
                isLast
                onPress={sttModels.length > 0 ? () => setSttModalVisible(true) : undefined}
              />
            </View>
          </View>

          <View>
            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Dictionary & Data
            </Text>

            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
              <SettingsItem
                icon={BookA}
                title="Manage Dictionary"
                value="Add or remove custom words"
                hasChevron
                onPress={() => {}}
              />
              <SettingsItem
                icon={Trash2}
                title="Clear usage data"
                value="Reset your weekly metrics"
                isLast
                onPress={handleClearData}
              />
            </View>
          </View>

          <View className="mt-4 mb-8 items-center">
            <Text
              className="text-[13px] text-zinc-400 dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.regular }}>
              {VERSION_BUILD}
            </Text>
          </View>
        </ScrollView>
      </View>

      <SelectorModal
        visible={translationProviderModalVisible}
        title="Translate Provider"
        options={translationProviders}
        selected={selectedTranslationProvider}
        onSelect={(provider) => {
          void updateSettings((current) => {
            const translationModel = resolveProviderModelForGroup('MT', provider).model;
            const languages = resolveModelDependentLanguageSettings({
              translationModel,
              dictionaryModel: current.dictionaryModel,
              ttsModel: current.ttsModel,
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
              translationProvider: provider,
              translationModel,
              ...languages,
            };
          });
        }}
        onClose={() => setTranslationProviderModalVisible(false)}
      />

      <SelectorModal
        visible={dictionaryProviderModalVisible}
        title="Dictionary Provider"
        options={dictionaryProviders}
        selected={selectedDictionaryProvider}
        onSelect={(provider) => {
          void updateSettings((current) => {
            const dictionaryModel = resolveProviderModelForGroup('AC', provider).model;
            const languages = resolveModelDependentLanguageSettings({
              translationModel: current.translationModel,
              dictionaryModel,
              ttsModel: current.ttsModel,
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
              dictionaryProvider: provider,
              dictionaryModel,
              ...languages,
            };
          });
        }}
        onClose={() => setDictionaryProviderModalVisible(false)}
      />

      <SelectorModal
        visible={ttsProviderModalVisible}
        title="TTS Provider"
        options={ttsProviders}
        selected={selectedTtsProvider}
        onSelect={(provider) => {
          void updateSettings((current) => {
            const nextTtsModel = resolveProviderModelForGroup('TTS', provider).model;
            const languages = resolveModelDependentLanguageSettings({
              translationModel: current.translationModel,
              dictionaryModel: current.dictionaryModel,
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
              ttsProvider: provider,
              ttsModel: nextTtsModel,
              ...languages,
            };
          });
        }}
        onClose={() => setTtsProviderModalVisible(false)}
      />

      <SelectorModal
        visible={sttProviderModalVisible}
        title="STT Provider"
        options={sttProviders}
        selected={selectedSttProvider}
        onSelect={(provider) => {
          void updateSettings((current) => ({
            ...current,
            sttProvider: provider,
            sttModel: resolveProviderModelForGroup('ASR', provider).model,
          }));
        }}
        onClose={() => setSttProviderModalVisible(false)}
      />

      <SelectorModal
        visible={translationModelModalVisible}
        title="Translation Model"
        options={translationModels}
        selected={selectedTranslationModel}
        onSelect={(val) => {
          void updateSettings((current) => {
            const languages = resolveModelDependentLanguageSettings({
              translationModel: val,
              dictionaryModel: current.dictionaryModel,
              ttsModel: current.ttsModel,
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
              translationModel: val,
              ...languages,
            };
          });
        }}
        onClose={() => setTranslationModelModalVisible(false)}
      />

      <SelectorModal
        visible={dictionaryModelModalVisible}
        title="Dictionary Model"
        options={dictionaryModels}
        selected={selectedDictionaryModel}
        onSelect={(val) => {
          void updateSettings((current) => {
            const languages = resolveModelDependentLanguageSettings({
              translationModel: current.translationModel,
              dictionaryModel: val,
              ttsModel: current.ttsModel,
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
              dictionaryModel: val,
              ...languages,
            };
          });
        }}
        onClose={() => setDictionaryModelModalVisible(false)}
      />

      <SelectorModal
        visible={ttsModalVisible}
        title="Text-to-Speech"
        options={ttsModels}
        selected={selectedTtsModel}
        onSelect={(val) => {
          void updateSettings((current) => {
            const languages = resolveModelDependentLanguageSettings({
              translationModel: current.translationModel,
              dictionaryModel: current.dictionaryModel,
              ttsModel: val,
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
              ttsModel: val,
              ...languages,
            };
          });
        }}
        onClose={() => setTtsModalVisible(false)}
      />

      <SelectorModal
        visible={sttModalVisible}
        title="Speech-to-Text"
        options={sttModels}
        selected={selectedSttModel}
        onSelect={(val) => void updateSetting('sttModel', val)}
        onClose={() => setSttModalVisible(false)}
      />

      <SelectorModal
        visible={ttsLanguageModalVisible}
        title="TTS Language"
        options={ttsLanguages.map((language) => ({
          name: languageNameToCode(language),
          displayName: language,
        }))}
        selected={selectedTtsLanguage}
        onSelect={(val) => {
          void updateSettings((current) => {
            const languages = resolveModelDependentLanguageSettings({
              translationModel: current.translationModel,
              dictionaryModel: current.dictionaryModel,
              ttsModel: current.ttsModel,
              translateSourceLanguage: current.translateSourceLanguage,
              translateTargetLanguage: current.translateTargetLanguage,
              dictionaryLanguage: current.dictionaryLanguage,
              languageId: current.languageId,
              ttsLanguage: val,
              voice: current.voice,
              includeVoice: true,
            });
            return {
              ...current,
              ...languages,
            };
          });
        }}
        onClose={() => setTtsLanguageModalVisible(false)}
      />

      <SelectorModal
        visible={voiceModalVisible}
        title="Voice"
        options={voices.map((v) => ({ name: v, displayName: v }))}
        selected={selectedVoice}
        onSelect={(val) => void updateSetting('voice', val)}
        onClose={() => setVoiceModalVisible(false)}
      />

      <SelectorModal
        visible={keyboardLanguageModalVisible}
        title="Keyboard Language"
        options={keyboardLanguages.map((language) => ({
          name: language.id,
          displayName: language.name,
        }))}
        selected={activeKeyboardLanguageId}
        isOptionDisabled={({ name }) => !hasKeyboardLayout(name)}
        hideSelectedIndicator
        renderOption={({ name, label, isSelected }) => {
          const comingSoon = !hasKeyboardLayout(name);

          return (
            <View className="flex-row items-center gap-4">
              <View className="flex-1">
                <Text
                  className="text-[18px]"
                  style={{
                    fontFamily: FONTS.main.medium,
                    color: isSelected ? colors.primaryForeground : colors.text,
                  }}>
                  {label}
                </Text>
                {comingSoon ? (
                  <Text
                    className="mt-1 text-[13px]"
                    style={{
                      fontFamily: FONTS.main.regular,
                      color: isSelected ? colors.primaryForeground : colors.textMuted,
                      opacity: isSelected ? 0.8 : 1,
                    }}>
                    Coming Soon
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
        renderTrailing={({ isSelected }) => (
          <View
            className={`h-8 w-8 items-center justify-center rounded-full ${
              isSelected ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-100 dark:bg-zinc-800'
            }`}>
            {isSelected ? (
              <Check color={colors.primaryForeground} size={16} strokeWidth={2.6} />
            ) : (
              <Globe color={colors.icon} size={16} strokeWidth={2.2} />
            )}
          </View>
        )}
        onSelect={(val) => void updateSetting('languageId', val)}
        onClose={() => setKeyboardLanguageModalVisible(false)}
      />

      <SelectorModal
        visible={themeModalVisible}
        title="Theme"
        options={THEME_PRESETS.map((preset) => ({
          name: preset.id,
          displayName: preset.name,
        }))}
        selected={activeThemeId}
        renderOption={({ name, label, isSelected }) => {
          const preset = THEME_PRESETS.find((item) => item.id === name);
          if (!preset) return null;

          return (
            <View>
              <Text
                className="text-[15px]"
                style={{
                  fontFamily: FONTS.main.medium,
                  color: isSelected ? colors.primaryForeground : colors.text,
                }}>
                {label}
              </Text>

              <View className="mt-3 flex-row gap-2">
                {(preset.appearance === 'system'
                  ? [preset.dark, preset.light]
                  : preset.appearance === 'light'
                    ? [preset.light]
                    : [preset.dark]
                ).map((palette, index) => (
                  <View key={index} className="flex-1 flex-row gap-1">
                    <View
                      className="h-8 flex-1 rounded-l-[12px]"
                      style={{ backgroundColor: palette.surface }}
                    />
                    <View className="h-8 flex-1" style={{ backgroundColor: palette.key }} />
                    <View
                      className="h-8 flex-1 rounded-r-[12px]"
                      style={{ backgroundColor: palette.accent }}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        }}
        onSelect={(val) => {
          const preset = THEME_PRESETS.find((item) => item.id === val);
          if (!preset) return;
          void updateSettings((current) => ({
            ...current,
            appearance: preset.appearance,
            themeDark: preset.dark,
            themeLight: preset.light,
          }));
        }}
        onClose={() => setThemeModalVisible(false)}
      />

      <SelectorModal
        visible={translateSourceModalVisible}
        title="Translate Source"
        options={translateSourceLanguages.map((language) => ({
          name: language,
          displayName: language,
        }))}
        selected={translateSourceLanguage}
        onSelect={(val) => void updateSetting('translateSourceLanguage', val)}
        onClose={() => setTranslateSourceModalVisible(false)}
      />

      <SelectorModal
        visible={translateTargetModalVisible}
        title="Translate Target"
        options={translateTargetLanguages.map((language) => ({
          name: language,
          displayName: language,
        }))}
        selected={translateTargetLanguage}
        onSelect={(val) => void updateSetting('translateTargetLanguage', val)}
        onClose={() => setTranslateTargetModalVisible(false)}
      />

      <SelectorModal
        visible={dictionaryLanguageModalVisible}
        title="Dictionary Language"
        options={dictionaryModelLanguages.map((language) => ({
          name: language,
          displayName: language,
        }))}
        selected={dictionaryLanguage}
        onSelect={(val) => void updateSetting('dictionaryLanguage', val)}
        onClose={() => setDictionaryLanguageModalVisible(false)}
      />
    </Body>
  );
};

export default Settings;
