import assert from "node:assert/strict";
import test from "node:test";
import {
  attachThinking,
  hydrateTranslationThinking,
  parseTranslation,
} from "./thinking";
import {
  buildMtRequest,
  buildMtThinkingRequest,
  hasThinking,
  mapMtResponse,
} from "./index";

test("attaches and parses saved thinking without changing the translation", () => {
  const saved = attachThinking("Bonjour", "The greeting maps directly.");

  assert.deepEqual(parseTranslation(saved), {
    thinkingContent: "The greeting maps directly.",
    mainContent: "Bonjour",
  });
});

test("hydrates structured thinking and replaces an older embedded value", () => {
  const hydrated = hydrateTranslationThinking(
    "<think>Old reasoning</think>\nBonjour",
    "Saved reasoning",
  );

  assert.deepEqual(parseTranslation(hydrated), {
    thinkingContent: "Saved reasoning",
    mainContent: "Bonjour",
  });
});

test("keeps legacy translations unchanged when no structured thinking exists", () => {
  const legacy = "<think>Legacy reasoning</think>\nBonjour";
  assert.equal(hydrateTranslationThinking(legacy), legacy);
});

test("removes every complete thinking block and supports the alternate tag", () => {
  assert.deepEqual(
    parseTranslation(
      "<|think>First pass</think>Bonjour<think>Second pass</think>",
    ),
    {
      thinkingContent: "First pass\n\nSecond pass",
      mainContent: "Bonjour",
    },
  );
});

test("never exposes an orphan opening thinking tag or its unfinished content", () => {
  assert.deepEqual(parseTranslation("Bonjour<think>unfinished"), {
    thinkingContent: "unfinished",
    mainContent: "Bonjour",
  });
  assert.deepEqual(parseTranslation("<|think>unfinished"), {
    thinkingContent: "unfinished",
    mainContent: "",
  });
  assert.deepEqual(parseTranslation("<think>done<think>"), {
    thinkingContent: "done",
    mainContent: "",
  });
});

test("turns the shared Auto Router option into provider-auto requests", () => {
  const translation = buildMtRequest(
    { text: "Hello", targetLang: "French", llmModel: "auto" },
    "translation-1",
  );
  assert.equal(translation.body.provider, "auto");
  assert.equal(translation.body.model, undefined);
  assert.equal(hasThinking("auto"), true);

  const thinking = buildMtThinkingRequest({
    sourceText: "Hello",
    targetText: "Bonjour",
    sourceLang: "English",
    targetLang: "French",
    llmModel: "auto",
    translationId: "translation-1",
  });
  assert.equal(thinking.body.provider, "auto");
  assert.equal(thinking.body.model, undefined);
  assert.equal(thinking.body.client_request_id, "translation-1");
});

const thinkingParams = {
  sourceText: "Hello",
  targetText: "Bonjour",
  sourceLang: "English",
  targetLang: "French",
  llmModel: "auto",
  translationId: "translation-1",
};

test("names the routed model on an Auto request when it can explain", () => {
  for (const llmModel of ["auto", "Hypa-Llama3.1-8b-SFT"]) {
    const thinking = buildMtThinkingRequest({
      ...thinkingParams,
      llmModel,
      translationModel: "gpt-4.1-nano",
    });
    assert.equal(thinking.body.provider, "auto", llmModel);
    assert.equal(thinking.body.model, "gpt-4.1-nano");
  }
});

test("keeps an explicit model when no routed model is known", () => {
  const thinking = buildMtThinkingRequest({
    ...thinkingParams,
    llmModel: "gpt-4.1-nano",
  });
  assert.equal(thinking.body.provider, "openai");
  assert.equal(thinking.body.model, "gpt-4.1-nano");
});

test("asks Auto when the routed model is missing, cannot explain, or unknown", () => {
  for (const translationModel of [
    undefined,
    null,
    "",
    "mansa-translate",
    "muse-spark-1.3",
    "retired-model",
  ]) {
    const thinking = buildMtThinkingRequest({
      ...thinkingParams,
      translationModel,
    });
    assert.equal(thinking.body.provider, "auto", String(translationModel));
    assert.equal(thinking.body.model, undefined);
  }
});

test("reads the routed model from an Auto answer only", () => {
  const auto = `data: ${JSON.stringify({
    choices: [{ message: { role: "assistant", content: "Bonjour" } }],
    auto: { policy: "auto-mt-1", attempts: [] },
    provider: "openai",
    model: "gpt-4.1-nano",
  })}`;
  assert.equal(
    mapMtResponse(auto, { sourceLang: "English" }, "translation-1").model,
    "gpt-4.1-nano",
  );

  const stream = `data: ${JSON.stringify({
    model: "gpt-4.1-nano-2025-04-14",
    choices: [{ delta: { content: "Bonjour" } }],
  })}\ndata: [DONE]`;
  assert.equal(
    mapMtResponse(stream, { sourceLang: "English" }, "translation-1").model,
    null,
  );
  assert.equal(
    mapMtResponse("Bonjour", { sourceLang: "English" }, "translation-1").model,
    null,
  );
});
