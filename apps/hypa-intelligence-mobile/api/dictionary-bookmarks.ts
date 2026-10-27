import { ApiError, api } from '@/api'
import type { DictionaryResponse, DictionaryHistoryEntry } from '@/api/dictionary'

function normalizeBookmarkError(
  err: unknown,
  fallback = 'Could not load bookmarks.',
): Error {
  if (err instanceof ApiError) return new Error(err.message)
  if (err instanceof Error) return err

  return new Error(fallback)
}

export async function getDictionaryBookmarkEntries() {
  try {
    const response = await api.get<{ data: DictionaryHistoryEntry[] }>(
      '/profile/bookmarks',
    )

    return response.data.data
  } catch (err) {
    throw normalizeBookmarkError(err)
  }
}

export async function addDictionaryBookmarkEntry(
  word: string,
  language: string,
  result: DictionaryResponse,
) {
  try {
    const response = await api.post<{ data: DictionaryHistoryEntry }>(
      '/profile/bookmarks',
      { word, language, result },
    )

    return response.data.data
  } catch (err) {
    throw normalizeBookmarkError(err, 'Could not save bookmark.')
  }
}

export async function removeDictionaryBookmarkEntry(
  word: string,
  language: string,
) {
  try {
    const response = await api.delete<{ message: string }>('/profile/bookmarks', {
      data: { word, language },
    })

    return response.data
  } catch (err) {
    throw normalizeBookmarkError(err, 'Could not remove bookmark.')
  }
}
