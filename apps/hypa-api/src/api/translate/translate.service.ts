import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Prisma } from 'src/generated/prisma/client';
import {
  charge_type,
  developer_request_provider,
  developer_request_type,
} from 'src/generated/prisma/enums';
import { DbService } from 'src/libs/db/db.service';
import { DeveloperSharedService } from '../developer/providers/shared.service';
import {
  ChargeType,
  DeveloperMtDto,
  DeveloperMtThinkingDto,
  DeveloperSpeechToTextDto,
  DeveloperTtsDto,
  developerReqType,
} from '../developer/developer.dto';
import errorCodes from '@hypa/config/json/error-codes';
import type { AutoSummary } from '@hypa/config/auto-routing';
import {
  attachThinking,
  parseTranslation,
} from '@hypa/translate-core/thinking';
import {
  getMtMessages,
  getMtThinkingMessages,
  getNonHypaLanguageDetectionMessages,
} from 'src/ai/prompts/mt.prompts';
import { autoLanguage, canonicalLanguage } from './auto-router/auto-language';
import { HypaAiAiService } from 'src/ai/hypaai.ai.service';
import { OpenAiAiService } from 'src/ai/openai.ai.service';
import {
  GoogleAiService,
  GoogleVertexAiService,
} from 'src/ai/google.ai.service';
import { MansaAiService } from 'src/ai/mansa.ai.service';
import { MetaAiService } from 'src/ai/meta.ai.service';
import type { AiUsage, ChatMessage } from 'src/ai/ai.types';
import { isVertexGoogleModel } from '@hypa/config/google-models';
import { modelHost } from '@hypa/config/model-hosts';
import { MODELS_BY_CAPABILITY } from '@hypa/config/models';
import {
  ASTRA_MAX_COMPLETION_TOKENS,
  ASTRA_MIN_COMPLETION_TOKENS,
  isGpt6AstraModel,
} from 'src/ai/openai.model';
import { sanitizeForLog } from '../../utils/log-utils';

type MtModelData = NonNullable<
  ReturnType<DeveloperSharedService['getModelInfo']>
>;

interface TranslateTextParams {
  body: DeveloperMtDto;
  type: developerReqType;
  userId?: string;
  apiKeyId?: string;
  signal?: AbortSignal;
}

interface DirectTranslationResult {
  text: string;
  usage: AiUsage;
  detectedSourceLang?: string;
}

interface GenerateTranslationThinkingParams {
  body: DeveloperMtThinkingDto;
  type: developerReqType;
  userId?: string;
  apiKeyId?: string;
  signal?: AbortSignal;
}

interface GenerateTtsParams {
  body: DeveloperTtsDto;
  type: developerReqType;
  userId?: string;
  apiKeyId?: string;
}

interface SpeechToTextParams {
  body: DeveloperSpeechToTextDto;
  type: developerReqType;
  userId?: string;
  apiKeyId?: string;
}

interface RecordProductRequestParams {
  body: { model: string; provider: string } & Record<string, unknown>;
  type: developer_request_type;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  userId?: string;
  apiKeyId?: string;
  chargeType: ChargeType;
  actualCost: number;
  audioDurationSeconds?: number;
  characterCount?: number;
}

const OPENAI_TRANSLATE_TIMEOUT_MS = 120_000;
const OPENAI_EXPLANATION_TIMEOUT_MS = 12_000;

