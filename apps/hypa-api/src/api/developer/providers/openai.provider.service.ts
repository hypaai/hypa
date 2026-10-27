import type { TranslationBilling } from './translation-billing';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  ChargeType,
  DeveloperMtDto,
  developerReqType,
  DeveloperSpeechToTextDto,
  DeveloperTtsDto,
} from '../developer.dto';
import { DeveloperSharedService } from './shared.service';
import errorCodes from '@hypa/config/json/error-codes';
import { isAxiosError } from 'axios';
import { Observable } from 'rxjs';
import { Prisma } from 'src/generated/prisma/client';
import { Debug } from 'src/utils/debug';
import { developer_request_type } from 'src/generated/prisma/enums';
import { OpenAiAiService } from 'src/ai/openai.ai.service';
import { getMtMessages } from 'src/ai/prompts/mt.prompts';
import {
  ASTRA_MAX_COMPLETION_TOKENS,
  ASTRA_MIN_COMPLETION_TOKENS,
  isGpt6AstraModel,
} from 'src/ai/openai.model';

interface TranslateTextParams {
  billing?: TranslationBilling;
  validateOutput?: (text: string) => void;
  body: DeveloperMtDto;
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

@Injectable()
export class OpenAiDeveloperService {
  constructor(
    private readonly shared: DeveloperSharedService,
    private readonly openAi: OpenAiAiService,
  ) {}

  private getMaxCompletionTokens(model: string, requested: number, cap = 1000) {
    if (isGpt6AstraModel(model)) {
      return Math.max(
        ASTRA_MIN_COMPLETION_TOKENS,
        this.shared.numberCap(
          requested,
          ASTRA_MAX_COMPLETION_TOKENS,
          ASTRA_MIN_COMPLETION_TOKENS,
        ),
      );
    }

    return this.shared.numberCap(requested, cap, 1000);
  }

