/**
 * Edit or generate an image with Meta's Muse Image, for example to replace the
 * text in a photo of a sign with another language while the rest of the picture
 * stays the same.
 *
 * It calls the Meta API directly. The key comes from `META_MODEL_API_KEY`, or
 * from the `apiKey` option. The rules Muse Image needs are built in: the
 * request never sends `mask` or `moderation` (both are rejected with a 400),
 * the answer is always PNG, and a safety block becomes one clear error.
 */

export const MUSE_IMAGE_MODEL = "muse-image-1.0";
export const MUSE_IMAGE_EDITS_URL = "https://api.meta.ai/v1/images/edits";
export const MUSE_IMAGE_GENERATIONS_URL =
  "https://api.meta.ai/v1/images/generations";

/** Muse Image edits take 1 to 10 source images. */
export const MAX_SOURCE_IMAGES = 10;

export interface SourceImage {
  /** The file's bytes, or the same bytes as base64. */
  data: Uint8Array | string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface MuseImageOptions {
  apiKey?: string;
  model?: string;
  /** Replaces the Meta URL, for tests or a proxy. */
  endpoint?: string;
  signal?: AbortSignal;
  /** Defaults to 120 seconds. */
  timeoutMs?: number;
  /** Wait before the one retry after a 503. Defaults to 1 second. */
  retryDelayMs?: number;
  fetch?: typeof fetch;
}

/** The model refused the image or the prompt (a content-policy block). */
export class ImageBlockedError extends Error {
  constructor(message = "The model declined to process this image.") {
    super(message);
    this.name = "ImageBlockedError";
  }
}

/** Any other failure from the Meta API. */
export class MuseImageError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MuseImageError";
    this.status = status;
  }
}

export interface Replacement {
  from: string;
  to: string;
}

/**
 * A prompt that asks for exact replacements and nothing else. Give the model
 * the words to draw: Muse Image does not know every language well, so
 * translate first with a translation model and pass the result in `to`.
 */
export function buildReplacementPrompt(
  language: string,
  replacements: Replacement[],
): string {
  const list = replacements
    .map(({ from, to }, index) => `${index + 1}. "${from}" -> "${to}"`)
    .join("\n");

  return (
    `Edit this image so that its text is in ${language}. Replace each piece of text exactly as listed, ` +
    "character for character, including every accent and tone mark. Do not translate anything yourself, " +
    "do not add, remove or reword any text.\n" +
    `${list}\n` +
    "Keep everything else identical: layout, positions, fonts, colours, background, borders and objects."
  );
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function toBase64(data: Uint8Array | string): string {
  return typeof data === "string" ? data : Buffer.from(data).toString("base64");
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(
  url: string,
  body: Record<string, unknown>,
  options: MuseImageOptions,
): Promise<Uint8Array> {
  const apiKey = options.apiKey ?? process.env.META_MODEL_API_KEY;

  if (!apiKey) {
    throw new MuseImageError(
      "Set META_MODEL_API_KEY, or pass apiKey in the options.",
    );
  }
  const send = options.fetch ?? fetch;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  for (let attempt = 0; ; attempt++) {
    const response = await send(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const text = await response.text();

    // Muse Image answers 503 while a model is warming up. One retry is enough.
    if (response.status === 503 && attempt === 0) {
      await sleep(options.retryDelayMs ?? 1000);
      continue;
    }
    if (!response.ok) {
      if (response.status === 400 && /content_policy_violation/.test(text)) {
        throw new ImageBlockedError();
      }
      throw new MuseImageError(
        `Muse Image request failed (${response.status})`,
        response.status,
      );
    }
    const encoded = (
      JSON.parse(text) as { data?: { b64_json?: string }[] }
    ).data?.[0]?.b64_json;
    const bytes = encoded ? Uint8Array.from(Buffer.from(encoded, "base64")) : undefined;

    if (!bytes || !isPng(bytes)) {
      throw new MuseImageError("Muse Image returned no PNG image.");
    }

    return bytes;
  }
}

/** Edit one to ten images with a prompt. Returns the PNG. */
export function editImage(
  prompt: string,
  images: SourceImage[],
  options: MuseImageOptions = {},
): Promise<Uint8Array> {
  if (images.length < 1 || images.length > MAX_SOURCE_IMAGES) {
    throw new RangeError(
      `Send between 1 and ${MAX_SOURCE_IMAGES} source images.`,
    );
  }

  return request(
    options.endpoint ?? MUSE_IMAGE_EDITS_URL,
    {
      model: options.model ?? MUSE_IMAGE_MODEL,
      prompt,
      images: images.map((image) => ({
        image_url: `data:${image.mimeType};base64,${toBase64(image.data)}`,
      })),
      response_format: "b64_json",
      output_format: "png",
    },
    options,
  );
}

/** Generate a new image from a prompt. Returns the PNG. */
export function generateImage(
  prompt: string,
  options: MuseImageOptions = {},
): Promise<Uint8Array> {
  return request(
    options.endpoint ?? MUSE_IMAGE_GENERATIONS_URL,
    {
      model: options.model ?? MUSE_IMAGE_MODEL,
      prompt,
      response_format: "b64_json",
      output_format: "png",
    },
    options,
  );
}
