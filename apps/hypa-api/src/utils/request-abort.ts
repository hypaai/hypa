import type { Request } from 'express';

export function abortOnDisconnect(req: Request): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onClose = () => {
    if (!req.res?.writableEnded) controller.abort();
  };
  req.res?.once('close', onClose);

  return {
    signal: controller.signal,
    cleanup: () => {
      req.res?.removeListener('close', onClose);
      controller.abort();
    },
  };
}
