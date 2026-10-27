import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Bookmark, Square, Volume2 } from 'lucide-react-native';

import { useDictionaryBookmarks } from '@/hooks/use-dictionary-bookmarks';
import { useDictionarySynthesize } from '@/hooks/use-dictionary-synthesize';
import {
  buildDictionaryResultSpeech,
  buildSectionSpeech,
  joinLabeledItems,
} from '@/lib/dictionary-speech';

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
};

type Props = {
  data: WordResult;
  onBookmark?: () => void;
  onSpeak?: () => void;
  isSpeakLoading?: boolean;
  isSpeaking?: boolean;
  isBookmarked?: boolean;
};

export function WordResultCard({
  data,
  onBookmark,
  onSpeak,
  isSpeakLoading = false,
  isSpeaking = false,
  isBookmarked = false,
}: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const language = data.language ?? 'English';
  const { isBookmarked: checkBookmarked, toggleBookmark } = useDictionaryBookmarks();
  const topLevelTts = useDictionarySynthesize();
  const definitionsTts = useDictionarySynthesize();
  const usageTts = useDictionarySynthesize();
  const synonymsTts = useDictionarySynthesize();
  const antonymsTts = useDictionarySynthesize();

  const textColor = isDark ? '#e5e5e5' : '#222';
  const mutedColor = isDark ? '#999' : '#666';
  const borderColor = isDark ? '#333' : '#ddd';
  const bg = isDark ? '#0b0b0b' : '#fff';
  const bookmarked = onBookmark ? isBookmarked : checkBookmarked(data.word, language);

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor }]}>
      <View style={styles.header}>
        <View style={styles.wordRow}>
          <Text style={[styles.wordTitle, { color: textColor }]}>{data.word}</Text>
          <TouchableOpacity
            onPress={() =>
              onBookmark
                ? onBookmark()
                : void toggleBookmark({
                    word: data.word,
                    language,
                    result: data,
                  })
            }
            hitSlop={8}
            activeOpacity={0.7}>
            <Bookmark size={18} color={textColor} fill={bookmarked ? textColor : 'transparent'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              onSpeak
                ? onSpeak()
                : topLevelTts.isPlaying
                  ? topLevelTts.stop()
                  : topLevelTts.synthesize(buildDictionaryResultSpeech(data), language)
            }
            hitSlop={8}
            activeOpacity={0.7}
            disabled={isSpeakLoading}>
            {isSpeakLoading || topLevelTts.isLoading ? (
              <ActivityIndicator size="small" color={mutedColor} />
            ) : isSpeaking || topLevelTts.isPlaying ? (
              <Square size={16} color={textColor} fill={textColor} />
            ) : (
              <Volume2 size={18} color={textColor} />
            )}
          </TouchableOpacity>
        </View>
        {data.partOfSpeech ? (
          <Text style={[styles.language, { color: mutedColor }]}>{data.partOfSpeech}</Text>
        ) : null}
      </View>

      {data.definitions.length > 0 && (
        <View style={[styles.section, { borderTopColor: borderColor }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionLabel, { color: mutedColor }]}>DEFINITION:</Text>
            <TouchableOpacity
              onPress={() =>
                definitionsTts.isPlaying
                  ? definitionsTts.stop()
                  : definitionsTts.synthesize(
                      buildSectionSpeech('Definition', joinLabeledItems(data.definitions)),
                      language
                    )
              }
              hitSlop={8}
              activeOpacity={0.7}
              disabled={definitionsTts.isLoading}>
              {definitionsTts.isLoading ? (
                <ActivityIndicator size="small" color={mutedColor} />
              ) : definitionsTts.isPlaying ? (
                <Square size={12} color={textColor} fill={textColor} />
              ) : (
                <Volume2 size={14} color={mutedColor} />
              )}
            </TouchableOpacity>
          </View>
          {data.definitions.map((def, i) => (
            <Text key={i} style={[styles.bodyText, { color: textColor }]}>
              {def.partOfSpeech ? (
                <Text style={styles.definitionType}>{def.partOfSpeech}: </Text>
              ) : null}
              {def.text}
            </Text>
          ))}
        </View>
      )}

      {data.usageExamples && data.usageExamples.length > 0 && (
        <View style={[styles.section, { borderTopColor: borderColor }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.usageTitle, { color: textColor }]}>Usage Example:</Text>
            <TouchableOpacity
              onPress={() =>
                usageTts.isPlaying
                  ? usageTts.stop()
                  : usageTts.synthesize(
                      buildSectionSpeech(
                        'Usage Examples',
                        joinLabeledItems(
                          (data.usageExamples ?? []).map((item) => ({
                            text: item.example,
                          }))
                        )
                      ),
                      language
                    )
              }
              hitSlop={8}
              activeOpacity={0.7}
              disabled={usageTts.isLoading}>
              {usageTts.isLoading ? (
                <ActivityIndicator size="small" color={mutedColor} />
              ) : usageTts.isPlaying ? (
                <Square size={12} color={textColor} fill={textColor} />
              ) : (
                <Volume2 size={14} color={mutedColor} />
              )}
            </TouchableOpacity>
          </View>
          {data.usageExamples.map((ue, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: textColor }]}>•</Text>
              <Text style={[styles.bodyText, { color: textColor, fontStyle: 'italic' }]}>
                {ue.partOfSpeech ? <Text style={styles.usageType}>{ue.partOfSpeech} </Text> : null}
                &ldquo;{ue.example}&rdquo;
              </Text>
            </View>
          ))}
        </View>
      )}

      {data.synonyms.length > 0 && (
        <View style={[styles.section, { borderTopColor: borderColor }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.metaLabel, { color: textColor }]}>Synonyms:</Text>
            <TouchableOpacity
              onPress={() =>
                synonymsTts.isPlaying
                  ? synonymsTts.stop()
                  : synonymsTts.synthesize(
                      buildSectionSpeech('Synonyms', data.synonyms.join(', ')),
                      language
                    )
              }
              hitSlop={8}
              activeOpacity={0.7}
              disabled={synonymsTts.isLoading}>
              {synonymsTts.isLoading ? (
                <ActivityIndicator size="small" color={mutedColor} />
              ) : synonymsTts.isPlaying ? (
                <Square size={12} color={textColor} fill={textColor} />
              ) : (
                <Volume2 size={14} color={mutedColor} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={[styles.metaLine, { color: mutedColor, fontStyle: 'italic' }]}>
            {data.synonyms.join(', ')}
          </Text>
        </View>
      )}

      {data.antonyms.length > 0 && (
        <View style={[styles.section, { borderTopColor: borderColor }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.metaLabel, { color: textColor }]}>Antonyms:</Text>
            <TouchableOpacity
              onPress={() =>
                antonymsTts.isPlaying
                  ? antonymsTts.stop()
                  : antonymsTts.synthesize(
                      buildSectionSpeech('Antonyms', data.antonyms.join(', ')),
                      language
                    )
              }
              hitSlop={8}
              activeOpacity={0.7}
              disabled={antonymsTts.isLoading}>
              {antonymsTts.isLoading ? (
                <ActivityIndicator size="small" color={mutedColor} />
              ) : antonymsTts.isPlaying ? (
                <Square size={12} color={textColor} fill={textColor} />
              ) : (
                <Volume2 size={14} color={mutedColor} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={[styles.metaLine, { color: mutedColor, fontStyle: 'italic' }]}>
            {data.antonyms.join(', ')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  header: { marginBottom: 16 },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordTitle: { fontSize: 22, fontWeight: '700' },
  language: { fontSize: 13, marginTop: 2 },
  section: { borderTopWidth: 0.5, paddingTop: 16, marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '500', letterSpacing: 0.5, marginBottom: 4 },
  usageTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  bodyText: { fontSize: 14, lineHeight: 22 },
  definitionType: { fontWeight: '700' },
  usageType: { fontWeight: '600', fontStyle: 'normal' },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  bullet: { fontSize: 14 },
  metaLine: { fontSize: 14, lineHeight: 22, marginBottom: 4 },
  metaLabel: { fontWeight: '700' },
});