import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

interface MansaTranslateParams {
  text: string;
  from: string;
  to: string;
  apiUrl: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface MansaTranscribeParams {
  audioBase64: string;
  language: string;
  mimeType: string;
  filename: string;
  durationSeconds: number;
  apiUrl: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface MansaSpeechParams {
  text: string;
  language: string;
  voice?: string;
  apiUrl: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

interface MansaSpeechResult {
  audio: Buffer;
  contentType: string;
  sampleRate?: number;
}

@Injectable()
export class MansaAiService {
  private readonly api: AxiosInstance = axios.create();

  private get apiKey(): string {
    const key = process.env.MANSA_API_KEY;
    if (!key) {
      throw new Error('MANSA_API_KEY is not configured');
    }
    return key;
  }

  private authHeaders() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async translate(params: MansaTranslateParams): Promise<string> {
    const response = await this.api.post(
      params.apiUrl,
      {
        text: params.text,
        from: params.from,
        to: params.to,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        timeout: params.timeoutMs,
        signal: params.signal,
      },
    );

    return String(response.data?.data?.translation ?? '');
  }

  async transcribe(params: MansaTranscribeParams): Promise<string> {
    const response = await this.api.post(
      params.apiUrl,
      {
        audioBase64: params.audioBase64,
        language: params.language,
        mimeType: params.mimeType,
        filename: params.filename,
        durationSeconds: params.durationSeconds,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        timeout: params.timeoutMs,
        signal: params.signal,
      },
    );

    return String(response.data?.data?.transcript ?? '');
  }

  async speech(params: MansaSpeechParams): Promise<MansaSpeechResult> {
    const response = await this.api.post(
      params.apiUrl,
      {
        text: params.text,
        language: params.language,
        voice: params.voice,
        stream: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        timeout: params.timeoutMs,
        signal: params.signal,
        responseType: 'arraybuffer',
      },
    );

    const contentType = String(response.headers['content-type'] ?? '');
    if (!contentType.startsWith('audio/')) {
      throw new Error(
        `Mansa TTS returned an unexpected content-type: ${contentType || '(none)'}`,
      );
    }

    return {
      audio: Buffer.from(response.data as ArrayBuffer),
      contentType,
      sampleRate: Number(response.headers['x-sampling-rate']) || undefined,
    };
  }
}
