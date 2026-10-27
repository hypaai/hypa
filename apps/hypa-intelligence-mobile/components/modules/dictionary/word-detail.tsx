import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  Square,
  Volume2,
  SearchX,
  Languages,
} from 'lucide-react-native';

import { useDictionaryBookmarks } from '@/hooks/use-dictionary-bookmarks';
import { useDictionaryModelLanguages } from '@/hooks/use-dictionary-model-languages';
import { useDictionarySynthesize } from '@/hooks/use-dictionary-synthesize';
import { useDictionaryTranslateWord } from '@/hooks/use-dictionary-translate-word';
import {
  buildDictionaryResultSpeech,
  buildSectionSpeech,
  buildWordOnlySpeech,
  joinLabeledItems,
} from '@/lib/dictionary-speech';
import { DictionaryDetailFooter } from '@/components/modules/dictionary/detail-footer';
import { BACK_BUTTON_SIZE, BackButton } from '@/components/shared/back-button';

type Def = { text: string; partOfSpeech?: string; context?: string };

type WordResult = {
  word: string;
  language?: string;
  phonetic?: string;
  partOfSpeech?: string;
  definitions: Def[];
  usageExamples?: { partOfSpeech?: string; example: string }[];
  exampleSentences?: string[];
  synonyms: string[];
  antonyms: string[];
  funFact?: string;
  culturalContext?: string;
  sectionHeaders?: Record<string, string>;
};

