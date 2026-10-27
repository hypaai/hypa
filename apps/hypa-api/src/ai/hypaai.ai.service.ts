import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { CanceledError, isAxiosError } from 'axios';
import { Observable } from 'rxjs';
import { Readable } from 'stream';
import { LEGACY_MODELS_BY_CAPABILITY as models } from '@hypa/config/legacy-models';
import { isStreamingModel } from '@hypa/config/models';
import errorCodes from '@hypa/config/json/error-codes';
import {
  AiUsage,
  ChatMessage,
  ChatSyncResult,
  HypaAiTtsRawResult,
  StreamChunk,
} from './ai.types';
import { parseSseStream } from './stream.utils';
import { assertTtsPayloadUsable } from './tts.utils';
import { getHypaAiMtMessages } from './prompts/mt.prompts';
import { DeveloperSharedService } from 'src/api/developer/providers/shared.service';
interface HypaAiChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  max_tokens?: number;
  apiKey?: string;
  timeout?: number;
  servedModelName?: string;
}

interface HypaAiAsrOptions {
  signal?: AbortSignal;
  system_instruction?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  apiKey?: string;
  timeout?: number;
}

interface HypaAiTtsParams {
  signal?: AbortSignal;
  voice?: string;
  temperature?: number;
  top_p?: number;
  repetition_penalty?: number;
  max_new_tokens?: number;
}

@Injectable()
export class HypaAiAiService {
  private readonly logger = new Logger(HypaAiAiService.name);

