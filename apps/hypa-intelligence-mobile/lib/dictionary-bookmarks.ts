import AsyncStorage from '@react-native-async-storage/async-storage'

import type { KeyboardDictionaryResult } from '@/lib/dictionary'

type DictionaryBookmarkEntry = {
  id: string
  word: string
  language: string
  result?: KeyboardDictionaryResult
  createdAt: string
}

const BOOKMARKS_KEY = 'hypa-keyboard-dictionary-bookmarks'

const createBookmarkId = () =>
  `dictionary-bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const makeKey = (word: string, language: string) =>
  `${word.trim().toLowerCase()}::${language.trim().toLowerCase()}`

export async function getDictionaryBookmarks(): Promise<DictionaryBookmarkEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BOOKMARKS_KEY)

    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveDictionaryBookmarks(bookmarks: DictionaryBookmarkEntry[]) {
  await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
}

export async function toggleDictionaryBookmark(params: {
  word: string
  language: string
  result?: KeyboardDictionaryResult
}) {
  const current = await getDictionaryBookmarks()
  const nextKey = makeKey(params.word, params.language)
  const existing = current.find(
    (entry) => makeKey(entry.word, entry.language) === nextKey,
  )

  if (existing) {
    const updated = current.filter(
      (entry) => makeKey(entry.word, entry.language) !== nextKey,
    )
    await saveDictionaryBookmarks(updated)

    return { bookmarks: updated, bookmarked: false }
  }

  const nextEntry: DictionaryBookmarkEntry = {
    id: createBookmarkId(),
    word: params.word,
    language: params.language,
    result: params.result,
    createdAt: new Date().toISOString(),
  }

  const updated = [nextEntry, ...current]
  await saveDictionaryBookmarks(updated)

  return { bookmarks: updated, bookmarked: true }
}

export async function removeDictionaryBookmark(word: string, language: string) {
  const current = await getDictionaryBookmarks()
  const nextKey = makeKey(word, language)
  const updated = current.filter(
    (entry) => makeKey(entry.word, entry.language) !== nextKey,
  )

  await saveDictionaryBookmarks(updated)

  return updated
}
