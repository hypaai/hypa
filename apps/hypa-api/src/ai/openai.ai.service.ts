import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { Readable } from 'stream';
import { Observable } from 'rxjs';
import { parseSseStream } from './stream.utils';
import { AiUsage, ChatMessage, ChatSyncResult, StreamChunk } from './ai.types';

@Injectable()
export class OpenAiAiService {
  chatStream(
    messages: ChatMessage[],
    model: string,
    options: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      stream_options?: { include_usage: boolean };
      reasoning_effort?: string;
      omit_sampling?: boolean;
    } = {},
  ): Observable<StreamChunk> {
    return new Observable((subscriber) => {
      void (async () => {
        try {
          const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model,
              messages,
              stream: true,
              stream_options: options.stream_options ?? { include_usage: true },
              ...(options.omit_sampling
                ? {}
                : {
                    top_p: options.top_p ?? 1,
                    temperature: options.temperature ?? 1,
                  }),
              max_completion_tokens: options.max_tokens ?? 1000,
              ...(options.reasoning_effort
                ? { reasoning_effort: options.reasoning_effort }
                : {}),
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              responseType: 'stream',
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
    model: string,
    options: {
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      signal?: AbortSignal;
      timeout?: number;
      reasoning_effort?: string;
      omit_sampling?: boolean;
    } = {},
  ): Promise<ChatSyncResult & { raw: unknown }> {
    const response = await axios.post<{
      choices: Array<{ message: { content: string } }>;
      usage: AiUsage;
    }>(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages,
        stream: false,
        ...(options.omit_sampling
          ? {}
          : {
              top_p: options.top_p ?? 1,
              temperature: options.temperature ?? 1,
            }),
        max_completion_tokens: options.max_tokens ?? 1000,
        ...(options.reasoning_effort
          ? { reasoning_effort: options.reasoning_effort }
          : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: options.signal,
        ...(options.timeout ? { timeout: options.timeout } : {}),
      },
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim() ?? '';
    const usage = response.data?.usage ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    return { content, usage, raw: response.data };
  }

  async ttsRequest(
    text: string,
    voice: string,
    model: string,
    url: string,
    signal?: AbortSignal,
  ): Promise<{ audio_b64: string; audio_type: string; usage?: AiUsage }> {
    const tokenSpeech =
      model === 'gpt-4o-mini-tts' || model.startsWith('gpt-4o-mini-tts-');
    const response = await axios.post(
      url,
      {
        model,
        input: text,
        voice,
        response_format: 'mp3',
        ...(tokenSpeech ? { stream_format: 'sse' } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: tokenSpeech ? 'stream' : 'arraybuffer',
        signal,
      },
    );

    if (tokenSpeech) {
      const stream = response.data as Readable;
      stream.setEncoding('utf8');
      const audio: Buffer[] = [];
      let usage: AiUsage | undefined;
      let pending = '';
      const parseEvent = (event: string) => {
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') return;
        const value = JSON.parse(data);
        if (value.type === 'speech.audio.delta') {
          if (
            usage ||
            typeof value.audio !== 'string' ||
            !value.audio.length ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(value.audio)
          ) {
            throw new BadRequestException('Invalid OpenAI speech audio event');
          }
          audio.push(Buffer.from(value.audio, 'base64'));
        } else if (value.type === 'speech.audio.done') {
          if (usage)
            throw new BadRequestException('Duplicate OpenAI speech usage');
          const raw = value.usage;
          if (
            !raw ||
            ![raw.input_tokens, raw.output_tokens, raw.total_tokens].every(
              (n) => Number.isSafeInteger(n) && n >= 0,
            ) ||
            raw.total_tokens !== raw.input_tokens + raw.output_tokens
          ) {
            throw new BadRequestException(
              'Missing or invalid OpenAI speech usage',
            );
          }
          usage = {
            prompt_tokens: raw.input_tokens,
            completion_tokens: raw.output_tokens,
            total_tokens: raw.total_tokens,
            input_text_tokens: raw.input_tokens,
            output_audio_tokens: raw.output_tokens,
          };
        } else if (value.type === 'error' || value.error) {
          throw new BadRequestException('OpenAI speech generation failed');
        }
      };
      try {
        for await (const chunk of stream as AsyncIterable<string>) {
          signal?.throwIfAborted();
          pending += chunk;
          let match: RegExpExecArray | null;
          while ((match = /\r?\n\r?\n/.exec(pending))) {
            parseEvent(pending.slice(0, match.index));
            pending = pending.slice(match.index + match[0].length);
          }
        }
        if (pending.trim()) parseEvent(pending);
        signal?.throwIfAborted();
        if (!usage || !audio.length)
          throw new BadRequestException('Incomplete OpenAI speech response');
        return {
          audio_b64: Buffer.concat(audio).toString('base64'),
          audio_type: 'audio/mpeg',
          usage,
        };
      } finally {
        stream.destroy();
      }
    }
    signal?.throwIfAborted();
    const audioBase64 = Buffer.from(response.data).toString('base64');
    const rawContentType =
      (response.headers?.['content-type'] as string | undefined) ||
      'audio/mpeg';
    const audioType = rawContentType.split(';')[0] || 'audio/mpeg';

    return { audio_b64: audioBase64, audio_type: audioType };
  }

  async asrRequest(
    audioBuffer: Buffer,
    mimeType: string,
    model: string,
    url: string,
    temperature?: number,
    signal?: AbortSignal,
  ): Promise<{ text: string; usage: AiUsage }> {
    const FormData = (await import('form-data')).default;
    const mimeToExt: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/m4a': 'm4a',
      'audio/flac': 'flac',
    };
    const ext = mimeToExt[mimeType] || 'mp3';

    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: `audio.${ext}`,
      contentType: mimeType,
    });
    formData.append('model', model);
    formData.append(
      'response_format',
      model === 'gpt-4o-transcribe-diarize' ? 'diarized_json' : 'json',
    );
    if (temperature !== undefined) {
      formData.append('temperature', String(temperature));
    }

    const response = await axios.post(url, formData, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
      signal,
    });

    signal?.throwIfAborted();
    const raw = response.data?.usage;
    let usage: AiUsage;
    if (
      model === 'whisper-1' ||
      model === 'gpt-transcribe' ||
      model === 'gpt-4o-transcribe-diarize'
    ) {
      if (
        raw?.type !== 'duration' ||
        !Number.isFinite(raw.seconds) ||
        raw.seconds <= 0
      )
        throw new BadRequestException(
          'Missing or invalid OpenAI billable duration',
        );
      usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        billable_seconds: raw.seconds,
      };
    } else {
      const details = raw?.input_token_details;
      if (
        raw?.type !== 'tokens' ||
        !details ||
        ![
          raw.input_tokens,
          raw.output_tokens,
          raw.total_tokens,
          details.text_tokens,
          details.audio_tokens,
        ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
        raw.input_tokens !== details.text_tokens + details.audio_tokens ||
        raw.total_tokens !== raw.input_tokens + raw.output_tokens
      )
        throw new BadRequestException(
          'Missing or invalid OpenAI transcription usage',
        );
      usage = {
        prompt_tokens: raw.input_tokens,
        completion_tokens: raw.output_tokens,
        total_tokens: raw.total_tokens,
        input_text_tokens: details.text_tokens,
        input_audio_tokens: details.audio_tokens,
      };
    }
    return {
      text: response.data?.text || response.data?.transcript || '',
      usage,
    };
  }
}
