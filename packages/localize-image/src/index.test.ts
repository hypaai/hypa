import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildReplacementPrompt,
  editImage,
  generateImage,
  ImageBlockedError,
  MuseImageError,
  type SourceImage,
} from "./index.ts";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const SOURCE: SourceImage = { data: PNG, mimeType: "image/png" };
const answer = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
  });
const png = () => answer(200, { data: [{ b64_json: Buffer.from(PNG).toString("base64") }] });

interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function stub(...replies: (() => Response)[]) {
  const calls: Call[] = [];
  const send = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)),
      headers: init.headers as Record<string, string>,
    });

    return (replies[Math.min(calls.length, replies.length) - 1] ?? png)();
  }) as unknown as typeof fetch;

  return { calls, send };
}

const options = (send: typeof fetch) => ({
  apiKey: "test-key",
  fetch: send,
  retryDelayMs: 0,
});

describe("editImage", () => {
  it("sends the images as data URLs and asks for a PNG", async () => {
    const { calls, send } = stub(png);
    const result = await editImage("Translate", [SOURCE], options(send));

    assert.equal(calls[0].url, "https://api.meta.ai/v1/images/edits");
    assert.equal(calls[0].headers.Authorization, "Bearer test-key");
    assert.deepEqual(calls[0].body, {
      model: "muse-image-1.0",
      prompt: "Translate",
      images: [
        { image_url: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` },
      ],
      response_format: "b64_json",
      output_format: "png",
    });
    assert.deepEqual([...result], [...PNG]);
  });

  it("never sends mask or moderation, which Muse Image rejects", async () => {
    const { calls, send } = stub(png);

    await editImage("Translate", [SOURCE], options(send));
    assert.ok(!("mask" in calls[0].body));
    assert.ok(!("moderation" in calls[0].body));
  });

  it("accepts base64 text as well as bytes", async () => {
    const { calls, send } = stub(png);
    const base64 = Buffer.from(PNG).toString("base64");

    await editImage("Go", [{ data: base64, mimeType: "image/png" }], options(send));
    assert.match(String((calls[0].body.images as { image_url: string }[])[0].image_url), new RegExp(base64));
  });

  it("takes between one and ten images", () => {
    assert.throws(() => editImage("Go", [], { apiKey: "k" }), RangeError);
    assert.throws(
      () => editImage("Go", Array(11).fill(SOURCE), { apiKey: "k" }),
      RangeError,
    );
  });

  it("turns a content-policy block into ImageBlockedError", async () => {
    const { send } = stub(() =>
      answer(400, { error: { code: "content_policy_violation", message: "filtered" } }),
    );

    await assert.rejects(
      editImage("Go", [SOURCE], options(send)),
      ImageBlockedError,
    );
  });

  it("retries a 503 once, then gives up", async () => {
    const warming = stub(() => answer(503, "warming up"), png);

    await editImage("Go", [SOURCE], options(warming.send));
    assert.equal(warming.calls.length, 2);

    const down = stub(() => answer(503, "down"));

    await assert.rejects(
      editImage("Go", [SOURCE], options(down.send)),
      (error: MuseImageError) => error.status === 503,
    );
    assert.equal(down.calls.length, 2);
  });

  it("does not retry other errors", async () => {
    const { calls, send } = stub(() => answer(500, "boom"));

    await assert.rejects(editImage("Go", [SOURCE], options(send)), MuseImageError);
    assert.equal(calls.length, 1);
  });

  it("rejects an answer that is not a PNG", async () => {
    const { send } = stub(() =>
      answer(200, { data: [{ b64_json: Buffer.from("not an image").toString("base64") }] }),
    );

    await assert.rejects(editImage("Go", [SOURCE], options(send)), MuseImageError);
  });

  it("needs an API key", async () => {
    const saved = process.env.META_MODEL_API_KEY;

    delete process.env.META_MODEL_API_KEY;
    try {
      await assert.rejects(editImage("Go", [SOURCE], { fetch: stub(png).send }), /META_MODEL_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.META_MODEL_API_KEY = saved;
    }
  });
});

describe("generateImage", () => {
  it("uses the generations endpoint and sends no images", async () => {
    const { calls, send } = stub(png);

    await generateImage("A market stall", options(send));
    assert.equal(calls[0].url, "https://api.meta.ai/v1/images/generations");
    assert.ok(!("images" in calls[0].body));
  });
});

describe("buildReplacementPrompt", () => {
  it("lists every replacement and asks for nothing else to change", () => {
    const prompt = buildReplacementPrompt("Yoruba", [
      { from: "NO ENTRY", to: "Má wọlé" },
    ]);

    assert.match(prompt, /text is in Yoruba/);
    assert.match(prompt, /1\. "NO ENTRY" -> "Má wọlé"/);
    assert.match(prompt, /Keep everything else identical/);
  });
});
