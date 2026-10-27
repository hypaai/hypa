import type { TranslationBilling } from './translation-billing';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import { supportsMtPair } from '@hypa/config/mt-pair-support';
import { Observable } from 'rxjs';
import errorCodes from '@hypa/config/json/error-codes';
import {
  charge_type,
  developer_request_type,
} from 'src/generated/prisma/enums';
import { MansaAiService } from 'src/ai/mansa.ai.service';
import { Debug } from 'src/utils/debug';
import {
  DeveloperMtDto,
  DeveloperSpeechToTextDto,
  DeveloperTtsDto,
  developerReqType,
} from '../developer.dto';
import { DeveloperSharedService } from './shared.service';

interface TranslateTextParams {
  billing?: TranslationBilling;
  validateOutput?: (text: string) => void;
  body: DeveloperMtDto;
  type: developerReqType;
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
}

interface SpeechToTextParams {
  body: DeveloperSpeechToTextDto;
  type: developerReqType;
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
}

interface GenerateTtsParams {
  body: DeveloperTtsDto;
  type: developerReqType;
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
}

const isAutoDetect = (value: string | undefined | null): boolean => {
  const normalized = value?.trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'auto' ||
    normalized === 'auto-detect' ||
    normalized === 'autodetect'
  );
};

const LANGUAGE_ALIASES: Record<string, string> = {
  ak: 'Twi',
  akan: 'Twi',
  'chichewa (nyanja)': 'Chichewa',
  'luganda (ganda)': 'Luganda',
  'pedi (sepedi)': 'Sepedi',
};

function resolveLanguageAlias(value: string): string {
  return LANGUAGE_ALIASES[value.trim().toLowerCase()] ?? value;
}

function isSupportedLanguage(
  languages: string[] | undefined,
  value: string,
): boolean {
  const normalized = value.trim().toLowerCase();
  return !!languages?.some((l) => l.toLowerCase() === normalized);
}

function invalidLanguage(languages: string[] | undefined, detail?: string) {
  return new BadRequestException({
    message: `${errorCodes.INVALID_LANGUAGE.message}${detail ? ` ${detail}` : ''} Supported languages: ${(languages || []).join(', ')}`,
    code: errorCodes.INVALID_LANGUAGE.code,
  });
}

const MAX_TRANSLATE_CHARACTERS = 5000;
const MAX_TTS_CHARACTERS = 2000;

function assertMaxCharacters(characterCount: number, max: number) {
  if (characterCount > max) {
    throw new BadRequestException({
      message: `This Mansa model accepts at most ${max.toLocaleString()} characters per request.`,
      code: errorCodes.INVALID_REQUEST.code,
    });
  }
}

function catalogTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs == null) {
    throw new BadGatewayException({
      message: 'Model timeout unavailable',
      code: errorCodes.MODEL_UNAVAILABLE.code,
    });
  }
  return timeoutMs;
}

const MIME_TO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

@Injectable()
export class MansaDeveloperService {
  constructor(
    private readonly shared: DeveloperSharedService,
    private readonly mansaAi: MansaAiService,
  ) {}

