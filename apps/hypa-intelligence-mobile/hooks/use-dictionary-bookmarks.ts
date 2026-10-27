import { useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addDictionaryBookmarkEntry,
  getDictionaryBookmarkEntries,
  removeDictionaryBookmarkEntry,
} from '@/api/dictionary-bookmarks'
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings'
import {
  adaptDictionaryResult,
  type KeyboardDictionaryResult,
  toDictionaryResponse,
} from '@/lib/dictionary'
import {
  getDictionaryBookmarks,
  removeDictionaryBookmark,
  saveDictionaryBookmarks,
  toggleDictionaryBookmark,
} from '@/lib/dictionary-bookmarks'

const BOOKMARKS_KEY = 'keyboard-dictionary-bookmarks'
const REMOTE_BOOKMARKS_KEY = 'keyboard-dictionary-bookmarks-remote'

const makeKey = (word: string, language: string) =>
  `${word.trim().toLowerCase()}::${language.trim().toLowerCase()}`

export function useDictionaryBookmarks() {
  const queryClient = useQueryClient()
  const { settings } = useKeyboardSettings()
  const hasToken = !!settings?.token?.trim()

  const bookmarksQuery = useQuery({
    queryKey: [BOOKMARKS_KEY],
    queryFn: getDictionaryBookmarks,
  })

  const remoteBookmarksQuery = useQuery({
    queryKey: [REMOTE_BOOKMARKS_KEY],
    queryFn: getDictionaryBookmarkEntries,
    enabled: hasToken,
  })

  useEffect(() => {
    if (!remoteBookmarksQuery.data?.length) return

    const local = bookmarksQuery.data ?? []
    const merged = new Map<string, (typeof local)[number]>()

    for (const entry of remoteBookmarksQuery.data) {
      const key = makeKey(entry.word, entry.language)
      merged.set(key, {
        id: entry.id,
        word: entry.word,
        language: entry.language,
        result: entry.result?.parsed
          ? adaptDictionaryResult(entry.result.parsed, entry.language)
          : undefined,
        createdAt: entry.created_at,
      })
    }

    for (const entry of local) {
      const key = makeKey(entry.word, entry.language)
      const existing = merged.get(key)

      if (!existing || entry.createdAt > existing.createdAt) {
        merged.set(key, entry)
      }
    }

    const nextBookmarks = Array.from(merged.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )

    void saveDictionaryBookmarks(nextBookmarks)
    queryClient.setQueryData([BOOKMARKS_KEY], nextBookmarks)
  }, [bookmarksQuery.data, queryClient, remoteBookmarksQuery.data])

  const toggleMutation = useMutation({
    mutationFn: async (params: {
      word: string
      language: string
      result?: KeyboardDictionaryResult
    }) => {
      const outcome = await toggleDictionaryBookmark(params)

      if (hasToken && params.result) {
        if (outcome.bookmarked) {
          await addDictionaryBookmarkEntry(
            params.word,
            params.language,
            toDictionaryResponse(params.result),
          ).catch(() => {})
        } else {
          await removeDictionaryBookmarkEntry(params.word, params.language).catch(
            () => {},
          )
        }
      }

      return outcome
    },
    onSuccess: ({ bookmarks }) => {
      queryClient.setQueryData([BOOKMARKS_KEY], bookmarks)
    },
  })

  const removeMutation = useMutation({
    mutationFn: async (params: { word: string; language: string }) => {
      const updated = await removeDictionaryBookmark(params.word, params.language)

      if (hasToken) {
        await removeDictionaryBookmarkEntry(params.word, params.language).catch(
          () => {},
        )
      }

      return updated
    },
    onSuccess: (bookmarks) => {
      queryClient.setQueryData([BOOKMARKS_KEY], bookmarks)
    },
  })

  const bookmarks = bookmarksQuery.data ?? []

  const isBookmarked = useCallback(
    (word: string, language: string) =>
      bookmarks.some(
        (entry) => makeKey(entry.word, entry.language) === makeKey(word, language),
      ),
    [bookmarks],
  )

  const getBookmark = useCallback(
    (word: string, language: string) =>
      bookmarks.find(
        (entry) => makeKey(entry.word, entry.language) === makeKey(word, language),
      ) ?? null,
    [bookmarks],
  )

  return {
    bookmarks,
    isLoading: bookmarksQuery.isLoading || remoteBookmarksQuery.isLoading,
    isError: bookmarksQuery.isError || remoteBookmarksQuery.isError,
    isBookmarked,
    getBookmark,
    toggleBookmark: toggleMutation.mutateAsync,
    removeBookmark: removeMutation.mutateAsync,
    isUpdating: toggleMutation.isPending || removeMutation.isPending,
  }
}
