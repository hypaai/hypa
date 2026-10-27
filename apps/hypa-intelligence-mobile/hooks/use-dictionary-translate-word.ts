import { useCallback, useEffect, useRef, useState } from 'react'

import { translateDictionaryWord } from '@/api/dictionary-translate'
import { useToast } from '@/lib/toast'

export function useDictionaryTranslateWord(
  text: string | undefined,
  sourceLanguage: string,
  enabled = true,
  targetLang?: string,
) {
  const toast = useToast()
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeRequestKeyRef = useRef<string | null>(null)
  const lastAutoRequestKeyRef = useRef<string | null>(null)
  const toastRef = useRef(toast)

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  const runTranslation = useCallback(
    async (
      nextText?: string,
      nextTargetLang?: string,
      options?: { skipDuplicateAuto?: boolean; force?: boolean },
    ) => {
      const resolvedText = nextText?.trim()
      const resolvedTarget = nextTargetLang?.trim()

      if (!resolvedText || !resolvedTarget) return
      if (resolvedTarget.toLowerCase() === sourceLanguage.toLowerCase()) return

      const requestKey = `${resolvedText.toLowerCase()}::${sourceLanguage.toLowerCase()}::${resolvedTarget.toLowerCase()}`

      if (!options?.force) {
        if (activeRequestKeyRef.current === requestKey) return
        if (
          options?.skipDuplicateAuto &&
          lastAutoRequestKeyRef.current === requestKey
        ) {
          return
        }
      }

      activeRequestKeyRef.current = requestKey
      if (options?.skipDuplicateAuto) {
        lastAutoRequestKeyRef.current = requestKey
      }
      setIsLoading(true)
      setError(null)

      try {
        const result = await translateDictionaryWord({
          text: resolvedText,
          sourceLang: sourceLanguage,
          targetLang: resolvedTarget,
        })

        setTranslations({ [resolvedTarget]: result.translation })
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Translation failed. Tap to retry.'

        setTranslations({ [resolvedTarget]: '\u2014' })
        setError(message)
        toastRef.current.showError('Translation failed', message)
      } finally {
        activeRequestKeyRef.current = null
        setIsLoading(false)
      }
    },
    [sourceLanguage],
  )

  useEffect(() => {
    if (!enabled || !targetLang || !text?.trim()) return
    void runTranslation(text, targetLang, { skipDuplicateAuto: true })
  }, [enabled, runTranslation, sourceLanguage, targetLang, text])

  const refetch = useCallback(() => {
    if (!targetLang || !text?.trim()) return
    void runTranslation(text, targetLang, { force: true })
  }, [runTranslation, targetLang, text])

  return { translations, isLoading, error, refetch }
}
