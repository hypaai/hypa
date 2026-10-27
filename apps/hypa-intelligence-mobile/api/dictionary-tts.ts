import { ApiError, api } from '@/api'
import { resolveProviderModelForGroup } from '@/lib/model-languages'

interface DictionarySynthesizeParams {
  text: string
  language?: string
  voice?: string
  preset?: Record<string, unknown>
}

function normalizeDictionaryTtsError(
  err: unknown,
  fallback = 'Failed to synthesize speech.',
): Error {
  if (err instanceof ApiError) return new Error(err.message)
  if (err instanceof Error) return err

  return new Error(fallback)
}

export async function synthesizeDictionarySpeech(
  params: DictionarySynthesizeParams,
): Promise<string> {
  try {
    const resolved = resolveProviderModelForGroup(
      'TTS',
      typeof params.preset?.provider === 'string' ? params.preset.provider : undefined,
      typeof params.preset?.model === 'string' ? params.preset.model : undefined,
    )
    const response = await api.post<
      string | { audio_url?: string; audio_b64?: string }
    >('/dictionary/tts', {
      text: params.text,
      voice: params.voice,
      preset: {
        ...params.preset,
        provider: resolved.provider,
        model: resolved.model,
        language: params.preset?.language ?? params.language,
      },
    })
    const payload = response.data

    if (typeof payload === 'string') {
      if (payload.startsWith('data:') || payload.startsWith('blob:')) {
        return payload
      }

      return `data:audio/wav;base64,${payload}`
    }

    if (payload.audio_url) return payload.audio_url
    if (payload.audio_b64) return `data:audio/wav;base64,${payload.audio_b64}`

    throw new Error('No audio was returned.')
  } catch (err) {
    throw normalizeDictionaryTtsError(err)
  }
}
