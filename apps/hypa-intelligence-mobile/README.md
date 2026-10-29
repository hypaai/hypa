# Hypa Intelligence (mobile)

Expo app with the Hypa keyboard. Tabs: Chat, Translate, Dictionary, Settings. The keyboard's setup and usage stats are in Profile.

## Chat tab

A chat with Hypa's tools built in. The header matches Translate: glass history and profile buttons, with Chat in the middle (tap it for What Hypa stores and Delete chat). A glass New chat button sits next to profile. An empty chat greets the user by name. The composer is one bar: photo, message, mic (dictate), and a round button that sends, or opens voice mode when the message is empty. The user types or speaks in any language, can attach a photo, and the agent picks tools (translate, speak, transcribe, read image, dictionary). Replies stream in through `POST /v2/agent` (`@hypa/intelligence-core/agent-stream`, using `expo/fetch` so the body streams). They can include audio with a play button.

- **Model:** Muse Spark plans each reply and Hypa's own models do the work (each tool uses Hypa Auto routing). The assistant model is chosen only in Settings › Assistant, which lists only tool-capable, non-contributor models (`getAssistantModels`). The default is `meta` / `muse-spark-1.3`, set in `lib/keyboard-settings.ts` and not as a `models.json` AC default, which would also change the dictionary model. Voice input uses the STT provider and model from Settings.
- **Signed out:** full Chat with the same tools and models. Hypa's anonymous account pays, so the user is not charged. There's no chat list, and the one temporary chat lasts until the app closes.
- **Signed in:** chats are saved. History (the clock button) opens the list (`GET /conversations?surface=app,keyboard`) shows app chats with the one "Keyboard" thread pinned on top, never Lab chats. Swipe left or use the chat menu to delete a chat (`DELETE /conversations/:id`), which removes its messages, audio and photos.
- **Voice mode:** the round waveform button in the composer (shown while the message is empty). Hold to talk, or tap and Hypa sends when you stop speaking. The turn is sent with `preferAudio: true`, the reply plays and the app starts listening again. Captions are shown in large text.
- **Steps:** each reply shows a chip per tool. Tap them for the model that ran and a short result. A failed tool is a red chip, never a success.
- **Long press:** Copy, Share (audio when the reply has it), Speak (TTS of any message), Regenerate. Regenerate sends a new `requestId`, so it is a new answer and a new charge.
- **Reconnect:** each turn has its own `requestId`. If the stream drops, the app polls `GET /v2/agent/:requestId` with the same id (`waitForAgent`) and fills in the same answer without a second charge. For anonymous turns this works only while the server still holds the job.
- **Privacy:** Chat menu › "What Hypa stores" shows `@hypa/config/json/chat-privacy`.

To run Chat against the local API instead of production, start `pnpm --filter hypa-api dev` and set `EXPO_PUBLIC_API_BASE_URL=http://<your computer's LAN IP>:5678` before starting the app. The local agent bills nothing: Muse Spark plans each reply, translation goes through `/v2/translate/mt` (with Auto), speech and transcription use Hypa's own models, dictionary lookups use `/dictionary`, and photos are read by Muse Spark.

New native modules (`expo-image-picker`, `expo-image-manipulator`) need a new dev build: `pnpm --filter @hypa/intelligence ios` or `android`.
