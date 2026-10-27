import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import axios, { AxiosInstance } from 'axios';
import { Subject } from 'rxjs';
import WS from 'ws';

interface StatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  workerId: string;
  delayTime?: number;
  output?: string;
  executionTime?: number;
  id: string;
}

export interface RunpodWebhookPayload {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  output?: string;
  delayTime?: number;
  input?: unknown;
  webhook?: string;
}

export interface ClientSession {
  send: (data: string | Buffer) => void;
  messages$: Subject<unknown>;
  close: () => void;
  onFailure: (cb: () => void) => void;
}

export interface PodData {
  jobId: string;
  status: RunpodWebhookPayload['status'];
  createdAt: number;
  address?: { ip: string; port: number };
  clientCount: number;
}

type Pod = PodData;

const IDLE_SHUTDOWN_GRACE_MS = 10_000;

const MAX_CLIENTS_PER_POD = 2;
const PODS_CACHE_KEY = 'asr_pods';

@Injectable()
export class PodService implements OnModuleInit {
  private pods = new Map<string, Pod>();
  private bootPromise: Promise<Pod> | null = null;
  private readonly api: AxiosInstance;

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {
    this.api = axios.create({
      baseURL: 'https://api.runpod.ai/v2/xcqujlwmz0vhlv',
      headers: {
        Authorization: `Bearer ${process.env.ASR_SEVERLESS_API_KEY}`,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.loadPodsFromCache();
    await this.validateCachedPods();
  }

  async prepareSession(): Promise<{ pod: Pod; session: ClientSession }> {
    const pod = await this.assignPod();
    const { ip, port } = pod.address!;

    return new Promise((resolve, reject) => {
      const ws = new WS(`ws://${ip}:${port}`);
      const messages$ = new Subject<unknown>();
      let failureHandler: (() => void) | null = null;

      const onConnectError = (err: Error) => {
        console.error(
          `[POD:${pod.jobId}] Failed to connect to pod WS:`,
          err.message,
        );
        ws.close();
        this.releaseClient(pod);
        reject(err);
      };

      ws.once('error', onConnectError);

      ws.once('open', () => {
        ws.removeListener('error', onConnectError);

        ws.on('message', (data, isBinary) => {
          if (isBinary) {
            messages$.next(data);
            return;
          }
          try {
            messages$.next(JSON.parse(data.toString()));
          } catch {
            messages$.next(data.toString());
          }
        });

        ws.on('close', () => {
          messages$.complete();
          failureHandler?.();
        });

        ws.on('error', (err) => {
          console.error(`[POD:${pod.jobId}] Client WS error:`, err.message);
          ws.close();
        });

        resolve({
          pod,
          session: {
            send: (data) => ws.send(data),
            messages$,
            close: () => ws.close(),
            onFailure: (cb) => {
              failureHandler = cb;
            },
          },
        });
      });
    });
  }

  releaseClient(pod: Pod): void {
    pod.clientCount = Math.max(0, pod.clientCount - 1);
    this.persistPodsToCache();
  }

  updateJobFromWebhook(payload: RunpodWebhookPayload): void {
    const { id, status, output } = payload;
    const pod = this.pods.get(id);
    if (!pod) return;

    pod.status = status;

    if (status === 'FAILED' || status === 'CANCELLED') {
      this.pods.delete(id);
      this.persistPodsToCache();
      return;
    }

    if (status === 'IN_PROGRESS' && output) {
      const match = output.match(/Public IP:\s*([\d.]+),\s*TCP Port:\s*(\d+)/);
      if (match) {
        pod.address = { ip: match[1], port: parseInt(match[2], 10) };
        this.persistPodsToCache();
        console.log(
          `[POD] Ready (webhook) — ${id} ws://${pod.address.ip}:${pod.address.port} (pool: ${this.pods.size})`,
        );
      }
    }
  }

  private async assignPod(): Promise<Pod> {
    let pod = this.findAvailablePod();
    if (!pod) pod = await this.bootPod();

    pod.clientCount++;
    await this.persistPodsToCache();
    return pod;
  }

  private findAvailablePod(): Pod | null {
    for (const pod of this.pods.values()) {
      if (
        pod.address &&
        pod.status === 'IN_PROGRESS' &&
        pod.clientCount < MAX_CLIENTS_PER_POD
      )
        return pod;
    }
    return null;
  }

  private async bootPod(): Promise<Pod> {
    if (this.bootPromise) return this.bootPromise;

    this.bootPromise = this.boot();
    try {
      return await this.bootPromise;
    } finally {
      this.bootPromise = null;
    }
  }

  private async boot(): Promise<Pod> {
    const { data } = await this.api.post<StatusResponse>('/run', {
      input: { prompt: '<>' },
      webhook: `${process.env.BASE_URL}/webhooks/runpod/status?sig=testfornow`,
    });
    const jobId = data.id;
    console.log(`[POD] Job started: ${jobId}`);

    const pod: Pod = {
      jobId,
      status: data.status ?? 'IN_QUEUE',
      createdAt: Date.now(),
      clientCount: 0,
    };
    this.pods.set(jobId, pod);
    await this.persistPodsToCache();

    return this.pollForAddress(jobId);
  }

  private async pollForAddress(jobId: string): Promise<Pod> {
    const pod = this.pods.get(jobId)!;
    while (true) {
      const { data } = await this.api.get<StatusResponse>(`/status/${jobId}`);

      if (data.status === 'FAILED' || data.status === 'CANCELLED') {
        this.pods.delete(jobId);
        this.persistPodsToCache();
        throw new Error(`[POD] Job ${jobId} ended with status: ${data.status}`);
      }

      pod.status = data.status;

      if (
        data.status === 'IN_PROGRESS' &&
        data.output &&
        data.output?.match(/Model ready/i)
      ) {
        const match = data.output.match(
          /Public IP:\s*([\d.]+),\s*TCP Port:\s*(\d+)/,
        );
        if (match) {
          pod.address = { ip: match[1], port: parseInt(match[2], 10) };
          await this.persistPodsToCache();
          console.log(
            `[POD] Ready — ${jobId} ws://${pod.address.ip}:${pod.address.port} (pool: ${this.pods.size})`,
          );
          return pod;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }

  private async shutdownPod(pod: Pod): Promise<void> {
    this.pods.delete(pod.jobId);
    await this.persistPodsToCache();
    if (!pod.address) return;

    const { ip, port } = pod.address;
    const ws = new WS(`ws://${ip}:${port}`);
    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'shutdown' }));
      ws.close();
    });
    ws.once('error', () => ws.close());
  }

  async cleanupIdlePods(): Promise<void> {
    const now = Date.now();
    const toShutdown: Pod[] = [];
    for (const pod of this.pods.values()) {
      if (pod.clientCount !== 0) continue;
      if (
        pod.status === 'IN_QUEUE' &&
        now - pod.createdAt < IDLE_SHUTDOWN_GRACE_MS
      )
        continue;
      toShutdown.push(pod);
    }
    for (const pod of toShutdown) {
      console.log(
        `[POD:${pod.jobId}] Cleanup job: shutting down idle pod (pool: ${this.pods.size - 1})`,
      );
      await this.shutdownPod(pod);
    }
  }

  private async loadPodsFromCache(): Promise<void> {
    try {
      const raw = await this.cacheManager.get<string>(PODS_CACHE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, PodData>;
      for (const entry of Object.values(data)) {
        const pod: PodData = {
          ...entry,
          status: entry.status ?? 'IN_PROGRESS',
          createdAt: entry.createdAt ?? Date.now(),
          clientCount: 0,
        };
        this.pods.set(entry.jobId, pod);
      }
      if (this.pods.size > 0) {
        console.log(`[POD] Restored ${this.pods.size} pod(s) from cache`);
      }
    } catch (e) {
      console.warn('[POD] Failed to load pods from cache:', e);
    }
  }

  private async validateCachedPods(): Promise<void> {
    const stale: string[] = [];
    for (const [id, pod] of this.pods) {
      if (!pod.address) {
        stale.push(id);
        continue;
      }
      const alive = await this.probePodWs(pod);
      if (!alive) stale.push(id);
    }
    for (const id of stale) this.pods.delete(id);
    if (stale.length > 0) {
      await this.persistPodsToCache();
      console.log(`[POD] Removed ${stale.length} stale pod(s) from cache`);
    }
  }

  private probePodWs(pod: Pod): Promise<boolean> {
    return new Promise((resolve) => {
      const { ip, port } = pod.address!;
      const ws = new WS(`ws://${ip}:${port}`);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5_000);
      ws.once('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });
      ws.once('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private async persistPodsToCache(): Promise<void> {
    try {
      const data: Record<string, PodData> = {};
      for (const [id, pod] of this.pods) {
        data[id] = {
          jobId: pod.jobId,
          status: pod.status,
          createdAt: pod.createdAt,
          address: pod.address,
          clientCount: pod.clientCount,
        };
      }
      await this.cacheManager.set(PODS_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[POD] Failed to persist pods to cache:', e);
    }
  }
}
