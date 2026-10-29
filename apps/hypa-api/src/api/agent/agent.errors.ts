import type { AgentEvent } from './agent.loop';

export function agentFailure(
  error: unknown,
): Extract<AgentEvent, { type: 'error' }> {
  const source = error as {
    status?: number;
    code?: string;
    message?: string;
    response?: { status?: number; data?: { error?: { message?: string } } };
    error?: { message?: string };
  } | null;
  const status = source?.status ?? source?.response?.status;
  const cancelled = source?.code === 'request_cancelled';
  const timeout = !cancelled && (
    ['ETIMEDOUT', 'ECONNABORTED'].includes(source?.code ?? '') ||
    (error instanceof Error &&
      [
        'APIConnectionTimeoutError',
        'APIUserAbortError',
        'AbortError',
        'CanceledError',
      ].some((name) => name === error.name || name === error.constructor.name)));
  const code = cancelled ? 'request_cancelled' :
    status === 429 || source?.code === 'rate_limit_exceeded'
      ? 'rate_limited'
      : timeout
        ? 'request_timeout'
        : [
              'agent_failed',
              'incomplete_response',
              'budget_exceeded',
              'request_timeout',
              'request_cancelled',
              'rate_limited',
            ].includes(source?.code ?? '')
          ? source!.code!
          : 'agent_failed';
  let message =
    source?.response?.data?.error?.message ??
    source?.error?.message ??
    source?.message ??
    'Agent failed';
  for (const key of [
    'OPENAI_API_KEY',
    'META_MODEL_API_KEY',
    'GEMINI_API_KEY',
    'HYPA_API_KEY',
  ]) {
    const secret = process.env[key];
    if (secret) message = message.split(secret).join('[redacted]');
  }
  message = message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/sk-[\w-]+/g, '[redacted]')
    .slice(0, 1000);
  return { type: 'error', code, message };
}
