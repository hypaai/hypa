import { useCallback, useEffect, useRef, useState } from 'react'
import { createAudioPlayer } from 'expo-audio'

import { synthesizeDictionarySpeech } from '@/api/dictionary-tts'
import { useSettings } from '@/context/settings-context'
import { languageNameToCode } from '@/lib/model-languages'
import { useToast } from '@/lib/toast'

const cleanLabel = (value: string) => value.replace(/\s+/g, ' ').trim()

export function useDictionarySynthesize(kind: 'input' | 'output' = 'output') {
  const toast = useToast()
  const { models, resolvePlaybackVoice, settings } = useSettings()
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const playerRef = useRef<any | null>(null)
  const activeLabelRef = useRef('')

  const stop = useCallback(() => {
    try {
      playerRef.current?.pause?.()
      playerRef.current?.remove?.()
      playerRef.current?.release?.()
    } catch {}

    playerRef.current = null
    activeLabelRef.current = ''
    setIsPlaying(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  const synthesize = useCallback(
    async (text: string, language = 'English', voiceOverride?: string) => {
      const normalizedText = cleanLabel(text)

      if (!normalizedText) return

      if (isPlaying && activeLabelRef.current === normalizedText) {
        stop()
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const languageCode = languageNameToCode(language) || language || 'en'
        const resolvedVoice =
          voiceOverride ||
          resolvePlaybackVoice(kind, languageCode, voiceOverride)

        if (!resolvedVoice) {
          throw new Error('No voice available for playback.')
        }

        const audioUri = await synthesizeDictionarySpeech({
          text: normalizedText,
          language,
          voice: resolvedVoice,
          preset: {
            provider: settings?.ttsProvider,
            model: models.ttsModel,
            language,
            max_new_tokens: 2048,
          },
        })

        stop()

        const player = createAudioPlayer({ uri: audioUri })
        playerRef.current = player
        activeLabelRef.current = normalizedText
        ;(player as any).addListener?.('playbackStatusUpdate', (status: any) => {
          if (status.didJustFinish && !status.loop) {
            activeLabelRef.current = ''
            setIsPlaying(false)
            return
          }

          setIsPlaying(!!status.playing)
        })

        await player.seekTo(0).catch(() => {})
        player.play()
        setIsPlaying(true)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to generate audio.'

        setError(message)
        setIsPlaying(false)
        toast.showError('Audio failed', message)
      } finally {
        setIsLoading(false)
      }
    },
    [
      isPlaying,
      kind,
      models.ttsModel,
      resolvePlaybackVoice,
      settings?.ttsProvider,
      stop,
      toast,
    ],
  )

  return { synthesize, stop, isLoading, isPlaying, error }
}
