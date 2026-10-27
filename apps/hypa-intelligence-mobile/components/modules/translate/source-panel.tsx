import React from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';
import { CopyIcon, MicIcon, Share2, SquareIcon, Volume2 } from 'lucide-react-native';

import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import { type useSpeechRecorder } from '@/hooks/use-speech-recorder';
import { translateStyles as styles } from './translate.styles';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

type SourcePanelProps = {
  card: string;
  border: string;
  text: string;
  sourceText: string;
  recorderControls: ReturnType<typeof useSpeechRecorder>;
  isSourceTtsLoading: boolean;
  isSourceTtsPlaying: boolean;
  canSpeakSource: boolean;
  onSourceTextChange: (value: string) => void;
  onInputTTS: () => void;
  onCopySource: () => void;
  onShareRecording: () => void;
};

export const SourcePanel = ({
  card,
  border,
  text,
  sourceText,
  recorderControls,
  isSourceTtsLoading,
  isSourceTtsPlaying,
  canSpeakSource,
  onSourceTextChange,
  onInputTTS,
  onCopySource,
  onShareRecording,
}: SourcePanelProps) => (
  <View style={[styles.panel, { backgroundColor: card, borderColor: border }]}>
    <View style={{ flex: 1, padding: 20 }}>
      <TextInput
        multiline
        value={sourceText}
        onChangeText={onSourceTextChange}
        placeholder="Enter text to translate..."
        placeholderTextColor={text + '80'}
        style={{
          flex: 1,
          color: text,
          fontSize: 16,
          lineHeight: 24,
          fontFamily: FONTS.main.regular,
          textAlignVertical: 'top',
        }}
      />
      <View style={styles.sourceToolbar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
          <TouchableOpacity
            onPress={recorderControls.toggleRecording}
            disabled={recorderControls.isBusy}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={[
              styles.recordButton,
              recorderControls.isRecording || recorderControls.isBusy
                ? styles.recordButtonActive
                : styles.recordButtonIdle,
              { opacity: recorderControls.isBusy ? 0.6 : 1 },
            ]}>
            {recorderControls.isBusy ? (
              <ActivityIndicator size="small" color="red" />
            ) : recorderControls.isRecording ? (
              <>
                <SquareIcon size={16} color="red" />
                <Text style={[styles.recordTimer, { color: 'red' }]}>
                  {formatTime(recorderControls.remainingSeconds)}
                </Text>
              </>
            ) : (
              <MicIcon size={16} color={text} />
            )}
          </TouchableOpacity>
          {recorderControls.lastRecordingUri &&
          !recorderControls.isRecording &&
          !recorderControls.isBusy ? (
            <TouchableOpacity
              onPress={onShareRecording}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
              <Share2 size={16} color={text} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
          <TouchableOpacity
            onPress={onInputTTS}
            disabled={!canSpeakSource}
            style={{
              backgroundColor: card,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 19,
              opacity: canSpeakSource ? 1 : 0.5,
            }}>
            {isSourceTtsLoading ? (
              <ActivityIndicator size="small" color={text} />
            ) : isSourceTtsPlaying ? (
              <SquareIcon size={16} color="red" />
            ) : (
              <Volume2 size={16} color={text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCopySource}
            disabled={!sourceText.trim()}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 6,
              opacity: sourceText.trim() ? 1 : 0.5,
            }}>
            <CopyIcon size={16} color={text} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </View>
);
