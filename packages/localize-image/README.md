# @hypa/localize-image

Edit or generate an image with Meta's Muse Image: for example, replace the text in a photo of a sign with another language while the rest of the picture stays the same.

```ts
import {
  buildReplacementPrompt,
  editImage,
  ImageBlockedError,
} from "@hypa/localize-image";

const prompt = buildReplacementPrompt("Yoruba", [
  { from: "NO ENTRY", to: "Má wọlé" },
]);

try {
  const png = await editImage(prompt, [{ data: bytes, mimeType: "image/jpeg" }]);
} catch (error) {
  if (error instanceof ImageBlockedError) {
    // The model declined this image or prompt.
  }
}
```

The key is read from `META_MODEL_API_KEY`, or pass `apiKey` in the options.

## What it takes care of

- Sends 1 to 10 source images as data URLs, and always asks for a PNG back.
- Never sends `mask` or `moderation`: Muse Image answers both with a 400.
- Turns a content-policy block into one clear `ImageBlockedError`.
- Retries a 503 once, because the model can still be warming up.
- Checks that the answer really is a PNG.

Muse Image does not know every language well, so translate first with a translation model and put the exact words in the prompt. `buildReplacementPrompt` does that. The folder `evals/image` measures how well this works.

## Tests

```sh
node --test src/index.test.ts
```

Needs Node 22.6 or newer, and no other dependencies.
