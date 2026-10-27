import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Share, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Clock3, UserRound } from 'lucide-react-native';
import { createAudioPlayer } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';

import Body from '@/components/shared/body';
import { GlassIconButton } from '@/components/ui/glass-icon-button';
import LanguageSelector from '@/components/ui/language-selector';
import { Text } from '@/components/ui/text';
import {
  ResultPanel,
  SourcePanel,
  TranslateFooter,
  translateStyles as styles,
} from '@/components/modules/translate';
import { useSettings } from '@/context/settings-context';
import { useAiConsent } from '@/hooks/use-ai-consent';
import { useSpeechRecorder } from '@/hooks/use-speech-recorder';
import { useThemeColors } from '@/hooks/use-theme-color';
import { useToast } from '@/lib/toast';
import {
  AUTO_DETECT_LANGUAGE,
  addTranslationHistoryItem,
  getDictionaryLanguages,
  synthesizeSpeech,
  translateText,
  translateThinking,
  type TranslationResult,
} from '@/lib/product-api';
import {
  isAutoDetectLanguage,
  languageNameToCode,
  resolveDetectedSourceLanguage,
  resolveValidLanguageSelection,
} from '@/lib/model-languages';
import { attachThinking, hasThinking, parseTranslation } from '@hypa/translate-core';
import {
  useTranslationSourceLanguagePresets,
  useTranslationTargetLanguagePresets,
} from '@/hooks/use-model-languages';
import { withReturnTo } from '@/lib/navigation';
import { shareAudioFromUri } from '@/lib/share-audio';
import { isAxiosError } from 'axios';


type TtsPanel = 'source' | 'output';

type TtsRequest = {
  panel: TtsPanel;
  text: string;
  language: string;
  voice: string;
  model: string;
  provider?: string;
};

type PendingTtsRequest = TtsRequest & { playbackEpoch: number };

type TranslateMutationVars = Parameters<typeof translateText>[0] & {
  translationEpoch?: number;
};

type ThinkingMutationVars = Parameters<typeof translateThinking>[0] & {
  translationEpoch: number;
};

const cleanLabel = (value: string) => value.replace(/\s+/g, ' ').trim();

const resolveSourceSpokenLanguage = (
  selected: string,
  detected: string | null | undefined,
  options: readonly string[]
) => {
  if (!isAutoDetectLanguage(selected)) return selected;
  return resolveDetectedSourceLanguage(detected, options);
};

const buildTranslationShareMessage = (params: {
  sourceLanguage: string;
  targetLanguage: string;
  sourceText: string;
  translatedText: string;
}) => {
  const source = params.sourceText.trim();
  const translated = params.translatedText.trim();
  return [
    `${params.sourceLanguage} → ${params.targetLanguage}`,
    '',
    source,
    '',
    translated,
    '',
    'Translated by Hypa Intelligence',
  ]
    .join('\n')
    .trim();
};

