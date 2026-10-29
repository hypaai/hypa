import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTranslationThinking,
  type ThinkingHistoryCache,
  type ThinkingHistoryQueryKey,
} from "./thinking-history";

test("attaches thinking and updates matching history and bookmark entries", () => {
  const caches = new Map<string, ThinkingHistoryCache>([
    [
      "translationHistory/history/user-1",
      { translations: [{ id: "translation-1", translatedText: "Bonjour" }] },
    ],
    [
      "translationHistory/bookmarks/user-1",
      { translations: [{ id: "translation-1", translatedText: "Bonjour" }] },
    ],
  ]);

  const translatedText = applyTranslationThinking({
    currentText: "Bonjour",
    targetText: "Bonjour",
    thinking: "The greeting maps directly.",
    translationId: "translation-1",
    userId: "user-1",
    setHistoryQueryData: (queryKey, updater) => {
      const key = queryKey.join("/");
      const next = updater(caches.get(key));
      if (next) caches.set(key, next);
    },
  });

  assert.equal(
    translatedText,
    "<think>The greeting maps directly.</think>\nBonjour",
  );
  for (const mode of ["history", "bookmarks"] as const) {
    assert.equal(
      caches.get(`translationHistory/${mode}/user-1`)?.translations[0]
        .translatedText,
      translatedText,
    );
  }
});

test("does not touch caches without a signed-in user and translation id", () => {
  const touchedKeys: ThinkingHistoryQueryKey[] = [];

  const translatedText = applyTranslationThinking({
    currentText: "",
    targetText: "Bonjour",
    thinking: "Reasoning",
    setHistoryQueryData: (queryKey) => touchedKeys.push(queryKey),
  });

  assert.equal(translatedText, "<think>Reasoning</think>\nBonjour");
  assert.deepEqual(touchedKeys, []);
});
