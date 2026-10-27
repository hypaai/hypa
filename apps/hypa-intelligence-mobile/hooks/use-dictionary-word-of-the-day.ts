import { useQuery } from '@tanstack/react-query'

import { dictionary } from '@/api/dictionary'

export function useDictionaryWordOfTheDay() {
  return useQuery({
    queryKey: ['dictionary', 'wordOfTheDay'],
    queryFn: dictionary.getWordOfTheDay,
    staleTime: 5 * 60_000,
  })
}
