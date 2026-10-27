import React from 'react';
import { ActivityIndicator, Alert, ScrollView, TouchableOpacity, View } from 'react-native';
import { Bookmark, RefreshCw, SearchX } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';

import Body from '@/components/shared/body';
import { Text } from '@/components/ui/text';
import { DictionaryDetailFooter } from '@/components/modules/dictionary/detail-footer';
import { dictionary } from '@/api/dictionary';
import { FONTS } from '@/constants/fonts';
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings';
import { adaptDictionaryResult } from '@/lib/dictionary';
import type { WordResult } from '@/lib/product-api';
import { getDictionaryResult, setDictionaryResult } from '@/lib/product-cache';
import { useThemeColors } from '@/hooks/use-theme-color';
import { goBackOrReturnTo } from '@/lib/navigation';
import { BackButton } from '@/components/shared/back-button';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <Text className="text-[13px] uppercase tracking-[1.4px] text-zinc-400 dark:text-zinc-500" style={{ fontFamily: FONTS.main.medium }}>
        {title}
      </Text>
      <View className="mt-3">{children}</View>
    </View>
  );
}

const DictionaryMore = () => {
  const { word = '', language = 'English', returnTo } = useLocalSearchParams<{
    word?: string;
    language?: string;
    returnTo?: string;
  }>();
  const { settings } = useKeyboardSettings();
  const colors = useThemeColors();
  const [result, setResult] = React.useState<WordResult | null>(() => getDictionaryResult(word, language));
  const [loading, setLoading] = React.useState(!result);

  const load = React.useCallback(async () => {
    if (!word.trim()) return;
    if (!settings?.aiDataSharingConsent) {
      setLoading(false);
      Alert.alert('Allow AI data processing', 'Enable AI data processing in Settings before loading dictionary details.');
      return;
    }

    setLoading(true);
    try {
      const response = await dictionary.search({
        word,
        language,
        provider: settings?.dictionaryProvider,
        model_name: settings?.dictionaryModel,
        cultural_context: true,
        fun_facts: true,
      });
      const adapted = adaptDictionaryResult(response.data, language);
      const next: WordResult = {
        word: adapted.word,
        phonetic: adapted.phonetic,
        partOfSpeech: adapted.partOfSpeech,
        language: adapted.language ?? language,
        definitions: adapted.definitions,
        usageExamples:
          adapted.usageExamples?.map((item) => ({
            partOfSpeech: item.partOfSpeech ?? '',
            example: item.example,
          })) ?? [],
        synonyms: adapted.synonyms,
        antonyms: adapted.antonyms,
        exampleSentences: adapted.exampleSentences ?? [],
        translations: {},
        culturalContext: adapted.culturalContext,
        funFact: adapted.funFact,
        sectionHeaders: adapted.sectionHeaders,
      };
      setResult(next);
      setDictionaryResult(next, language);
    } catch (error) {
      Alert.alert('Lookup failed', error instanceof Error ? error.message : 'Unable to load this word.');
    } finally {
      setLoading(false);
    }
  }, [
    language,
    settings?.aiDataSharingConsent,
    settings?.dictionaryModel,
    settings?.dictionaryProvider,
    word,
  ]);

  React.useEffect(() => {
    if (!result) {
      void load();
    }
  }, [load, result]);

  const definitions = result?.definitions ?? [];
  const usageExamples = result?.usageExamples ?? [];
  const translations = Object.entries(result?.translations ?? {});

  return (
    <Body showBackground={false}>
      <View className="flex-1 px-1 pt-4">
        <View className="mb-5 flex-row items-center justify-between">
          <BackButton onPress={() => goBackOrReturnTo(returnTo, '/(dashboard)/dictionary')} />
          <Text className="text-[20px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
            See More
          </Text>
          <TouchableOpacity className="rounded-full bg-zinc-100 p-2 dark:bg-zinc-900" onPress={() => void load()}>
            <RefreshCw size={18} color={colors.icon} />
          </TouchableOpacity>
        </View>

        {loading && !result ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.spinner} />
            <Text className="mt-3 text-zinc-500 dark:text-zinc-400" style={{ fontFamily: FONTS.main.regular }}>
              Loading "{word}"...
            </Text>
          </View>
        ) : !result ? (
          <View className="flex-1 items-center justify-center">
            <SearchX size={36} color="#A1A1AA" />
            <Text className="mt-3 text-zinc-500 dark:text-zinc-400" style={{ fontFamily: FONTS.main.regular }}>
              Word not found.
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
            <View className="rounded-3xl bg-zinc-950 p-5 dark:bg-zinc-50">
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                  <Text className="text-[34px] text-white dark:text-zinc-950" style={{ fontFamily: FONTS.alt.semibold }}>
                    {result.word}
                  </Text>
                  <Text className="mt-1 text-[15px] text-zinc-400 dark:text-zinc-500" style={{ fontFamily: FONTS.main.regular }}>
                    {[result.language, result.partOfSpeech, result.phonetic].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View className="rounded-full bg-white/10 p-3 dark:bg-zinc-900/10">
                  <Bookmark size={20} color={colors.primaryForeground} />
                </View>
              </View>
            </View>

            <Section title="Definitions">
              <View className="gap-3">
                {definitions.map((definition, index) => (
                  <View key={`${definition.text}-${index}`} className="rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-900">
                    <Text className="text-[15px] leading-6 text-zinc-700 dark:text-zinc-300" style={{ fontFamily: FONTS.main.regular }}>
                      {definition.text}
                    </Text>
                    {definition.partOfSpeech ? (
                      <Text className="mt-2 text-[12px] uppercase tracking-[1px] text-zinc-400" style={{ fontFamily: FONTS.main.medium }}>
                        {definition.partOfSpeech}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </Section>

            {usageExamples.length ? (
              <Section title="Usage">
                <View className="gap-3">
                  {usageExamples.map((example, index) => (
                    <Text key={`${example.example}-${index}`} className="text-[15px] leading-6 text-zinc-600 dark:text-zinc-300" style={{ fontFamily: FONTS.main.regular }}>
                      {example.example}
                    </Text>
                  ))}
                </View>
              </Section>
            ) : null}

            {result.exampleSentences?.length ? (
              <Section title="Example Sentences">
                <View className="gap-3">
                  {result.exampleSentences.map((sentence, index) => (
                    <Text key={`${sentence}-${index}`} className="text-[15px] leading-6 text-zinc-600 dark:text-zinc-300" style={{ fontFamily: FONTS.main.regular }}>
                      {sentence}
                    </Text>
                  ))}
                </View>
              </Section>
            ) : null}

            {result.synonyms?.length || result.antonyms?.length ? (
              <Section title="Related Words">
                <View className="gap-4">
                  {result.synonyms?.length ? (
                    <View>
                      <Text className="mb-2 text-[14px] text-zinc-500" style={{ fontFamily: FONTS.main.medium }}>
                        Synonyms
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {result.synonyms.map((item) => (
                          <View key={item} className="rounded-full bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
                            <Text className="text-[13px] text-zinc-700 dark:text-zinc-300" style={{ fontFamily: FONTS.main.medium }}>
                              {item}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {result.antonyms?.length ? (
                    <View>
                      <Text className="mb-2 text-[14px] text-zinc-500" style={{ fontFamily: FONTS.main.medium }}>
                        Antonyms
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {result.antonyms.map((item) => (
                          <View key={item} className="rounded-full bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
                            <Text className="text-[13px] text-zinc-700 dark:text-zinc-300" style={{ fontFamily: FONTS.main.medium }}>
                              {item}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              </Section>
            ) : null}

            {translations.length ? (
              <Section title="Translations">
                <View className="gap-2">
                  {translations.map(([key, value]) => (
                    <View key={key} className="flex-row items-center justify-between rounded-2xl bg-zinc-100 p-3 dark:bg-zinc-900">
                      <Text className="text-[14px] capitalize text-zinc-500" style={{ fontFamily: FONTS.main.medium }}>
                        {key}
                      </Text>
                      <Text className="text-[15px] text-zinc-950 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}

            {result.culturalContext ? (
              <Section title="Cultural Context">
                <Text className="text-[15px] leading-6 text-zinc-600 dark:text-zinc-300" style={{ fontFamily: FONTS.main.regular }}>
                  {result.culturalContext}
                </Text>
              </Section>
            ) : null}

            {result.funFact ? (
              <Section title="Fun Fact">
                <Text className="text-[15px] leading-6 text-zinc-600 dark:text-zinc-300" style={{ fontFamily: FONTS.main.regular }}>
                  {result.funFact}
                </Text>
              </Section>
            ) : null}

            <DictionaryDetailFooter />
          </ScrollView>
        )}
      </View>
    </Body>
  );
};

export default DictionaryMore;