  private assertEnabled(
    flagEnvVar: 'MANSA_MT_ENABLED' | 'MANSA_ASR_ENABLED' | 'MANSA_TTS_ENABLED',
  ) {
    const enabled = process.env[flagEnvVar] === 'true';
    const hasKey = !!process.env.MANSA_API_KEY;
    if (!enabled || !hasKey) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }
  }

  private mapMansaError(error: unknown): never {
    if (!isAxiosError(error)) throw error;

    if (error.code === 'ERR_CANCELED') throw error;

    if (
      error.code === 'ECONNABORTED' ||
      error.message?.toLowerCase().includes('timeout')
    ) {
      throw new GatewayTimeoutException({
        message: errorCodes.SERVICE_UNAVAILABLE.message,
        code: errorCodes.SERVICE_UNAVAILABLE.code,
      });
    }

    if (!error.response) {
      Debug.error(
        `Mansa request failed without a response (${error.code ?? error.message}).`,
      );
      throw new BadGatewayException({
        message: errorCodes.SERVICE_UNAVAILABLE.message,
        code: errorCodes.SERVICE_UNAVAILABLE.code,
      });
    }

    let data: unknown = error.response.data;
    if (Buffer.isBuffer(data)) {
      try {
        data = JSON.parse(data.toString('utf8'));
      } catch {
        data = undefined;
      }
    }
    const problem = data as
      | {
          context?: string;
          detail?: string;
          invalidParams?: unknown;
        }
      | undefined;
    const context = problem?.context;
    const status = error.response?.status;

    if (context === 'invalid_request') {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_REQUEST.message}${problem?.detail ? ` ${problem.detail}` : ''}`,
        code: errorCodes.INVALID_REQUEST.code,
        invalidParams: problem?.invalidParams,
      });
    }

    if (context === 'unauthorized' || context === 'invalid_api_key') {
      Debug.error(
        `Mansa rejected our own API key (context: ${context}) — MANSA_API_KEY needs attention.`,
      );
      throw new ServiceUnavailableException({
        message: errorCodes.SERVICE_UNAVAILABLE.message,
        code: errorCodes.SERVICE_UNAVAILABLE.code,
      });
    }

    if (context === 'insufficient_credit') {
      Debug.error(
        'Mansa account balance is empty (insufficient_credit) — needs a top-up.',
      );
      throw new ServiceUnavailableException({
        message: errorCodes.SERVICE_UNAVAILABLE.message,
        code: errorCodes.SERVICE_UNAVAILABLE.code,
      });
    }

    if (context === 'rate_limited') {
      throw new HttpException(
        {
          message:
            'Mansa is rate-limiting requests right now. Please retry shortly.',
          code: errorCodes.SERVICE_UNAVAILABLE.code,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (
      context === 'service_unavailable' ||
      context === 'response_incomplete' ||
      context === 'translation_failed' ||
      (status && status >= 500)
    ) {
      Debug.error(
        `Mansa returned a vendor error (context: ${context ?? 'unknown'}, status: ${status}).`,
        problem,
      );
      throw new BadGatewayException({
        message: errorCodes.SERVICE_UNAVAILABLE.message,
        code: errorCodes.SERVICE_UNAVAILABLE.code,
      });
    }

    throw new BadRequestException({
      message: `${errorCodes.INVALID_REQUEST.message}${problem?.detail ? ` Provider details: ${problem.detail}` : ''}`,
      code: errorCodes.INVALID_REQUEST.code,
    });
  }

  async translateText(
    params: TranslateTextParams,
  ): Promise<Observable<{ data: string }>> {
    const billing = params.billing ?? this.shared;
    this.assertEnabled('MANSA_MT_ENABLED');

    const modelData = this.shared.getModelInfo({
      provider: 'mansa',
      model: params.body.model,
      type: 'MT',
    });
    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }
    if (!modelData.rates?.input) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }
    const timeoutMs = catalogTimeoutMs(modelData.timeout_ms);

    if (params.body.thinking) {
      throw new BadRequestException({
        message: 'Mansa does not support thinking mode.',
        code: errorCodes.INVALID_REQUEST.code,
      });
    }

    const rawTarget = params.body.target_lang;
    if (!rawTarget) {
      throw invalidLanguage(
        modelData.languages,
        'A target language is required.',
      );
    }
    const targetLang = resolveLanguageAlias(rawTarget);
    if (!isSupportedLanguage(modelData.languages, targetLang)) {
      throw invalidLanguage(modelData.languages);
    }

    const rawSource = params.body.source_lang;
    if (isAutoDetect(rawSource)) {
      throw invalidLanguage(
        modelData.languages,
        'This model requires an explicit source language — auto-detect is not supported.',
      );
    }
    const sourceLang = resolveLanguageAlias(rawSource!);
    if (!isSupportedLanguage(modelData.languages, sourceLang)) {
      throw invalidLanguage(modelData.languages);
    }

    if (!supportsMtPair('mansa', sourceLang, targetLang)) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Beta languages only pair with English.`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }

    const characterCount = this.shared.codePointCount(params.body.text);
    assertMaxCharacters(characterCount, MAX_TRANSLATE_CHARACTERS);
    const usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      character_count: characterCount,
    };
    const estimatedCost = this.shared.calculateCost({
      usage,
      rates: modelData.rates,
      chargeType: 'character_count',
      additionalData: { characterCount },
    });

    params.signal?.throwIfAborted();
    await this.shared.checkBalance(params.userId, estimatedCost);
    await billing.deductBalance(params.userId, estimatedCost);

    const modelName = String(modelData.name);
    const apiUrl = String(modelData.base_apiURL);

    return new Observable<{ data: string }>((subscriber) => {
      void (async () => {
        try {
          const translation = await this.mansaAi.translate({
            text: params.body.text,
            from: sourceLang,
            to: targetLang,
            apiUrl,
            timeoutMs,
            signal: params.signal,
          });

          params.validateOutput?.(translation ?? '');
          if (!translation) {
            throw new BadRequestException({
              message: errorCodes.INCOMPLETE_RESPONSE.message,
              code: errorCodes.INCOMPLETE_RESPONSE.code,
            });
          }

          if (params.signal?.aborted) {
            await billing.refundBalance(
              params.userId,
              estimatedCost,
              'Mansa MT abandoned attempt',
            );
            subscriber.complete();
            return;
          }

          await billing.recordDevRequest({
            body: params.body,
            type: developer_request_type.machine_translation,
            usage,
            rates: modelData.rates!,
            userId: params.userId,
            apiKeyId: params.apiKeyId,
            chargeType: charge_type.character_count,
            characterCount,
            actualCost: estimatedCost,
          });

          if (params.body.stream) {
            subscriber.next({
              data: JSON.stringify({
                choices: [
                  {
                    index: 0,
                    delta: { content: translation },
                    finish_reason: null,
                  },
                ],
                fullContent: translation,
                complete: false,
              }),
            });
            subscriber.next({
              data: JSON.stringify({
                delta: '',
                fullContent: translation,
                complete: true,
              }),
            });
          } else {
            subscriber.next({
              data: JSON.stringify({
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: translation,
                      finish_reason: 'stop',
                    },
                  },
                ],
                usage,
                model: modelName,
                provider: 'mansa',
              }),
            });
          }
          subscriber.complete();
        } catch (error) {
          await billing
            .refundBalance(
              params.userId,
              estimatedCost,
              'Mansa MT API call failed',
            )
            .catch((refundError) =>
              Debug.error('Mansa MT refund failed', refundError),
            );
          try {
            this.mapMansaError(error);
          } catch (mapped) {
            subscriber.error(mapped);
          }
        }
      })();
    });
  }

  async speechToText(params: SpeechToTextParams) {
    this.assertEnabled('MANSA_ASR_ENABLED');

    if (params.body.stream) {
      throw new BadRequestException({
        message: 'Mansa does not support live/streaming transcription.',
        code: errorCodes.INVALID_REQUEST.code,
      });
    }

    const modelData = this.shared.getModelInfo({
      provider: 'mansa',
      model: params.body.model,
      type: 'ASR',
    });
    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }
    if (!modelData.rates?.input) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }
    const timeoutMs = catalogTimeoutMs(modelData.timeout_ms);

    const rawLanguage = params.body.source_lang;
    if (!rawLanguage) {
      throw invalidLanguage(
        modelData.languages,
        'A source language is required for transcription.',
      );
    }
    const language = resolveLanguageAlias(rawLanguage);
    if (!isSupportedLanguage(modelData.languages, language)) {
      throw invalidLanguage(modelData.languages);
    }

    const { base64, mimeType } = await this.shared.decodeAudio({
      audio: params.body.audio,
      audioType: params.body.audio_type,
      mimeType: params.body.mime_type,
    });
    const bareMimeType = mimeType?.split(';')[0]?.trim().toLowerCase();
    if (!bareMimeType || !MIME_TO_EXT[bareMimeType]) {
      throw new BadRequestException({
        message: errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }

    const audioBuffer = Buffer.from(base64, 'base64');
    const durationSeconds = Math.ceil(
      await this.shared.getAudioDurationSeconds(audioBuffer, bareMimeType),
    );

    const usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      billable_seconds: durationSeconds,
    };
    const estimatedCost = this.shared.calculateCost({
      usage,
      rates: modelData.rates,
      chargeType: 'audio_minutes',
      additionalData: { audioDurationSeconds: durationSeconds },
    });

    params.signal?.throwIfAborted();
    await this.shared.checkBalance(params.userId, estimatedCost);
    await this.shared.deductBalance(params.userId, estimatedCost);

    try {
      const transcript = await this.mansaAi.transcribe({
        audioBase64: base64,
        language,
        mimeType: bareMimeType,
        filename: `audio.${MIME_TO_EXT[bareMimeType]}`,
        durationSeconds,
        apiUrl: String(modelData.base_apiURL),
        timeoutMs,
        signal: params.signal,
      });

      if (!transcript) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      await this.shared.recordDevRequest({
        body: params.body,
        type: developer_request_type.speech_to_text,
        usage,
        rates: modelData.rates!,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        chargeType: charge_type.audio_minutes,
        audioDurationSeconds: durationSeconds,
        actualCost: estimatedCost,
      });

      return {
        response: { text: transcript },
        usage,
        model: modelData.name,
        provider: 'mansa',
      };
    } catch (error) {
      await this.shared
        .refundBalance(
          params.userId,
          estimatedCost,
          'Mansa ASR API call failed',
        )
        .catch((refundError) =>
          Debug.error('Mansa ASR refund failed', refundError),
        );
      this.mapMansaError(error);
    }
  }

  async generateTts(params: GenerateTtsParams) {
    this.assertEnabled('MANSA_TTS_ENABLED');

    const modelData = this.shared.getModelInfo({
      provider: 'mansa',
      model: params.body.model,
      type: 'TTS',
    });
    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }
    if (!modelData.rates?.input) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }
    const timeoutMs = catalogTimeoutMs(modelData.timeout_ms);

    const languages = modelData.languages ?? [];
    const languageCodes = modelData.languageCodes ?? [];
    const requestedLanguage = params.body.language?.trim();
    if (!requestedLanguage) {
      throw invalidLanguage(modelData.languages, 'A language is required.');
    }
    const languageIndex = languages.findIndex(
      (l) => l.toLowerCase() === requestedLanguage.toLowerCase(),
    );
    const matchedByCode =
      languageIndex < 0
        ? languageCodes.findIndex(
            (c) => c.toLowerCase() === requestedLanguage.toLowerCase(),
          )
        : -1;
    const index = languageIndex >= 0 ? languageIndex : matchedByCode;
    if (index < 0) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Supported languages: ${languages.join(', ')}`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }

    const language = languages[index];
    const code = languageCodes[index];
    const mansaLanguageName =
      ({ fon: 'fon', nr: 'ndebele' } as Record<string, string>)[code] ??
      language.toLowerCase();

    const voicesForLanguage = modelData.voices?.[language.toLowerCase()] ?? [];
    const requestedVoice = params.body.voice?.trim();
    let voice: string | undefined;
    if (requestedVoice) {
      voice = voicesForLanguage.includes(requestedVoice)
        ? requestedVoice
        : undefined;
      if (!voice) {
        throw new BadRequestException({
          message: `${errorCodes.INVALID_VOICE.message} Supported voices for "${language}": ${voicesForLanguage.join(', ')}`,
          code: errorCodes.INVALID_VOICE.code,
        });
      }
    }

    const characterCount = this.shared.codePointCount(params.body.text);
    assertMaxCharacters(characterCount, MAX_TTS_CHARACTERS);
    const usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      character_count: characterCount,
    };
    const rates = { input: modelData.rates.input, output: 0 };
    const estimatedCost = this.shared.calculateCost({
      usage,
      rates,
      chargeType: 'character_count',
      additionalData: { characterCount },
    });

    params.signal?.throwIfAborted();
    await this.shared.checkBalance(params.userId, estimatedCost);
    await this.shared.deductBalance(params.userId, estimatedCost);

    try {
      const result = await this.mansaAi.speech({
        text: params.body.text,
        language: mansaLanguageName,
        voice,
        apiUrl: String(modelData.base_apiURL),
        timeoutMs,
        signal: params.signal,
      });

      await this.shared.recordDevRequest({
        body: params.body,
        type: developer_request_type.text_to_speech,
        usage,
        rates,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        chargeType: charge_type.character_count,
        characterCount,
        actualCost: estimatedCost,
      });

      return {
        response: {
          audio_b64: result.audio.toString('base64'),
          audio_type: result.contentType,
          sample_rate: result.sampleRate ?? null,
        },
        usage,
        model: modelData.name,
        voice,
        language,
        provider: 'mansa',
      };
    } catch (error) {
      await this.shared
        .refundBalance(
          params.userId,
          estimatedCost,
          'Mansa TTS API call failed',
        )
        .catch((refundError) =>
          Debug.error('Mansa TTS refund failed', refundError),
        );
      this.mapMansaError(error);
    }
  }
}
