# @hypa/intelligence-core

Hypa Intelligence's product layer, in two entry points.

## `@hypa/intelligence-core` (server only)

- `HYPA_TOOLS`: the one tool list. hypa-api serves it at `/v2/mcp` and the agent (`/v2/agent`) offers it as function tools (`toFunctionTools()`), plus the agent-only `finish`. Combos are written once on a `HypaExecutor` (translate, speak, transcribe, look up, read image), which hypa-api implements and bills to the caller.
- Every model tool takes `model`: omit or `"auto"` for Auto, `"default"` for the catalog default, or a `provider/model` id from `list_models` (`toolModelChoices`). Contributor models are never offered.
- `runHypaTool(tool, executor, args)` validates the args, then runs the tool.

Never import this entry point from browser code.

## `@hypa/intelligence-core/agent-stream` (browser-safe)

The client for `POST /v2/agent` (SSE) and `GET /v2/agent/:requestId`, shared by Hypa Chat web, Intelligence web and, later, the mobile apps.

- `streamAgent({ connection, body, onEvent })`: sends one turn. It throws `AgentStreamError` when the request is rejected. A plain network error means the stream dropped: call `waitForAgent` with the same `requestId` to pick up the answer without a second charge.
- `applyAgentEvent(reply, event)`: folds an event into a reply (text, steps, failed tools, audio, keyboard action, usage, cost). `stepsFromTrace(tool_trace)` rebuilds steps for a saved message.
- `toolLabels(name)`: one short line per tool (running, done, failed). Small surfaces show only these, never the full trace.
- `resolveAgentAudio(url, connection)`: inline (anonymous) audio is a data URL; signed-in audio is a signed API path fetched with the login token.
- `imageToAttachment(file)` and `blobToBase64(blob)`: photos downscaled to 1,600 px JPEG, and recordings, for the request body.

`connection.token` is the login token. Omit it for anonymous users, who get the same tools and models, are not billed, and have nothing saved.

## Tests

```bash
yarn workspace @hypa/intelligence-core test
```
