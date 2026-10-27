import React, { useEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Body from '@/components/shared/body'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Text } from '@/components/ui/text'
import { adaptDictionaryResult } from '@/lib/dictionary'
import { useDictionarySearch } from '@/providers/dictionary-search-provider'
import WordDetail from '@/components/modules/dictionary/word-detail'

export default function WordPage() {
  const params = useLocalSearchParams<{ word?: string; lang?: string }>()
  const router = useRouter()
  const word = (params.word ?? '').trim()
  const lang = params.lang ?? 'English'
  const requestedDetailsKeyRef = useRef<string | null>(null)
  const {
    getCachedResult,
    search,
    searchError,
    isSearching,
    fetchDetails,
    detailsError,
    isFetchingDetailsFor,
  } = useDictionarySearch()

  const data = word ? getCachedResult(word, lang) : null
  const isFetchingDetails = word ? isFetchingDetailsFor(word, lang) : false
  const detailsRequestKey = `${word.toLowerCase()}::${lang.toLowerCase()}`

  useEffect(() => {
    if (!word) return

    if (!data && !isSearching && !searchError) {
      search({
        word,
        language: lang,
      })
      return
    }

    if (!data) return
    if (isFetchingDetails) return
    if (data.cultural_context?.length && data.fun_facts?.length) return
    if (requestedDetailsKeyRef.current === detailsRequestKey) return

    requestedDetailsKeyRef.current = detailsRequestKey
    fetchDetails({
      word,
      language: lang,
      cultural_context: true,
      fun_facts: true,
    })
  }, [
    data,
    detailsRequestKey,
    fetchDetails,
    isFetchingDetails,
    isSearching,
    lang,
    search,
    searchError,
    word,
  ])

  const viewData = useMemo(
    () => (data ? adaptDictionaryResult(data, lang) : null),
    [data, lang],
  )

  const isLoading = !!word && !data && !searchError && !detailsError

  if (isLoading) {
    return (
      <Body showBackground={false} enableScroll={false} hideBottomInset>
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#71717a" />
          <Text style={styles.message}>Loading "{word}"...</Text>
        </View>
      </Body>
    )
  }

  if (!viewData) {
    const message = detailsError ?? searchError ?? 'Word not found'

    return (
      <Body showBackground={false} enableScroll={false} hideBottomInset>
        <View style={styles.centered}>
          <Text style={styles.message}>{message}</Text>
        </View>
      </Body>
    )
  }

  return (
    <Body showBackground={false} enableScroll={false} hideBottomInset>
      <WordDetail
        data={viewData}
        isDetailsLoading={isFetchingDetails}
        onBack={() => router.back()}
      />
    </Body>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  message: {
    textAlign: 'center',
    opacity: 0.7,
  },
})