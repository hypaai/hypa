import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import errorCodes from '@hypa/config/json/error-codes';
import { modelHost } from '@hypa/config/model-hosts';
import { MetaAiService } from 'src/ai/meta.ai.service';
import { GoogleAiService } from 'src/ai/google.ai.service';
import {
  AudioLimitError,
  convertAudioToPcmWav,
  pcm16DurationSeconds,
} from 'src/ai/pcm-wav';
import { AiUsage } from 'src/ai/ai.types';
import { developer_request_type } from 'src/generated/prisma/enums';
import {
  ChargeType,
  DeveloperMtDto,
  DeveloperSpeechToTextDto,
  developerReqType,
} from '../developer.dto';
import { DeveloperSharedService } from './shared.service';
import { HypaAiDeveloperService } from './hypaai.provider.service';
import { getMtMessages } from 'src/ai/prompts/mt.prompts';

interface TranslateTextParams {
  validateOutput?: (text: string) => void;
  body: DeveloperMtDto;
  type: 'MT';
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
}

interface MetaDeveloperEvent {
  data: string | Record<string, unknown>;
}

@Injectable()
export class MetaDeveloperService {
  constructor(
    private readonly shared: DeveloperSharedService,
    private readonly metaAi: MetaAiService,
    private readonly hf: GoogleAiService,
    private readonly hypaAi: HypaAiDeveloperService,
  ) {}

  private sendError(
    subscriber: Subscriber<MetaDeveloperEvent>,
    error: unknown,
  ) {
    try {
      this.shared.handleError(error);
    } catch (handledError) {
      subscriber.error(handledError);
    }
  }

  private async reconcile(params: {
    userId: string;
    estimatedCost: number;
    actualCost: number;
    reason: string;
    signal?: AbortSignal;
    record: () => Promise<void>;
  }) {
    const difference = params.actualCost - params.estimatedCost;
    if (Math.abs(difference) > 0.0000001) {
      if (difference > 0)
        await this.shared.deductBalance(params.userId, difference);
      else
        await this.shared.refundBalance(
          params.userId,
          Math.abs(difference),
          params.reason,
        );
    }
    if (params.signal?.aborted) {
      await this.shared.refundBalance(
        params.userId,
        params.actualCost,
        params.reason,
      );
      return;
    }
    await params.record();
  }

  private chatClient(type: string, model: string) {
    const host = modelHost(type, 'meta', model);
    if (host === 'meta-api') return this.metaAi;
    if (host === 'hf-router') return this.hf;
    throw new BadRequestException({
      message: errorCodes.INVALID_PROVIDER.message,
      code: errorCodes.INVALID_PROVIDER.code,
    });
  }

  async translateText(params: TranslateTextParams) {
    if (!params.body.text?.trim()) {
      throw new BadRequestException({
        message: 'Text field is required',
        code: errorCodes.INVALID_REQUEST.code,
      });
    }
    const targetLang = params.body.target_lang?.trim();
    if (!targetLang) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Target language is required`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }
    const modelData = await this.shared.getModelInfo({
      provider: params.body.provider,
      model: params.body.model,
      type: 'MT',
    });
    if (!modelData?.rates?.input || !modelData.rates?.output) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }
    const supported = modelData.languages?.some(
      (language: string) => language.toLowerCase() === targetLang.toLowerCase(),
    );
    if (!supported) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Supported languages: ${(modelData.languages || []).join(', ')}`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }
    const client = this.chatClient('MT', String(modelData.name));
    const messages = getMtMessages({
      provider: 'meta',
      text: params.body.text,
      sourceLang: params.body.source_lang,
      targetLang,
      model: params.body.model,
    });
    const promptTokens = this.shared.getTextNumberOfTokens(
      messages.map((message) => message.content).join(' '),
    );
    const completionTokens = Math.ceil(
      this.shared.getTextNumberOfTokens(params.body.text) * 1.2,
    );
    const estimatedUsage: AiUsage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const rates = modelData.rates;
    const estimatedCost = this.shared.calculateCost({
      usage: estimatedUsage,
      rates,
      chargeType,
    });
    params.signal?.throwIfAborted();
    await this.shared.deductBalance(params.userId, estimatedCost);
    const options = {
      temperature: this.shared.clampTemperature(params.body.temperature, 1, 1),
      max_tokens: this.shared.numberCap(params.body.max_tokens, 2048, 1000),
      top_p: this.shared.clampTemperature(params.body.top_p, 1, 0.95),
      thinking: Boolean(params.body.thinking),
      signal: params.signal,
    };
    const modelName = String(modelData.name);
    const apiUrl = String(modelData.base_apiURL);

