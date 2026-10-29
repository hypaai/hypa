import assert from "node:assert/strict";
import test from "node:test";
import { buildDictionaryRequest } from "./index";

test("resolves a non-Hypa translation model to that provider's assistant model", () => {
  const request = buildDictionaryRequest({
    word: "apple",
    model: "gpt-4.1-nano",
  });

  assert.equal(request.provider, "openai");
  assert.equal(request.model_name, "gpt-4.1-nano");
});

test("resolves a Google translation model to the Google provider", () => {
  const request = buildDictionaryRequest({
    word: "apple",
    model: "gemini-3.5-flash",
  });

  assert.equal(request.provider, "google");
  assert.equal(request.model_name, "gemini-3.5-flash");
});

test("keeps the selected provider when the model is only a translation model", () => {
  const request = buildDictionaryRequest({
    word: "apple",
    model: "gpt-4o-mini",
    provider: "openai",
  });

  assert.equal(request.provider, "openai");
  assert.equal(request.model_name, "gpt-4.1-nano");
});

test("uses Auto Router for providers without an assistant model", () => {
  const request = buildDictionaryRequest({
    word: "apple",
    model: "mansa-translate",
    provider: "mansa",
  });

  assert.equal(request.provider, "auto");
  assert.equal(request.model_name, undefined);
});

test("keeps Auto Router in dictionary requests", () => {
  const request = buildDictionaryRequest({
    word: "apple",
    model: "auto",
    provider: "auto",
  });

  assert.equal(request.provider, "auto");
  assert.equal(request.model_name, undefined);
});

test("uses Auto Router when nothing is selected", () => {
  const request = buildDictionaryRequest({ word: "apple" });

  assert.equal(request.provider, "auto");
  assert.equal(request.model_name, undefined);
});

test("keeps an explicitly selected Hypa assistant model", () => {
  const request = buildDictionaryRequest({
    word: "apple",
    provider: "hypaai",
    model: "Hypa-Llama3.1-8b-SFT",
  });

  assert.equal(request.provider, "hypaai");
  assert.equal(request.model_name, "Hypa-Llama3.1-8b-SFT");
});
