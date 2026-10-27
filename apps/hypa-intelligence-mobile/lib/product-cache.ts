import type { WordResult } from '@/lib/product-api';

const dictionaryResults = new Map<string, WordResult>();

const keyFor = (word: string, language: string) => `${word.trim().toLowerCase()}::${language.trim().toLowerCase()}`;

export function setDictionaryResult(result: WordResult, language = result.language) {
  dictionaryResults.set(keyFor(result.word, language), result);
}

export function getDictionaryResult(word: string, language: string) {
  return dictionaryResults.get(keyFor(word, language)) ?? null;
}
