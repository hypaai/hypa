import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, SearchX } from 'lucide-react-native';

import Body from '@/components/shared/body';
import { TopBar } from '@/components/shared/top-bar';
import { useDictionaryModelLanguages } from '@/hooks/use-dictionary-model-languages';
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { adaptDictionaryResult } from '@/lib/dictionary';
import { useDictionarySearch } from '@/providers/dictionary-search-provider';
import { GlobeView } from '@/components/modules/dictionary/globe-view';
import { SearchBar } from '@/components/modules/dictionary/search-bar';
import WordOfTheDay from '@/components/modules/dictionary/word-of-the-day';
import { WordResultCard } from '@/components/modules/dictionary/word-result-card';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.72;

const firstParamValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default function DictionaryIndex() {
  const router = useRouter();
  const { dictionaryWord, dictionaryLang, dictionaryLookupId } = useLocalSearchParams<{
    dictionaryWord?: string | string[];
    dictionaryLang?: string | string[];
    dictionaryLookupId?: string | string[];
  }>();
  const isDark = useColorScheme() === 'dark';
  const { searchResult, searchError, isSearching, isSearchError, search, resetSearch } =
    useDictionarySearch();
  const { settings, updateSettings } = useKeyboardSettings();
  const dictionaryModelLanguages = useDictionaryModelLanguages();
  const didHydrateLanguageRef = useRef(false);
  const lastRouteLookupRef = useRef('');

  const colors = useMemo(
    () => ({
      bg: isDark ? '#09090b' : '#ffffff',
      card: isDark ? '#09090b' : '#ffffff',
      border: isDark ? '#27272a' : '#e4e4e7',
      muted: isDark ? '#a1a1aa' : '#71717a',
      primary: isDark ? '#f4f4f5' : '#111111',
    }),
    [isDark]
  );

  const resolvedDictionaryLanguage = useMemo(() => {
    const rawDictionaryLanguage = settings?.dictionaryLanguage ?? 'English';

    return dictionaryModelLanguages.includes(rawDictionaryLanguage)
      ? rawDictionaryLanguage
      : dictionaryModelLanguages.includes('English')
        ? 'English'
        : (dictionaryModelLanguages[0] ?? 'English');
  }, [dictionaryModelLanguages, settings?.dictionaryLanguage]);

  const [searchInput, setSearchInput] = useState('');
  const [language, setLanguage] = useState(resolvedDictionaryLanguage);
  const [activeWord, setActiveWord] = useState('');
  const [activeLang, setActiveLang] = useState(resolvedDictionaryLanguage);
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (!settings) return;

    if (!didHydrateLanguageRef.current) {
      setLanguage(resolvedDictionaryLanguage);
      setActiveLang(resolvedDictionaryLanguage);
      didHydrateLanguageRef.current = true;
      return;
    }

    if (!dictionaryModelLanguages.includes(language)) {
      setLanguage(resolvedDictionaryLanguage);
    }

    if (!dictionaryModelLanguages.includes(activeLang)) {
      setActiveLang(resolvedDictionaryLanguage);
    }
  }, [activeLang, dictionaryModelLanguages, language, resolvedDictionaryLanguage, settings]);

  const result =
    searchResult && activeLang ? adaptDictionaryResult(searchResult, activeLang) : null;

  const hasResultContent =
    !!result &&
    (result.definitions.length > 0 ||
      (result.usageExamples?.length ?? 0) > 0 ||
      (result.synonyms?.length ?? 0) > 0 ||
      (result.antonyms?.length ?? 0) > 0 ||
      !!result.funFact ||
      !!result.culturalContext);

  const dictionaryPayload = useMemo(
    () => ({
      provider: settings?.dictionaryProvider,
      model_name: settings?.dictionaryModel,
      seeMore: true,
      output_length: 1400,
      temperature: 0.3,
      top_p: 0.95,
      top_k: 0,
    }),
    [settings?.dictionaryModel, settings?.dictionaryProvider]
  );

  const persistLanguage = useCallback(
    (lang: string) => {
      setLanguage(lang);
      void updateSettings((current) =>
        current.dictionaryLanguage === lang ? current : { ...current, dictionaryLanguage: lang }
      );
    },
    [updateSettings]
  );

  const runSearch = useCallback(
    (word: string, lang: string) => {
      resetSearch();
      search({
        word,
        language: lang,
        ...dictionaryPayload,
      });
    },
    [dictionaryPayload, resetSearch, search]
  );

  const applyLanguage = useCallback(
    (lang: string) => {
      const changed = language.toLowerCase() !== lang.toLowerCase();

      persistLanguage(lang);
      if (!changed || !settings?.autoLookupOnLanguageChangePage || !sheetOpen) return;

      const trimmed = activeWord.trim();
      if (!trimmed) return;

      setActiveLang(lang);
      runSearch(trimmed, lang);
    },
    [activeWord, language, persistLanguage, runSearch, settings, sheetOpen]
  );

  const performSearch = useCallback(
    (word: string, lang: string) => {
      const trimmed = word.trim();
      if (!trimmed) return;

      setSheetOpen(true);
      setActiveWord(trimmed);
      setActiveLang(lang);
      setSearchInput(trimmed);
      persistLanguage(lang);
      runSearch(trimmed, lang);
    },
    [persistLanguage, runSearch]
  );

  const handleSearch = useCallback(
    (word: string, lang: string) => {
      Keyboard.dismiss();
      performSearch(word, lang);
    },
    [performSearch]
  );

  const handleCloseSheet = useCallback(() => {
    Keyboard.dismiss();
    setSheetOpen(false);
    resetSearch();
  }, [resetSearch]);

  useEffect(() => {
    const word = firstParamValue(dictionaryWord)?.trim();
    if (!word) return;

    const requestedLanguage = firstParamValue(dictionaryLang)?.trim();
    const languageToSearch =
      requestedLanguage && dictionaryModelLanguages.includes(requestedLanguage)
        ? requestedLanguage
        : resolvedDictionaryLanguage;
    const lookupId = firstParamValue(dictionaryLookupId) ?? word;
    const lookupKey = `${lookupId}:${word}:${languageToSearch}`;

    if (lastRouteLookupRef.current === lookupKey) return;
    lastRouteLookupRef.current = lookupKey;
    performSearch(word, languageToSearch);
  }, [
    dictionaryLang,
    dictionaryLookupId,
    dictionaryModelLanguages,
    dictionaryWord,
    performSearch,
    resolvedDictionaryLanguage,
  ]);

  const handleSeeMore = useCallback(() => {
    if (!result) return;
    setSheetOpen(false);
    router.push({
      pathname: '/word/[word]',
      params: { word: result.word, lang: activeLang },
    });
  }, [activeLang, result, router]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setSheetOpen(false);
      };
    }, [])
  );

  return (
    <Body
      showBackground={false}
     
      enableScroll={false}
      hideBottomInset={process.env.EXPO_OS !== 'ios'}>
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <TopBar title="Dictionary" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <GlobeView size={340} />
            </View>

            <WordOfTheDay />

            <View style={{ height: 40 }} />
          </ScrollView>

          <View
            style={[
              styles.searchWrap,
              { borderTopColor: colors.border, backgroundColor: colors.bg },
            ]}>
            <SearchBar
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmit={handleSearch}
              language={language}
              languagePickerDisabled={isSearching}
              onLanguageChange={applyLanguage}
            />
          </View>
        </KeyboardAvoidingView>
      </View>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={handleCloseSheet}
        statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={handleCloseSheet}>
          <View />
        </Pressable>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.sheetHeader}>
            <View style={[styles.dragBar, { backgroundColor: colors.muted }]} />
          </View>

          <View style={styles.sheetSearchWrap}>
            <SearchBar
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmit={handleSearch}
              language={language}
              languagePickerDisabled={isSearching}
              onLanguageChange={applyLanguage}
            />
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {isSearching && (
              <View style={styles.centerState}>
                <Spinner
                  variant="dots"
                  size="lg"
                  color={colors.primary}
                  label={`Looking up "${activeWord}" in ${activeLang}...`}
                  showLabel
                />
              </View>
            )}

            {isSearchError && !isSearching && (
              <View style={styles.centerState}>
                <SearchX size={40} color={colors.muted} />
                <Text variant="muted" style={{ marginTop: 4, color: colors.muted }}>
                  {searchError ?? 'Something went wrong'}
                </Text>
              </View>
            )}

            {result && !isSearching && hasResultContent && <WordResultCard data={result} />}

            {result && !isSearching && !hasResultContent && (
              <View style={styles.centerState}>
                <SearchX size={40} color={colors.muted} />
                <Text variant="muted" style={{ marginTop: 4, color: colors.muted }}>
                  We found the word, but this model returned no dictionary details.
                </Text>
              </View>
            )}
          </ScrollView>

          {result && !isSearching && (
            <View style={[styles.sheetFooter, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={[styles.seeMoreBtn, { backgroundColor: colors.primary }]}
                onPress={handleSeeMore}
                activeOpacity={0.8}>
                <Text style={[styles.seeMoreText, { color: colors.bg }]}>See More</Text>
                <ArrowRight size={16} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </Body>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  searchWrap: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  dragBar: {
    width: 44,
    height: 5,
    borderRadius: 999,
    opacity: 0.4,
  },
  sheetSearchWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  sheetFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  seeMoreBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  seeMoreText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
