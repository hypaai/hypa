---
name: hypa-intelligence-translate-tts
description: Maintain, review, or debug text-to-speech behavior in the Hypa Intelligence mobile app's Translate screen. Use for speaker controls, autoplay and manual playback, concurrent or stale TTS requests, audio-player lifecycle, TTS language and model voice selection, auto-detected source speech language, output voice changes, Android/iOS playback parity, or Translate text sharing in apps/hypa-intelligence-mobile. Do not use for native keyboard Translate-to-Undo state.
---

# Hypa Intelligence Translate TTS

Keep Translate-screen TTS behavior simple, language-correct, and safe when asynchronous requests overlap.

## Keep the scope separate

Work primarily in:

- `apps/hypa-intelligence-mobile/app/(dashboard)/translate.tsx`
- `apps/hypa-intelligence-mobile/components/modules/translate/source-panel.tsx`
- `apps/hypa-intelligence-mobile/components/modules/translate/result-panel.tsx`
- `apps/hypa-intelligence-mobile/components/voice-selector.tsx`
- `apps/hypa-intelligence-mobile/app/(dashboard)/settings.tsx`
- `apps/hypa-intelligence-mobile/lib/model-languages.ts`
- `apps/hypa-intelligence-mobile/lib/product-api.ts`
- `apps/hypa-intelligence-mobile/lib/share-audio.ts`

Do not alter native keyboard translation or Undo behavior for an app-screen TTS issue. Use `hypa-keyboard-translation-undo` when that state machine is involved.

Before editing, inspect the complete relevant functions and the working-tree diff. Preserve unrelated user changes.

## Preserve language and voice behavior

- Use a speaker icon such as `Volume2` for TTS; reserve microphone icons for speech input.
- Derive available TTS languages from the selected TTS model.
- Derive available voices from both the selected TTS model and spoken language.
- Treat the Settings TTS language and voice as defaults, not overrides for every Translate panel.
- Speak translated output using the current target language.
- Speak source text using the selected source language or the detected language when source is Auto Detect.
- Resolve the voice again when playback starts. If the model has no voice for that language, disable that panel's speaker cleanly.
- In automatic voice mode, keep per-target-language choices isolated. In manual mode, honor the selected global voice only when valid for the spoken language.

Use shared model configuration and existing helpers such as `resolvePlaybackVoice`, `getTtsLanguages`, and `getTtsVoicesForLanguage`. Do not duplicate model-language tables in UI code.

## Make the latest TTS request win

Apply one request generation or playback epoch across source, output, autoplay, and voice-triggered synthesis.

Whenever a new TTS call starts:

1. Stop and release active playback.
2. Invalidate all older synthesis and player-initialization callbacks.
3. Start the new request immediately, even if another request remains in flight.
4. Ignore stale success and error callbacks completely.
5. Allow only the latest response to create or start a player and update loading state.

Actual network cancellation is optional. Prefer one generation check over adding request ownership and cancellation machinery when ignoring stale responses is sufficient.

Keep manual speaker and voice controls available while synthesis is pending so user intent can supersede the request. Preserve the normal playing-button behavior: pressing the currently playing panel stops it instead of synthesizing the same audio again.

Guard asynchronous player setup both before and after awaited initialization. A newer request may arrive after a player is created but before playback begins.

## Keep sharing independent from TTS

The Translate output Share action shares text only:

```text
English → Yoruba

Hello, how are you?

Bawo ni?

Translated by Hypa Intelligence
```

Do not synthesize, cache, attach, or share output audio from this action. Stop and invalidate pending or active TTS before opening the share sheet so a late response cannot begin playback. Keep recorded-clip or native-keyboard audio sharing separate.

## Chat tab playback is separate

The Intelligence mobile Chat tab does not use the Translate player. It plays agent `audio` through `hooks/use-chat-audio.ts`: one playback epoch, stop and release the current player before the next, and ignore a result that is no longer the latest. Voice mode auto-plays the reply, then starts the existing speech recorder again. Sharing a chat reply’s audio uses `lib/share-audio.ts`. That path does not synthesize Translate-screen speech and does not change the Translate share-text action.

## Prefer less state

- Reuse the existing playback epoch for stale synthesis responses when it represents the same invalidation boundary.
- Avoid per-panel mutation instances, audio caches, compatibility fields, or duplicated pending flags unless a demonstrated requirement needs them.
- Hypa Intelligence is pre-release. Remove replaced fields and fallbacks instead of adding migrations unless compatibility is explicitly requested.
- Delete stale props, imports, helpers, and branches after simplifying behavior.

## Validate changes

Run focused checks:

```sh
git diff --check
pnpm exec prettier --check "apps/hypa-intelligence-mobile/app/(dashboard)/translate.tsx" \
  apps/hypa-intelligence-mobile/components/modules/translate/source-panel.tsx \
  apps/hypa-intelligence-mobile/components/modules/translate/result-panel.tsx
pnpm --filter @hypa/intelligence exec tsc --noEmit
```

Report unrelated existing type errors separately. Manually verify:

1. Autoplay supersedes an older pending or playing request.
2. Either panel's speaker supersedes a request from the other panel.
3. Changing output voice while pending starts the newly selected voice and suppresses the old result.
4. Rapid source/output taps never play stale audio or let stale errors clear current loading state.
5. Auto Detect source playback uses the detected language; output playback follows target-language changes.
6. Sharing produces only the required text and no TTS starts afterward.
7. Android and iOS show the same user-visible result.
