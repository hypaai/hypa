export class RequestTimeoutError extends Error {
  readonly code = 'request_timeout';
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function requestCancelled(): Error & { code: string } {
  return Object.assign(new Error('Stopped by user.'), {
    name: 'AbortError',
    code: 'request_cancelled',
  });
}

export async function withRequestDeadline<T>(
  parent: AbortSignal | undefined,
  timeoutMs: number,
  label: string,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  parent?.throwIfAborted();
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new RequestTimeoutError(`${label} timed out.`)),
    timeoutMs,
  );
  let onAbort: () => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason ?? requestCancelled());
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    if (parent?.aborted) onParentAbort();
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return run(controller.signal);
      }),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
