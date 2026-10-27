import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  dictionary,
  type DictionaryHistoryEntry,
  type PaginatedResponse,
} from '@/api/dictionary'
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings'

const HISTORY_KEY = 'keyboard-dictionary-history'

export function useDictionaryHistory(params?: {
  page?: number
  limit?: number
  query?: string
  enabled?: boolean
}) {
  const { settings } = useKeyboardSettings()
  const queryClient = useQueryClient()
  const hasToken = !!settings?.token?.trim()

  const historyQuery = useQuery({
    queryKey: [HISTORY_KEY, params?.page, params?.limit, params?.query],
    queryFn: () =>
      dictionary.getHistory({
        page: params?.page,
        limit: params?.limit,
        query: params?.query,
      }),
    enabled: (params?.enabled ?? true) && hasToken,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dictionary.deleteHistory(id),
    onSuccess: (_result, deletedId) => {
      queryClient.setQueriesData<PaginatedResponse<DictionaryHistoryEntry>>(
        { queryKey: [HISTORY_KEY] },
        (current) => {
          if (!current) return current

          return {
            ...current,
            data: current.data.filter((entry) => entry.id !== deletedId),
          }
        },
      )
      queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] })
    },
  })

  return {
    history: historyQuery.data?.data ?? [],
    meta: historyQuery.data?.meta,
    isLoading: historyQuery.isLoading,
    isError: historyQuery.isError,
    error: historyQuery.error,
    deleteEntry: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}
