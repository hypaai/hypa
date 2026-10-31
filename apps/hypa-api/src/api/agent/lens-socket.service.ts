import {
  type ExecutionContext,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { AuthGuard } from '../auth/auth.guard';
import { AgentService } from './agent.service';

export const LENS_SOCKET_PATH = '/v2/agent/lens';

const MAX_TEXT_LENGTH = 500;
const MAX_IN_FLIGHT = 6;
const MAX_QUEUED = 40;
const DEFAULT_PROVIDER = 'meta';
const DEFAULT_MODEL = 'muse-spark-1.3';
const LENS_TOOL = 'translate_message';

export const LENS_INSTRUCTION = [
  'You translate short lines of text read from a camera.',
  `Call ${LENS_TOOL} exactly once with the line as text and the requested language as targetLang.`,
  'Then reply with only the translation: no quotes, notes or explanations.',
].join(' ');

type Caller = { user?: { id?: string }; userId?: string };
type Job = { id: string; text: string; target: string; provider: string; model: string };
type Inbound =
  | { type: 'translate'; id: string; text: string; target: string; provider?: string; model?: string }
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
    private readonly agent: AgentService,
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
      const provider = typeof message.provider === 'string' && message.provider.trim() ? message.provider.trim() : DEFAULT_PROVIDER;
      const model = typeof message.model === 'string' && message.model.trim() ? message.model.trim() : DEFAULT_MODEL;
      queue.push({ id: message.id, text, target, provider, model });
      next();
    });

    client.on('close', () => {
      queue.length = 0;
      for (const controller of running.values()) controller.abort();
      running.clear();
    });
    client.on('error', (error) => this.logger.warn(`Lens socket error: ${error.message}`));
  }

  /** Runs the line through the same agent pipeline as POST /v2/agent, without saving a chat. */
  private async run(job: Job, caller: Caller, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    const run = await this.agent.open({
      requestId: randomUUID(),
      userId: caller.user?.id ?? caller.userId,
      ephemeral: true,
      input: `Translate into ${job.target}:\n${job.text}`,
      provider: job.provider,
      model: job.model,
      surface: 'app',
      toolNames: [LENS_TOOL],
      systemInstruction: LENS_INSTRUCTION,
    });
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (error: Error | null, text?: string) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        // The tool result is the translation; skip the model's closing turn.
        this.agent.cancel(run);
        queueMicrotask(() => stop());
        if (error) reject(error);
        else resolve(text!);
      };
      const onAbort = () => finish(new Error('Cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });
      const stop = this.agent.subscribe(run, (event) => {
        if (!event) return finish(new Error('No translation returned'));
        if (event.type === 'tool_result' && event.name === LENS_TOOL) {
          const translation = event.ok ? (event.result as { translation?: unknown } | undefined)?.translation : undefined;
          if (typeof translation === 'string' && translation.trim()) return finish(null, translation.trim());
          return finish(new Error(event.ok ? 'No translation returned' : event.error || 'Translation failed'));
        }
        if (event.type === 'done' && event.text?.trim()) return finish(null, event.text.trim());
        if (event.type === 'error') return finish(new Error(event.message || 'Translation failed'));
      });
    });
  }
}
