import type { KeyboardDictionaryResult } from '@/lib/dictionary';

type TypedItem = {
  partOfSpeech?: string;
  text: string;
};

const cleanSpeechText = (value: string) => value.replace(/\s+/g, ' ').trim();

export const buildWordOnlySpeech = (word: string) => cleanSpeechText(word);

export const buildSectionSpeech = (title: string, body: string) =>
  cleanSpeechText(`${title}. ${body}`);

const buildTypedItemSpeech = (item: TypedItem) =>
  item.partOfSpeech
    ? cleanSpeechText(`${item.partOfSpeech}. ${item.text}`)
    : cleanSpeechText(item.text);

export const joinLabeledItems = (items: TypedItem[] | undefined, separator = '. ') =>
  items?.map(buildTypedItemSpeech).join(separator) ?? '';

export const buildDictionaryResultSpeech = (data: KeyboardDictionaryResult) => {
  const parts = [buildSectionSpeech('Word', buildWordOnlySpeech(data.word))];

  if (data.definitions.length) {
    parts.push(buildSectionSpeech('Definition', joinLabeledItems(data.definitions)));
  }

  if (data.usageExamples?.length) {
    parts.push(
      buildSectionSpeech(
        'Usage Examples',
        joinLabeledItems(
          data.usageExamples.map((item) => ({
            partOfSpeech: item.partOfSpeech,
            text: item.example,
          }))
        )
      )
    );
  }

  if (data.synonyms.length) {
    parts.push(buildSectionSpeech('Synonyms', data.synonyms.join(', ')));
  }

  if (data.antonyms.length) {
    parts.push(buildSectionSpeech('Antonyms', data.antonyms.join(', ')));
  }

  if (data.culturalContext) {
    parts.push(buildSectionSpeech('Cultural Context', data.culturalContext));
  }

  if (data.funFact) {
    parts.push(buildSectionSpeech('Fun Fact', data.funFact));
  }

  return parts.join('. ');
};
