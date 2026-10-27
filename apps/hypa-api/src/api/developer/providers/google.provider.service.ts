import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import errorCodes from '@hypa/config/json/error-codes';
import { isVertexGoogleModel } from '@hypa/config/google-models';
import { parseBuffer } from 'music-metadata';
import { AiUsage, ChatSyncResult, StreamChunk } from 'src/ai/ai.types';
import {
  VERTEX_SUPPORTED_AUDIO_MIME_TYPES,
  GoogleAiService,
  GoogleVertexAiService,
} from 'src/ai/google.ai.service';
import { getMtMessages } from 'src/ai/prompts/mt.prompts';
import { developer_request_type } from 'src/generated/prisma/enums';
import {
  ChargeType,
  DeveloperMtDto,
  DeveloperSpeechToTextDto,
  DeveloperTtsDto,
} from '../developer.dto';
import { DeveloperSharedService } from './shared.service';
import type { TranslationBilling } from './translation-billing';
import { Debug } from 'src/utils/debug';

interface TranslateTextParams {
  billing?: TranslationBilling;
  validateOutput?: (text: string) => void;
  body: DeveloperMtDto;
  type: 'MT';
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
}

interface SpeechToTextParams {
  body: DeveloperSpeechToTextDto;
  type: 'ASR';
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
}

interface GenerateTtsParams {
  body: DeveloperTtsDto;
  type: 'TTS';
  userId: string;
  apiKeyId: string;
  signal?: AbortSignal;
}

interface GoogleDeveloperEvent {
  data: string | Record<string, unknown>;
}

interface ModelRates {
  input: number;
  output: number;
  audioInput?: number;
  audioOutput?: number;
}

type GenerationMessages = Parameters<GoogleVertexAiService['chatStream']>[0];

interface GenerateParams {
  kind: 'Chat' | 'MT';
  userId: string;
  provider: unknown;
  modelName: string;
  streamRequest: () => Promise<AsyncIterable<StreamChunk>>;
  syncRequest: () => Promise<ChatSyncResult>;
  stream?: boolean;
  estimatedCost: number;
  billing?: TranslationBilling;
  validateOutput?: (text: string) => void;
  settle: (usage: AiUsage, output: string, label: string) => Promise<void>;
}

const COST_ADJUSTMENT_EPSILON = 0.0000001;

const VERTEX_MAX_INLINE_AUDIO_BYTES = 7 * 1024 * 1024;
const VERTEX_ASR_RESERVED_OUTPUT_TOKENS = 500;
const VERTEX_TRANSCRIBE_AUDIO_TOKENS_PER_SECOND = 25;
const VERTEX_TRANSCRIBE_TEXT_TOKENS_PER_MINUTE = 175;
const VERTEX_AUDIO_TOKENS_PER_SECOND = 32;
const VERTEX_TTS_MAX_INPUT_BYTES = 8000;
const VERTEX_TTS_MAX_OUTPUT_TOKENS = 16384;
const VERTEX_DEFAULT_TTS_VOICE = 'Kore';
const VERTEX_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

function isVertexTranscribeModel(modelName: string): boolean {
  return modelName === VERTEX_TRANSCRIBE_MODEL;
}

function assertVertexGoogleAudioModel(type: 'ASR' | 'TTS', model: string) {
  if (!isVertexGoogleModel(type, model)) {
    throw new BadRequestException({
      message: `Google ${type} model must be Vertex-hosted`,
      code: errorCodes.INVALID_PROVIDER.code,
    });
  }
}