@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);

  constructor(
    private readonly db: DbService,
    readonly shared: DeveloperSharedService,
    private readonly hypaAi: HypaAiAiService,
    private readonly openAi: OpenAiAiService,
    private readonly googleAi: GoogleAiService,
    private readonly vertexAi: GoogleVertexAiService,
    private readonly mansaAi: MansaAiService,
    private readonly metaAi: MetaAiService,
  ) {}

  private supportsLanguage(modelData: MtModelData, value?: string) {
    const requested = value?.trim();
    if (!requested) return false;
    const name = (canonicalLanguage(requested) ?? requested).toLowerCase();
    return (modelData.languages || []).some(
      (language: string) => language.toLowerCase() === name,
    );
  }

  private assertSupportedLanguages(
    modelData: MtModelData,
    body: DeveloperMtDto,
  ) {
    if (
      !this.supportsLanguage(modelData, body.target_lang) ||
      (!this.isAutoLanguage(body.source_lang) &&
        !this.supportsLanguage(modelData, body.source_lang))
    ) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message}. Supported languages: ${(modelData.languages || []).join(', ')}`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }
  }

  private isAutoLanguage(language?: string | null) {
    const normalized = language?.trim().toLowerCase().replace(/\s+/g, '-');
    return (
      !normalized ||
      normalized === 'auto' ||
      normalized === 'auto-detect' ||
      normalized === 'autodetect'
    );
  }

  private cleanDetectedLanguage(value?: string | null) {
    const cleaned = (value || '')
      .split('</think>')
      .pop()
      ?.replace(/["'`]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^language\s*:\s*/i, '')
      .trim();

    if (!cleaned || /^n\/?a$/i.test(cleaned) || this.isAutoLanguage(cleaned)) {
      return undefined;
    }

    return cleaned;
  }

  private async detectSourceLanguage(params: {
    text: string;
    provider: string;
    modelData: MtModelData;
    signal?: AbortSignal;
  }): Promise<{ language?: string; usage?: AiUsage }> {
    try {
      const result =
        params.provider === 'hypaai'
          ? await this.hypaAi.chatSync(
              [
                {
                  role: 'system',
                  content:
                    'You are Hypa Translate. Detect the input language. Return only the language name.',
                },
                {
                  role: 'user',
                  content: params.text,
                },
              ],
              params.modelData.base_apiURL,
              {
                ...this.shared.resolveHypaAiUpstream(params.modelData),
                signal: params.signal,
                temperature: 0.01,
                max_tokens: 20,
                top_k: 3,
                top_p: 0.95,
              },
            )
          : await this.chatWithMtModel({
              provider: params.provider,
              modelData: params.modelData,
              messages: getNonHypaLanguageDetectionMessages({
                provider: params.provider,
                text: params.text,
              }),
              signal: params.signal,
              maxTokens: 20,
              temperature: 0,
            });

      const cleaned = this.cleanDetectedLanguage(result.content);
      const canonical = cleaned ? autoLanguage(cleaned) : null;
      const language =
        canonical && this.supportsLanguage(params.modelData, canonical)
          ? canonical
          : undefined;
      if (cleaned && !language) {
        this.logger.warn({
          message: 'Detected source language is not supported',
          provider: params.provider,
          detected: cleaned,
        });
      }
      this.logger.log({
        message: 'Detected source language',
        provider: params.provider,
        detected: language,
      });
      return { language, usage: result.usage };
    } catch (error) {
      this.logger.warn({
        message: 'Source language detection failed',
        provider: params.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private async chatWithMtModel(params: {
    provider: string;
    modelData: MtModelData;
    messages: ChatMessage[];
    signal?: AbortSignal;
    maxTokens: number;
    temperature?: number;
    topP?: number;
    topK?: number;
  }): Promise<{ content: string; usage: AiUsage }> {
    const { modelData, messages, signal, maxTokens } = params;
    if (params.provider === 'openai') {
      return this.openAi.chatSync(messages, modelData.name, {
        signal,
        timeout: OPENAI_TRANSLATE_TIMEOUT_MS,
        ...(isGpt6AstraModel(modelData.name)
          ? {
              max_tokens: Math.min(
                ASTRA_MAX_COMPLETION_TOKENS,
                Math.max(ASTRA_MIN_COMPLETION_TOKENS, maxTokens),
              ),
              omit_sampling: true,
            }
          : {
              temperature:
                modelData.fixedTemperature ?? params.temperature ?? 0,
              top_p: params.topP ?? 0.5,
              max_tokens: Math.min(maxTokens, 2048),
            }),
        reasoning_effort: modelData.reasoningEffort,
      });
    }
    if (params.provider === 'google') {
      return isVertexGoogleModel('MT', modelData.name)
        ? this.vertexAi.chatSync(
            messages,
            modelData.name,
            modelData.base_apiURL,
            {
              signal,
              thinking: false,
              max_tokens: Math.min(maxTokens, 65536),
            },
          )
        : this.googleAi.chatSync(
            messages,
            modelData.name,
            modelData.base_apiURL,
            {
              signal,
              thinking: false,
              temperature: params.temperature ?? 0,
              top_p: params.topP ?? 0.5,
              top_k: params.topK ?? 1,
              max_tokens: Math.min(maxTokens, 2000),
            },
          );
    }
    if (params.provider === 'meta') {
      const host = modelHost('MT', 'meta', modelData.name);
      const client =
        host === 'meta-api'
          ? this.metaAi
          : host === 'hf-router'
            ? this.googleAi
            : undefined;
      if (!client) {
        throw new BadRequestException({
          message: errorCodes.INVALID_PROVIDER.message,
          code: errorCodes.INVALID_PROVIDER.code,
        });
      }
      return client.chatSync(messages, modelData.name, modelData.base_apiURL, {
        signal,
        thinking: false,
        temperature: params.temperature ?? 0,
        top_p: params.topP ?? 0.5,
        max_tokens: Math.min(maxTokens, 2048),
      });
    }
    throw new BadRequestException(
      `Unsupported MT provider: ${params.provider}`,
    );
  }

  private buildHypaMtRequest(params: {
    body: DeveloperMtDto;
    modelData: MtModelData;
    thinking: boolean;
    signal?: AbortSignal;
  }) {
    const sourceLang = params.body.source_lang || 'auto';

    return {
      sourceLang,
      messages: getMtMessages({
        provider: 'hypaai',
        text: params.body.text,
        thinking: params.thinking,
        sourceLang,
        targetLang: params.body.target_lang ?? 'auto',
        model: params.body.model,
      }),
      options: {
        ...this.shared.resolveHypaAiUpstream(params.modelData),
        signal: params.signal,
        temperature: this.shared.clampTemperature(params.body.temperature, 1),
        max_tokens: this.shared.numberCap(params.body.max_tokens, 1000, 1000),
        top_k: this.shared.numberCap(params.body.top_k, 1),
        top_p: this.shared.numberCap(params.body.top_p, 0.5, 0.5),
      },
    };
  }

  private addUsage(usage: AiUsage, extra?: AiUsage): AiUsage {
    if (!extra) return usage;
    return {
      prompt_tokens: usage.prompt_tokens + extra.prompt_tokens,
      completion_tokens: usage.completion_tokens + extra.completion_tokens,
      total_tokens: usage.total_tokens + extra.total_tokens,
    };
  }

  private canRecordDevRequest(params: { userId?: string; apiKeyId?: string }) {
    return Boolean(params.userId && params.apiKeyId);
  }

  private async recordProductRequest(params: RecordProductRequestParams) {
    if (!this.canRecordDevRequest(params)) {
      return;
    }

    await this.db.developer_request.create({
      data: {
        model: params.body.model,
        provider: params.body.provider as developer_request_provider,
        type: params.type,
        charge_type: params.chargeType as charge_type,
        data: JSON.parse(
          JSON.stringify({ ...params.body, audio: undefined }),
        ) as Prisma.InputJsonValue,
        output_tokens: params.usage.completion_tokens,
        prompt_tokens: params.usage.prompt_tokens,
        total_tokens: params.usage.total_tokens,
        estimated_cost: params.actualCost,
        audio_duration_seconds: params.audioDurationSeconds ?? 0,
        character_count: params.characterCount ?? 0,
        user: { connect: { id: params.userId! } },
        api_key: { connect: { id: params.apiKeyId! } },
      },
    });
  }

  async findTranslationModel(params: {
    userId?: string;
    translationId?: string;
    sourceText: string;
    targetText: string;
  }): Promise<
    { provider: string; model: string; auto?: AutoSummary } | undefined
  > {
    if (!params.userId) return undefined;

    const byId = params.translationId
      ? await this.db.translation.findFirst({
          where: {
            userId: params.userId,
            OR: [
              { id: params.translationId },
              { client_request_id: params.translationId },
            ],
          },
        })
      : null;

    let record = byId;
    if (!record?.model) {
      const targetText = (params.targetText ?? '').trim();
      const candidates = await this.db.translation.findMany({
        where: { userId: params.userId, input_text: params.sourceText },
        orderBy: { created_at: 'desc' },
        take: 20,
      });
      record =
        candidates.find(
          (candidate) =>
            (
              parseTranslation(candidate.output_text ?? '').mainContent ?? ''
            ).trim() === targetText,
        ) ?? null;
    }

    if (!record?.model || !record.provider) return undefined;

    return {
      provider: record.provider,
      model: record.model,
      auto: (record.auto_resolution as AutoSummary | null) ?? undefined,
    };
  }

  async recordProductTranslation(params: {
    userId?: string;
    body: DeveloperMtDto;
    outputText: string;
    autoResolution?: Prisma.InputJsonValue;
  }) {
    if (!params.userId) {
      this.logger.log({
        message: 'Skipping translation table save',
        userId: params.userId,
        clientRequestId: params.body['client_request_id'],
      });
      return;
    }

    const userId = params.userId;
    const saved = {
      input_text: params.body.text,
      output_text: params.outputText,
      source_lang: params.body.source_lang,
      target_lang: params.body.target_lang,
      model: params.body.model,
      provider: params.body.provider,
      temperature: params.body.temperature,
      top_k: params.body.top_k,
      top_p: params.body.top_p,
      translate_history: true,
    };
    const clientRequestId = params.body.client_request_id?.trim();
    if (!clientRequestId) {
      return this.db.translation.create({
        data: { ...saved, auto_resolution: params.autoResolution, userId },
      });
    }

    const save = () =>
      this.db.translation.upsert({
        where: {
          userId_client_request_id: {
            userId,
            client_request_id: clientRequestId,
          },
        },
        create: {
          ...saved,
          auto_resolution: params.autoResolution,
          client_request_id: clientRequestId,
          userId,
        },
        update: {
          ...saved,
          auto_resolution: params.autoResolution ?? Prisma.DbNull,
          thinking: null,
        },
      });
    try {
      return await save();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return save();
      }
      throw error;
    }
  }

  private resolveTtsVoice(
    modelData: MtModelData,
    body: DeveloperTtsDto,
    options: { allowAnyLanguageVoice?: boolean } = {},
  ) {
    const voicesByLanguage = modelData.voices ?? {};
    const allowAnyLanguageVoice = options.allowAnyLanguageVoice === true;
    const rawRequestedVoice = body.voice?.trim();
    const requestedVoice =
      rawRequestedVoice?.toLowerCase() === 'auto'
        ? undefined
        : rawRequestedVoice;
    const rawRequestedLanguage = body.language?.trim().toLowerCase();
    const requestedLanguage =
      rawRequestedLanguage === 'auto' ? undefined : rawRequestedLanguage;
    const fallbackLanguage = requestedLanguage || 'english';
    const fallbackVoice =
      voicesByLanguage[fallbackLanguage]?.[0] ??
      Object.values(voicesByLanguage)[0]?.[0] ??
      'Eniola';
    const voice = requestedVoice || fallbackVoice;
    const normalizedVoice = voice.toLowerCase();
    const normalizedLanguage = requestedLanguage || undefined;
    const celebVoice =
      modelData.celeb_voices?.some(
        (item: string) => item.toLowerCase() === normalizedVoice,
      ) ?? false;

    if (celebVoice) {
      return {
        voice,
        language: body.language?.trim().toLowerCase(),
        celebVoice,
      };
    }

    for (const [language, voices] of Object.entries(voicesByLanguage)) {
      const supportedVoice = (voices as string[] | undefined)?.find(
        (item: string) => item.toLowerCase() === normalizedVoice,
      );

      if (supportedVoice) {
        if (normalizedLanguage && normalizedLanguage !== language) {
          if (allowAnyLanguageVoice) {
            return {
              voice: supportedVoice,
              language: normalizedLanguage,
              celebVoice,
            };
          }

          throw new BadRequestException({
            message: `${errorCodes.INVALID_VOICE.message}. Voice "${voice}" is available for "${language}", not "${normalizedLanguage}".`,
            code: errorCodes.INVALID_VOICE.code,
          });
        }

        return { voice: supportedVoice, language, celebVoice };
      }
    }

    const voicesForLanguage = voicesByLanguage[fallbackLanguage] || [];
    const voiceMessage = `Supported voices for "${fallbackLanguage}": ${voicesForLanguage.join(', ')}. Celebrity voices: ${modelData.celeb_voices?.join(', ') || 'N/A'}`;

    throw new BadRequestException({
      message: `${errorCodes.INVALID_VOICE.message}. Supported languages: ${Object.keys(voicesByLanguage).join(', ')}. ${voiceMessage}`,
      code: errorCodes.INVALID_VOICE.code,
    });
  }

  async translateText(params: TranslateTextParams) {
    if (params.body.provider !== 'hypaai') {
      return this.translateWithDirectProvider(params);
    }

    const modelData = await this.shared.getModelInfo({
      provider: params.body.provider,
      model: params.body.model,
      type: 'MT',
    });

    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    if (!modelData.rates?.input || !modelData.rates?.output) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    this.assertSupportedLanguages(modelData, params.body);

    return new Observable((subscriber) => {
      (async () => {
        try {
          const detection = this.isAutoLanguage(params.body.source_lang)
            ? await this.detectSourceLanguage({
                text: params.body.text,
                provider: 'hypaai',
                modelData,
                signal: params.signal,
              })
            : {};
          const detectedSourceLang = detection.language;
          const {
            sourceLang: effectiveSourceLang,
            messages,
            options,
          } = this.buildHypaMtRequest({
            body: detectedSourceLang
              ? { ...params.body, source_lang: detectedSourceLang }
              : params.body,
            modelData,
            thinking: params.body.thinking ?? true,
            signal: params.signal,
          });

          if (params.body.stream) {
            const stream$ = this.hypaAi.chatStream(
              messages,
              modelData.base_apiURL,
              options,
            );

            if (detectedSourceLang) {
              subscriber.next({
                data: {
                  detected_source_lang: detectedSourceLang,
                  complete: false,
                },
              });
            }

            stream$.subscribe({
              next: (chunk) => {
                this.logger.log({
                  message: 'HypaAI MT stream response',
                  raw: chunk.raw,
                  fullContent: chunk.fullContent,
                  complete: chunk.complete,
                });

                subscriber.next({
                  data: {
                    ...(chunk.raw as object),
                    fullContent: chunk.fullContent,
                    complete: chunk.complete,
                  },
                });
              },
              error: (error) => {
                subscriber.error(error);
              },
              complete: () => {
                subscriber.next({
                  data: {
                    fullContent: '',
                    complete: true,
                    detected_source_lang: detectedSourceLang || null,
                  },
                });
                subscriber.complete();
              },
            });
            return;
          }

          const result = await this.hypaAi.chatSync(
            messages,
            modelData.base_apiURL,
            options,
          );
          const usage = this.addUsage(result.usage, detection.usage);

          this.logger.log({
            message: 'HypaAI MT model response',
            response: sanitizeForLog(result),
          });

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
              usage,
              model: modelData.name,
              provider: params.body.provider,
              detected_source_lang: detectedSourceLang || null,
              language: detectedSourceLang || params.body.source_lang || null,
              source_language:
                detectedSourceLang || params.body.source_lang || null,
            }),
          });

          const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
          const cost = this.shared.calculateCost({
            usage,
            rates: modelData.rates!,
            chargeType,
          });

          if (params.userId) {
            await this.recordProductTranslation({
              userId: params.userId,
              body: {
                ...params.body,
                source_lang: effectiveSourceLang,
              },
              outputText: result.content,
            });
          }

          if (this.canRecordDevRequest(params)) {
            await this.recordProductRequest({
              body: {
                ...params.body,
                input_text: params.body.text,
                output_text: result.content,
                source_lang: effectiveSourceLang,
                target_lang: params.body.target_lang,
                detected_source_lang: detectedSourceLang,
              },
              type: developer_request_type.machine_translation,
              usage,
              userId: params.userId,
              apiKeyId: params.apiKeyId,
              chargeType,
              actualCost: cost,
            });
          }

          subscriber.complete();
        } catch (error) {
          try {
            this.shared.handleError(error);
          } catch (e) {
            subscriber.error(e);
          }
        }
      })();
    });
  }

  async translateDirect(params: {
    body: DeveloperMtDto;
    signal?: AbortSignal;
    userId?: string;
    apiKeyId?: string;
  }): Promise<DirectTranslationResult> {
    const modelData = this.shared.getModelInfo({
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
    this.assertSupportedLanguages(modelData, params.body);

    const provider = params.body.provider;
    const targetLang = params.body.target_lang ?? 'auto';
    const requestedMaxTokens = params.body.max_tokens ?? 1240;
    let detection: { language?: string; usage?: AiUsage } = {};
    let body = params.body;
    let content = '';
    let usage: AiUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    if (provider === 'mansa') {
      const sourceLang = params.body.source_lang?.trim();
      if (!sourceLang || this.isAutoLanguage(sourceLang)) {
        throw new BadRequestException('Mansa requires a source language');
      }
      if (
        process.env.MANSA_MT_ENABLED !== 'true' ||
        !process.env.MANSA_API_KEY?.trim()
      ) {
        throw new BadRequestException({
          message: errorCodes.INVALID_PROVIDER.message,
          code: errorCodes.INVALID_PROVIDER.code,
        });
      }
      content = await this.mansaAi.translate({
        text: params.body.text,
        from: sourceLang,
        to: targetLang,
        apiUrl: modelData.base_apiURL,
        timeoutMs: modelData.timeout_ms ?? 60_000,
        signal: params.signal,
      });
    } else if (
      provider === 'hypaai' ||
      provider === 'openai' ||
      provider === 'google' ||
      provider === 'meta'
    ) {
      if (this.isAutoLanguage(params.body.source_lang)) {
        detection = await this.detectSourceLanguage({
          text: params.body.text,
          provider,
          modelData,
          signal: params.signal,
        });
      }
      if (detection.language) {
        body = { ...params.body, source_lang: detection.language };
      }

      let result: { content: string; usage: AiUsage };
      if (provider === 'hypaai') {
        const request = this.buildHypaMtRequest({
          body,
          modelData,
          thinking: false,
          signal: params.signal,
        });
        result = await this.hypaAi.chatSync(
          request.messages,
          modelData.base_apiURL,
          request.options,
        );
      } else {
        result = await this.chatWithMtModel({
          provider,
          modelData,
          messages: getMtMessages({
            provider,
            text: body.text,
            sourceLang: body.source_lang,
            targetLang,
            model: body.model,
            thinking: false,
          }),
          signal: params.signal,
          maxTokens: requestedMaxTokens,
          temperature: body.temperature,
          topP: body.top_p,
          topK: body.top_k,
        });
      }
      content = result.content;
      usage = this.addUsage(result.usage, detection.usage);
    } else {
      throw new BadRequestException(`Unsupported MT provider: ${provider}`);
    }

    const text = parseTranslation(content || '').mainContent?.trim() ?? '';
    if (!text) {
      throw new BadRequestException({
        message: errorCodes.INCOMPLETE_RESPONSE.message,
        code: errorCodes.INCOMPLETE_RESPONSE.code,
      });
    }

    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const characterCount =
      chargeType === 'character_count'
        ? Array.from(params.body.text).length
        : undefined;
    const actualCost = this.shared.calculateCost({
      usage,
      rates: modelData.rates,
      chargeType,
      additionalData: { characterCount },
    });
    await this.recordProductRequest({
      body: {
        ...body,
        input_text: body.text,
        output_text: content,
        detected_source_lang: detection.language,
      },
      type: developer_request_type.machine_translation,
      usage,
      chargeType,
      actualCost,
      characterCount,
      userId: params.userId,
      apiKeyId: params.apiKeyId,
    });

    return { text, usage, detectedSourceLang: detection.language };
  }

  private translateWithDirectProvider(params: TranslateTextParams) {
    return new Observable<{ data: string }>((subscriber) => {
      void (async () => {
        try {
          const result = await this.translateDirect({
            body: params.body,
            signal: params.signal,
            userId: params.userId,
            apiKeyId: params.apiKeyId,
          });
          const sourceLanguage =
            result.detectedSourceLang || params.body.source_lang || null;
          if (params.userId) {
            await this.recordProductTranslation({
              userId: params.userId,
              body: {
                ...params.body,
                source_lang: sourceLanguage ?? params.body.source_lang,
              },
              outputText: result.text,
            });
          }
          subscriber.next({
            data: JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: result.text,
                    finish_reason: 'stop',
                  },
                },
              ],
              usage: result.usage,
              model: params.body.model,
              provider: params.body.provider,
              detected_source_lang: result.detectedSourceLang || null,
              language: sourceLanguage,
              source_language: sourceLanguage,
            }),
          });
          subscriber.complete();
        } catch (error) {
          let handledError: unknown = error;
          try {
            this.shared.handleError(error);
          } catch (thrownError) {
            handledError = thrownError;
          }
          subscriber.error(handledError);
        }
      })();
    });
  }

  async generateTranslationThinking(params: GenerateTranslationThinkingParams) {
    if (params.body.provider !== 'hypaai') {
      return this.generateNonHypaTranslationThinking(params);
    }

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

    try {
      const result = await this.hypaAi.chatSync(
        getMtThinkingMessages({
          sourceLang: params.body.source_lang,
          targetLang: params.body.target_lang,
          sourceText: params.body.source_text,
          targetText: params.body.target_text,
        }),
        modelData.base_apiURL,
        {
          ...this.shared.resolveHypaAiUpstream(modelData),
          temperature: this.shared.clampTemperature(
            params.body.temperature,
            0.3,
            0.3,
          ),
          max_tokens: this.shared.numberCap(params.body.max_tokens, 800, 800),
          top_k: this.shared.numberCap(params.body.top_k, 3, 1),
          top_p: this.shared.numberCap(params.body.top_p, 0.5, 0.5),
          signal: params.signal,
        },
      );

      const parsed = parseTranslation(result.content || '');
      const thinking = (
        parsed.thinkingContent ||
        parsed.mainContent ||
        ''
      ).trim();

      if (!thinking) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
      const actualCost = this.shared.calculateCost({
        usage: result.usage,
        rates: modelData.rates,
        chargeType,
      });

      await this.mergeThinkingIntoHistory({
        userId: params.userId,
        translationId: params.body.client_request_id,
        targetText: params.body.target_text,
        thinking,
      });

      const originalTranslationId = params.body.client_request_id?.trim();
      await this.recordProductRequest({
        body: {
          ...params.body,
          input_text: params.body.source_text,
          output_text: thinking,
          original_translation_id: originalTranslationId,
          client_request_id: originalTranslationId
            ? `${originalTranslationId}-thinking`
            : params.body.client_request_id,
        },
        type: developer_request_type.machine_translation,
        usage: result.usage,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        chargeType,
        actualCost,
      });

      return { thinking };
    } catch (error) {
      throw this.shared.handleError(error);
    }
  }

  private resolveExplanationModel(provider: string, model: string) {
    const selected = (MODELS_BY_CAPABILITY.MT[provider] ?? []).find(
      (entry) => entry.name === model,
    );
    if (!selected) {
      throw new BadRequestException(`${provider}/${model} is not an MT model`);
    }
    if (provider === 'openai' || provider === 'google') {
      return { provider, model: selected } as const;
    }

    throw new BadRequestException(
      `The selected translation model ${provider}/${model} does not support explanations`,
    );
  }

  private async generateNonHypaTranslationThinking(
    params: GenerateTranslationThinkingParams,
  ) {
    const selectedProvider = params.body.provider.trim();
    const prompt = this.resolveExplanationModel(
      selectedProvider,
      params.body.model,
    );
    const messages = getMtThinkingMessages({
      provider: selectedProvider,
      sourceLang: params.body.source_lang,
      targetLang: params.body.target_lang,
      sourceText: params.body.source_text,
      targetText: params.body.target_text,
    });
    const requestedMaxTokens = params.body.max_tokens ?? 800;
    const googleApiUrl = prompt.model.baseApiUrl ?? '';
    if (prompt.provider === 'google' && !googleApiUrl) {
      throw new BadGatewayException('Translation model endpoint unavailable');
    }

    try {
      const result =
        prompt.provider === 'openai'
          ? await this.openAi.chatSync(messages, prompt.model.name, {
              timeout: OPENAI_EXPLANATION_TIMEOUT_MS,
              ...(isGpt6AstraModel(prompt.model.name)
                ? {
                    max_tokens: Math.min(
                      ASTRA_MAX_COMPLETION_TOKENS,
                      Math.max(ASTRA_MIN_COMPLETION_TOKENS, requestedMaxTokens),
                    ),
                    omit_sampling: true,
                  }
                : {
                    temperature: prompt.model.fixedTemperature ?? 0.2,
                    top_p: 0.9,
                    max_tokens: Math.min(requestedMaxTokens, 1000),
                  }),
              reasoning_effort: prompt.model.reasoningEffort,
              signal: params.signal,
            })
          : await (isVertexGoogleModel('MT', prompt.model.name)
              ? this.vertexAi.chatSync(
                  messages,
                  prompt.model.name,
                  googleApiUrl,
                  {
                    thinking: false,
                    max_tokens: Math.min(requestedMaxTokens, 65536),
                    signal: params.signal,
                  },
                )
              : this.googleAi.chatSync(
                  messages,
                  prompt.model.name,
                  googleApiUrl,
                  {
                    thinking: false,
                    temperature: 0.2,
                    top_p: 0.9,
                    top_k: 20,
                    max_tokens: Math.min(requestedMaxTokens, 2000),
                    signal: params.signal,
                  },
                ));
      const parsed = parseTranslation(result.content || '');
      const thinking = (
        parsed.thinkingContent ||
        parsed.mainContent ||
        ''
      ).trim();
      if (!thinking) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      const modelData = this.shared.getModelInfo({
        provider: prompt.provider,
        model: prompt.model.name,
        type: 'MT',
      });
      if (!modelData?.rates)
        throw new BadGatewayException('Model rates unavailable');
      const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
      const actualCost = this.shared.calculateCost({
        usage: result.usage,
        rates: modelData.rates,
        chargeType,
      });
      await this.mergeThinkingIntoHistory({
        userId: params.userId,
        translationId: params.body.client_request_id,
        targetText: params.body.target_text,
        thinking,
      });
      await this.recordProductRequest({
        body: { ...params.body, output_text: thinking },
        type: developer_request_type.machine_translation,
        usage: result.usage,
        chargeType,
        actualCost,
        userId: params.userId,
        apiKeyId: params.apiKeyId,
      });
      return { thinking };
    } catch (error) {
      this.shared.handleError(error);
    }
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

    if (
      !modelData.rates?.input ||
      !(modelData.rates.audioOutput ?? modelData.rates.output)
    ) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    if (params.body.enrollment_data) {
      throw new BadRequestException({
        message: 'Voice enrollment requires a developer-authenticated request',
        code: errorCodes.INVALID_REQUEST.code,
      });
    }

    const allowAnyLanguageVoice = true;
    const { voice, language } = this.resolveTtsVoice(modelData, params.body, {
      allowAnyLanguageVoice,
    });

    try {
      const ttsResult = await this.hypaAi.ttsRequest(
        params.body.text,
        voice,
        modelData.base_apiURL,
        {
          temperature: this.shared.clampTemperature(
            params.body.temperature,
            0.9,
          ),
          top_p: this.shared.numberCap(params.body.top_p, 0.9, 0.9),
          repetition_penalty: this.shared.numberCap(
            params.body.repetition_penalty,
            2,
            2,
          ),
          max_new_tokens: this.shared.numberCap(
            params.body.max_tokens,
            4096,
            2000,
          ),
        },
      );

      this.logger.log({
        message: 'HypaAI TTS model response',
        model: modelData.name,
        voice,
        language,
        response: sanitizeForLog(ttsResult),
      });

      if (!ttsResult.audio_b64) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      const inputTokens = ttsResult.input_ids_len || 0;
      const outputTokens = ttsResult.gen_ids_len || 0;
      const usage = {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        ...(typeof modelData.rates?.audioOutput === 'number'
          ? {
              input_text_tokens: inputTokens,
              output_audio_tokens: outputTokens,
            }
          : {}),
      };
      const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
      const actualCost = this.shared.calculateCost({
        usage,
        rates: modelData.rates,
        chargeType,
      });

      if (this.canRecordDevRequest(params)) {
        await this.recordProductRequest({
          body: {
            ...params.body,
            voice,
            language,
          },
          type: developer_request_type.text_to_speech,
          usage,
          userId: params.userId!,
          apiKeyId: params.apiKeyId!,
          chargeType,
          actualCost,
        });
      }

      return {
        response: {
          audio_b64: ttsResult.audio_b64,
          audio_type: 'audio/wav',
          sample_rate: ttsResult.sample_rate,
        },
        usage,
        model: modelData.name,
        voice,
        language,
        provider: params.body.provider,
      };
    } catch (error) {
      throw this.shared.handleError(error);
    }
  }

  async speechToText(params: SpeechToTextParams) {
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

    const chargeType = (modelData.charge_type || 'tokens') as ChargeType;
    const audioDurationSeconds =
      chargeType === 'audio_minutes'
        ? await this.shared.getAudioDurationSeconds(
            Buffer.from(base64, 'base64'),
            mimeType,
          )
        : undefined;

    try {
      const upstream = this.shared.resolveHypaAiUpstream(modelData);

      const result = await this.hypaAi.asrRequest(
        base64,
        mimeType,
        String(modelData.base_apiURL),
        {
          temperature: this.shared.clampTemperature(params.body.temperature, 1),
          top_p: this.shared.numberCap(params.body.top_p, 0.5, 0.5),
          top_k: this.shared.numberCap(params.body.top_k, 1, 1),
          max_tokens: this.shared.numberCap(params.body.max_tokens, 400, 400),
          apiKey: upstream.apiKey,
          timeout: upstream.timeout,
        },
      );

      this.logger.log({
        message: 'HypaAI STT model response',
        model: modelData.name,
        mimeType,
        response: sanitizeForLog(result),
      });

      if (!result.transcript) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }

      const rates = modelData.rates || { input: 0.00000015, output: 0.0000006 };
      const actualCost = this.shared.calculateCost({
        usage: result.usage,
        rates,
        chargeType,
        additionalData:
          chargeType === 'audio_minutes' ? { audioDurationSeconds } : undefined,
      });

      if (this.canRecordDevRequest(params)) {
        await this.recordProductRequest({
          body: params.body as unknown as RecordProductRequestParams['body'],
          type: developer_request_type.speech_to_text,
          usage: result.usage,
          userId: params.userId!,
          apiKeyId: params.apiKeyId!,
          chargeType,
          audioDurationSeconds:
            chargeType === 'audio_minutes' ? audioDurationSeconds : undefined,
          actualCost,
        });
      }

      return {
        response: { text: result.transcript },
        usage: result.usage,
        model: modelData.name,
        provider: params.body.provider,
      };
    } catch (error) {
      throw this.shared.handleError(error);
    }
  }

  private translationByIdWhere(
    id: string,
    userId: string,
  ): Prisma.translationWhereInput {
    return {
      userId,
      translate_history: true,
      OR: [{ id }, { client_request_id: id }],
    };
  }

  private parseHistoryCursor(cursor: string) {
    const separator = cursor.indexOf('_');
    const createdAt = new Date(cursor.slice(0, separator));
    const id = cursor.slice(separator + 1);
    if (separator < 0 || Number.isNaN(createdAt.getTime()) || !id) {
      throw new BadRequestException('Invalid history cursor');
    }
    return { createdAt, id };
  }

  async getHistory(params: {
    userId: string;
    limit: number;
    filter?: 'all' | 'bookmarks';
    cursor?: string;
  }) {
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const scope: Prisma.translationWhereInput = {
      userId: params.userId,
      translate_history: true,
      ...(params.filter === 'bookmarks' ? { bookmarked: true } : {}),
    };
    const after = params.cursor
      ? this.parseHistoryCursor(params.cursor)
      : undefined;
    const where: Prisma.translationWhereInput = after
      ? {
          ...scope,
          OR: [
            { created_at: { lt: after.createdAt } },
            { created_at: after.createdAt, id: { lt: after.id } },
          ],
        }
      : scope;

    const rows = await this.db.translation.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];

    return {
      nextCursor:
        rows.length > limit && last
          ? `${last.created_at.toISOString()}_${last.id}`
          : null,
      data: items,
    };
  }

  async getTranslation(id: string, userId: string) {
    const translation = await this.db.translation.findFirst({
      where: this.translationByIdWhere(id, userId),
      orderBy: { created_at: 'desc' },
    });

    if (!translation) {
      throw new NotFoundException('Translation not found');
    }

    return translation;
  }

  async updateBookmark(params: {
    id: string;
    userId: string;
    bookmarked: boolean;
  }) {
    const translation = await this.getTranslation(params.id, params.userId);

    return this.db.translation.update({
      where: { id: translation.id },
      data: { bookmarked: params.bookmarked },
    });
  }

  async updateFeedback(params: {
    id: string;
    userId: string;
    liked: boolean | null;
    correction?: string;
  }) {
    const translation = await this.getTranslation(params.id, params.userId);

    return this.db.translation.update({
      where: { id: translation.id },
      data: { liked: params.liked, correction: params.correction ?? null },
    });
  }

  async deleteTranslation(id: string, userId: string) {
    const result = await this.db.translation.deleteMany({
      where: this.translationByIdWhere(id, userId),
    });

    if (result.count === 0) {
      throw new NotFoundException('Translation not found');
    }

    return { message: 'Translation deleted' };
  }

  private async mergeThinkingIntoHistory(params: {
    userId?: string;
    translationId?: string;
    targetText: string;
    thinking: string;
  }) {
    if (!params.userId || !params.translationId?.trim()) return;

    let existing: Awaited<ReturnType<TranslateService['getTranslation']>>;
    try {
      existing = await this.getTranslation(
        params.translationId.trim(),
        params.userId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) return;
      throw error;
    }

    await this.db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<
        Array<{ output_text: string; thinking: string | null }>
      >(
        Prisma.sql`
          SELECT "output_text", "thinking"
          FROM "translation"
          WHERE "id" = ${existing.id}
          FOR UPDATE
        `,
      );

      if (!locked || locked.thinking?.trim()) return;

      const currentOutput = locked.output_text.trim()
        ? locked.output_text
        : params.targetText;

      await tx.translation.update({
        where: { id: existing.id },
        data: {
          output_text: attachThinking(currentOutput, params.thinking),
          thinking: params.thinking.trim(),
        },
      });
    });
  }
}
