import assert from "node:assert/strict";
import test from "node:test";
import {
  appendHistoryPage,
  applyBookmark,
  mapHistoryResponse,
  mapTranslationRecord,
  prependHistoryItem,
  type TranslationHistoryItem,
} from "./index";

const item = (id: string, translatedText = id): TranslationHistoryItem => ({
  id,
  sourceLanguage: "English",
  targetLanguage: "French",
  originalText: "Hello",
  translatedText,
});

test("maps a saved translation using the id the client sent", () => {
  const mapped = mapTranslationRecord({
    id: "row-1",
    client_request_id: "client-1",
    input_text: "Hello",
    output_text: "Bonjour",
    source_lang: "English",
    target_lang: "French",
    bookmarked: true,
    liked: false,
    correction: "Salut",
    thinking: "A greeting.",
    created_at: "2026-10-01T00:00:00.000Z",
  });

  assert.equal(mapped.id, "client-1");
  assert.equal(mapped.originalText, "Hello");
  assert.equal(mapped.sourceLanguage, "English");
  assert.equal(mapped.targetLanguage, "French");
  assert.equal(mapped.bookmarked, true);
  assert.equal(mapped.liked, false);
  assert.equal(mapped.correction, "Salut");
  assert.equal(mapped.translatedText, "<think>A greeting.</think>\nBonjour");
});

test("falls back to the row id and defaults for a translation saved without them", () => {
  const mapped = mapTranslationRecord({ id: "row-1", output_text: "Bonjour" });

  assert.equal(mapped.id, "row-1");
  assert.equal(mapped.sourceLanguage, "Auto-detect");
  assert.equal(mapped.bookmarked, false);
  assert.equal(mapped.liked, null);
  assert.equal(mapped.correction, undefined);
});

test("offers another page only while the API returns a cursor", () => {
  const page = (nextCursor: string | null) =>
    mapHistoryResponse({ nextCursor, data: [] });

  assert.equal(
    page("2026-10-01T00:00:00.000Z_b").meta.nextCursor,
    "2026-10-01T00:00:00.000Z_b",
  );
  assert.equal(page(null).meta.nextCursor, null);
});

test("appends a loaded page once and takes over its cursor", () => {
  const current = prependHistoryItem(
    {
      translations: [item("a"), item("b")],
      meta: mapHistoryResponse({ nextCursor: "c1", data: [] }).meta,
    },
    item("new"),
  );
  const next = {
    translations: [item("b"), item("c")],
    meta: mapHistoryResponse({ nextCursor: null, data: [] }).meta,
  };

  const merged = appendHistoryPage(current, next);

  assert.deepEqual(
    merged.translations.map((entry) => entry.id),
    ["new", "a", "b", "c"],
  );
  assert.equal(merged.meta.nextCursor, null);
});

test("starts a history from a page when nothing is loaded yet", () => {
  const next = {
    translations: [item("a")],
    meta: prependHistoryItem(undefined, item("a")).meta,
  };

  assert.deepEqual(
    appendHistoryPage(undefined, next).translations.map((entry) => entry.id),
    ["a"],
  );
});

test("puts a new translation first and replaces the same id", () => {
  const first = prependHistoryItem(undefined, item("a", "old"));
  assert.equal(first.meta.nextCursor, null);

  const second = prependHistoryItem(first, item("b"));
  const again = prependHistoryItem(second, item("a", "new"));

  assert.deepEqual(
    again.translations.map((entry) => `${entry.id}:${entry.translatedText}`),
    ["a:new", "b:b"],
  );
  assert.equal(again.meta, first.meta);
});

test("keeps the cursor of the loaded history when a translation is added", () => {
  const meta = mapHistoryResponse({ nextCursor: "c1", data: [] }).meta;
  const added = prependHistoryItem(
    { translations: [item("a")], meta },
    item("new"),
  );

  assert.equal(added.meta.nextCursor, "c1");
});

test("bookmarking flags the matching history entry", () => {
  const meta = { nextCursor: null };
  const history = { translations: [item("a"), item("b")], meta };
  const next = applyBookmark(history, "b", true);

  assert.deepEqual(
    next?.translations.map((entry) => entry.bookmarked),
    [undefined, true],
  );
});

test("unbookmarking clears the matching history flag", () => {
  const meta = { nextCursor: null };
  const history = { translations: [{ ...item("a"), bookmarked: true }], meta };
  const next = applyBookmark(history, "a", false);

  assert.equal(next?.translations[0].bookmarked, false);
});