async function getAudioDurationSeconds(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<number | undefined> {
  try {
    const metadata = await parseBuffer(audioBuffer, { mimeType });
    const duration = metadata.format.duration;
    return typeof duration === 'number' &&
      Number.isFinite(duration) &&
      duration > 0
      ? duration
      : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class GoogleDeveloperService {
  constructor(
    private readonly shared: DeveloperSharedService,
    private readonly googleAi: GoogleAiService,
    private readonly vertexAi: GoogleVertexAiService,
  ) {}

  private sendError(
    subscriber: Subscriber<GoogleDeveloperEvent>,
    error: unknown,
  ) {
    try {
      this.shared.handleError(error);
    } catch (handledError) {
      subscriber.error(handledError);
    }
  }

  private async getBillableModel(
    args: Parameters<DeveloperSharedService['getModelInfo']>[0],
  ) {
    const modelData = await this.shared.getModelInfo(args);

    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    const rates = modelData.rates;
    const hasPositiveRate = Object.values(rates ?? {}).some(
      (rate) => typeof rate === 'number' && Number.isFinite(rate) && rate > 0,
    );
    const hasPositiveInputRate = [rates?.input, rates?.audioInput].some(
      (rate) => typeof rate === 'number' && Number.isFinite(rate) && rate > 0,
    );
    const hasPositiveOutputRate = [rates?.output, rates?.audioOutput].some(
      (rate) => typeof rate === 'number' && Number.isFinite(rate) && rate > 0,
    );
    const hasCompleteTokenRates = hasPositiveInputRate && hasPositiveOutputRate;

    if (
      !rates ||
      ((modelData.charge_type ?? 'tokens') === 'tokens'
        ? !hasCompleteTokenRates
        : !hasPositiveRate)
    ) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    return { modelData, rates: rates as ModelRates };
  }

  private async settleCost(params: {
    userId: string;
    usage: AiUsage;
    rates: ModelRates;
    chargeType: ChargeType;
    estimatedCost: number;
    label: string;
    billing?: TranslationBilling;
  }) {
    const billing = params.billing ?? this.shared;
    const actualCost = this.shared.calculateCost({
      usage: params.usage,
      rates: params.rates,
      chargeType: params.chargeType,
    });
    const difference = actualCost - params.estimatedCost;

    if (Math.abs(difference) > COST_ADJUSTMENT_EPSILON) {
      if (difference > 0) {
        await billing.deductBalance(params.userId, difference);
      } else {
        await billing.refundBalance(
          params.userId,
          Math.abs(difference),
          `${params.label} cost adjustment`,
        );
      }
    }

    return actualCost;
  }

  private buildRequests(args: {
    isVertex: boolean;
    messages: GenerationMessages;
    modelName: string;
    apiUrl: string;
    thinking: boolean;
    signal?: AbortSignal;
    body: {
      max_tokens?: number;
      temperature?: number;
      top_k?: number;
      top_p?: number;
    };
    kind: 'Chat' | 'MT';
    maxTokens: number;
  }): Pick<GenerateParams, 'streamRequest' | 'syncRequest'> {
    if (args.isVertex) {
      const options = {
        max_tokens: args.maxTokens,
        thinking: args.thinking,
        signal: args.signal,
      };
      const client = this.vertexAi;
      return {
        streamRequest: () =>
          client.chatStream(
            args.messages,
            args.modelName,
            args.apiUrl,
            options,
          ),
        syncRequest: () =>
          client.chatSync(args.messages, args.modelName, args.apiUrl, options),
      };
    }

    const options = {
      temperature:
        args.kind === 'MT'
          ? this.shared.clampTemperature(args.body.temperature, 1, 1)
          : this.shared.numberCap(args.body.temperature ?? 0, 1, 1),
      max_tokens: args.maxTokens,
      top_k:
        args.kind === 'MT'
          ? this.shared.clampTemperature(args.body.top_k, 64, 64)
          : this.shared.numberCap(args.body.top_k ?? 0, 64, 64),
      top_p:
        args.kind === 'MT'
          ? this.shared.clampTemperature(args.body.top_p, 1, 0.95)
          : this.shared.numberCap(args.body.top_p ?? 0, 1, 0.95),
      thinking: args.thinking,
      signal: args.signal,
    };
    const client = this.googleAi;
    return {
      streamRequest: () =>
        client.chatStream(args.messages, args.modelName, args.apiUrl, options),
      syncRequest: () =>
        client.chatSync(args.messages, args.modelName, args.apiUrl, options),
    };
  }

  private generate(params: GenerateParams): Observable<GoogleDeveloperEvent> {
    const billing = params.billing ?? this.shared;
    const capability = params.kind === 'Chat' ? 'AC' : 'MT';
    const label = `${isVertexGoogleModel(capability, params.modelName) ? 'Gemini' : 'Google'} ${params.kind}`;

    return new Observable<GoogleDeveloperEvent>((subscriber) => {
      void (async () => {
        if (params.stream) {
          let fullContent = '';
          let usage: AiUsage | undefined;

          try {
            const stream = await params.streamRequest();

            for await (const chunk of stream) {
              fullContent = chunk.fullContent;
              usage = chunk.usage ?? usage;

              if (chunk.complete) continue;

              subscriber.next({
                data: {
                  ...(chunk.raw as object),
                  fullContent: chunk.fullContent,
                  complete: false,
                },
              });
            }

            if (!usage) {
              throw new BadGatewayException(
                `${label} stream usage unavailable`,
              );
            }

            params.validateOutput?.(fullContent);
          } catch (error) {
            await billing.refundBalance(
              params.userId,
              params.estimatedCost,
              `${label} stream error`,
            );
            this.sendError(subscriber, error);
            return;
          }

          try {
            await params.settle(usage, fullContent, label);
            subscriber.next({ data: { fullContent: '', complete: true } });
            subscriber.complete();
          } catch (error) {
            this.sendError(subscriber, error);
          }
          return;
        }

        let result;
        try {
          result = await params.syncRequest();

          params.validateOutput?.(result.content ?? '');
          if (
            params.kind === 'MT' ? !result.content?.trim() : !result.content
          ) {
            throw new BadRequestException({
              message: errorCodes.INCOMPLETE_RESPONSE.message,
              code: errorCodes.INCOMPLETE_RESPONSE.code,
            });
          }
        } catch (error) {
          await billing.refundBalance(
            params.userId,
            params.estimatedCost,
            `${label} API call failed`,
          );
          this.sendError(subscriber, error);
          return;
        }

        subscriber.next({
          data: JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: result.content,
                },
                finish_reason: result.finishReason ?? 'stop',
              },
            ],
            usage: result.usage,
            model: params.modelName,
            provider: params.provider,
          }),
        });

        try {
          await params.settle(result.usage, result.content, label);
          subscriber.complete();
        } catch (error) {
          this.sendError(subscriber, error);
        }
      })();
    });
  }

  async translateText(params: TranslateTextParams) {
    const billing = params.billing ?? this.shared;
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

    const { modelData, rates } = await this.getBillableModel({
      provider: params.body.provider,
      model: params.body.model,
      type: params.type,
    });

    const supportedLanguage = modelData.languages?.some(
      (language: string) => language.toLowerCase() === targetLang.toLowerCase(),
    );
    if (!supportedLanguage) {
      const languagesList = modelData.languages || [];
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Supported languages: ${languagesList.join(', ')}`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }

    const modelName = String(modelData.name);
    const apiUrl = String(modelData.base_apiURL);
    const isVertex = isVertexGoogleModel('MT', modelName);
    const messages = getMtMessages({
      provider: 'google',
      text: params.body.text,
      sourceLang: params.body.source_lang,
      targetLang,
      model: params.body.model,
    });
    const promptText = messages.map((message) => message.content).join(' ');
    const promptTokens = this.shared.getTextNumberOfTokens(promptText);
    const sourceTokens = this.shared.getTextNumberOfTokens(params.body.text);
    const maxTokens = this.shared.numberCap(
      params.body.max_tokens ?? 0,
      isVertex ? 65536 : 2048,
      1000,
    );
    const completionTokens = isVertex
      ? maxTokens
      : Math.ceil(sourceTokens * 1.2);
    const estimatedUsage: AiUsage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const estimatedCost = this.shared.calculateCost({
      usage: estimatedUsage,
      rates,
      chargeType,
    });

    params.signal?.throwIfAborted();
    await this.shared.checkBalance(params.userId, estimatedCost);
    await billing.deductBalance(params.userId, estimatedCost);

    const requests = this.buildRequests({
      isVertex,
      messages,
      modelName,
      apiUrl,
      thinking: Boolean(params.body.thinking),
      signal: params.signal,
      body: params.body,
      kind: 'MT',
      maxTokens,
    });

    return this.generate({
      kind: 'MT',
      userId: params.userId,
      provider: params.body.provider,
      modelName,
      ...requests,
      stream: params.body.stream,
      estimatedCost,
      billing,
      validateOutput: params.validateOutput,
      settle: async (usage, output, label) => {
        const actualCost = await this.settleCost({
          userId: params.userId,
          usage,
          rates,
          chargeType,
          estimatedCost,
          label,
          billing,
        });

        if (params.signal?.aborted) {
          await billing.refundBalance(
            params.userId,
            actualCost,
            `${label} abandoned attempt`,
          );
          return;
        }

        await billing.recordDevRequest({
          body: {
            ...params.body,
            input_text: params.body.text,
            output_text: output,
            source_lang: params.body.source_lang,
            target_lang: params.body.target_lang,
          },
          type: developer_request_type.machine_translation,
          usage,
          rates,
          userId: params.userId,
          apiKeyId: params.apiKeyId,
          chargeType,
          actualCost,
        });
      },
    });
  }

  async speechToText(params: SpeechToTextParams) {
    assertVertexGoogleAudioModel('ASR', params.body.model);
    const { modelData, rates } = await this.getBillableModel({
      provider: params.body.provider,
      model: params.body.model,
      type: params.type,
    });

    const { base64, mimeType } = await this.shared.decodeAudio({
      audio: params.body.audio,
      audioType: params.body.audio_type,
      mimeType: params.body.mime_type,
    });
    const normalizedMimeType = mimeType?.split(';')[0]?.trim().toLowerCase();

    if (
      !normalizedMimeType ||
      !VERTEX_SUPPORTED_AUDIO_MIME_TYPES.has(normalizedMimeType)
    ) {
      throw new BadRequestException({
        message: errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }

    const audioBuffer = Buffer.from(base64, 'base64');
    if (
      audioBuffer.length === 0 ||
      audioBuffer.length > VERTEX_MAX_INLINE_AUDIO_BYTES
    ) {
      throw new BadRequestException({
        message:
          audioBuffer.length > VERTEX_MAX_INLINE_AUDIO_BYTES
            ? 'Vertex ASR audio must not exceed 7 MiB'
            : errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }

    const modelName = String(modelData.name);
    const apiUrl = String(modelData.base_apiURL);
    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const systemInstruction = params.body.system_instruction;

    params.signal?.throwIfAborted();
    const isSpecializedTranscribe = isVertexTranscribeModel(modelName);
    const countedInputTokens = isSpecializedTranscribe
      ? undefined
      : await this.vertexAi.countAudioTokens(
          base64,
          normalizedMimeType,
          modelName,
          apiUrl,
          params.signal,
          systemInstruction,
        );
    const audioDurationSeconds = await getAudioDurationSeconds(
      audioBuffer,
      normalizedMimeType,
    );
    const fallbackAudioTokens = audioDurationSeconds
      ? Math.ceil(
          audioDurationSeconds *
            (isSpecializedTranscribe
              ? VERTEX_TRANSCRIBE_AUDIO_TOKENS_PER_SECOND
              : VERTEX_AUDIO_TOKENS_PER_SECOND),
        )
      : Math.max(
          500,
          Math.ceil(
            (audioBuffer.length / 16000) *
              (isSpecializedTranscribe
                ? VERTEX_TRANSCRIBE_AUDIO_TOKENS_PER_SECOND
                : VERTEX_AUDIO_TOKENS_PER_SECOND),
          ),
        );
    if (countedInputTokens === undefined && !isSpecializedTranscribe) {
      Debug.warn({
        message: 'Using documented Gemini audio token estimate for billing',
        model: modelName,
        estimateTokens: fallbackAudioTokens,
        tokensPerSecond: VERTEX_AUDIO_TOKENS_PER_SECOND,
        reason: 'count_tokens_unavailable',
      });
    }
    const estimatedInputTokens = Math.max(
      1,
      countedInputTokens ?? fallbackAudioTokens,
    );
    const estimatedOutputTokens = isSpecializedTranscribe
      ? Math.max(
          1,
          audioDurationSeconds
            ? Math.ceil(
                (audioDurationSeconds / 60) *
                  VERTEX_TRANSCRIBE_TEXT_TOKENS_PER_MINUTE,
              )
            : VERTEX_ASR_RESERVED_OUTPUT_TOKENS,
        )
      : VERTEX_ASR_RESERVED_OUTPUT_TOKENS;
    const estimatedUsage: AiUsage = {
      prompt_tokens: estimatedInputTokens,
      completion_tokens: estimatedOutputTokens,
      total_tokens: estimatedInputTokens + estimatedOutputTokens,
    };
    const estimatedCost = this.shared.calculateCost({
      usage: estimatedUsage,
      rates,
      chargeType,
    });

    await this.shared.deductBalance(params.userId, estimatedCost);
    let reservationOutstanding = true;
    let providerResponseValid = false;

    try {
      const result = isSpecializedTranscribe
        ? await this.vertexAi.transcribeSync(
            base64,
            normalizedMimeType,
            modelName,
            apiUrl,
            params.signal,
          )
        : await this.vertexAi.speechToTextSync(
            base64,
            normalizedMimeType,
            modelName,
            apiUrl,
            {
              max_tokens: this.shared.numberCap(
                params.body.max_tokens,
                65536,
                1000,
              ),
              system_instruction: systemInstruction,
              signal: params.signal,
            },
          );

      if (result.finishReason && result.finishReason !== 'STOP') {
        throw new BadGatewayException(
          `Vertex ASR ended with finish reason ${result.finishReason}`,
        );
      }

      if (!result.text.trim()) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      providerResponseValid = true;

      const actualCost = await this.settleCost({
        userId: params.userId,
        usage: result.usage,
        rates,
        chargeType,
        estimatedCost,
        label: 'Gemini ASR',
      });
      reservationOutstanding = false;

      await this.shared.recordDevRequest({
        body: {
          ...params.body,
          output_text: result.text,
        },
        type: developer_request_type.speech_to_text,
        usage: result.usage,
        rates,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        chargeType,
        actualCost,
      });

      return {
        response: { text: result.text },
        usage: result.usage,
        model: modelName,
        provider: params.body.provider,
      };
    } catch (error) {
      if (reservationOutstanding && !providerResponseValid) {
        await this.shared.refundBalance(
          params.userId,
          estimatedCost,
          'Gemini ASR API call failed',
        );
      }
      this.shared.handleError(error);
    }
  }

  async generateTts(params: GenerateTtsParams) {
    assertVertexGoogleAudioModel('TTS', params.body.model);
    const { modelData, rates } = await this.getBillableModel({
      provider: params.body.provider,
      model: params.body.model,
      type: params.type,
    });

    const text = params.body.text?.trim();
    if (!text) {
      throw new BadRequestException({
        message: 'Text field is required',
        code: errorCodes.INVALID_REQUEST.code,
      });
    }

    const textByteLength = Buffer.byteLength(text, 'utf8');
    if (textByteLength > VERTEX_TTS_MAX_INPUT_BYTES) {
      throw new BadRequestException({
        message: `Vertex TTS text must not exceed ${VERTEX_TTS_MAX_INPUT_BYTES} UTF-8 bytes`,
        code: errorCodes.INVALID_REQUEST.code,
      });
    }

    const languages = modelData.languages ?? [];
    const requestedLanguage = params.body.language?.trim() || 'English';
    const languageIndex = languages.findIndex(
      (language) => language.toLowerCase() === requestedLanguage.toLowerCase(),
    );
    if (languageIndex < 0) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Supported languages: ${languages.join(', ')}`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }

    const language = languages[languageIndex];
    const languageKey = language.toLowerCase();
    const languageCode = modelData.languageCodes?.[languageIndex]?.trim();
    if (!languageCode) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Vertex TTS does not support the requested language "${language}".`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }

    const voicesForLanguage = modelData.voices?.[languageKey] ?? [];
    const requestedVoice =
      params.body.voice?.trim() || VERTEX_DEFAULT_TTS_VOICE;
    const voice = voicesForLanguage.find(
      (candidate) => candidate.toLowerCase() === requestedVoice.toLowerCase(),
    );
    if (!voice) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_VOICE.message} Supported voices for "${language}": ${voicesForLanguage.join(', ')}`,
        code: errorCodes.INVALID_VOICE.code,
      });
    }

    const inputTokens = this.shared.getTextNumberOfTokens(text);
    const estimatedUsage: AiUsage = {
      prompt_tokens: inputTokens,
      completion_tokens: VERTEX_TTS_MAX_OUTPUT_TOKENS,
      total_tokens: inputTokens + VERTEX_TTS_MAX_OUTPUT_TOKENS,
    };
    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const estimatedCost = this.shared.calculateCost({
      usage: estimatedUsage,
      rates,
      chargeType,
    });

    params.signal?.throwIfAborted();
    await this.shared.deductBalance(params.userId, estimatedCost);
    let reservationOutstanding = true;
    let providerResponseValid = false;

    try {
      const result = await this.vertexAi.textToSpeechSync(
        text,
        languageCode,
        voice,
        String(modelData.name),
        String(modelData.base_apiURL),
        params.signal,
      );

      if (result.finishReason && result.finishReason !== 'STOP') {
        throw new BadGatewayException(
          `Vertex TTS ended with finish reason ${result.finishReason}`,
        );
      }
      if (!result.audio_b64) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      providerResponseValid = true;

      const actualCost = await this.settleCost({
        userId: params.userId,
        usage: result.usage,
        rates,
        chargeType,
        estimatedCost,
        label: 'Gemini TTS',
      });
      reservationOutstanding = false;

      await this.shared.recordDevRequest({
        body: params.body,
        type: developer_request_type.text_to_speech,
        usage: result.usage,
        rates,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        chargeType,
        actualCost,
      });

      return {
        response: {
          audio_b64: result.audio_b64,
          audio_type: result.audio_type,
          sample_rate: result.sample_rate,
        },
        usage: result.usage,
        model: modelData.name,
        voice,
        language,
        provider: params.body.provider,
      };
    } catch (error) {
      if (reservationOutstanding && !providerResponseValid) {
        await this.shared.refundBalance(
          params.userId,
          estimatedCost,
          'Gemini TTS API call failed',
        );
      }
      this.shared.handleError(error);
    }
  }
}