const Entry = () => {
  const colors = useThemeColors();
  const toast = useToast();
  const queryClient = useQueryClient();
  const translationEpochRef = useRef(0);
  const {
    languages,
    updateLanguages,
    models,
    behavior,
    updateBehavior,
    updateVoice,
    voiceSelectionMode,
    favoriteCelebrityVoices,
    favoriteVoices,
    getVoicesForLanguage,
    targetLanguageVoices,
    updateTargetLanguageVoice,
    resolvePlaybackVoice,
    settings,
  } = useSettings();

  const selectedTranslationProvider = settings?.translationProvider;
  const selectedTtsProvider = settings?.ttsProvider;
  const selectedSttProvider = settings?.sttProvider;

  const SOURCE_LANGUAGES = useTranslationSourceLanguagePresets();
  const TARGET_LANGUAGES = useTranslationTargetLanguagePresets();
  const dictionaryLanguages = useMemo(
    () => getDictionaryLanguages(models.dictionaryModel),
    [models.dictionaryModel]
  );

  const { historySourceLang, historyTargetLang, historySourceText, historyTranslatedText, historyId } =
    useLocalSearchParams<{
      historySourceLang?: string;
      historyTargetLang?: string;
      historySourceText?: string;
      historyTranslatedText?: string;
      historyId?: string;
    }>();

  const [sourceLang, setSourceLang] = useState(
    languages.sourceLang || SOURCE_LANGUAGES[0]?.name || AUTO_DETECT_LANGUAGE
  );
  const [targetLang, setTargetLang] = useState(
    languages.targetLang || TARGET_LANGUAGES[0]?.name || 'English'
  );
  const [sourceText, setSourceText] = useState('');
  const [translated, setTranslated] = useState('');
  const [lastTranslatedSourceText, setLastTranslatedSourceText] = useState('');
  const [detectedSourceLang, setDetectedSourceLang] = useState<string | null>(null);
  const [thinkingProcess, setThinkingProcess] = useState<string | null>(null);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [currentTranslationId, setCurrentTranslationId] = useState<string | null>(null);
  const [activeTtsPanel, setActiveTtsPanel] = useState<TtsPanel | null>(null);
  const [activeTtsLabel, setActiveTtsLabel] = useState('');
  const [pendingTtsPanel, setPendingTtsPanel] = useState<TtsPanel | null>(null);
  const [swapHistory, setSwapHistory] = useState<{
    originalInput: string;
    originalRawTranslation: string;
    originalThinkingProcess: string | null;
  } | null>(null);

  const ttsPlayerRef = useRef<any | null>(null);
  const playbackEpochRef = useRef(0);
  const skipLanguagePersistRef = useRef(false);

  const sourceLanguageNames = useMemo(
    () => SOURCE_LANGUAGES.map((language) => language.name),
    [SOURCE_LANGUAGES]
  );
  const targetLanguageNames = useMemo(
    () => TARGET_LANGUAGES.map((language) => language.name),
    [TARGET_LANGUAGES]
  );

  useEffect(() => {
    if (skipLanguagePersistRef.current) return;

    setSourceLang((current) =>
      resolveValidLanguageSelection(current, sourceLanguageNames, AUTO_DETECT_LANGUAGE)
    );
    setTargetLang((current) =>
      resolveValidLanguageSelection(current, targetLanguageNames, 'English')
    );
  }, [sourceLanguageNames, targetLanguageNames]);

  useEffect(() => {
    if (skipLanguagePersistRef.current) return;

    const nextSource = resolveValidLanguageSelection(
      languages.sourceLang,
      sourceLanguageNames,
      AUTO_DETECT_LANGUAGE
    );
    const nextTarget = resolveValidLanguageSelection(
      languages.targetLang,
      targetLanguageNames,
      'English'
    );

    setSourceLang((current) => (current === nextSource ? current : nextSource));
    setTargetLang((current) => (current === nextTarget ? current : nextTarget));
  }, [languages.sourceLang, languages.targetLang, sourceLanguageNames, targetLanguageNames]);

  const { thinkingContent, mainContent } = useMemo(
    () => parseTranslation(translated),
    [translated]
  );
  const activeThinkingContent = thinkingContent || thinkingProcess;

  const card = colors.surface;
  const text = colors.text;
  const primary = colors.primary;
  const background = colors.background;
  const border = colors.border;

  useEffect(() => {
    if (!historySourceLang || !historyTargetLang || !historySourceText || !historyTranslatedText)
      return;
    skipLanguagePersistRef.current = true;
    setSourceLang(historySourceLang);
    setTargetLang(historyTargetLang);
    setSourceText(historySourceText);
    setTranslated(historyTranslatedText);
    setThinkingProcess(parseTranslation(historyTranslatedText).thinkingContent);
    setLastTranslatedSourceText(historySourceText);
    setCurrentTranslationId(historyId || null);
    setDetectedSourceLang(isAutoDetectLanguage(historySourceLang) ? null : historySourceLang);
    setSwapHistory(null);
    setTimeout(() => {
      skipLanguagePersistRef.current = false;
    }, 0);
  }, [historyId, historySourceLang, historyTargetLang, historySourceText, historyTranslatedText]);

  useEffect(() => {
    if (skipLanguagePersistRef.current) return;
    updateLanguages({ sourceLang, targetLang });
  }, [sourceLang, targetLang]);

  const stopPlayers = useCallback(() => {
    playbackEpochRef.current += 1;
    try {
      ttsPlayerRef.current?.pause();
      ttsPlayerRef.current?.remove();
      ttsPlayerRef.current?.release?.();
    } catch {}
    ttsPlayerRef.current = null;
    setActiveTtsPanel(null);
    setActiveTtsLabel('');
    setPendingTtsPanel(null);
  }, []);

  const runWithConsent = useAiConsent({
    hasConsent: behavior.aiDataSharingConsent,
    updateBehavior,
  });

  const recorderControls = useSpeechRecorder({
    asrModel: models.asrModel,
    provider: selectedSttProvider,
    onTranscript: setSourceText,
    runWithConsent,
    stopPlayers,
    toast,
  });

  const playBase64Audio = useCallback(
    async (panel: TtsPanel, label: string, audioB64: string, audioType = 'audio/mpeg') => {
      stopPlayers();
      const epoch = playbackEpochRef.current;
      const dataUri = `data:${audioType};base64,${audioB64}`;
      const player = createAudioPlayer({ uri: dataUri });
      if (playbackEpochRef.current !== epoch) {
        try {
          player.pause?.();
          player.remove?.();
          player.release?.();
        } catch {}
        return;
      }
      ttsPlayerRef.current = player;
      setPendingTtsPanel(null);
      setActiveTtsLabel(cleanLabel(label));
      setActiveTtsPanel(panel);
      (player as any).addListener?.('playbackStatusUpdate', (status: any) => {
        if (status.didJustFinish && !status.loop) {
          setActiveTtsPanel(null);
          setActiveTtsLabel('');
          return;
        }
        setActiveTtsPanel(status.playing ? panel : null);
      });
      await player.seekTo(0).catch(() => {});
      if (playbackEpochRef.current !== epoch) {
        try {
          player.pause?.();
          player.remove?.();
          player.release?.();
        } catch {}
        return;
      }
      player.play();
    },
    [stopPlayers]
  );

  const ttsMutation = useMutation({
    mutationFn: ({ panel: _panel, playbackEpoch: _playbackEpoch, ...params }: PendingTtsRequest) =>
      synthesizeSpeech(params),
    onSuccess: (data, variables) => {
      if (variables.playbackEpoch !== playbackEpochRef.current) return;
      void playBase64Audio(variables.panel, variables.text, data.audio_b64, data.audio_type);
    },
    onError: (error, variables) => {
      if (variables.playbackEpoch !== playbackEpochRef.current) return;
      setPendingTtsPanel(null);
      toast.showError(
        'Audio failed',
        error instanceof Error ? error.message : 'Failed to generate audio.'
      );
    },
  });

  const startTts = useCallback(
    (request: TtsRequest) => {
      stopPlayers();
      setPendingTtsPanel(request.panel);
      ttsMutation.mutate({ ...request, playbackEpoch: playbackEpochRef.current });
    },
    [stopPlayers, ttsMutation]
  );

  const translateMutation = useMutation({
    mutationFn: ({ translationEpoch: _translationEpoch, ...params }: TranslateMutationVars) =>
      translateText(params),
    onSuccess: async (data: TranslationResult, variables: TranslateMutationVars) => {
      if (variables.translationEpoch && variables.translationEpoch !== translationEpochRef.current) return;
      console.log('Translation result:', data);
      setTranslated(data.translation);
      setThinkingProcess(data.thinking ?? null);
      setThinkingExpanded(false);
      setLastTranslatedSourceText(variables.text);
      setCurrentTranslationId(data.id || null);
      const spokenSource = resolveSourceSpokenLanguage(
        variables.sourceLang,
        data.language,
        sourceLanguageNames
      );
      setDetectedSourceLang(spokenSource);
      if (spokenSource && isAutoDetectLanguage(variables.sourceLang)) {
        setSourceLang(spokenSource);
      }
      setSwapHistory(null);
      await addTranslationHistoryItem({
        sourceLanguage: spokenSource || variables.sourceLang,
        targetLanguage: variables.targetLang,
        originalText: variables.text,
        translatedText: data.thinking
          ? `<think>${data.thinking}</think>\n${data.translation}`
          : data.translation,
      });
      await queryClient.invalidateQueries({ queryKey: ['keyboard-translate-history'] });

      const filteredText = data.translation.trim();
      console.log(filteredText);
      if (behavior.autoPlayAudio && filteredText) {
        const targetVoice = resolveOutputVoice();
        if (targetVoice) {
          startTts({
            panel: 'output',
            text: filteredText,
            language: targetLang,
            voice: targetVoice,
            model: models.ttsModel,
            provider: selectedTtsProvider,
          });
        }
      }
    },
    onError: (error) => {
      console.error('Translation error:', isAxiosError(error) ? error.response : 'n/a');
      toast.showError(
        'Translation failed',
        error instanceof Error ? error.message : 'Please try again.'
      );
    },
  });

  const thinkingMutation = useMutation({
    mutationFn: ({ translationEpoch: _translationEpoch, ...params }: ThinkingMutationVars) =>
      translateThinking(params),
    onSuccess: (thinking, variables) => {
      if (variables.translationEpoch !== translationEpochRef.current) return;
      const next = thinking.trim();
      if (!next) {
        toast.showError('Thinking unavailable', 'Could not generate a thinking process for this translation.');
        return;
      }
      setTranslated((current) => attachThinking(current || variables.targetText, next));
      setThinkingProcess(next);
      setThinkingExpanded(true);
      void queryClient.invalidateQueries({ queryKey: ['keyboard-translate-history'] });
    },
    onError: (error) => {
      toast.showError(
        'Thinking failed',
        error instanceof Error ? error.message : 'Could not generate the thinking process.'
      );
    },
  });

  const resetTranslation = useCallback(() => {
    translationEpochRef.current += 1;
    setTranslated('');
    setLastTranslatedSourceText('');
    setDetectedSourceLang(null);
    setThinkingProcess(null);
    setThinkingExpanded(false);
    setCurrentTranslationId(null);
    setSwapHistory(null);
  }, []);

  const clear = useCallback(() => {
    Keyboard.dismiss();
    stopPlayers();
    setSourceText('');
    resetTranslation();
  }, [resetTranslation, stopPlayers]);

  const resolveOutputVoice = useCallback(
    (voiceOverride?: string) => {
      const langCode = languageNameToCode(targetLang) || targetLang || 'en';
      return (
        voiceOverride ||
        resolvePlaybackVoice('output', langCode, targetLanguageVoices[langCode.toLowerCase()])
      );
    },
    [resolvePlaybackVoice, targetLanguageVoices, targetLang]
  );

  const sanitizeVoices = useCallback((voices: string[]) => {
    const seen = new Set<string>();
    return voices.reduce<string[]>((acc, item) => {
      const normalized = item?.trim();
      if (!normalized || normalized.toLowerCase() === 'auto' || seen.has(normalized)) return acc;
      seen.add(normalized);
      acc.push(normalized);
      return acc;
    }, []);
  }, []);

  const getOutputVoiceList = useCallback(() => {
    const langCode = languageNameToCode(targetLang) || targetLang || 'en';
    const languageVoices = sanitizeVoices(getVoicesForLanguage(langCode));
    if (languageVoices.length === 0) return [];
    if (voiceSelectionMode === 'favorites') return sanitizeVoices(favoriteVoices);
    if (voiceSelectionMode === 'celebrity') return sanitizeVoices(favoriteCelebrityVoices);
    return languageVoices;
  }, [
    favoriteCelebrityVoices,
    favoriteVoices,
    getVoicesForLanguage,
    sanitizeVoices,
    targetLang,
    voiceSelectionMode,
  ]);

  const handleTranslate = useCallback(async () => {
    Keyboard.dismiss();
    if (recorderControls.isTranscribing || translateMutation.isPending) return;

    runWithConsent(() => {
      void (async () => {
        let input = sourceText.trim();
        if (!input) return;
        
        translationEpochRef.current += 1;
        
        translateMutation.mutate({
          sourceLang,
          targetLang,
          text: input,
          translationModel: models.translationModel,
          provider: selectedTranslationProvider,
          translationEpoch: translationEpochRef.current,
        });
      })();
    });
  }, [
    models.translationModel,
    runWithConsent,
    selectedTranslationProvider,
    sourceLang,
    sourceText,
    recorderControls.isTranscribing,
    targetLang,
    translateMutation,
  ]);

  const handleToggleThinking = useCallback(() => {
    if (
      (!hasThinking(models.translationModel) &&
        !Boolean(activeThinkingContent)) ||
      translateMutation.isPending ||
      thinkingMutation.isPending
    ) {
      return;
    }

    const targetText = (mainContent || translated).trim();
    if (!targetText) return;

    if (activeThinkingContent) {
      setThinkingExpanded((current) => !current);
      return;
    }

    const sourceForThinking = (lastTranslatedSourceText || sourceText).trim();
    if (!sourceForThinking) return;

    runWithConsent(() => {
      thinkingMutation.mutate({
        sourceText: sourceForThinking,
        targetText,
        sourceLang,
        targetLang,
        llmModel: models.translationModel,
        detectedLanguage: detectedSourceLang,
        translationId: currentTranslationId,
        translationEpoch: translationEpochRef.current,
      });
    });
  }, [
    activeThinkingContent,
    currentTranslationId,
    detectedSourceLang,
    lastTranslatedSourceText,
    mainContent,
    models.translationModel,
    runWithConsent,
    sourceLang,
    sourceText,
    targetLang,
    thinkingMutation,
    translateMutation.isPending,
    translated,
  ]);

  const copySource = useCallback(async () => {
    if (!sourceText.trim()) return;
    await Clipboard.setStringAsync(sourceText);
    toast.showSuccess('Copied', 'Source text copied.');
  }, [sourceText, toast]);

  const copyTranslation = useCallback(async () => {
    const output = (mainContent || translated).trim();
    if (!output) return;
    await Clipboard.setStringAsync(output);
    toast.showSuccess('Copied', 'Translation copied.');
  }, [mainContent, toast, translated]);

  const handleInputTTS = useCallback(() => {
    const input = sourceText.trim();
    if (!input) return;
    const spokenLanguage = resolveSourceSpokenLanguage(
      sourceLang,
      detectedSourceLang,
      sourceLanguageNames
    );
    if (!spokenLanguage) return;
    const sourceCode = languageNameToCode(spokenLanguage) || spokenLanguage;
    const inputVoice = resolvePlaybackVoice('input', sourceCode);
    if (!inputVoice) return;
    if (activeTtsPanel === 'source' && activeTtsLabel === cleanLabel(input)) {
      stopPlayers();
      return;
    }
    runWithConsent(() => {
      startTts({
        panel: 'source',
        text: input,
        language: spokenLanguage,
        voice: inputVoice,
        model: models.ttsModel,
        provider: selectedTtsProvider,
      });
    });
  }, [
    activeTtsLabel,
    activeTtsPanel,
    detectedSourceLang,
    models.ttsModel,
    resolvePlaybackVoice,
    runWithConsent,
    selectedTtsProvider,
    sourceLang,
    sourceLanguageNames,
    sourceText,
    startTts,
    stopPlayers,
  ]);

  const handleOutputTTS = useCallback(() => {
    const output = ((thinkingExpanded ? activeThinkingContent : mainContent) || translated).trim();
    if (!output) return;
    if (activeTtsPanel === 'output' && activeTtsLabel === cleanLabel(output)) {
      stopPlayers();
      return;
    }
    const targetVoice = resolveOutputVoice();
    if (!targetVoice) return;
    runWithConsent(() => {
      startTts({
        panel: 'output',
        text: output,
        language: targetLang,
        voice: targetVoice,
        model: models.ttsModel,
        provider: selectedTtsProvider,
      });
    });
  }, [
    activeTtsLabel,
    activeTtsPanel,
    mainContent,
    models.ttsModel,
    resolveOutputVoice,
    runWithConsent,
    selectedTtsProvider,
    startTts,
    stopPlayers,
    targetLang,
    activeThinkingContent,
    thinkingExpanded,
    translated,
  ]);

  const handleShareTranslation = useCallback(async () => {
    const output = (mainContent || translated).trim();
    if (!output) return;
    stopPlayers();
    const sourceLanguage =
      resolveSourceSpokenLanguage(sourceLang, detectedSourceLang, sourceLanguageNames) ||
      sourceLang;
    const message = buildTranslationShareMessage({
      sourceLanguage,
      targetLanguage: targetLang,
      sourceText,
      translatedText: output,
    });

    try {
      await Share.share({ message }, { dialogTitle: 'Share translation' });
    } catch (error) {
      toast.showError(
        'Share failed',
        error instanceof Error ? error.message : 'Could not share translation.'
      );
    }
  }, [
    detectedSourceLang,
    mainContent,
    sourceLang,
    sourceLanguageNames,
    sourceText,
    stopPlayers,
    targetLang,
    toast,
    translated,
  ]);

  const handleShareRecording = useCallback(async () => {
    const uri = recorderControls.lastRecordingUri;
    if (!uri) return;
    try {
      const shared = await shareAudioFromUri(uri, 'audio/m4a');
      if (!shared) {
        toast.showInfo('Sharing unavailable', 'Audio sharing is not supported on this device.');
      }
    } catch (error) {
      toast.showError(
        'Share failed',
        error instanceof Error ? error.message : 'Could not share the recording.'
      );
    }
  }, [recorderControls.lastRecordingUri, toast]);

  const handleDictionaryLookup = useCallback(() => {
    const word = sourceText.trim();
    if (!word) return;

    const dictionaryLanguage = dictionaryLanguages.includes(sourceLang)
      ? sourceLang
      : dictionaryLanguages.includes(targetLang)
        ? targetLang
        : dictionaryLanguages.includes('English')
          ? 'English'
          : (dictionaryLanguages[0] ?? 'English');

    Keyboard.dismiss();
    router.push({
      pathname: '/(dashboard)/dictionary',
      params: {
        dictionaryWord: word,
        dictionaryLang: dictionaryLanguage,
        dictionaryLookupId: Date.now().toString(),
      },
    } as any);
  }, [dictionaryLanguages, router, sourceLang, sourceText, targetLang]);

  const canSwap =
    !!sourceLang &&
    !!targetLang &&
    sourceLang !== targetLang &&
    !isAutoDetectLanguage(sourceLang) &&
    !isAutoDetectLanguage(targetLang);

  const swapTranslationLanguages = useCallback(() => {
    if (!canSwap || !translated.trim()) return;
    const nextSourceLang = targetLang;
    const nextTargetLang = sourceLang;
    const cleanTranslated = parseTranslation(translated).mainContent || translated;

    skipLanguagePersistRef.current = true;
    setSourceLang(nextSourceLang);
    setTargetLang(nextTargetLang);

    if (!swapHistory) {
      setSwapHistory({
        originalInput: sourceText,
        originalRawTranslation: translated,
        originalThinkingProcess: activeThinkingContent,
      });
      setSourceText(cleanTranslated.trim());
      setTranslated(sourceText);
      setLastTranslatedSourceText(cleanTranslated.trim());
    } else {
      setSourceText(swapHistory.originalInput);
      setTranslated(swapHistory.originalRawTranslation);
      setThinkingProcess(swapHistory.originalThinkingProcess);
      setLastTranslatedSourceText(swapHistory.originalInput);
      setSwapHistory(null);
    }

    setTimeout(() => {
      skipLanguagePersistRef.current = false;
      updateLanguages({ sourceLang: nextSourceLang, targetLang: nextTargetLang });
    }, 0);
  }, [
    activeThinkingContent,
    canSwap,
    sourceLang,
    sourceText,
    swapHistory,
    targetLang,
    translated,
    updateLanguages,
  ]);

  const showClearButton =
    !!translated && !translateMutation.isPending && sourceText === lastTranslatedSourceText;

  const isValid = !!sourceLang && !!targetLang && sourceText.trim().length > 0;

  const outputVoices = getOutputVoiceList();
  const targetCode = languageNameToCode(targetLang) || targetLang || 'en';
  const sourceSpokenLanguage = resolveSourceSpokenLanguage(
    sourceLang,
    detectedSourceLang,
    sourceLanguageNames
  );
  const sourceCode = languageNameToCode(sourceSpokenLanguage) || sourceSpokenLanguage || '';
  const resolvedOutputVoice = resolveOutputVoice();
  const selectedOutputVoice = outputVoices.includes(resolvedOutputVoice)
    ? resolvedOutputVoice
    : (outputVoices[0] ?? '');
  const canSpeakOutput = !!mainContent?.trim() && !!resolvedOutputVoice;
  const canSpeakSource =
    !!sourceText.trim() && !!sourceSpokenLanguage && !!resolvePlaybackVoice('input', sourceCode);
  const sourceTtsLabel = cleanLabel(sourceText);
  const outputTtsText = ((thinkingExpanded ? activeThinkingContent : mainContent) || '').trim();
  const outputTtsLabel = cleanLabel(outputTtsText);
  const isSourceTtsLoading = ttsMutation.isPending && pendingTtsPanel === 'source';
  const isOutputTtsLoading = ttsMutation.isPending && pendingTtsPanel === 'output';
  const isSourceTtsPlaying = activeTtsPanel === 'source' && activeTtsLabel === sourceTtsLabel;
  const isOutputTtsPlaying = activeTtsPanel === 'output' && activeTtsLabel === outputTtsLabel;

  const handleSourceTextChange = useCallback(
    (value: string) => {
      setSourceText(value);
      if (translated && value !== lastTranslatedSourceText) {
        setSwapHistory(null);
        setDetectedSourceLang(null);
      }
    },
    [lastTranslatedSourceText, translated]
  );

  const handleOutputVoiceChange = useCallback(
    (nextVoice: string) => {
      if (voiceSelectionMode === 'auto') updateTargetLanguageVoice(targetCode, nextVoice);
      else updateVoice({ voice: nextVoice });
      const output = mainContent.trim();
      if (output) {
        runWithConsent(() => {
          startTts({
            panel: 'output',
            text: output,
            language: targetLang,
            voice: nextVoice,
            model: models.ttsModel,
            provider: selectedTtsProvider,
          });
        });
      }
    },
    [
      mainContent,
      models.ttsModel,
      runWithConsent,
      selectedTtsProvider,
      startTts,
      targetCode,
      targetLang,
      updateTargetLanguageVoice,
      updateVoice,
      voiceSelectionMode,
    ]
  );

  return (
    <Body
      showBackground={false}
     
      enableScroll={false}
      hideBottomInset={process.env.EXPO_OS !== 'ios'}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            padding: 0,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            overflow: 'hidden',
            backgroundColor: background,
            zIndex: 10,
          }}>
          <View style={styles.headerRow}>
            <GlassIconButton
              fallbackClassName="bg-white dark:bg-zinc-950"
              onPress={() =>
                router.push({
                  pathname: '/translate-history',
                  params: withReturnTo('/(dashboard)/translate'),
                } as any)
              }>
              <Clock3 size={20} color={text} />
            </GlassIconButton>
            <Text style={{ fontSize: 22, fontWeight: '600', color: text }}>Translate</Text>
            <GlassIconButton
              fallbackClassName="bg-white dark:bg-zinc-950"
              onPress={() =>
                router.push({
                  pathname: '/profile',
                  params: withReturnTo('/(dashboard)/translate'),
                } as any)
              }>
              <UserRound size={20} color={text} />
            </GlassIconButton>
          </View>

          <View style={styles.languageRow}>
            <LanguageSelector
              languages={SOURCE_LANGUAGES}
              value={sourceLang}
              onChange={(next) => {
                if (next === sourceLang) return;
                stopPlayers();
                resetTranslation();
                setSourceLang(next);
              }}
              title="Source language"
            />
            <TouchableOpacity
              onPress={swapTranslationLanguages}
              disabled={!canSwap}
              style={{ opacity: canSwap ? 1 : 0.4 }}>
              <View style={[styles.swapButton, { backgroundColor: `${card}80` }]}>
                <ArrowLeftRight size={16} color={text} />
              </View>
            </TouchableOpacity>
            <LanguageSelector
              languages={TARGET_LANGUAGES}
              value={targetLang}
              onChange={(next) => {
                if (next === targetLang) return;
                stopPlayers();
                resetTranslation();
                setTargetLang(next);
                if (behavior.autoTranslateOnLanguageChangePage && !!sourceText.trim()) {
                  runWithConsent(() => {
                    translateMutation.mutate({
                      sourceLang,
                      targetLang: next,
                      text: sourceText.trim(),
                      translationModel: models.translationModel,
                      provider: selectedTranslationProvider,
                      translationEpoch: translationEpochRef.current,
                    });
                  });
                }
              }}
              title="Target language"
            />
          </View>
        </View>

        <View style={styles.panelArea}>
          <View style={styles.panelSlot}>
            <SourcePanel
              card={card}
              border={border}
              text={text}
              sourceText={sourceText}
              recorderControls={recorderControls}
              isSourceTtsLoading={isSourceTtsLoading}
              isSourceTtsPlaying={isSourceTtsPlaying}
              canSpeakSource={canSpeakSource}
              onSourceTextChange={handleSourceTextChange}
              onInputTTS={handleInputTTS}
              onCopySource={copySource}
              onShareRecording={handleShareRecording}
            />
          </View>
          <View style={styles.panelSlot}>
            <ResultPanel
              card={card}
              text={text}
              primary={primary}
              border={border}
              thinkingExpanded={thinkingExpanded}
              thinkingContent={activeThinkingContent}
              isThinkingLoading={thinkingMutation.isPending}
              canUseThinking={
                hasThinking(models.translationModel) &&
                !!(mainContent || translated).trim()
              }
              mainContent={mainContent}
              outputVoices={outputVoices}
              selectedOutputVoice={selectedOutputVoice}
              isOutputTtsLoading={isOutputTtsLoading}
              isOutputTtsPlaying={isOutputTtsPlaying}
              canSpeakOutput={canSpeakOutput}
              canOpenDictionary={!!sourceText.trim()}
              onToggleThinking={handleToggleThinking}
              onDictionaryLookup={handleDictionaryLookup}
              onOutputVoiceChange={handleOutputVoiceChange}
              onOutputTTS={handleOutputTTS}
              onCopyTranslation={copyTranslation}
              onShareTranslation={handleShareTranslation}
            />
          </View>
        </View>

        <TranslateFooter
          background={background}
          primary={primary}
          text={text}
          isValid={isValid}
          isClearMode={showClearButton}
          isTranslating={translateMutation.isPending}
          isTranscribing={recorderControls.isTranscribing}
          onPress={showClearButton ? clear : handleTranslate}
        />
      </View>
    </Body>
  );
};

export default Entry;
