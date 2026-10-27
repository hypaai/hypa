import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { Readable } from 'stream';
import { AiUsage, ChatSyncResult, StreamChunk } from './ai.types';
import {
  parseGoogleSseStream,
  stripGoogleThinkingFromHistory,
  type GoogleChatOptions,
} from './google.ai.service';
interface MetaChatMessage {
  role: string;
  content: string | Array<Record<string, unknown>>;
  tool_calls?: unknown;
  tool_call_id?: string;
}

interface MetaAsrResponse {
  transcript?: string;
  audioDurationMs?: number;
}

function metaChatBody(
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
    max_completion_tokens: options.max_tokens ?? 1000,
    ...sampling,
  };
}

@Injectable()
export class MetaAiService {
  private readonly api: AxiosInstance = axios.create({
    timeout: 120_000,
    headers: { 'Content-Type': 'application/json' },
  });

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
    const response = await this.api.post(
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
    const stream = await this.chatStream(messages, model, url, options);
    let content = '';
    let usage: AiUsage | undefined;
    let finishReason: string | null = null;
    for await (const chunk of stream) {
      content = chunk.fullContent;
      usage = chunk.usage ?? usage;
      finishReason = chunk.finishReason ?? finishReason;
    }
    if (!usage) throw new Error('Meta response usage unavailable');
    return { content, usage, finishReason };
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
      throw new Error(`Meta transcription failed (${response.status})`);
    }
    const body = (await response.json()) as MetaAsrResponse;
    return {
      transcript: body.transcript ?? '',
      audioDurationMs: body.audioDurationMs ?? 0,
    };
  }
}
