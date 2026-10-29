import { textOutputTokens } from '@hypa/config/request-policy';
import { Injectable } from '@nestjs/common';
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  isAxiosError,
} from 'axios';
import { Readable } from 'stream';
import { AiUsage, ChatSyncResult, StreamChunk } from './ai.types';
import {
  parseGoogleSseStream,
  stripGoogleThinkingFromHistory,
  type GoogleChatOptions,
} from './google.ai.service';
import { convertAudioToPcmWav } from './pcm-wav';
import { responsesWithTools } from './responses-tools';
import type { LoopMessage } from '../api/agent/agent.loop';
import type { AgentModelOptions } from '../api/agent/agent.transport';
import type { FunctionTool } from '@hypa/intelligence-core';
import { Debug } from 'src/utils/debug';

export interface MetaChatMessage {
  role: string;
  content: string | Array<Record<string, unknown>>;
  tool_calls?: unknown;
  tool_call_id?: string;
}

interface MetaAsrResponse {
  transcript?: string;
  audioDurationMs?: number;
}

export function metaChatBody(
  messages: MetaChatMessage[],
  model: string,
  options: GoogleChatOptions,
) {
  const temperature = options.temperature;
  const topP = options.top_p;
  const sampling =
    temperature !== undefined
      ? { temperature }
      : topP && topP > 0
        ? { top_p: topP }
        : {};
  const history = messages.map((message) => {
    if (typeof message.content !== 'string' || message.role !== 'assistant') {
      return message;
    }
    return stripGoogleThinkingFromHistory([
      { role: 'assistant', content: message.content },
    ])[0];
  });

  return {
    model,
    messages: history,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: textOutputTokens(options.max_tokens),
    reasoning_effort: 'low',
    ...sampling,
  };
}

const clip = (text: string) => text.slice(0, 300);

async function errorBody(data: unknown): Promise<string> {
  if (!(data instanceof Readable)) return clip(typeof data === 'string' ? data : (JSON.stringify(data) ?? ''));
  const chunks = (await data.toArray()) as Buffer[];
  return clip(Buffer.concat(chunks).toString());
}

@Injectable()
export class MetaAiService {
  private readonly api: AxiosInstance = axios.create({
    timeout: 120_000,
    headers: { 'Content-Type': 'application/json' },
  });

  private async post(
    url: string,
    body: { model: string; stream: boolean; [key: string]: unknown },
    config: AxiosRequestConfig,
  ) {
    try {
      return await this.api.post(url, body, config);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        Debug.error({
          message: 'Meta request failed',
          url,
          model: body.model,
          stream: body.stream,
          status: error.response?.status,
          code: error.code,
          response: await errorBody(error.response?.data),
        });
      }
      throw error;
    }
  }

  private authHeader() {
    const key = process.env.META_MODEL_API_KEY;
    if (!key) throw new Error('META_MODEL_API_KEY is not set');
    return { Authorization: `Bearer ${key}` };
  }

  async chatStream(
    messages: MetaChatMessage[],
    model: string,
    url: string,
    options: GoogleChatOptions = {},
  ): Promise<AsyncGenerator<StreamChunk>> {
    const response = await this.post(
      url,
      metaChatBody(messages, model, options),
      {
        responseType: 'stream',
        signal: options.signal,
        headers: this.authHeader(),
      },
    );
    return parseGoogleSseStream(
      response.data as Readable,
      options.thinking ?? true,
    );
  }

  async chatSync(
    messages: MetaChatMessage[],
    model: string,
    url: string,
    options: GoogleChatOptions = {},
  ): Promise<ChatSyncResult & { finishReason: string | null }> {
    const body = metaChatBody(messages, model, options);
    const request: Record<string, unknown> = { ...body, stream: false };
    delete request.stream_options;
    let response;
    try {
      response = await this.api.post<{
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
        usage?: AiUsage;
      }>(url, request, {
        signal: options.signal,
        headers: this.authHeader(),
      });
    } catch (error) {
      if (isAxiosError(error) && ['ETIMEDOUT', 'ECONNABORTED'].includes(error.code ?? '')) {
        throw Object.assign(new Error('Meta request timed out.'), { code: 'request_timeout' });
      }
      throw error;
    }
    const choice = response.data.choices?.[0];
    const finishReason = choice?.finish_reason ?? null;
    if (finishReason === 'length') {
      throw Object.assign(new Error('Meta reached its output-token limit before completing the response.'), { code: 'incomplete_response' });
    }
    const usage = response.data.usage;
    if (!usage) {
      throw Object.assign(new Error('Meta returned no token usage; the response could not be accounted for.'), { code: 'missing_usage' });
    }
    const content = choice?.message?.content?.trim() ?? '';
    if (!content) throw Object.assign(new Error('Meta returned an empty response.'), { code: 'empty_response' });
    return { content, usage, finishReason };
  }

  async chatWithTools(
    messages: LoopMessage[],
    model: string,
    url: string,
    tools: FunctionTool[],
    signal?: AbortSignal,
    options?: AgentModelOptions,
    onTextDelta?: (text: string) => void,
  ) {
    if (new URL(url).origin !== 'https://api.meta.ai') {
      throw new Error('Refusing to send the provider key to another host');
    }
    return responsesWithTools({
      baseURL: 'https://api.meta.ai/v1',
      apiKey: process.env.META_MODEL_API_KEY,
      messages, model, tools, signal, options, onTextDelta,
    });
  }

  async transcribe(
    audio: Buffer,
  ): Promise<{ transcript: string; audioDurationMs: number }> {
    const wav = await convertAudioToPcmWav(audio);
    return this.transcribeWav(wav);
  }

  async transcribeWav(
    wav: Buffer,
    signal?: AbortSignal,
  ): Promise<{ transcript: string; audioDurationMs: number }> {
    const form = new FormData();
    form.append(
      'request',
      JSON.stringify({
        model: 'muse-voice-transcribe-1.0',
        audioEncoding: 'WAV',
        mode: 'PUSH_TO_TALK',
      }),
    );
    form.append(
      'audio',
      new Blob([new Uint8Array(wav)], { type: 'audio/wav' }),
      'audio.wav',
    );
    const response = await fetch('https://api.meta.ai/v1/asr/transcribe', {
      method: 'POST',
      headers: this.authHeader(),
      body: form,
      signal,
    });
    if (!response.ok) {
      Debug.error({
        message: 'Meta transcription failed',
        status: response.status,
        response: clip(await response.text()),
      });
      throw new Error(`Meta transcription failed (${response.status})`);
    }
    const body = (await response.json()) as MetaAsrResponse;
    return {
      transcript: body.transcript ?? '',
      audioDurationMs: body.audioDurationMs ?? 0,
    };
  }
}
