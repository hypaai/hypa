import {
  AgentStreamError,
  streamAgent,
  waitForAgent,
  type AgentConnection,
  type AgentEvent,
  type AgentRequestBody,
} from '@hypa/intelligence-core/agent-stream';

export async function runChatTurn(input: {
  connection: AgentConnection;
  body: AgentRequestBody;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  onReconnect: () => void;
}) {
  let terminal = false;
  const onEvent = (event: AgentEvent) => {
    if (input.signal.aborted) return;
    if (event.type === 'done' || event.type === 'error') terminal = true;
    input.onEvent(event);
  };
  try {
    await streamAgent({ ...input, onEvent });
  } catch (error) {
    if (input.signal.aborted) throw error;
    if (error instanceof AgentStreamError && error.status && error.status >= 400) throw error;
    if (terminal) return;
  }
  if (terminal || input.signal.aborted) return;
  input.onReconnect();
  const result = await waitForAgent({
    connection: input.connection,
    requestId: input.body.requestId,
    signal: input.signal,
  });
  if (input.signal.aborted) return;
  if (result.status !== 'done') throw new Error('The reply is not ready. Reconnect to check it without paying again.');
  onEvent({ type: 'done', action: result.action ?? 'show', text: result.message,
    speak: Boolean(result.audioUrl), audioUrl: result.audioUrl, chatId: result.chatId });
}

export function fitChatImage(width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
