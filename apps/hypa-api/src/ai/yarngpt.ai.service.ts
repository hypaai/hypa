import { BadGatewayException, Injectable } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { randomUUID } from 'crypto';
import { parseBuffer } from 'music-metadata';
import { setTimeout as delay } from 'timers/promises';
import { lookup } from 'node:dns';
import { Agent } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

const MAX_YARN_AUDIO_BYTES = 64 * 1024 * 1024;
const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blockedAddresses.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  blockedAddresses.addSubnet(address, prefix, 'ipv6');
const publicV6 = new BlockList();
publicV6.addSubnet('2000::', 3, 'ipv6');

const publicAudioLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    if (
      !addresses.length ||
      addresses.some(({ address, family }) =>
        family === 6
          ? !publicV6.check(address, 'ipv6') ||
            blockedAddresses.check(address, 'ipv6')
          : family !== 4 || blockedAddresses.check(address, 'ipv4'),
      )
    ) {
      return callback(
        new Error('YarnGPT audio URL must resolve to public addresses'),
        [],
      );
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

interface YarnJob {
  job_id?: string;
  status?: string;
  audio_url?: string;
}

@Injectable()
export class YarnGptAiService {
  private readonly api = axios.create();
  private readonly audioAgent = new Agent({ lookup: publicAudioLookup });

  async speech(params: {
    text: string;
    voice: string;
    apiUrl: string;
    timeoutMs: number;
    signal?: AbortSignal;
    idempotencyKey?: string;
    jobId?: string;
    deadlineAt?: number;
    onJobCreated?: (jobId: string) => Promise<void>;
  }) {
    const key = process.env.YARNGPT_API_KEY;
    if (!key) throw new BadGatewayException('YarnGPT is unavailable');
    const deadline = params.deadlineAt ?? Date.now() + params.timeoutMs;
    const signal = AbortSignal.any([
      AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      ...(params.signal ? [params.signal] : []),
    ]);
    signal.throwIfAborted();
    const config = () => ({
      headers: { Authorization: `Bearer ${key}` },
      signal,
      timeout: Math.max(1, deadline - Date.now()),
    });
    const wait = async (ms: number) => {
      const remaining = Math.max(1, deadline - Date.now());
      await delay(Math.min(Math.max(ms, 1000), remaining), undefined, {
        signal,
      });
      signal.throwIfAborted();
    };
    const retryDelay = (value: unknown, fallback: number) => {
      if (typeof value !== 'string' || !value.trim()) return fallback;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        return seconds > 0 ? seconds * 1000 : fallback;
      }
      const date = Date.parse(value);
      if (!Number.isFinite(date)) return fallback;
      const delayMs = date - Date.now();
      return delayMs > 0 ? delayMs : fallback;
    };
    const idempotencyKey = params.idempotencyKey ?? randomUUID();
    const body = {
      text: params.text,
      voice: params.voice,
      output_format: 'wav',
    };
    let job: YarnJob | undefined = params.jobId
      ? { job_id: params.jobId }
      : undefined;
    let retriedTransientFailure = false;
    while (!job) {
      try {
        const requestConfig = config();
        const response = await this.api.post<YarnJob>(params.apiUrl, body, {
          ...requestConfig,
          headers: {
            ...requestConfig.headers,
            'Idempotency-Key': idempotencyKey,
          },
        });
        job = response.data;
        break;
      } catch (error) {
        if (
          signal.aborted ||
          !isAxiosError<{ error?: { code?: string } }>(error)
        )
          throw error;
        if (
          error.response?.status === 409 &&
          error.response.data?.error?.code === 'ALREADY_EXISTS'
        ) {
          await wait(retryDelay(error.response.headers['retry-after'], 2000));
          continue;
        }
        if (
          retriedTransientFailure ||
          (error.response &&
            ![500, 502, 503, 504].includes(error.response.status))
        )
          throw error;
        retriedTransientFailure = true;
        await wait(retryDelay(error.response?.headers['retry-after'], 1000));
      }
    }
    if (!job || typeof job.job_id !== 'string' || !job.job_id.trim()) {
      throw new BadGatewayException('YarnGPT returned no job identifier');
    }
    const jobId = job.job_id;
    if (!params.jobId) await params.onJobCreated?.(jobId);
    const base = new URL(params.apiUrl).origin;
    let poll = 0;
    while (true) {
      await wait(poll === 0 ? 1000 : poll === 1 ? 2000 : 5000);
      poll++;
      try {
        const response = await this.api.get<YarnJob>(
          `${base}/api/v1/status/${encodeURIComponent(jobId)}`,
          config(),
        );
        job = response.data;
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 429) {
          await wait(retryDelay(error.response.headers['retry-after'], 5000));
          continue;
        }
        throw error;
      }
      if (job.status === 'completed') break;
      if (job.status !== 'queued' && job.status !== 'processing') {
        throw new BadGatewayException('YarnGPT speech generation failed');
      }
    }
    const audioUrl =
      typeof job.audio_url === 'string' ? new URL(job.audio_url) : null;
    if (
      !audioUrl ||
      audioUrl.protocol !== 'https:' ||
      audioUrl.username ||
      audioUrl.password ||
      (audioUrl.port && audioUrl.port !== '443') ||
      isIP(audioUrl.hostname.replace(/^\[|\]$/g, '')) ||
      audioUrl.hostname === 'localhost' ||
      audioUrl.hostname.endsWith('.localhost')
    ) {
      throw new BadGatewayException('YarnGPT returned no usable audio URL');
    }
    const response = await this.api.get<ArrayBuffer>(audioUrl.href, {
      signal,
      timeout: Math.max(1, deadline - Date.now()),
      responseType: 'arraybuffer',
      maxContentLength: MAX_YARN_AUDIO_BYTES,
      maxBodyLength: MAX_YARN_AUDIO_BYTES,
      maxRedirects: 0,
      proxy: false,
      httpsAgent: this.audioAgent,
    });
    const audio = Buffer.from(response.data);
    if (
      audio.length <= 44 ||
      audio.length > MAX_YARN_AUDIO_BYTES ||
      audio.toString('ascii', 0, 4) !== 'RIFF' ||
      audio.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw new BadGatewayException('YarnGPT returned invalid WAV audio');
    }
    const metadata = await parseBuffer(audio, { mimeType: 'audio/wav' });
    const sampleRate = metadata.format.sampleRate;
    const duration = metadata.format.duration;
    if (
      !sampleRate ||
      !Number.isFinite(sampleRate) ||
      !duration ||
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      throw new BadGatewayException('YarnGPT returned incomplete audio');
    }
    signal.throwIfAborted();
    return {
      audio_b64: audio.toString('base64'),
      audio_type: 'audio/wav',
      sample_rate: sampleRate,
    };
  }
}
