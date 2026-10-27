import type { DictionaryResponse, DictionarySection } from '@/api/dictionary'

export type KeyboardDictionaryResult = {
  word: string
  language?: string
  phonetic?: string
  partOfSpeech?: string
  definitions: { text: string; partOfSpeech?: string; context?: string }[]
  usageExamples?: { partOfSpeech?: string; example: string }[]
  exampleSentences?: string[]
  synonyms: string[]
  antonyms: string[]
  funFact?: string
  culturalContext?: string
  sectionHeaders?: Record<string, string>
}

const joinSectionText = (sections?: DictionarySection[]) =>
  sections?.map((item) => item.text).join('\n') || undefined

export function adaptDictionaryResult(
  data: DictionaryResponse,
  language: string,
): KeyboardDictionaryResult {
  return {
    word: data.word,
    language,
    partOfSpeech: data.definitions?.find((item) => item.type)?.type,
    definitions:
      data.definitions?.map((item) => ({
        text: item.text,
        partOfSpeech: item.type,
      })) ?? [],
    usageExamples:
      data.usage?.map((item) => ({
        partOfSpeech: item.type,
        example: item.text,
      })) ?? [],
    exampleSentences: data.usage?.map((item) => item.text) ?? [],
    synonyms: data.syms ?? [],
    antonyms: data.antm ?? [],
    funFact: joinSectionText(data.fun_facts),
    culturalContext: joinSectionText(data.cultural_context),
    sectionHeaders: {
      definition: 'Definition',
      usageExamples: 'Usage Examples',
      synonyms: 'Synonyms',
      antonyms: 'Antonyms',
      culturalContext: 'Cultural Context',
    },
  }
}

export function toDictionaryResponse(
  result: KeyboardDictionaryResult,
): DictionaryResponse {
  const toSections = (
    items:
      | { text: string; partOfSpeech?: string }[]
      | undefined,
  ): DictionarySection[] | undefined =>
    items?.length
      ? items.map((item) => ({
          text: item.text,
          type: item.partOfSpeech,
        }))
      : undefined

  return {
    word: result.word,
    definitions: toSections(result.definitions),
    usage: result.usageExamples?.length
      ? result.usageExamples.map((item) => ({
          text: item.example,
          type: item.partOfSpeech,
        }))
      : undefined,
    syms: result.synonyms.length ? result.synonyms : undefined,
    antm: result.antonyms.length ? result.antonyms : undefined,
    cultural_context: result.culturalContext
      ? [{ text: result.culturalContext }]
      : undefined,
    fun_facts: result.funFact ? [{ text: result.funFact }] : undefined,
  }
}
