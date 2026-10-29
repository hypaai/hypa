import { attachThinking } from "./thinking.ts";

export type ThinkingHistoryItem = {
  id: string;
  translatedText: string;
};

export type ThinkingHistoryCache = {
  translations: ThinkingHistoryItem[];
};

export type ThinkingHistoryQueryKey = readonly [
  "translationHistory",
  "history" | "bookmarks",
  string,
];

export type SetThinkingHistoryQueryData<TCache extends ThinkingHistoryCache> = (
  queryKey: ThinkingHistoryQueryKey,
  updater: (current: TCache | undefined) => TCache | undefined,
) => void;

export const applyTranslationThinking = <
  TCache extends ThinkingHistoryCache,
>(params: {
  currentText: string;
  targetText: string;
  thinking: string;
  translationId?: string | null;
  userId?: string | null;
  setHistoryQueryData: SetThinkingHistoryQueryData<TCache>;
}) => {
  const translatedText = attachThinking(
    params.currentText || params.targetText,
    params.thinking,
  );

  const { translationId, userId } = params;
  if (translationId && userId) {
    (["history", "bookmarks"] as const).forEach((mode) => {
      params.setHistoryQueryData(
        ["translationHistory", mode, userId],
        (current) => {
          if (!current) return current;
          return {
            ...current,
            translations: current.translations.map((item) =>
              item.id === translationId
                ? { ...item, translatedText }
                : item,
            ),
          };
        },
      );
    });
  }

  return translatedText;
};
