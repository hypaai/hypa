import { ApiError, api } from '@/api'
import { isAutoDetectLanguage } from '@/lib/model-languages'

interface DictionaryTranslateParams {
  text: string
  sourceLang: string
  targetLang: string
}

interface DictionaryTranslateResult {
  translation: string
  language: string | null
  id: string | null
}

function normalizeDictionaryTranslateError(
  err: unknown,
  fallback = 'Translation failed.',
): Error {
  if (err instanceof ApiError) return new Error(err.message)
  if (err instanceof Error) return err

  return new Error(fallback)
}

export async function translateDictionaryWord(
  params: DictionaryTranslateParams,
): Promise<DictionaryTranslateResult> {
  try {
    const response = await api.post<{
      output_text: string
      source_lang?: string
      target_lang?: string
      id?: string
    }>('/dictionary/translate', {
      text: params.text,
      source_lang: isAutoDetectLanguage(params.sourceLang)
        ? undefined
        : params.sourceLang,
      target_lang: params.targetLang,
    })

    return {
      translation: response.data.output_text,
      language:
        response.data.source_lang ??
        (isAutoDetectLanguage(params.sourceLang) ? null : params.sourceLang),
      id: response.data.id ?? null,
    }
  } catch (err) {
    throw normalizeDictionaryTranslateError(err)
  }
}