  async translateText(params: TranslateTextParams) {
    const billing = params.billing ?? this.shared;
    const modelData = await this.shared.getModelInfo({
      provider: params.body.provider,
      model: params.body.model,
      type: 'MT',
    });

    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    if (!modelData.rates?.input || !modelData.rates?.output) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    const supportedLanguages = modelData.languages?.find(
      (l: string) => l.toLowerCase() === params.body.target_lang?.toLowerCase(),
    );
    if (!supportedLanguages) {
      const languagesList = modelData.languages || [];
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Supported languages: ${languagesList.join(', ')}`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }

    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const isAstra = isGpt6AstraModel(params.body.model);
    const temperature = isAstra
      ? undefined
      : (modelData.fixedTemperature ??
        this.shared.clampTemperature(params.body.temperature, 1));
    const reasoningEffort = modelData.reasoningEffort;
    const inputTokens = this.shared.getTextNumberOfTokens(params.body.text);
    const estimatedOutputTokens = Math.ceil(inputTokens * 1.2);
    const estimatedUsage = {
      prompt_tokens: inputTokens,
      completion_tokens: estimatedOutputTokens,
      total_tokens: inputTokens + estimatedOutputTokens,
    };
    const estimatedCost = this.shared.calculateCost({
      usage: estimatedUsage,
      rates: modelData.rates,
      chargeType,
    });

    params.signal?.throwIfAborted();
    await billing.deductBalance(params.userId, estimatedCost);

    const messages = getMtMessages({
      provider: 'openai',
      text: params.body.text,
      sourceLang: params.body.source_lang,
      targetLang: params.body.target_lang ?? 'auto',
      model: params.body.model,
    });

    return new Observable((subscriber) => {
      (async () => {
        try {
          if (params.body.stream) {
            const stream$ = this.openAi.chatStream(
              messages,
              params.body.model,
              {
                ...(isAstra ? {} : { temperature }),
                max_tokens: this.getMaxCompletionTokens(
                  params.body.model,
                  params.body.max_tokens,
                  2048,
                ),
                ...(isAstra
                  ? {}
                  : { top_p: this.shared.numberCap(params.body.top_p, 1) }),
                stream_options: { include_usage: true },
                reasoning_effort: reasoningEffort,
                ...(isAstra ? { omit_sampling: true } : {}),
              },
            );

            stream$.subscribe({
              next: (chunk) => {
                subscriber.next({
                  data: {
                    ...(chunk.raw as object),
                    fullContent: chunk.fullContent,
                    complete: chunk.complete,
                  },
                });
              },
              error: async (error) => {
                void billing.refundBalance(
                  params.userId,
                  estimatedCost,
                  'OpenAI MT stream error',
                );
                subscriber.error(error);
              },
              complete: () => {
                subscriber.next({ data: { fullContent: '', complete: true } });
                subscriber.complete();
              },
            });
            return;
          }

          const result = await this.openAi.chatSync(
            messages,
            params.body.model,
            {
              ...(isAstra ? {} : { temperature }),
              max_tokens: this.getMaxCompletionTokens(
                params.body.model,
                params.body.max_tokens,
                2048,
              ),
              ...(isAstra
                ? {}
                : { top_p: this.shared.numberCap(params.body.top_p, 1) }),
              signal: params.signal,
              reasoning_effort: reasoningEffort,
              ...(isAstra ? { omit_sampling: true } : {}),
            },
          );

          params.validateOutput?.(result.content ?? '');
          if (!result.content) {
            throw new BadRequestException({
              message: errorCodes.INCOMPLETE_RESPONSE.message,
              code: errorCodes.INCOMPLETE_RESPONSE.code,
            });
          }

          subscriber.next({
            data: JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: result.content,
                    finish_reason: 'stop',
                  },
                },
              ],
              usage: result.usage,
              model: modelData.name,
              provider: params.body.provider,
            }),
          });

          const cost = this.shared.calculateCost({
            usage: result.usage,
            rates: modelData.rates!,
            chargeType,
          });

          const diff = cost - estimatedCost;
          if (Math.abs(diff) > 0.0000001) {
            if (diff > 0) {
              await billing.deductBalance(params.userId, diff);
            } else {
              await billing.refundBalance(
                params.userId,
                Math.abs(diff),
                'OpenAI MT cost adjustment',
              );
            }
          }

          if (params.signal?.aborted) {
            await billing.refundBalance(
              params.userId,
              cost,
              'OpenAI MT abandoned attempt',
            );
            subscriber.complete();
            return;
          }

          await billing.recordDevRequest({
            body: {
              ...params.body,
              input_text: params.body.text,
              output_text: result.content,
              source_lang: params.body.source_lang,
              target_lang: params.body.target_lang,
            },
            type: developer_request_type.machine_translation,
            usage: result.usage,
            rates: modelData.rates!,
            userId: params.userId,
            apiKeyId: params.apiKeyId,
            chargeType,
            actualCost: cost,
          });
          subscriber.complete();
        } catch (error) {
          await billing.refundBalance(
            params.userId,
            estimatedCost,
            'OpenAI MT API call failed',
          );
          try {
            this.shared.handleError(error);
          } catch (e) {
            subscriber.error(e);
          }
        }
      })();
    });
  }

  async generateTts(params: GenerateTtsParams) {
    const modelData = await this.shared.getModelInfo({
      provider: params.body.provider,
      model: params.body.model,
      type: 'TTS',
    });

    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    if (!modelData.rates) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    const language = params.body?.language?.toLowerCase() || 'english';
    const voice =
      params.body?.voice || modelData.voices?.[language]?.[0] || 'alloy';
    const voicesForLanguage = modelData.voices?.[language] || [];
    const supportedVoice = voicesForLanguage.find(
      (v: string) => v.toLowerCase() === voice.toLowerCase(),
    );

    if (!supportedVoice) {
      const supportedLanguages = modelData.voices
        ? Object.keys(modelData.voices)
        : [];
      throw new BadRequestException({
        message: `${errorCodes.INVALID_VOICE.message} Supported languages: ${supportedLanguages.join(', ')}. Supported voices for "${language}": ${voicesForLanguage.join(', ')}`,
        code: errorCodes.INVALID_VOICE.code,
      });
    }

    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const { estimatedCost, characterCount } = this.shared.estimateTtsCost(
      params.body.text,
      modelData.rates,
      chargeType,
    );

    params.signal?.throwIfAborted();
    await this.shared.deductBalance(params.userId, estimatedCost);

    let deducted = estimatedCost;
    try {
      const result = await this.openAi.ttsRequest(
        params.body.text,
        voice,
        params.body.model,
        modelData.base_apiURL,
        params.signal,
      );

      params.signal?.throwIfAborted();
      const usage =
        chargeType === 'character_count'
          ? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          : result.usage;
      if (!usage)
        throw new BadGatewayException('OpenAI speech usage is missing');
      const actualCost = this.shared.calculateCost({
        usage,
        rates: modelData.rates,
        chargeType,
        additionalData: { characterCount },
      });
      const difference = new Prisma.Decimal(actualCost).minus(estimatedCost);
      if (difference.gt(0))
        await this.shared.deductBalance(params.userId, difference.toNumber());
      else if (difference.lt(0))
        await this.shared.refundBalance(
          params.userId,
          difference.negated().toNumber(),
          'OpenAI TTS cost adjustment',
        );
      deducted = actualCost;
      params.signal?.throwIfAborted();
      await this.shared.recordDevRequest({
        body: { ...params.body, billing_usage: usage },
        type: developer_request_type.text_to_speech,
        usage,
        rates: modelData.rates!,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        chargeType,
        actualCost,
        characterCount,
      });

      return {
        response: {
          audio_b64: result.audio_b64,
          audio_type: result.audio_type,
          sample_rate: null,
        },
        usage,
        model: modelData.name,
        voice,
        provider: params.body.provider,
      };
    } catch (error) {
      await this.shared.refundBalance(
        params.userId,
        deducted,
        'OpenAI TTS API call failed',
      );

      if (isAxiosError(error)) {
        Debug.error(
          'TTS request failed',
          error.response?.status,
          error.response?.data,
        );
      } else {
        Debug.error('TTS request failed', error);
      }
      throw this.shared.handleError(error);
    }
  }

  async speechToText(params: {
    body: DeveloperSpeechToTextDto;
    type: developerReqType;
    userId: string;
    apiKeyId: string;
    signal?: AbortSignal;
  }) {
    const modelData = await this.shared.getModelInfo({
      provider: params.body.provider,
      model: params.body.model,
      type: 'ASR',
    });

    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const { base64, mimeType } = await this.shared.decodeAudio({
      audio: params.body.audio,
      audioType: params.body.audio_type,
    });

    if (!mimeType?.startsWith('audio')) {
      throw new BadRequestException({
        message: errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }

    const audioBuffer = Buffer.from(base64, 'base64');
    let estimatedAudioDurationSeconds: number | undefined;
    try {
      estimatedAudioDurationSeconds = await this.shared.getAudioDurationSeconds(
        audioBuffer,
        mimeType,
      );
    } catch (error) {
      if (chargeType === 'audio_minutes') throw error;
    }
    const rates = modelData.rates;
    if (!rates) throw new BadGatewayException('Model rates unavailable');
    const estimatedTokens = Math.max(
      500,
      estimatedAudioDurationSeconds
        ? Math.ceil(estimatedAudioDurationSeconds * 50)
        : 0,
    );
    const estimatedUsage = {
      prompt_tokens: estimatedTokens,
      completion_tokens: estimatedTokens,
      total_tokens: estimatedTokens * 2,
      ...(rates.audioInput !== undefined
        ? { input_text_tokens: 0, input_audio_tokens: estimatedTokens }
        : {}),
    };
    const estimatedCost = this.shared.calculateCost({
      usage: estimatedUsage,
      rates,
      chargeType,
      additionalData:
        chargeType === 'audio_minutes'
          ? { audioDurationSeconds: estimatedAudioDurationSeconds }
          : undefined,
    });

    params.signal?.throwIfAborted();
    await this.shared.deductBalance(params.userId, estimatedCost);

    let deducted = estimatedCost;
    try {
      const result = await this.openAi.asrRequest(
        audioBuffer,
        mimeType,
        params.body.model,
        modelData.base_apiURL,
        this.shared.clampTemperature(params.body.temperature, 1),
        params.signal,
      );

      const { text: transcript, usage } = result;
      params.signal?.throwIfAborted();
      if (!transcript) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      const actualAudioDurationSeconds = usage.billable_seconds;
      const actualCost = this.shared.calculateCost({
        usage,
        rates,
        chargeType,
        additionalData:
          chargeType === 'audio_minutes'
            ? { audioDurationSeconds: actualAudioDurationSeconds }
            : undefined,
      });

      const difference = new Prisma.Decimal(actualCost).minus(estimatedCost);
      if (difference.gt(0))
        await this.shared.deductBalance(params.userId, difference.toNumber());
      else if (difference.lt(0))
        await this.shared.refundBalance(
          params.userId,
          difference.negated().toNumber(),
          'OpenAI ASR cost adjustment',
        );
      deducted = actualCost;
      params.signal?.throwIfAborted();

      await this.shared.recordDevRequest({
        body: { ...params.body, billing_usage: usage },
        type: developer_request_type.speech_to_text,
        usage,
        rates,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        chargeType,
        audioDurationSeconds:
          chargeType === 'audio_minutes'
            ? actualAudioDurationSeconds
            : undefined,
        actualCost,
      });

      return {
        response: { text: transcript },
        usage,
        model: modelData.name,
        provider: params.body.provider,
      };
    } catch (error) {
      await this.shared.refundBalance(
        params.userId,
        deducted,
        'OpenAI ASR API call failed',
      );
      console.log(isAxiosError(error) && error.response?.data);
      throw this.shared.handleError(error);
    }
  }
}
