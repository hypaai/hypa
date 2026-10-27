import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { BookOpen, SearchX } from 'lucide-react-native';

import Body from '@/components/shared/body';
import { TopBar } from '@/components/shared/top-bar';
import { SearchBar } from '@/components/modules/dictionary/search-bar';
import { WordResultCard } from '@/components/modules/dictionary/word-result-card';
import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { useDictionaryModelLanguages } from '@/hooks/use-dictionary-model-languages';
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings';
import { useThemeColors } from '@/hooks/use-theme-color';
import { adaptDictionaryResult } from '@/lib/dictionary';
import { useDictionarySearch } from '@/providers/dictionary-search-provider';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ word?: string; lang?: string }>();
  const { searchResult, searchError, isSearching, isSearchError, search } = useDictionarySearch();
  const { settings, updateSettings } = useKeyboardSettings();
  const colors = useThemeColors();

  const languages = useDictionaryModelLanguages();
  const fallbackLanguage = languages.includes('English') ? 'English' : languages[0];
  const resolvedDictionaryLanguage = useMemo(() => {
    const raw = settings?.dictionaryLanguage ?? fallbackLanguage;
    return languages.includes(raw) ? raw : fallbackLanguage;
  }, [fallbackLanguage, languages, settings?.dictionaryLanguage]);

  const initialLanguage =
    params.lang && languages.includes(params.lang) ? params.lang : resolvedDictionaryLanguage;

  const [searchInput, setSearchInput] = useState(params.word ?? '');
  const [language, setLanguage] = useState(initialLanguage);
  const [activeWord, setActiveWord] = useState(params.word ?? '');
  const [activeLang, setActiveLang] = useState(initialLanguage);

  const result =
    searchResult && activeLang ? adaptDictionaryResult(searchResult, activeLang) : null;

  const applyLanguage = useCallback(
    (lang: string) => {
      setLanguage(lang);
      void updateSettings((current) =>
        current.dictionaryLanguage === lang ? current : { ...current, dictionaryLanguage: lang }
      );
    },
    [updateSettings]
  );

  useEffect(() => {
    if (!params.word) return;
    const nextLanguage =
      params.lang && languages.includes(params.lang) ? params.lang : resolvedDictionaryLanguage;

    setSearchInput(params.word);
    setLanguage(nextLanguage);
    setActiveWord(params.word);
    setActiveLang(nextLanguage);
  }, [languages, params.lang, params.word, resolvedDictionaryLanguage]);

  useEffect(() => {
    if (params.lang || params.word) return;
    setLanguage(resolvedDictionaryLanguage);
    setActiveLang(resolvedDictionaryLanguage);
  }, [params.lang, params.word, resolvedDictionaryLanguage]);

  const runSearch = useCallback(
    (word: string, lang: string) => {
      const trimmed = word.trim();
      if (!trimmed) return;

      setActiveWord(trimmed);
      setActiveLang(lang);
      setSearchInput(trimmed);
      applyLanguage(lang);
      search({
        word: trimmed,
        language: lang,
      });
    },
    [applyLanguage, search]
  );

  useEffect(() => {
    if (activeWord.trim()) {
      runSearch(activeWord, activeLang);
    }
  }, [activeLang, activeWord, runSearch]);

  const handleSearch = useCallback(
    (word: string, lang: string) => {
      Keyboard.dismiss();
      runSearch(word, lang);
    },
    [runSearch]
  );

  const hasContent = result || isSearching || isSearchError;

  return (
    <Body showBackground={false} enableScroll={false} hideBottomInset>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <TopBar title="Hypa Dictionary" showBack />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={90}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              !hasContent && styles.scrollContentCentered,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {!hasContent && (
              <View style={styles.emptyState}>
                <Icon as={BookOpen} className="size-12 text-zinc-500" />
                <Text style={styles.emptyTitle}>Search a word</Text>
                <Text style={styles.emptySubtitle}>
                  Look up definitions, translations, and more{'\n'}in any language.
                </Text>
              </View>
            )}

            {isSearching && (
              <View style={styles.centerState}>
                <Spinner
                  variant="dots"
                  size="lg"
                  color="#111111"
                  label={`Looking up "${searchInput}" in ${language}...`}
                  showLabel
                />
              </View>
            )}

            {isSearchError && !isSearching && (
              <View style={styles.centerState}>
                <Icon as={SearchX} className="size-10 text-zinc-500" />
                <Text style={styles.stateText}>{searchError ?? 'Something went wrong'}</Text>
              </View>
            )}

            {result && !isSearching && (
              <View style={styles.resultContainer}>
                <WordResultCard data={result} />
              </View>
            )}
          </ScrollView>

          <View style={styles.bottomBar}>
            <SearchBar
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmit={handleSearch}
              language={language}
              languagePickerDisabled={isSearching}
              onLanguageChange={applyLanguage}
            />
            <Text style={styles.hint}>Tap search or press return</Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Body>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  scrollContentCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  stateText: { marginTop: 4, textAlign: 'center' },
  resultContainer: { paddingTop: 8, width: '100%' },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  hint: {
    textAlign: 'center',
    fontSize: 11,
    opacity: 0.5,
    marginTop: 6,
    letterSpacing: 0.5,
  },
});