    return new Observable<MetaDeveloperEvent>((subscriber) => {
      void (async () => {
        let reconciling = false;
        try {
          const result = await client.chatSync(
            messages,
            modelName,
            apiUrl,
            options,
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
                  message: { role: 'assistant', content: result.content },
                  finish_reason: result.finishReason ?? 'stop',
                },
              ],
              usage: result.usage,
              model: modelName,
              provider: 'meta',
            }),
          });
          const actualCost = this.shared.calculateCost({
            usage: result.usage,
            rates,
            chargeType,
          });
          reconciling = true;
          await this.reconcile({
            userId: params.userId,
            estimatedCost,
            actualCost,
            reason: 'Meta MT cost adjustment',
            signal: params.signal,
            record: () =>
              this.shared.recordDevRequest({
                body: {
                  ...params.body,
                  input_text: params.body.text,
                  output_text: result.content,
                  source_lang: params.body.source_lang,
                  target_lang: targetLang,
                },
                type: developer_request_type.machine_translation,
                usage: result.usage,
                rates,
                userId: params.userId,
                apiKeyId: params.apiKeyId,
                chargeType,
                actualCost,
              }),
          });
          subscriber.complete();
        } catch (error) {
          if (!reconciling)
            await this.shared.refundBalance(
              params.userId,
              estimatedCost,
              'Meta MT API call failed',
            );
          this.sendError(subscriber, error);
        }
      })();
    });
  }

  async transcribe(params: {
    body: DeveloperSpeechToTextDto;
    type: developerReqType;
    userId: string;
    apiKeyId: string;
    signal?: AbortSignal;
  }) {
    const host = modelHost('ASR', 'meta', params.body.model);
    if (host === 'runpod') return this.hypaAi.speechToText(params);
    if (host !== 'meta-api') {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }
    const modelData = await this.shared.getModelInfo({
      provider: 'meta',
      model: params.body.model,
      type: 'ASR',
    });
    if (!modelData?.rates?.input) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }
    const { base64 } = await this.shared.decodeAudio({
      audio: params.body.audio,
      audioType: params.body.audio_type,
      mimeType: params.body.mime_type,
    });
    const audio = Buffer.from(base64, 'base64');
    let wav: Buffer;
    try {
      wav = await convertAudioToPcmWav(audio);
    } catch (error) {
      if (error instanceof AudioLimitError) {
        throw new BadRequestException({
          message: error.message,
          code: errorCodes.INVALID_REQUEST.code,
        });
      }
      throw error;
    }
    const durationSeconds = Math.max(1, Math.ceil(pcm16DurationSeconds(wav)));
    params.signal?.throwIfAborted();
    const usage = {
      prompt_tokens: durationSeconds,
      completion_tokens: 0,
      total_tokens: durationSeconds,
    };
    const actualCost = this.shared.calculateCost({
      usage,
      rates: modelData.rates,
      chargeType: 'audio_minutes',
      additionalData: { audioDurationSeconds: durationSeconds },
    });
    await this.shared.checkBalance(params.userId, actualCost);
    await this.shared.deductBalance(params.userId, actualCost);
    let result: { transcript: string; audioDurationMs: number };
    try {
      result = await this.metaAi.transcribeWav(wav, params.signal);
    } catch (error) {
      await this.shared.refundBalance(
        params.userId,
        actualCost,
        'Meta ASR API call failed',
      );
      throw error;
    }
    const billedSeconds =
      result.audioDurationMs > 0
        ? Math.max(1, Math.ceil(result.audioDurationMs / 1000))
        : durationSeconds;
    usage.prompt_tokens = billedSeconds;
    usage.total_tokens = billedSeconds;
    const billedCost = this.shared.calculateCost({
      usage,
      rates: modelData.rates,
      chargeType: 'audio_minutes',
      additionalData: { audioDurationSeconds: billedSeconds },
    });
    if (!result.transcript) {
      await this.shared.refundBalance(
        params.userId,
        actualCost,
        'Meta ASR empty transcript',
      );
      throw new BadRequestException({
        message: errorCodes.INCOMPLETE_RESPONSE.message,
        code: errorCodes.INCOMPLETE_RESPONSE.code,
      });
    }
    const difference = billedCost - actualCost;
    if (difference > 0.0000001)
      await this.shared.deductBalance(params.userId, difference);
    else if (difference < -0.0000001) {
      await this.shared.refundBalance(
        params.userId,
        Math.abs(difference),
        'Meta ASR cost adjustment',
      );
    }
    await this.shared.recordDevRequest({
      body: params.body,
      type: developer_request_type.speech_to_text,
      usage,
      rates: modelData.rates,
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      chargeType: 'audio_minutes',
      audioDurationSeconds: billedSeconds,
      actualCost: billedCost,
    });
    return {
      response: { text: result.transcript },
      usage,
      model: modelData.name,
      provider: 'meta',
    };
  }
}
