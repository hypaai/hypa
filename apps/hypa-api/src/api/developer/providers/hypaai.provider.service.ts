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
} from '../developer.dto';
import { DeveloperSharedService } from './shared.service';
import errorCodes from '@hypa/config/json/error-codes';
import { isStreamingModel } from '@hypa/config/models';
import { developer_request_type } from 'src/generated/prisma/enums';
import { Observable } from 'rxjs';
import { HypaAiAiService } from 'src/ai/hypaai.ai.service';
import { getMtMessages } from 'src/ai/prompts/mt.prompts';
import { assertUsableTranslation } from '../../translate/mt/translation-output';

interface TranslateTextParams {
  billing?: TranslationBilling;
  signal?: AbortSignal;
  validateOutput?: (text: string) => void;
  body: DeveloperMtDto;
  type: developerReqType;
  userId: string;
  apiKeyId: string;
}

const getTranslationContent = (content: string, includeThinking?: boolean) => {
  if (includeThinking) return content.trim();
  return (content.split('</think>').at(-1) ?? content).trim();
};

@Injectable()
export class HypaAiDeveloperService {
  constructor(
    readonly shared: DeveloperSharedService,
    private readonly hypaAi: HypaAiAiService,
  ) {}

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
    let deducted = estimatedCost;

    const messages = getMtMessages({
      provider: 'hypaai',
      text: params.body.text,
      thinking: Boolean(params.body.thinking),
      sourceLang: params.body.source_lang,
      targetLang: params.body.target_lang ?? 'auto',
      model: params.body.model,
    });

    return new Observable((subscriber) => {
      (async () => {
        try {
          if (params.body.stream) {
            const stream$ = this.hypaAi.chatStream(
              messages,
              modelData.base_apiURL,
              {
                ...this.shared.resolveHypaAiUpstream(modelData),
                signal: params.signal,
                temperature: this.shared.clampTemperature(
                  params.body.temperature,
                  2,
                ),
                max_tokens: this.shared.numberCap(
                  params.body.max_tokens,
                  2048,
                  1000,
                ),
                top_k: this.shared.numberCap(params.body.top_k, 50_000, 1),
                top_p: this.shared.numberCap(params.body.top_p, 1, 0.5),
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
                  'HypaAI MT stream error',
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

          const result = await this.hypaAi.chatSync(
            messages,
            modelData.base_apiURL,
            {
              ...this.shared.resolveHypaAiUpstream(modelData),
              signal: params.signal,
              temperature: this.shared.clampTemperature(
                params.body.temperature,
                2,
              ),
              max_tokens: this.shared.numberCap(
                params.body.max_tokens,
                2048,
                1000,
              ),
              top_k: this.shared.numberCap(params.body.top_k, 50_000, 1),
              top_p: this.shared.numberCap(params.body.top_p, 1, 0.5),
            },
          );

          if (!result.content) {
            throw new BadRequestException({
              message: errorCodes.INCOMPLETE_RESPONSE.message,
              code: errorCodes.INCOMPLETE_RESPONSE.code,
            });
          }

          params.signal?.throwIfAborted();
          const content = getTranslationContent(
            result.content,
            params.body.thinking,
          );
          (params.validateOutput ?? assertUsableTranslation)(content);

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
                'HypaAI MT cost adjustment',
              );
            }
          }
          deducted = cost;
          params.signal?.throwIfAborted();

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
          subscriber.next({
            data: JSON.stringify({
              choices: [
                {
                  message: { role: 'assistant', content },
                  finish_reason: 'stop',
                },
              ],
              usage: result.usage,
              model: modelData.name,
              provider: params.body.provider,
            }),
          });
          subscriber.complete();
        } catch (error) {
          await billing.refundBalance(
            params.userId,
            deducted,
            'HypaAI MT API call failed',
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

  async speechToText(params: {
    signal?: AbortSignal;
    body: DeveloperSpeechToTextDto;
    type: developerReqType;
    userId: string;
    apiKeyId: string;
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

    if (isStreamingModel({ baseApiUrl: modelData.base_apiURL })) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    const { base64, mimeType } = await this.shared.decodeAudio({
      audio: params.body.audio,
      audioType: params.body.audio_type,
      mimeType: params.body.mime_type,
    });

    if (!mimeType?.startsWith('audio')) {
      throw new BadRequestException({
        message: errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }

    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const actualAudioDurationSeconds =
      chargeType === 'audio_minutes'
        ? await this.shared.getAudioDurationSeconds(
            Buffer.from(base64, 'base64'),
            mimeType,
          )
        : undefined;
    const estimatedTokens = 500;
    const estimatedUsage = {
      prompt_tokens: estimatedTokens,
      completion_tokens: estimatedTokens,
      total_tokens: estimatedTokens * 2,
    };
    const rates = modelData.rates || { input: 0.00000015, output: 0.0000006 };
    const estimatedCost = this.shared.calculateCost({
      usage: estimatedUsage,
      rates,
      chargeType,
      additionalData:
        chargeType === 'audio_minutes'
          ? { audioDurationSeconds: actualAudioDurationSeconds }
          : undefined,
    });

    await this.shared.deductBalance(params.userId, estimatedCost);

    try {
      const upstream = this.shared.resolveHypaAiUpstream(modelData);
      const result = await this.hypaAi.asrRequest(
        base64,
        mimeType,
        String(modelData.base_apiURL),
        {
          temperature: this.shared.clampTemperature(params.body.temperature, 1),
          signal: params.signal,
          top_p: this.shared.numberCap(params.body.top_p, 0.5, 0.5),
          top_k: this.shared.numberCap(params.body.top_k, 1, 1),
          max_tokens: this.shared.numberCap(params.body.max_tokens, 400, 400),
          apiKey: upstream.apiKey,
          timeout: upstream.timeout,
        },
      );

      if (!result.transcript) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      const actualCost = this.shared.calculateCost({
        usage: result.usage,
        rates,
        chargeType,
        additionalData:
          chargeType === 'audio_minutes'
            ? { audioDurationSeconds: actualAudioDurationSeconds }
            : undefined,
      });

      const diff = actualCost - estimatedCost;
      if (Math.abs(diff) > 0.0000001) {
        if (diff > 0) {
          await this.shared.deductBalance(params.userId, diff);
        } else {
          await this.shared.refundBalance(
            params.userId,
            Math.abs(diff),
            'HypaAI ASR cost adjustment',
          );
        }
      }

      await this.shared.recordDevRequest({
        body: params.body,
        type: developer_request_type.speech_to_text,
        usage: result.usage,
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
        response: { text: result.transcript },
        usage: result.usage,
        model: modelData.name,
        provider: params.body.provider,
      };
    } catch (error) {
      await this.shared.refundBalance(
        params.userId,
        estimatedCost,
        'HypaAI ASR API call failed',
      );
      throw this.shared.handleError(error);
    }
  }
}
