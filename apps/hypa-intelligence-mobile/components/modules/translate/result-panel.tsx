import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { BookA, Brain, CopyIcon, Share2, SquareIcon, Volume2 } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import VoiceSelector from '@/components/voice-selector';
import { FONTS } from '@/constants/fonts';
import { translateStyles as styles } from './translate.styles';

type ResultPanelProps = {
  card: string;
  text: string;
  primary: string;
  border: string;
  thinkingExpanded: boolean;
  thinkingContent: string | null;
  isThinkingLoading: boolean;
  canUseThinking: boolean;
  mainContent: string;
  outputVoices: string[];
  selectedOutputVoice: string;
  isOutputTtsLoading: boolean;
  isOutputTtsPlaying: boolean;
  canSpeakOutput: boolean;
  canOpenDictionary: boolean;
  onToggleThinking: () => void;
  onDictionaryLookup: () => void;
  onOutputVoiceChange: (voice: string) => void;
  onOutputTTS: () => void;
  onCopyTranslation: () => void;
  onShareTranslation: () => void;
};

export const ResultPanel = ({
  card,
  text,
  primary,
  border,
  thinkingExpanded,
  thinkingContent,
  isThinkingLoading,
  canUseThinking,
  mainContent,
  outputVoices,
  selectedOutputVoice,
  isOutputTtsLoading,
  isOutputTtsPlaying,
  canSpeakOutput,
  canOpenDictionary,
  onToggleThinking,
  onDictionaryLookup,
  onOutputVoiceChange,
  onOutputTTS,
  onCopyTranslation,
  onShareTranslation,
}: ResultPanelProps) => {
  const hasThinkingContent = !!thinkingContent?.trim();

  return (
    <View style={[styles.panel, { backgroundColor: card, borderColor: border }]}>
      {hasThinkingContent && thinkingExpanded ? (
        <View style={{ flex: 1 }}>
          <View style={styles.thinkingHeader}>
            <Brain size={16} color={primary} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: primary }}>
              Thinking Process
            </Text>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
            showsVerticalScrollIndicator>
            <Text
              style={{
                fontSize: 13,
                color: text,
                opacity: 0.8,
                fontStyle: 'italic',
                lineHeight: 22,
              }}>
              {thinkingContent}
            </Text>
          </ScrollView>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator>
          <Text
            selectable
            style={{
              fontSize: 16,
              lineHeight: 24,
              color: text,
              opacity: mainContent ? 1 : 0.5,
              fontFamily: FONTS.main.regular,
            }}>
            {mainContent || 'Translation will appear here...'}
          </Text>
        </ScrollView>
      )}

      <View pointerEvents="box-none" style={styles.resultFooterWrap}>
        <View pointerEvents="auto" style={[styles.resultFooter, { backgroundColor: card }]}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Pressable
              style={{ opacity: canUseThinking ? 1 : 0.5 }}
              disabled={!canUseThinking || isThinkingLoading}
              onPress={onToggleThinking}>
              {isThinkingLoading ? (
                <ActivityIndicator size="small" color={primary} />
              ) : (
                <Brain
                  size={16}
                  color={hasThinkingContent || thinkingExpanded ? primary : text}
                />
              )}
            </Pressable>
            <Pressable
              style={{ opacity: canOpenDictionary ? 1 : 0.3 }}
              disabled={!canOpenDictionary}
              onPress={onDictionaryLookup}>
              <BookA size={16} color={canOpenDictionary ? primary : text} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {!!mainContent?.trim() && outputVoices.length > 0 && (
              <VoiceSelector
                title=""
                voices={outputVoices}
                value={selectedOutputVoice}
                onChange={onOutputVoiceChange}
              />
            )}
            <Pressable
              style={{ opacity: canSpeakOutput ? 1 : 0.3 }}
              disabled={!canSpeakOutput}
              onPress={onOutputTTS}>
              {isOutputTtsLoading ? (
                <ActivityIndicator size="small" color={text} />
              ) : isOutputTtsPlaying ? (
                <SquareIcon color="red" size={16} />
              ) : (
                <Volume2 color={text} size={16} />
              )}
            </Pressable>
            <Pressable
              style={{ opacity: mainContent ? 1 : 0.3 }}
              disabled={!mainContent}
              onPress={onShareTranslation}>
              <Share2 color={text} size={16} />
            </Pressable>
            <Pressable
              style={{ opacity: mainContent ? 1 : 0.3 }}
              disabled={!mainContent}
              onPress={onCopyTranslation}>
              <CopyIcon color={text} size={16} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};
