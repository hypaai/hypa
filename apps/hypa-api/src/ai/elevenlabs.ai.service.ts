import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import FormData from 'form-data';
import errorCodes from '@hypa/config/json/error-codes';

export interface ElevenLabsTtsResult {
  audio_b64: string;
  audio_type: 'audio/mpeg';
  sample_rate: 44100;
  character_cost?: number;
}

export interface ElevenLabsAsrResult {
  text: string;
  language_code?: string;
  audio_duration_secs?: number | null;
}

export const ELEVENLABS_MAX_CHARACTERS = 5000;

@Injectable()
export class ElevenLabsAiService {
  async ttsRequest(params: {
    text: string;
    voiceId: string;
    model: string;
    languageCode?: string;
    baseUrl: string;
    signal?: AbortSignal;
  }): Promise<ElevenLabsTtsResult> {
    if (params.text.length > ELEVENLABS_MAX_CHARACTERS) {
      throw new BadRequestException({
        message: `This ElevenLabs model accepts at most ${ELEVENLABS_MAX_CHARACTERS.toLocaleString()} characters per request.`,
        code: errorCodes.INVALID_REQUEST.code,
      });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new BadGatewayException({
        message: errorCodes.MODEL_UNAVAILABLE.message,
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    try {
      const requestBody: {
        text: string;
        model_id: string;
        language_code?: string;
      } = {
        text: params.text,
        model_id: params.model,
      };
      if (params.model !== 'eleven_multilingual_v2' && params.languageCode) {
        requestBody.language_code = params.languageCode;
      }

      const response = await axios.post<ArrayBuffer>(
        `${params.baseUrl}/${encodeURIComponent(params.voiceId)}?output_format=mp3_44100_128`,
        requestBody,
        {
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          signal: params.signal,
          timeout: 120000,
        },
      );

      const audio = Buffer.from(response.data);
      if (audio.length === 0) {
        throw new BadGatewayException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      const rawCharacterCost = response.headers?.['character-cost'];
      const parsedCharacterCost = Number(rawCharacterCost);
      const characterCost =
        (typeof rawCharacterCost === 'number' ||
          (typeof rawCharacterCost === 'string' &&
            rawCharacterCost.trim() !== '')) &&
        Number.isFinite(parsedCharacterCost) &&
        parsedCharacterCost >= 0
          ? parsedCharacterCost
          : undefined;

      return {
        audio_b64: audio.toString('base64'),
        audio_type: 'audio/mpeg',
        sample_rate: 44100,
        character_cost: characterCost,
      };
    } catch (error) {
      if (!isAxiosError(error)) throw error;
      if (error.code === 'ERR_CANCELED') throw error;

      const status = error.response?.status;
      const providerError = this.decodeProviderError(error.response?.data);
      const providerCode = providerError?.code?.toLowerCase();
      if (providerCode === 'paid_plan_required') {
        throw new HttpException(
          {
            message:
              'This ElevenLabs voice requires a paid plan. Please upgrade your plan or choose a premade voice.',
            code: 'PAID_PLAN_REQUIRED',
            provider_code: providerCode,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      if (
        status === 429 ||
        status === 402 ||
        providerCode === 'quota_exceeded' ||
        providerCode === 'insufficient_credits' ||
        providerCode === 'rate_limit_exceeded' ||
        providerCode === 'concurrent_limit_exceeded'
      ) {
        throw new HttpException(
          {
            message:
              'The ElevenLabs rate, quota, or concurrency limit was reached.',
            code: errorCodes.MODEL_UNAVAILABLE.code,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (status === 401 || status === 403) {
        throw new BadGatewayException({
          message: errorCodes.MODEL_UNAVAILABLE.message,
          code: errorCodes.MODEL_UNAVAILABLE.code,
        });
      }
      if (!status || status >= 500) {
        throw new ServiceUnavailableException({
          message: errorCodes.MODEL_UNAVAILABLE.message,
          code: errorCodes.MODEL_UNAVAILABLE.code,
        });
      }

      const providerMessage = providerError?.message;
      throw new BadRequestException({
        message: providerMessage
          ? `${errorCodes.INVALID_REQUEST.message} Provider details: ${providerMessage}`
          : errorCodes.INVALID_REQUEST.message,
        code: errorCodes.INVALID_REQUEST.code,
      });
    }
  }

  async asrRequest(params: {
    audioBuffer: Buffer;
    mimeType: string;
    model: string;
    baseUrl: string;
    signal?: AbortSignal;
  }): Promise<ElevenLabsAsrResult> {
    const mimeToExt: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/m4a': 'm4a',
      'audio/flac': 'flac',
    };
    const normalizedMimeType = params.mimeType
      .split(';')[0]
      .trim()
      .toLowerCase();
    const ext = mimeToExt[normalizedMimeType] || 'bin';

    const formData = new FormData();
    formData.append('file', params.audioBuffer, {
      filename: `audio.${ext}`,
      contentType: normalizedMimeType,
    });
    formData.append('model_id', params.model);

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new BadGatewayException({
        message: errorCodes.MODEL_UNAVAILABLE.message,
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    try {
      const response = await axios.post<ElevenLabsAsrResult>(
        params.baseUrl,
        formData,
        {
          headers: {
            'xi-api-key': apiKey,
            ...formData.getHeaders(),
          },
          responseType: 'json',
          signal: params.signal,
          timeout: 120000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );

      const text =
        typeof response.data?.text === 'string'
          ? response.data.text.trim()
          : '';
      if (!text) {
        throw new BadGatewayException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      return {
        text,
        language_code: response.data.language_code,
        audio_duration_secs: response.data.audio_duration_secs,
      };
    } catch (error) {
      if (!isAxiosError(error)) throw error;
      if (error.code === 'ERR_CANCELED') throw error;

      const status = error.response?.status;
      const providerError = this.decodeProviderError(error.response?.data);
      const providerCode = providerError?.code?.toLowerCase();
      if (
        status === 429 ||
        status === 402 ||
        providerCode === 'quota_exceeded' ||
        providerCode === 'insufficient_credits' ||
        providerCode === 'rate_limit_exceeded' ||
        providerCode === 'concurrent_limit_exceeded'
      ) {
        throw new HttpException(
          {
            message:
              'The ElevenLabs rate, quota, or concurrency limit was reached.',
            code: errorCodes.MODEL_UNAVAILABLE.code,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (status === 401 || status === 403) {
        throw new BadGatewayException({
          message: errorCodes.MODEL_UNAVAILABLE.message,
          code: errorCodes.MODEL_UNAVAILABLE.code,
        });
      }
      if (!status || status >= 500) {
        throw new ServiceUnavailableException({
          message: errorCodes.MODEL_UNAVAILABLE.message,
          code: errorCodes.MODEL_UNAVAILABLE.code,
        });
      }

      const providerMessage = providerError?.message;
      throw new BadRequestException({
        message: providerMessage
          ? `${errorCodes.INVALID_REQUEST.message} Provider details: ${providerMessage}`
          : errorCodes.INVALID_REQUEST.message,
        code: errorCodes.INVALID_REQUEST.code,
      });
    }
  }

  private decodeProviderError(
    data: unknown,
  ): { message?: string; code?: string } | undefined {
    try {
      const decoded =
        data instanceof ArrayBuffer || ArrayBuffer.isView(data)
          ? Buffer.from(data as ArrayBuffer).toString('utf8')
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : typeof data === 'string'
              ? data
              : JSON.stringify(data);
      const parsed = JSON.parse(decoded) as {
        detail?: { message?: string; code?: string; status?: string } | string;
        message?: string;
        code?: string;
      };
      return typeof parsed.detail === 'string'
        ? { message: parsed.detail, code: parsed.code }
        : {
            message: parsed.detail?.message || parsed.message,
            code: parsed.detail?.code || parsed.detail?.status || parsed.code,
          };
    } catch {
      return undefined;
    }
  }
}