  private readonly api = axios.create({
    timeout: 60_000,
    headers: {
      Authorization: `Bearer ${process.env.HYPA_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  constructor(private readonly shared: DeveloperSharedService) {}

  private requestOverrides(options: HypaAiChatOptions) {
    return {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.apiKey
        ? { headers: { Authorization: `Bearer ${options.apiKey}` } }
        : {}),
      ...(options.timeout ? { timeout: options.timeout } : {}),
    };
  }

  private servedModel(options: HypaAiChatOptions) {
    return options.servedModelName ? { model: options.servedModelName } : {};
  }

  chatStream(
    messages: ChatMessage[],
    url: string,
    options: HypaAiChatOptions = {},
  ): Observable<StreamChunk> {
    return new Observable((subscriber) => {
      void (async () => {
        try {
          const response = await this.api.post(
            url,
            {
              ...this.servedModel(options),
              messages,
              stream: true,
              temperature: options.temperature ?? 0.3,
              max_tokens: options.max_tokens ?? 1000,
              top_k: options.top_k ?? 20,
              top_p: options.top_p ?? 0.95,
            },
            {
              responseType: 'stream',
              ...this.requestOverrides(options),
            },
          );

          const stream = response.data as Readable;
          parseSseStream(stream).subscribe(subscriber);
        } catch (error) {
          subscriber.error(error);
        }
      })();
    });
  }

  async chatSync(
    messages: ChatMessage[],
    url: string,
    options: HypaAiChatOptions = {},
  ): Promise<ChatSyncResult> {
    const response = await this.api.post<{
      choices: Array<{ message: { content: string } }>;
      usage: AiUsage;
    }>(
      url,
      {
        ...this.servedModel(options),
        messages,
        stream: false,
        temperature: options.temperature ?? 1,
        max_tokens: options.max_tokens ?? 1000,
        top_k: options.top_k ?? 1000,
        top_p: options.top_p ?? 1,
      },
      this.requestOverrides(options),
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim() ?? '';
    const usage = response.data?.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    return { content, usage };
  }

  async translateFull(params: {
    text: string;
    source_lang?: string;
    target_lang?: string;
    preset?: {
      model?: string;
      temperature?: number;
      top_p?: number;
      top_k?: number;
      max_tokens?: number;
      thinking?: boolean;
    };
    custom?: { api_url: string; api_key: string };
    signal?: AbortSignal;
  }): Promise<string> {
    const { text, source_lang, target_lang, preset, custom } = params;

    if (!target_lang || target_lang.toLowerCase() === 'auto') {
      return text;
    }
    const model = models.MT.hypaai.find((m) => m.name == preset?.model);

    const primaryUrl = custom?.api_url || model?.base_apiURL;

    if (!primaryUrl) {
      throw new BadGatewayException(
        'Translation failed: no endpoint configured for this model',
      );
    }

    const primaryUpstream = this.shared.resolveHypaAiUpstream(model);

    const isScaledHost = Boolean(
      primaryUpstream.apiKey || primaryUpstream.timeout,
    );

    const messages: ChatMessage[] = getHypaAiMtMessages({
      sourceLang: source_lang,
      targetLang: target_lang,
      text,
      model: preset?.model,
      thinking: preset?.thinking ?? false,
    });

    const body = {
      stream: false,
      messages,
      top_k: preset?.top_k ?? 10,
      top_p: preset?.top_p ?? 0.95,
      temperature: preset?.temperature ?? 0.3,
      ...(preset?.max_tokens !== undefined
        ? { max_tokens: preset.max_tokens }
        : {}),
    };

    const run = async (
      url: string,
      apiKey: string | undefined,
      upstream: { servedModelName?: string; timeout?: number },
    ): Promise<string> => {
      const response = await this.api.post(
        url,
        {
          ...(upstream.servedModelName
            ? { model: upstream.servedModelName }
            : {}),
          ...body,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey ?? process.env.HYPA_API_KEY}`,
            'Content-Type': 'application/json',
          },
          ...(upstream.timeout ? { timeout: upstream.timeout } : {}),
          signal: params.signal,
        },
      );
      return response.data?.choices?.[0]?.message?.content?.trim() || '';
    };

    const runTarget = async (target: {
      url: string;
      apiKey?: string;
      upstream: { servedModelName?: string; timeout?: number };
      retryOnNotReady: boolean;
    }): Promise<string> => {
      try {
        return await run(target.url, target.apiKey, target.upstream);
      } catch (error) {
        if (
          this.isTranslationCanceled(error) ||
          !target.retryOnNotReady ||
          !this.isPausedEndpointError(error)
        ) {
          throw error;
        }
        this.logger.warn(
          '[Translation][HypaAI] Endpoint not ready. Retrying the same URL once.',
        );
        return run(target.url, target.apiKey, target.upstream);
      }
    };

    try {
      return await runTarget({
        url: primaryUrl,
        apiKey: custom?.api_key ?? primaryUpstream.apiKey,
        upstream: primaryUpstream,
        retryOnNotReady: isScaledHost,
      });
    } catch (error) {
      if (this.isTranslationCanceled(error)) throw error;
      throw this.translateFailure(error);
    }
  }

  private isTranslationCanceled(error: unknown): boolean {
    return isAxiosError(error) && error.code === 'ERR_CANCELED';
  }

  private translateFailure(error: unknown): BadGatewayException {
    const detail = this.getAxiosErrorDetail(error);
    this.logger.error(`Translation failed: ${detail}`);
    return new BadGatewayException(`Translation failed: ${detail}`);
  }

  async asrRequest(
    base64: string,
    _mimeType: string,
    url: string,
    options: HypaAiAsrOptions = {},
  ): Promise<{ transcript: string; usage: AiUsage }> {
    this.assertHttpAsrRow(url);

    const body = {
      inputs: base64,
      stream: true,
      parameters: {
        generation_parameters: {
          temperature: options.temperature ?? 1,
          top_p: options.top_p ?? 0.5,
          top_k: options.top_k ?? 1,
          max_new_tokens: options.max_tokens ?? 400,
        },
      },
    };

    const data = this.isRunpodAsrUrl(url)
      ? await this.runpodQueueOutput<{ text?: string }>(
          url,
          body,
          options.signal,
          {
            label: 'ASR',
            budgetMs: options.timeout,
            apiKey: options.apiKey,
          },
        )
      : (
          await this.api.post(encodeURI(url), body, {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(options.apiKey
                ? { Authorization: `Bearer ${options.apiKey}` }
                : {}),
            },
            timeout: options.timeout ?? 0,
            signal: options.signal,
          })
        ).data;

    const transcript: string = data?.text ?? '';
    const outputTokens = transcript.split(' ').length;
    const usage: AiUsage = {
      prompt_tokens: outputTokens,
      completion_tokens: outputTokens,
      total_tokens: outputTokens * 2,
    };

    return { transcript, usage };
  }

  private assertHttpAsrRow(url: string): void {
    if (isStreamingModel({ baseApiUrl: url })) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }
  }

  private static readonly RUNPOD_TTS_MODEL_NAME =
    'hypa-orpheus-3b-tts-vc-flt-rp';
  private static readonly RUNPOD_ASR_MODEL_NAME =
    'wspr-small-2025-11-11-12-12--mpk-rp';
  private static readonly RUNPOD_TTS_RUNSYNC_WAIT_MS = 180000;
  private static readonly RUNPOD_RUNSYNC_TIMEOUT_MARGIN_MS = 20000;
  private static readonly RUNPOD_TTS_POLL_INTERVAL_MS = 5000;
  private static readonly RUNPOD_TTS_POLL_BUDGET_MS = 900000;
  private static readonly RUNPOD_TTS_POLL_TIMEOUT_MS = 90000;

  private runpodKey(): string {
    const key = process.env.RUNPOD_API_KEY || process.env.RP_API_KEY || '';
    if (!key) {
      throw new ServiceUnavailableException(
        'RUNPOD_API_KEY is not set but is required by this model',
      );
    }
    return key;
  }

  private isRunpodTtsModelName(name?: string): boolean {
    return name === HypaAiAiService.RUNPOD_TTS_MODEL_NAME;
  }

  private isRunpodTtsUrl(url: string): boolean {
    return this.isRunpodRowUrl(
      url,
      models.TTS.hypaai,
      HypaAiAiService.RUNPOD_TTS_MODEL_NAME,
    );
  }

  private isRunpodAsrUrl(url: string): boolean {
    return this.isRunpodRowUrl(
      url,
      models.ASR.hypaai,
      HypaAiAiService.RUNPOD_ASR_MODEL_NAME,
    );
  }

  private isRunpodRowUrl(
    url: string,
    rows: { name: string; base_apiURL?: string }[],
    modelName: string,
  ): boolean {
    const rpBase = rows.find((m) => m.name === modelName)?.base_apiURL;
    if (typeof rpBase !== 'string' || !rpBase) return false;
    return url.replace(/\/+$/, '') === rpBase.replace(/\/+$/, '');
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new CanceledError());
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new CanceledError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private runpodSettledOutput<T>(
    data: unknown,
    label = 'TTS',
  ): {
    done: boolean;
    jobId?: string;
    output?: T;
  } {
    if (!data || typeof data !== 'object') return { done: false };
    const d = data as Record<string, unknown>;
    const status = d.status;
    const inner = d.output as { error?: unknown } | undefined;
    const rawError = d.error ?? inner?.error;
    const errorDetail =
      typeof rawError === 'string'
        ? rawError
        : rawError
          ? JSON.stringify(rawError)
          : '';

    if (status === 'TIMED_OUT' || status === 'CANCELLED') {
      throw new ServiceUnavailableException(
        `RunPod ${label} job ${String(status).toLowerCase().replace('_', ' ')} before completing`,
      );
    }
    if (status === 'FAILED' || errorDetail) {
      throw new BadGatewayException(
        `RunPod ${label} job failed: ${errorDetail || 'unknown worker error'}`,
      );
    }
    if ('output' in d) {
      if (status === 'COMPLETED' || status === undefined) {
        return { done: true, output: d.output as T };
      }
      return {
        done: false,
        jobId: typeof d.id === 'string' ? d.id : undefined,
      };
    }
    if (
      'audio_b64' in d ||
      'audio' in d ||
      'audio_sample' in d ||
      'cloning_features' in d
    ) {
      return { done: true, output: data as T };
    }
    if (typeof d.id === 'string') return { done: false, jobId: d.id };
    return { done: false };
  }

  private async runpodPollOutput<T>(
    base: string,
    headers: Record<string, string>,
    jobId: string,
    signal?: AbortSignal,
    label = 'TTS',
    deadline?: number,
  ): Promise<T> {
    const end =
      deadline ?? Date.now() + HypaAiAiService.RUNPOD_TTS_POLL_BUDGET_MS;
    for (;;) {
      if (signal?.aborted) throw new CanceledError();
      if (Date.now() > end) {
        throw new ServiceUnavailableException(
          `RunPod ${label} job ${jobId} did not finish in time`,
        );
      }
      await this.sleep(HypaAiAiService.RUNPOD_TTS_POLL_INTERVAL_MS, signal);
      if (signal?.aborted) throw new CanceledError();
      const res = await axios.get(`${base}/status/${jobId}`, {
        headers,
        timeout: HypaAiAiService.RUNPOD_TTS_POLL_TIMEOUT_MS,
        signal,
      });
      const settled = this.runpodSettledOutput<T>(res.data, label);
      if (settled.done) return settled.output as T;
    }
  }

  private async runpodQueueOutput<T>(
    baseUrl: string,
    hypaPayload: Record<string, unknown>,
    signal?: AbortSignal,
    opts: {
      label?: string;
      apiKey?: string;
      budgetMs?: number;
    } = {},
  ): Promise<T> {
    const base = baseUrl.replace(/\/+$/, '');
    const key = opts.apiKey || this.runpodKey();
    const label = opts.label ?? 'TTS';
    const waitMs = opts.budgetMs
      ? Math.floor(opts.budgetMs / 2)
      : HypaAiAiService.RUNPOD_TTS_RUNSYNC_WAIT_MS;
    const timeoutMs = waitMs + HypaAiAiService.RUNPOD_RUNSYNC_TIMEOUT_MARGIN_MS;
    const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : undefined;
    const headers = {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const wrapped = { input: hypaPayload };
    this.logger.log(`RunPod ${label} upstream: ${base} (queue)`);

    try {
      const res = await axios.post(`${base}/runsync?wait=${waitMs}`, wrapped, {
        headers,
        timeout: timeoutMs,
        signal,
      });
      const settled = this.runpodSettledOutput<T>(res.data, label);
      if (settled.done) return settled.output as T;
      if (settled.jobId) {
        return await this.runpodPollOutput<T>(
          base,
          headers,
          settled.jobId,
          signal,
          label,
          deadline,
        );
      }
    } catch (err) {
      const timedOut =
        isAxiosError(err) &&
        (err.code === 'ECONNABORTED' ||
          err.code === 'ETIMEDOUT' ||
          /timeout/i.test(err.message ?? ''));
      if (!timedOut) throw err;
      if (deadline) {
        throw new ServiceUnavailableException(
          `RunPod ${label} runsync timed out`,
        );
      }
      this.logger.warn(
        `RunPod ${label} runsync timed out; falling back to async poll`,
      );
    }

    const submit = await axios.post(`${base}/run`, wrapped, {
      headers,
      timeout: HypaAiAiService.RUNPOD_TTS_POLL_TIMEOUT_MS,
      signal,
    });
    const jobId =
      (submit.data as { id?: unknown })?.id ??
      this.runpodSettledOutput<T>(submit.data, label).jobId;
    if (typeof jobId !== 'string' || !jobId) {
      throw new BadGatewayException(
        `RunPod ${label} did not return a job id for async polling`,
      );
    }
    return await this.runpodPollOutput<T>(
      base,
      headers,
      jobId,
      signal,
      label,
      deadline,
    );
  }

  async tts(params: {
    text: string;
    voice?: string;
    presets?: {
      provider?: string;
      model?: string;
      language?: string;
      temperature?: number;
      top_p?: number;
      repetition_penalty?: number;
      max_tokens?: number;
    };
    custom?: { api_url: string; api_key: string };
    signal?: AbortSignal;
  }): Promise<string> {
    const { text, voice, presets, custom } = params;

    const ttsModels = ((models as any).TTS?.hypaai ?? []) as Array<{
      name?: string;
      base_apiURL?: string;
      default?: boolean;
    }>;

    if (!ttsModels.length) {
      throw new BadRequestException('No TTS models are configured');
    }

    const model = presets?.model
      ? ttsModels.find((item) => item.name === presets.model)
      : ttsModels.find((item) => item.default) || ttsModels[0];

    if (!model?.base_apiURL) {
      throw new BadRequestException(
        `Invalid TTS model${presets?.model ? `: ${presets.model}` : ''}`,
      );
    }

    const synthesizeUrl = model.base_apiURL;

    const body = {
      inputs: text,
      parameters: {
        language: presets?.language,
        voice: voice || 'Eniola',
        temperature: presets?.temperature ?? 0.1,
        top_p: presets?.top_p ?? 0.95,
        repetition_penalty: Math.min(presets?.repetition_penalty ?? 2, 2.0),
        max_new_tokens: Math.min(presets?.max_tokens ?? 1024, 4096),
      },
    };

    if (presets?.provider === 'custom') {
      if (!custom?.api_url) {
        throw new BadRequestException('custom.api_url is required');
      }
      try {
        const headers: Record<string, string> = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        };
        if (custom.api_key) {
          headers.Authorization = `Bearer ${custom.api_key}`;
        }
        const response = await axios.post(custom.api_url, body, {
          headers,
          signal: params.signal,
        });
        assertTtsPayloadUsable(response.data);
        const audio = this.extractBase64Audio(response.data);
        if (!audio) {
          throw new BadGatewayException(
            'TTS provider returned no audio payload',
          );
        }
        return audio;
      } catch (err) {
        if (isAxiosError(err) && err.code === 'ERR_CANCELED') throw err;
        if (err instanceof HttpException) throw err;
        console.log(err);
        if (this.isTtsModelUnavailable(err)) {
          throw new ServiceUnavailableException(
            'tts model unavailable now, try again in the next 5 minutes',
          );
        }
        throw new BadGatewayException(
          `Failed to generate TTS: ${this.getAxiosErrorDetail(err)}`,
        );
      }
    }

    if (this.isRunpodTtsModelName(model.name)) {
      try {
        const output = await this.runpodQueueOutput<Record<string, unknown>>(
          synthesizeUrl,
          body,
          params.signal,
        );
        assertTtsPayloadUsable(output);
        const audio = this.extractBase64Audio(output);
        if (!audio) {
          throw new BadGatewayException(
            'TTS provider returned no audio payload',
          );
        }
        return audio;
      } catch (err) {
        if (isAxiosError(err) && err.code === 'ERR_CANCELED') throw err;
        if (err instanceof CanceledError) throw err;
        if (err instanceof HttpException) throw err;
        if (this.isTtsModelUnavailable(err)) {
          throw new ServiceUnavailableException(
            'tts model unavailable now, try again in the next 5 minutes',
          );
        }
        throw new BadGatewayException(
          `Failed to generate TTS: ${this.getAxiosErrorDetail(err)}`,
        );
      }
    }

    try {
      const response = await this.api.post(synthesizeUrl, body, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal: params.signal,
      });
      assertTtsPayloadUsable(response.data);
      const audio = this.extractBase64Audio(response.data);
      if (!audio) {
        throw new BadGatewayException('TTS provider returned no audio payload');
      }
      return audio;
    } catch (err) {
      if (isAxiosError(err) && err.code === 'ERR_CANCELED') throw err;
      if (err instanceof HttpException) throw err;
      if (this.isTtsModelUnavailable(err)) {
        throw new ServiceUnavailableException(
          'tts model unavailable now, try again in the next 5 minutes',
        );
      }
      throw new BadGatewayException(
        `Failed to generate TTS: ${this.getAxiosErrorDetail(err)}`,
      );
    }
  }

  async ttsRequest(
    text: string,
    voice: string,
    url: string,
    params: HypaAiTtsParams,
    cloningFeatures?: unknown,
  ): Promise<HypaAiTtsRawResult> {
    const body = {
      inputs: text,
      clone: !!cloningFeatures,
      enroll_user: false,
      cloning_features: cloningFeatures ?? null,
      parameters: {
        temperature: params.temperature ?? 0.9,
        top_p: params.top_p ?? 0.9,
        repetition_penalty: Math.min(params.repetition_penalty ?? 2, 2.0),
        max_new_tokens: Math.min(params.max_new_tokens ?? 512, 4096),
        ...(cloningFeatures ? {} : { voice }),
      },
    };

    if (this.isRunpodTtsUrl(url)) {
      const output = await this.runpodQueueOutput<HypaAiTtsRawResult>(
        url,
        body,
        params.signal,
      );
      assertTtsPayloadUsable(output);
      return output;
    }

    const response = await this.api.post<HypaAiTtsRawResult>(url, body, {
      signal: params.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    assertTtsPayloadUsable(response.data);
    return response.data;
  }

  private extractBase64Audio(data: unknown): string {
    const response = (data ?? {}) as {
      audio_b64?: unknown;
      audio_sample?: unknown;
      audio?: unknown;
      response?: {
        audio_b64?: unknown;
        audio_sample?: unknown;
        audio?: unknown;
      };
      data?: {
        audio_b64?: unknown;
        audio_sample?: unknown;
        audio?: unknown;
      };
    };

    const rawAudio =
      response.audio_b64 ??
      response.audio_sample ??
      response.audio ??
      response.response?.audio_b64 ??
      response.response?.audio_sample ??
      response.response?.audio ??
      response.data?.audio_b64 ??
      response.data?.audio_sample ??
      response.data?.audio;

    if (typeof rawAudio === 'string') {
      return rawAudio.startsWith('data:') ? rawAudio.split(',')[1] : rawAudio;
    }

    if (
      Array.isArray(rawAudio) &&
      rawAudio.length > 0 &&
      rawAudio.every(
        (v) =>
          typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255,
      )
    ) {
      return Buffer.from(rawAudio).toString('base64');
    }

    return '';
  }

  getAxiosErrorDetail(error: unknown): string {
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const data = error.response?.data;

      const responseMessage =
        typeof data === 'string'
          ? data
          : (data as { message?: string; error?: string; detail?: string })
              ?.message ||
            (data as { message?: string; error?: string; detail?: string })
              ?.error ||
            (data as { message?: string; error?: string; detail?: string })
              ?.detail ||
            'No response body';

      return [
        status ? `${status}${statusText ? ` ${statusText}` : ''}` : null,
        responseMessage,
      ]
        .filter(Boolean)
        .join(' - ');
    }

    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }

  private isTtsModelUnavailable(error: unknown): boolean {
    if (!isAxiosError(error)) return false;

    if (error.response?.status === 503) return true;

    const payload = error.response?.data as
      | {
          code?: unknown;
          error_code?: unknown;
          errorCode?: unknown;
          message?: unknown;
          error?: unknown;
          detail?: unknown;
        }
      | undefined;

    const candidates: unknown[] = [
      payload?.code,
      payload?.error_code,
      payload?.errorCode,
      payload?.message,
      payload?.error,
      payload?.detail,
    ];

    return candidates.some((v) => {
      if (typeof v === 'number') return v === 5003;
      if (typeof v === 'string') return v.includes('5003');
      return false;
    });
  }

  private isPausedEndpointError(error: unknown): boolean {
    if (!isAxiosError(error)) return false;

    if (
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      /timeout/i.test(error.message ?? '')
    ) {
      return true;
    }

    const status = error.response?.status;
    if (status === 502 || status === 503 || status === 504) {
      return true;
    }

    const data = error.response?.data as
      | string
      | { message?: unknown; error?: unknown; detail?: unknown }
      | undefined;

    const text =
      typeof data === 'string'
        ? data
        : [data?.message, data?.error, data?.detail]
            .filter((value): value is string => typeof value === 'string')
            .join(' ');

    return /endpoint\s+is\s+paused|no\s+workers?|queued|worker\s+starting|cold\s+start/i.test(
      text,
    );
  }
}