export default function WordDetail({
  data,
  onBack,
  isDetailsLoading = false,
}: {
  data: WordResult;
  onBack?: () => void;
  isDetailsLoading?: boolean;
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const c = {
    bg: isDark ? '#000' : '#fff',
    fg: isDark ? '#f3f4f6' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#2b2b2b' : '#e6e6e6',
    card: isDark ? '#071126' : '#fff',
    primary: isDark ? '#2563eb' : '#2563eb',
    primaryFg: '#fff',
    accent: isDark ? '#111827' : '#eef2ff',
  };
  const invertedBg = c.fg;
  const invertedFg = c.bg;
  const invertedMuted = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.72)';
  const invertedSoft = isDark ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.18)';
  const invertedSofter = isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.24)';
  const language = data.language ?? 'English';

  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [translateLang, setTranslateLang] = useState<string | null>(null);
  const modelLanguages = useDictionaryModelLanguages();
  const { isBookmarked, toggleBookmark } = useDictionaryBookmarks();
  const wordOnlyTts = useDictionarySynthesize();
  const wordTts = useDictionarySynthesize();
  const definitionsTts = useDictionarySynthesize();
  const usageTts = useDictionarySynthesize();
  const sentencesTts = useDictionarySynthesize();
  const synonymsTts = useDictionarySynthesize();
  const antonymsTts = useDictionarySynthesize();
  const funFactTts = useDictionarySynthesize();
  const contextTts = useDictionarySynthesize();
  const {
    translations,
    isLoading: isTranslating,
    refetch: refetchTranslation,
  } = useDictionaryTranslateWord(data.word, language, !!translateLang, translateLang ?? undefined);

  if (!data) {
    return (
      <View style={styles.centered}>
        <SearchX size={32} color={c.muted} />
        <Text style={{ color: c.muted, marginTop: 8 }}>Word not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <BackButton onPress={onBack} />
        <Text style={[styles.headerTitle, { color: c.fg }]}>Word Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.breadcrumb, { color: c.muted }]}>
          Languages / {data.language ?? 'English'} /{' '}
          <Text style={[styles.breadcrumbWord, { color: c.fg }]}>{data.word}</Text>
        </Text>

        <View style={styles.wordHeader}>
          <View style={styles.langRow}>
            <View style={[styles.langBadge, { borderColor: c.border }]}>
              <Text style={[styles.langBadgeText, { color: c.muted }]}>
                {data.language ?? 'English'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                wordOnlyTts.isPlaying
                  ? wordOnlyTts.stop()
                  : wordOnlyTts.synthesize(buildWordOnlySpeech(data.word), language)
              }
              style={styles.wordOnlyBtn}
              activeOpacity={0.7}
              disabled={wordOnlyTts.isLoading}>
              {wordOnlyTts.isLoading ? (
                <ActivityIndicator size="small" color={c.muted} />
              ) : wordOnlyTts.isPlaying ? (
                <Square size={18} color={c.fg} fill={c.fg} />
              ) : (
                <Volume2 size={20} color={c.muted} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.wordRow}>
            <Text style={[styles.wordTitle, { color: c.fg }]}>{data.word}</Text>
            <TouchableOpacity
              onPress={() =>
                void toggleBookmark({
                  word: data.word,
                  language,
                  result: data,
                })
              }
              style={styles.bookmarkBtn}
              activeOpacity={0.7}>
              <Bookmark
                size={22}
                color={isBookmarked(data.word, language) ? c.fg : c.muted}
                fill={isBookmarked(data.word, language) ? c.fg : 'transparent'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                wordTts.isPlaying
                  ? wordTts.stop()
                  : wordTts.synthesize(buildDictionaryResultSpeech(data), language)
              }
              style={styles.bookmarkBtn}
              activeOpacity={0.7}
              disabled={wordTts.isLoading}>
              {wordTts.isLoading ? (
                <ActivityIndicator size="small" color={c.muted} />
              ) : wordTts.isPlaying ? (
                <Square size={18} color={c.fg} fill={c.fg} />
              ) : (
                <Volume2 size={22} color={c.muted} />
              )}
            </TouchableOpacity>
          </View>

          {(data.phonetic || data.partOfSpeech) && (
            <Text style={[styles.phonetic, { color: c.muted }]}>
              {data.phonetic}
              {data.phonetic && data.partOfSpeech ? ' · ' : ''}
              {data.partOfSpeech}
            </Text>
          )}
        </View>

        <View style={[styles.section, { borderTopColor: c.border }]}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: c.muted }]}>
              {(data.sectionHeaders?.definition ?? 'DEFINITION').toUpperCase()}
            </Text>
            <TouchableOpacity
              onPress={() =>
                definitionsTts.isPlaying
                  ? definitionsTts.stop()
                  : definitionsTts.synthesize(
                      buildSectionSpeech('Definition', joinLabeledItems(data.definitions)),
                      language
                    )
              }
              hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              activeOpacity={0.7}
              disabled={definitionsTts.isLoading}>
              {definitionsTts.isLoading ? (
                <ActivityIndicator size="small" color={c.muted} />
              ) : definitionsTts.isPlaying ? (
                <Square size={12} color={c.fg} fill={c.fg} />
              ) : (
                <Volume2 size={14} color={c.muted} />
              )}
            </TouchableOpacity>
          </View>
          {data.definitions.map((def, i) => (
            <View key={i} style={styles.defRow}>
              <View style={[styles.bullet, { backgroundColor: c.fg }]} />
              <View style={styles.defContent}>
                {def.partOfSpeech && (
                  <Text style={[styles.defPOS, { color: c.fg }]}>{def.partOfSpeech}</Text>
                )}
                <Text style={[styles.defText, { color: c.fg }]}>{def.text}</Text>
                {def.context && (
                  <Text style={[styles.defContext, { color: c.muted }]}>
                    Context: {def.context}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {data.usageExamples && data.usageExamples.length > 0 && (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: c.muted }]}>
                {(data.sectionHeaders?.usageExamples ?? 'USAGE EXAMPLES').toUpperCase()}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  usageTts.isPlaying
                    ? usageTts.stop()
                    : usageTts.synthesize(
                        buildSectionSpeech(
                          'Usage Examples',
                          joinLabeledItems(
                            (data.usageExamples ?? []).map((item) => ({
                              partOfSpeech: item.partOfSpeech,
                              text: item.example,
                            }))
                          )
                        ),
                        language
                      )
                }
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                activeOpacity={0.7}
                disabled={usageTts.isLoading}>
                {usageTts.isLoading ? (
                  <ActivityIndicator size="small" color={c.muted} />
                ) : usageTts.isPlaying ? (
                  <Square size={12} color={c.fg} fill={c.fg} />
                ) : (
                  <Volume2 size={14} color={c.muted} />
                )}
              </TouchableOpacity>
            </View>
            {data.usageExamples.map((ue, i) => (
              <View key={i} style={[styles.exampleCard, { borderLeftColor: c.border }]}>
                <Text style={[styles.examplePOS, { color: c.fg }]}>{ue.partOfSpeech}</Text>
                <Text style={[styles.exampleText, { color: c.muted }]}>
                  &lsquo;{ue.example}&rsquo;
                </Text>
              </View>
            ))}
          </View>
        )}

        {(!data.usageExamples || data.usageExamples.length === 0) &&
          data.exampleSentences &&
          data.exampleSentences.length > 0 && (
            <View style={[styles.section, { borderTopColor: c.border }]}>
              <View style={styles.sectionTitleRow}>
                <Text style={[styles.sectionTitle, { color: c.muted }]}>
                  {(data.sectionHeaders?.usageExamples ?? 'EXAMPLE SENTENCES').toUpperCase()}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    sentencesTts.isPlaying
                      ? sentencesTts.stop()
                      : sentencesTts.synthesize(
                          buildSectionSpeech(
                            'Example Sentences',
                            (data.exampleSentences ?? []).join('. ')
                          ),
                          language
                        )
                  }
                  hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                  activeOpacity={0.7}
                  disabled={sentencesTts.isLoading}>
                  {sentencesTts.isLoading ? (
                    <ActivityIndicator size="small" color={c.muted} />
                  ) : sentencesTts.isPlaying ? (
                    <Square size={12} color={c.fg} fill={c.fg} />
                  ) : (
                    <Volume2 size={14} color={c.muted} />
                  )}
                </TouchableOpacity>
              </View>
              {data.exampleSentences.map((s, i) => (
                <View key={i} style={[styles.exampleCard, { borderLeftColor: c.border }]}>
                  <Text style={[styles.exampleText, { color: c.muted }]}>{s}</Text>
                </View>
              ))}
            </View>
          )}

        {(data.synonyms.length > 0 || data.antonyms.length > 0) && (
          <View style={[styles.section, { borderTopColor: c.border }]}>
            {data.synonyms.length > 0 && (
              <View style={styles.chipSection}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionTitle, { color: c.muted }]}>
                    {(data.sectionHeaders?.synonyms ?? 'SYNONYMS').toUpperCase()}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      synonymsTts.isPlaying
                        ? synonymsTts.stop()
                        : synonymsTts.synthesize(
                            buildSectionSpeech('Synonyms', data.synonyms.join(', ')),
                            language
                          )
                    }
                    hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                    activeOpacity={0.7}
                    disabled={synonymsTts.isLoading}>
                    {synonymsTts.isLoading ? (
                      <ActivityIndicator size="small" color={c.muted} />
                    ) : synonymsTts.isPlaying ? (
                      <Square size={12} color={c.fg} fill={c.fg} />
                    ) : (
                      <Volume2 size={14} color={c.muted} />
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.chipWrap}>
                  {data.synonyms.map((syn, i) => (
                    <View
                      key={`${syn}-${i}`}
                      style={[styles.chip, { borderColor: c.border, backgroundColor: c.card }]}>
                      <Text style={[styles.chipText, { color: c.fg }]}>{syn}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {data.antonyms.length > 0 && (
              <View style={styles.chipSection}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionTitle, { color: c.muted }]}>
                    {(data.sectionHeaders?.antonyms ?? 'ANTONYMS').toUpperCase()}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      antonymsTts.isPlaying
                        ? antonymsTts.stop()
                        : antonymsTts.synthesize(
                            buildSectionSpeech('Antonyms', data.antonyms.join(', ')),
                            language
                          )
                    }
                    hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                    activeOpacity={0.7}
                    disabled={antonymsTts.isLoading}>
                    {antonymsTts.isLoading ? (
                      <ActivityIndicator size="small" color={c.muted} />
                    ) : antonymsTts.isPlaying ? (
                      <Square size={12} color={c.fg} fill={c.fg} />
                    ) : (
                      <Volume2 size={14} color={c.muted} />
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.chipWrap}>
                  {data.antonyms.map((ant, i) => (
                    <View
                      key={`${ant}-${i}`}
                      style={[styles.chip, { borderColor: c.border, backgroundColor: c.card }]}>
                      <Text style={[styles.chipText, { color: c.fg }]}>{ant}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {data.funFact ? (
          <View style={[styles.highlightCard, { backgroundColor: invertedBg }]}>
            <Text style={[styles.quoteChar, { color: invertedFg }]}>&ldquo;</Text>
            <Text style={[styles.highlightText, { color: invertedFg }]}>{data.funFact}</Text>
            <Text style={[styles.quoteChar, { color: invertedFg }]}>&rdquo;</Text>
            <TouchableOpacity
              onPress={() =>
                funFactTts.isPlaying
                  ? funFactTts.stop()
                  : funFactTts.synthesize(
                      buildSectionSpeech('Fun Fact', data.funFact ?? ''),
                      language
                    )
              }
              style={styles.cardTtsBtn}
              hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              activeOpacity={0.7}
              disabled={funFactTts.isLoading}>
              {funFactTts.isLoading ? (
                <ActivityIndicator size="small" color={invertedFg} />
              ) : funFactTts.isPlaying ? (
                <Square size={14} color={invertedFg} fill={invertedFg} />
              ) : (
                <Volume2 size={16} color={invertedFg} style={{ opacity: 0.9 }} />
              )}
            </TouchableOpacity>
          </View>
        ) : isDetailsLoading ? (
          <View style={[styles.highlightCard, { backgroundColor: invertedBg }]}>
            <Text style={[styles.quoteChar, { color: invertedFg, opacity: 0.8 }]}>&ldquo;</Text>
            <View style={styles.skeletonBlock}>
              <View
                style={[
                  styles.skeletonLine,
                  styles.skeletonLineWide,
                  { backgroundColor: invertedSofter },
                ]}
              />
              <View style={[styles.skeletonLine, { backgroundColor: invertedSoft }]} />
              <View
                style={[
                  styles.skeletonLine,
                  styles.skeletonLineShort,
                  { backgroundColor: invertedSoft },
                ]}
              />
            </View>
            <Text style={[styles.quoteChar, { color: invertedFg, opacity: 0.8 }]}>&rdquo;</Text>
          </View>
        ) : null}

        {data.culturalContext ? (
          <View style={[styles.contextCard, { backgroundColor: invertedBg }]}>
            <View style={styles.contextHeaderRow}>
              <Text style={[styles.contextLabel, { color: invertedMuted }]}>
                {(data.sectionHeaders?.culturalContext ?? 'CULTURAL CONTEXT').toUpperCase()}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  contextTts.isPlaying
                    ? contextTts.stop()
                    : contextTts.synthesize(
                        buildSectionSpeech('Cultural Context', data.culturalContext ?? ''),
                        language
                      )
                }
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
                activeOpacity={0.7}
                disabled={contextTts.isLoading}>
                {contextTts.isLoading ? (
                  <ActivityIndicator size="small" color={invertedFg} />
                ) : contextTts.isPlaying ? (
                  <Square size={14} color={invertedFg} fill={invertedFg} />
                ) : (
                  <Volume2 size={16} color={invertedFg} style={{ opacity: 0.9 }} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={[styles.contextText, { color: invertedFg }]}>{data.culturalContext}</Text>
          </View>
        ) : isDetailsLoading ? (
          <View style={[styles.contextCard, { backgroundColor: invertedBg }]}>
            <Text
              style={[
                styles.contextLabel,
                styles.contextLabelStandalone,
                { color: invertedMuted },
              ]}>
              {(data.sectionHeaders?.culturalContext ?? 'CULTURAL CONTEXT').toUpperCase()}
            </Text>
            <View style={styles.skeletonBlock}>
              <View
                style={[
                  styles.skeletonLine,
                  styles.skeletonLineWide,
                  { backgroundColor: invertedSofter },
                ]}
              />
              <View style={[styles.skeletonLine, { backgroundColor: invertedSoft }]} />
              <View
                style={[
                  styles.skeletonLine,
                  styles.skeletonLineShort,
                  { backgroundColor: invertedSoft },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View style={[styles.section, { borderTopColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.muted }]}>TRANSLATE</Text>

          <View style={styles.translateRow}>
            <View style={[styles.langPill, { borderColor: c.border, opacity: 0.6 }]}>
              <Languages size={16} color={c.muted} />
              <Text style={[styles.langPillText, { color: c.fg }]}>
                {data.language ?? 'English'}
              </Text>
            </View>

            <ArrowRight size={16} color={c.muted} />

            <TouchableOpacity
              style={[styles.langPill, { borderColor: c.border }]}
              onPress={() => setLangPickerOpen(true)}
              activeOpacity={0.7}>
              <Languages size={16} color={c.muted} />
              <Text style={[styles.langPillText, { color: c.fg }]}>
                {translateLang ?? 'Select language'}
              </Text>
              <ChevronDown size={14} color={c.muted} />
            </TouchableOpacity>
          </View>

          {translateLang && (
            <View style={[styles.translateCard, { borderColor: c.border }]}>
              <View style={styles.translateSide}>
                <Text style={[styles.translateLangLabel, { color: c.muted }]}>
                  {language.toUpperCase()}
                </Text>
                <Text style={[styles.translateWordText, { color: c.fg }]}>{data.word}</Text>
              </View>

              <ArrowRight size={18} color={c.muted} />

              <View style={styles.translateSide}>
                <Text style={[styles.translateLangLabel, { color: c.muted }]}>
                  {translateLang.toUpperCase()}
                </Text>
                {isTranslating ? (
                  <View style={styles.translateLoadingRow}>
                    <ActivityIndicator size="small" color={c.muted} />
                    <Text style={[styles.translateRetryText, { color: c.muted }]}>
                      Translating...
                    </Text>
                  </View>
                ) : translations[translateLang] && translations[translateLang] !== '\u2014' ? (
                  <Text style={[styles.translateWordText, { color: c.fg }]}>
                    {translations[translateLang]}
                  </Text>
                ) : translations[translateLang] === '\u2014' ? (
                  <TouchableOpacity onPress={refetchTranslation} activeOpacity={0.7}>
                    <Text style={[styles.translateRetryText, { color: c.muted }]}>
                      Tap to retry
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.translateLoadingRow}>
                    <ActivityIndicator size="small" color={c.muted} />
                    <Text style={[styles.translateRetryText, { color: c.muted }]}>
                      Translating...
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        <Modal
          visible={langPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setLangPickerOpen(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setLangPickerOpen(false)}>
            <Pressable style={[styles.modalSheet, { backgroundColor: c.card }]}>
              <Text style={[styles.modalTitle, { color: c.fg }]}>Select language</Text>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {modelLanguages
                  .filter((l) => l.toLowerCase() !== (data.language ?? 'english').toLowerCase())
                  .map((l) => (
                    <TouchableOpacity
                      key={l}
                      style={[
                        styles.modalOption,
                        { borderBottomColor: c.border },
                        translateLang === l && { backgroundColor: c.accent },
                      ]}
                      onPress={() => {
                        setTranslateLang(l);
                        setLangPickerOpen(false);
                      }}
                      activeOpacity={0.7}>
                      <Text style={[styles.modalOptionText, { color: c.fg }]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <DictionaryDetailFooter />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerSpacer: { width: BACK_BUTTON_SIZE },
  breadcrumb: { fontSize: 13, marginTop: 8, marginBottom: 16 },
  breadcrumbWord: { fontStyle: 'italic' },
  wordHeader: { marginBottom: 24 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  langBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  langBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  wordOnlyBtn: { alignItems: 'center', justifyContent: 'center', padding: 2 },
  wordRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  wordTitle: { fontSize: 34, fontWeight: '300', textTransform: 'capitalize' },
  bookmarkBtn: { padding: 8 },
  phonetic: { fontSize: 14, fontStyle: 'italic', marginTop: 6 },
  section: { borderTopWidth: 0.5, paddingTop: 20, marginBottom: 24 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  cardTtsBtn: { marginTop: 10, padding: 6 },
  defRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  defContent: { flex: 1 },
  defPOS: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  defText: { fontSize: 14, lineHeight: 22 },
  defContext: { fontSize: 12, marginTop: 2 },
  exampleCard: { borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 6, marginBottom: 12 },
  examplePOS: { fontSize: 12, fontWeight: '600' },
  exampleText: { fontSize: 14, fontStyle: 'italic', lineHeight: 22 },
  chipSection: { marginBottom: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '500' },
  highlightCard: { borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 20 },
  quoteChar: { fontSize: 28, lineHeight: 32 },
  highlightText: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  contextCard: { borderRadius: 16, paddingHorizontal: 24, paddingVertical: 24, marginBottom: 20 },
  contextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  contextLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, opacity: 0.7 },
  contextLabelStandalone: { marginBottom: 10 },
  contextText: { fontSize: 14, lineHeight: 22 },
  skeletonBlock: { width: '100%', gap: 10, alignItems: 'center' },
  skeletonLine: { height: 10, borderRadius: 999, width: '88%' },
  skeletonLineWide: { width: '100%' },
  skeletonLineShort: { width: '70%' },
  translateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  langPillText: { fontSize: 14, fontWeight: '500' },
  translateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  translateSide: { flex: 1 },
  translateLangLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginBottom: 4 },
  translateWordText: { fontSize: 18, fontWeight: '500', textTransform: 'capitalize' },
  translateLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  translateRetryText: { fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheet: { width: '80%', maxHeight: '60%', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  modalScroll: { maxHeight: 300 },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  modalOptionText: { fontSize: 15 },
});
