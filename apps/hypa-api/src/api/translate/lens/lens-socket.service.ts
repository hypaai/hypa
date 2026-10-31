import {
  type ExecutionContext,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { buildMtRequest, mapMtResponse } from '@hypa/translate-core';
import { parseTranslation } from '@hypa/translate-core/thinking';
import { EventEmitter } from 'events';
import type { Request } from 'express';
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { lastValueFrom, type Observable } from 'rxjs';
import { WebSocket, WebSocketServer } from 'ws';
import type { DeveloperMtDto } from '../../developer/developer.dto';
import { AuthGuard } from '../../auth/auth.guard';
import { TranslateController } from '../translate.controller';

export const LENS_SOCKET_PATH = '/v2/translate/lens';

const MAX_TEXT_LENGTH = 500;
const MAX_IN_FLIGHT = 6;
const MAX_QUEUED = 40;

type Caller = { user?: unknown; userId?: string; apiKeyId?: string };
type Job = { id: string; text: string; target: string };
type Inbound =
  | { type: 'translate'; id: string; text: string; target: string }
  | { type: 'cancel'; id: string };

export const isLensSocketRequest = (req: IncomingMessage) =>
  (req.url ?? '').split('?')[0] === LENS_SOCKET_PATH;

@Injectable()
export class LensSocketService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LensSocketService.name);
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  private server?: Server;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly guard: AuthGuard,
    private readonly translate: TranslateController,
  ) {}

  onApplicationBootstrap() {
    this.server = this.adapterHost.httpAdapter?.getHttpServer() as Server | undefined;
    this.server?.on('upgrade', this.onUpgrade);
  }

  onApplicationShutdown() {
    this.server?.removeListener('upgrade', this.onUpgrade);
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
  }

  private readonly onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isLensSocketRequest(req)) return;
    void this.authenticate(req)
      .then((caller) => {
        if (socket.destroyed) return;
        this.wss.handleUpgrade(req, socket, head, (client) => this.serve(client, caller));
      })
      .catch(() => {
        if (!socket.destroyed) socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      });
  };

  private async authenticate(req: IncomingMessage): Promise<Caller> {
    const request = req as IncomingMessage & Caller;
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    if (!(await this.guard.canActivate(context))) throw new Error('Unauthorized');
    return { user: request.user, userId: request.userId };
  }

  private serve(client: WebSocket, caller: Caller) {
    const running = new Map<string, AbortController>();
    const queue: Job[] = [];

    const send = (message: object) => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
    };

    const next = () => {
      while (running.size < MAX_IN_FLIGHT && queue.length) {
        const job = queue.shift()!;
        const controller = new AbortController();
        running.set(job.id, controller);
        this.run(job, caller, controller.signal)
          .then((text) => send({ type: 'translation', id: job.id, text }))
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            send({ type: 'error', id: job.id, message: error instanceof Error ? error.message : 'Translation failed' });
          })
          .finally(() => {
            if (running.get(job.id) === controller) running.delete(job.id);
            next();
          });
      }
    };

    client.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let message: Inbound;
      try {
        message = JSON.parse(raw.toString()) as Inbound;
      } catch {
        return;
      }
      if (typeof message?.id !== 'string' || !message.id) return;
      if (message.type === 'cancel') {
        running.get(message.id)?.abort();
        running.delete(message.id);
        const queued = queue.findIndex((job) => job.id === message.id);
        if (queued >= 0) queue.splice(queued, 1);
        return;
      }
      if (message.type !== 'translate') return;
      const text = typeof message.text === 'string' ? message.text.trim() : '';
      const target = typeof message.target === 'string' ? message.target.trim() : '';
      if (!text || !target || text.length > MAX_TEXT_LENGTH || target.length > 64) {
        send({ type: 'error', id: message.id, message: 'Invalid line' });
        return;
      }
      if (running.has(message.id) || queue.some((job) => job.id === message.id)) return;
      if (queue.length >= MAX_QUEUED) {
        send({ type: 'error', id: message.id, message: 'Too many lines' });
        return;
      }
      queue.push({ id: message.id, text, target });
      next();
    });

    client.on('close', () => {
      queue.length = 0;
      for (const controller of running.values()) controller.abort();
      running.clear();
    });
    client.on('error', (error) => this.logger.warn(`Lens socket error: ${error.message}`));
  }

  private async run(job: Job, caller: Caller, signal: AbortSignal) {
    const { body, translationId } = buildMtRequest({
      text: job.text,
      sourceLang: 'auto',
      targetLang: job.target,
      llmModel: 'auto',
    });
    const request = { ...body, save_history: false } as DeveloperMtDto & { client_request_id?: string };
    delete request.client_request_id;

    const res = Object.assign(new EventEmitter(), { writableEnded: false });
    const onAbort = () => res.emit('close');
    signal.addEventListener('abort', onAbort, { once: true });
    const req = { ...caller, headers: {}, res, signal } as unknown as Request & Caller;
    try {
      const response = await this.translate.translateText(request, req);
      caller.apiKeyId ??= req.apiKeyId;
      const payload = await lastValueFrom(response as Observable<{ data: unknown }>);
      signal.throwIfAborted();
      const data = typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data ?? '');
      const mapped = mapMtResponse(data, { sourceLang: 'auto' }, translationId);
      return parseTranslation(mapped.translation).mainContent || mapped.translation;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
