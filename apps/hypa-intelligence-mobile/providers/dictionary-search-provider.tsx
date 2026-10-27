import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useMutation } from '@tanstack/react-query'

import {
  dictionary,
  searchAbortController,
  type DictionaryResponse,
  type DictionarySearchParams,
} from '@/api/dictionary'

type DictionaryCache = Record<string, DictionaryResponse>

type DictionarySearchContextValue = {
  searchResult: DictionaryResponse | null
  searchError: string | null
  isSearching: boolean
  isSearchError: boolean
  detailsError: string | null
  isFetchingDetails: boolean
  search: (params: DictionarySearchParams) => void
  fetchDetails: (params: DictionarySearchParams) => void
  resetSearch: () => void
  getCachedResult: (word: string, language: string) => DictionaryResponse | null
  isFetchingDetailsFor: (word: string, language: string) => boolean
  primeResult: (params: DictionarySearchParams, result: DictionaryResponse) => void
}

const DictionarySearchContext =
  createContext<DictionarySearchContextValue | null>(null)

const getCacheKey = (word: string, language: string) =>
  `${word.trim().toLowerCase()}::${language.trim().toLowerCase()}`

export function DictionarySearchProvider({
  children,
}: {
  children: ReactNode
}) {
  const [cache, setCache] = useState<DictionaryCache>({})
  const [searchResult, setSearchResult] = useState<DictionaryResponse | null>(
    null,
  )
  const [detailsKey, setDetailsKey] = useState<string | null>(null)
  const detailsAbortRef = useRef<AbortController | null>(null)

  const setCachedResult = useCallback(
    (params: DictionarySearchParams, result: DictionaryResponse) => {
      const requestKey = getCacheKey(params.word, params.language)
      const resultKey = getCacheKey(result.word || params.word, params.language)

      setCache((current) => ({
        ...current,
        [requestKey]: result,
        [resultKey]: result,
      }))
    },
    [],
  )

  const searchMutation = useMutation({
    mutationFn: (params: DictionarySearchParams) => dictionary.search(params),
    onSuccess: (response, params) => {
      setSearchResult(response.data)
      setCachedResult(params, response.data)
    },
  })

  const detailsMutation = useMutation({
    mutationFn: (params: DictionarySearchParams) => {
      detailsAbortRef.current?.abort()
      const controller = new AbortController()
      detailsAbortRef.current = controller

      return dictionary.search(params, controller.signal)
    },
    onMutate: (params) => {
      setDetailsKey(getCacheKey(params.word, params.language))
    },
    onSuccess: (response, params) => {
      const requestKey = getCacheKey(params.word, params.language)
      const resultKey = getCacheKey(
        response.data.word || params.word,
        params.language,
      )
      const patchDetails = (current?: DictionaryResponse) => ({
        ...(current ?? response.data),
        cultural_context: response.data.cultural_context,
        fun_facts: response.data.fun_facts,
      })

      setCache((current) => ({
        ...current,
        [requestKey]: patchDetails(current[requestKey]),
        [resultKey]: patchDetails(current[resultKey] ?? current[requestKey]),
      }))
      setSearchResult((current) => {
        if (!current) return current
        const currentKey = getCacheKey(current.word, params.language)
        const responseKey = getCacheKey(response.data.word, params.language)

        return currentKey === responseKey
          ? {
              ...current,
              cultural_context: response.data.cultural_context,
              fun_facts: response.data.fun_facts,
            }
          : current
      })
    },
  })

  const getCachedResult = useCallback(
    (word: string, language: string) =>
      cache[getCacheKey(word, language)] ?? null,
    [cache],
  )

  const search = useCallback(
    (params: DictionarySearchParams) => {
      searchMutation.mutate(params)
    },
    [searchMutation],
  )

  const fetchDetails = useCallback(
    (params: DictionarySearchParams) => {
      const nextKey = getCacheKey(params.word, params.language)

      if (detailsMutation.isPending && detailsKey === nextKey) return

      detailsMutation.mutate({
        ...params,
        cultural_context: true,
        fun_facts: true,
        only_cc_and_ff: true,
      })
    },
    [detailsKey, detailsMutation],
  )

  const resetSearch = useCallback(() => {
    searchAbortController.abort()
    searchMutation.reset()
    setSearchResult(null)
  }, [searchMutation])

  const isFetchingDetailsFor = useCallback(
    (word: string, language: string) =>
      detailsMutation.isPending && detailsKey === getCacheKey(word, language),
    [detailsKey, detailsMutation.isPending],
  )

  const primeResult = useCallback(
    (params: DictionarySearchParams, result: DictionaryResponse) => {
      setCachedResult(params, result)
      setSearchResult(result)
    },
    [setCachedResult],
  )

  const value = useMemo<DictionarySearchContextValue>(
    () => ({
      searchResult,
      searchError: searchMutation.error?.message ?? null,
      isSearching: searchMutation.isPending,
      isSearchError: searchMutation.isError,
      detailsError: detailsMutation.error?.message ?? null,
      isFetchingDetails: detailsMutation.isPending,
      search,
      fetchDetails,
      resetSearch,
      getCachedResult,
      isFetchingDetailsFor,
      primeResult,
    }),
    [
      detailsMutation.error?.message,
      detailsMutation.isPending,
      fetchDetails,
      getCachedResult,
      isFetchingDetailsFor,
      primeResult,
      resetSearch,
      search,
      searchMutation.error?.message,
      searchMutation.isError,
      searchMutation.isPending,
      searchResult,
    ],
  )

  return (
    <DictionarySearchContext.Provider value={value}>
      {children}
    </DictionarySearchContext.Provider>
  )
}

export function useDictionarySearch() {
  const context = useContext(DictionarySearchContext)

  if (!context) {
    throw new Error(
      'useDictionarySearch must be used within DictionarySearchProvider',
    )
  }

  return context
}
