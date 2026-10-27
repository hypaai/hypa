import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native'
import { Square, Volume2 } from 'lucide-react-native'
import { type AudioStatus, createAudioPlayer } from 'expo-audio'

import { useDictionaryWordOfTheDay } from '@/hooks/use-dictionary-word-of-the-day'

function getFormattedDate(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yy}.${mm}.${dd}`
}

export default function WordOfTheDay() {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  const { data, isLoading, error } = useDictionaryWordOfTheDay()
  const playerRef = useRef<any | null>(null)
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>(
    'idle',
  )

  const border = isDark ? '#2b2b2b' : '#e6e6e6'
  const muted = isDark ? '#9ca3af' : '#6b7280'
  const text = isDark ? '#f3f4f6' : '#111827'
  const card = isDark ? '#071126' : '#ffffff'

  const stopAudio = useCallback(() => {
    const player = playerRef.current
    if (!player) return

    try {
      player.pause()
    } catch {}

    try {
      player.remove()
    } catch {}

    try {
      player.release()
    } catch {}

    playerRef.current = null
    setAudioState('idle')
  }, [])

  useEffect(() => () => stopAudio(), [stopAudio])

  useEffect(() => {
    if (!data?.audioUrl && audioState !== 'idle') {
      stopAudio()
    }
  }, [audioState, data?.audioUrl, stopAudio])

  const handlePlayAudio = useCallback(async () => {
    if (!data?.audioUrl) return

    if (audioState === 'playing') {
      stopAudio()
      return
    }

    setAudioState('loading')

    try {
      stopAudio()

      const player = createAudioPlayer({ uri: data.audioUrl })
      playerRef.current = player

      ;(player as any).addListener?.('playbackStatusUpdate', (status: AudioStatus) => {
        if (status.didJustFinish && !status.loop) {
          stopAudio()
          return
        }

        if (status.playing) {
          setAudioState('playing')
        }
      })

      await player.seekTo(0).catch(() => {})
      player.play()
    } catch {
      stopAudio()
    }
  }, [audioState, data?.audioUrl, stopAudio])

  const meaningText = isLoading
    ? 'Loading word of the day...'
    : error
      ? error.message || 'Unable to load word of the day.'
      : data?.meaning || 'No word of the day is available right now.'
  const wordText = data?.word || 'Word of the Day'
  const languageText = data?.language || null

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: text }]}>Word of the Day</Text>

      <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.date, { color: muted }]}>{getFormattedDate()}</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
            onPress={() => void handlePlayAudio()}
            disabled={!data?.audioUrl || audioState === 'loading'}
          >
            {audioState === 'loading' ? (
              <ActivityIndicator size="small" color={muted} />
            ) : audioState === 'playing' ? (
              <Square size={16} color="#000000" fill="#000000" />
            ) : (
              <Volume2 size={20} color={muted} />
            )}
          </TouchableOpacity>
        </View>

        {languageText ? (
          <Text style={[styles.language, { color: muted }]}>{languageText}</Text>
        ) : null}

        <Text style={[styles.word, { color: text }]}>{wordText}</Text>
        <Text style={[styles.definition, { color: muted }]}>{meaningText}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    fontWeight: '400',
  },
  word: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  language: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  definition: {
    fontSize: 14,
    lineHeight: 20,
  },
})