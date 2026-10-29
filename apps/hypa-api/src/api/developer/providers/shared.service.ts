import type { VoiceEnrollmentBilling } from 'src/utils/voice-enrollment-billing';
import { AiUsage } from 'src/ai/ai.types';
import {
  BadRequestException,
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BaseDeveloperBody,
  ChargeType,
  ModelRates,
  HypaModelsConfig,
  providerKey,
} from '../developer.dto';
import { LEGACY_MODELS_BY_CAPABILITY as models } from '@hypa/config/legacy-models';
import winston from 'winston';
import {
  charge_type,
  developer_request_type,
  request_source,
} from 'src/generated/prisma/enums';
import { Debug } from 'src/utils/debug';
import argon2 from 'argon2';
import { customAlphabet } from 'nanoid';
import { DbService } from 'src/libs/db/db.service';
import { Prisma } from 'src/generated/prisma/client';
import errorCodes from '@hypa/config/json/error-codes';
import axios, { isAxiosError } from 'axios';
import { createHash, randomUUID } from 'crypto';
import { get_encoding } from 'tiktoken';
import { parseBuffer } from 'music-metadata';
import { UserQueue } from 'src/queues/users-queue/user.queue';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

interface getModelInfoParams {
  provider: providerKey;
  model: string;
  type: 'MT' | 'TTS' | 'ASR' | 'OCR' | 'ALI' | 'VC' | 'AC';
}

interface CalculateCostParams {
  usage:
    | AiUsage
    | (Pick<AiUsage, 'prompt_tokens' | 'completion_tokens'> & Partial<AiUsage>);
  rates: ModelRates;
  chargeType?: ChargeType;
  additionalData?: {
    audioDurationSeconds?: number;
    characterCount?: number;
  };
}

interface RecorDevRequestParams {
  body: Partial<BaseDeveloperBody> & {
    billing_usage?: AiUsage;
    billing?: VoiceEnrollmentBilling;
  };
  type: developer_request_type;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  rates: {
    input: number;
    output: number;
  };
  userId: string;
  apiKeyId: string;
  chargeType?: charge_type;
  audioDurationSeconds?: number;
  characterCount?: number;
  actualCost: number;
}

const allModels = models as unknown as HypaModelsConfig;

@Injectable()
export class DeveloperSharedService {
  private readonly nanoid = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    48,
  );

  constructor(
    private db: DbService,
    private userQueue: UserQueue,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}
  getModelInfo({ provider, model, type }: getModelInfoParams) {
    return allModels[type]?.[provider]?.find((m) => m.name === model);
  }

  resolveHypaAiUpstream(model?: {
    api_key_env?: string;
    served_model_name?: string;
    timeout_ms?: number;
  }): { apiKey?: string; servedModelName?: string; timeout?: number } {
    if (!model) {
      return {};
    }

    const upstream: {
      apiKey?: string;
      servedModelName?: string;
      timeout?: number;
    } = {};

    if (model.api_key_env) {
      const apiKey = process.env[model.api_key_env];
      if (!apiKey) {
        throw new ServiceUnavailableException(
          `${model.api_key_env} is not set but is required by this model`,
        );
      }
      upstream.apiKey = apiKey;
    }

    if (model.served_model_name) {
      upstream.servedModelName = model.served_model_name;
    }
    if (model.timeout_ms) {
      upstream.timeout = model.timeout_ms;
    }

    return upstream;
  }

  async isHypaOnly(userId?: string): Promise<boolean> {
    const freeOnly = process.env.TRANSLATE_FREE_HYPA_ONLY === 'true';
    const paidOnly = process.env.TRANSLATE_PAID_HYPA_ONLY === 'true';
    if (freeOnly === paidOnly) return freeOnly;
    const wallet = userId
      ? await this.db.wallet.findUnique({
          where: { userId },
          select: { balance: true },
        })
      : null;
    return Number(wallet?.balance ?? 0) > 0 ? paidOnly : freeOnly;
  }

  async getUserWallet(userId: string) {
    let wallet = await this.db.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await this.db.wallet.create({
        data: {
          userId,
          balance: 0,
        },
      });
    }

    return wallet;
  }

  async hasBalance(userId: string, cost: number) {
    const wallet = await this.getUserWallet(userId);
    return Number(wallet.balance) >= cost;
  }

  async checkBalance(userId: string, cost: number) {
    const wallet = await this.getUserWallet(userId);
    const currentBalance = Number(wallet.balance);

    if (currentBalance < cost) {
      throw new BadRequestException({
        message: errorCodes.INSUFFICIENT_BALANCE.message,
        code: errorCodes.INSUFFICIENT_BALANCE.code,
      });
    }
  }

  calculateCost(params: CalculateCostParams): number {
    const { usage, rates, chargeType = 'tokens', additionalData } = params;
    winston.debug(`Calculating cost with chargeType: ${chargeType}`);
    if (chargeType === 'tokens') {
      const inputAudio = usage.input_audio_tokens ?? 0;
      const outputAudio = usage.output_audio_tokens ?? 0;
      const inputText =
        usage.input_text_tokens ?? usage.prompt_tokens - inputAudio;
      const outputText = usage.completion_tokens - outputAudio;
      const components = [
        [inputText, rates.input],
        [outputText, rates.output],
        [inputAudio, rates.audioInput],
        [outputAudio, rates.audioOutput],
      ];
      let cost = new Prisma.Decimal(0);
      for (const [count, rate] of components) {
        if (
          !Number.isFinite(count) ||
          count! < 0 ||
          (count! > 0 &&
            (rate === undefined || !Number.isFinite(rate) || rate < 0))
        )
          throw new BadRequestException(
            'Invalid token usage or missing model rate',
          );
        cost = cost.plus(new Prisma.Decimal(count ?? 0).mul(rate ?? 0));
      }
      return cost.toNumber();
    }
    if (
      chargeType === 'audio_minutes' &&
      additionalData?.audioDurationSeconds !== undefined
    )
      return new Prisma.Decimal(additionalData.audioDurationSeconds)
        .mul(rates.input)
        .toNumber();
    if (
      chargeType === 'character_count' &&
      additionalData?.characterCount !== undefined
    )
      return new Prisma.Decimal(additionalData.characterCount)
        .mul(rates.input)
        .toNumber();
    throw new BadRequestException('Missing usage for model billing unit');
  }

  async recordDevRequest({
    body,
    type,
    usage,
    rates,
    userId,
    apiKeyId,
    chargeType = charge_type.tokens,
    audioDurationSeconds,
    characterCount,
    actualCost,
  }: RecorDevRequestParams) {
    if (!rates || !usage || !userId || !apiKeyId) {
      Debug.error('NO RATES OR USAGE OR USER ID OR API KEY ID');
      return;
    }
    await this.userQueue.recordDevRequest({
      body: JSON.parse(JSON.stringify({ ...body, audio: undefined })),
      type,
      usage,
      rates,
      userId,
      apiKeyId,
      chargeType,
      audioDurationSeconds,
      characterCount,
      actualCost,
    });
  }

  async recordCompletedDevRequest(
    params: RecorDevRequestParams,
  ): Promise<void> {
    const historyId = randomUUID();
    try {
      const { body, ...record } = params;
      if (
        !record.rates ||
        !record.usage ||
        !record.userId ||
        !record.apiKeyId
      ) {
        throw new Error('Invalid completed request metadata');
      }
      await this.userQueue.recordCompletedDevRequest({
        ...record,
        historyId,
        body: JSON.parse(JSON.stringify({ ...body, audio: undefined })),
      });
    } catch {
      Logger.error({
        message: 'Completed request history recording failed',
        historyId,
        provider: params.body.provider,
        model: params.body.model,
        userId: params.userId,
        cost: params.actualCost,
      });
    }
  }

  async deductBalance(userId: string, cost: number) {
    await this.userQueue.deductBalance({ userId, amount: cost });
  }

  async refundBalance(userId: string, amount: number, reason?: string) {
    await this.userQueue.refundBalance({ userId, amount, reason });
  }

  async invalidateUserBalanceCache(userId: string) {
    const cacheKey = `user_balance:${userId}`;
    await this.cacheManager.del(cacheKey);
  }

  handleError(error: unknown): never {
    if (!isAxiosError(error)) {
      throw error;
    }
    if (error.response?.status === 503) {
      throw new ServiceUnavailableException({
        message: errorCodes.MODEL_UNAVAILABLE.message,
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    const responseData = error.response?.data as
      | { message?: string; error?: string | { message?: string } }
      | undefined;
    const providerMessage =
      responseData?.message ||
      (typeof responseData?.error === 'string'
        ? responseData.error
        : responseData?.error?.message) ||
      error.message;

    throw new BadRequestException({
      message: `${errorCodes.INVALID_REQUEST.message}${providerMessage ? ` Provider details: ${providerMessage}` : ''}`,
      code: errorCodes.INVALID_REQUEST.code,
    });
  }

  numberCap(initial: number, cap: number, defaultValue = 0) {
    if (!initial || isNaN(initial)) return defaultValue;
    return Math.min(cap, Math.max(initial, 1));
  }

  clampTemperature(initial: number | undefined, cap: number, defaultValue = 1) {
    if (initial === undefined || initial === null || isNaN(initial))
      return defaultValue;
    return Math.min(cap, Math.max(initial, 0));
  }

  throwUnsupportedProviderError(provider: string): never {
    throw new BadRequestException({
      message: `Provider "${provider}" is not available for this feature`,
      code: errorCodes.MODEL_UNAVAILABLE.code,
    });
  }

  async getAudioDurationSeconds(audioBuffer: Buffer, mimeType: string) {
    try {
      const metadata = await parseBuffer(audioBuffer, { mimeType });
      const duration = metadata.format.duration;
      if (!duration || !Number.isFinite(duration) || duration <= 0) {
        throw new Error('Audio duration is unavailable');
      }
      return duration;
    } catch {
      throw new BadRequestException({
        message: errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }
  }

  codePointCount(text: string): number {
    return [...text].length;
  }

  getTextNumberOfTokens(text: string) {
    Debug.log('GETTING TOKENS');
    const encoding = get_encoding('cl100k_base');
    const tokens = encoding.encode(text);
    Debug.log('NO OF TOKENS', tokens.length);
    encoding.free();
    return tokens.length;
  }

  async decodeAudio({
    audio,
    audioType,
    mimeType: mimeTypeOverride,
  }: {
    audio: string;
    audioType?: 'base64' | 'url';
    mimeType?: string;
  }) {
    try {
      const normalizeMimeType = (mimeType: string | undefined) =>
        mimeType?.split(';')[0]?.trim().toLowerCase();

      const detectAudioMime = (buffer: Buffer): string => {
        if (buffer.length < 12) return 'audio/mpeg';
        const header = buffer.toString('ascii', 0, 12);
        if (header.startsWith('RIFF') && header.includes('WAVE')) {
          return 'audio/wav';
        }
        if (header.startsWith('OggS')) {
          return 'audio/ogg';
        }
        if (header.startsWith('fLaC')) {
          return 'audio/flac';
        }
        if (header.startsWith('ID3')) {
          return 'audio/mpeg';
        }
        if (
          buffer[0] === 0x1a &&
          buffer[1] === 0x45 &&
          buffer[2] === 0xdf &&
          buffer[3] === 0xa3
        ) {
          return 'audio/webm';
        }
        const byte0 = buffer[0];
        const byte1 = buffer[1];
        if (byte0 === 0xff && (byte1 & 0xe0) === 0xe0) {
          return 'audio/mpeg';
        }
        if (
          buffer.length >= 8 &&
          buffer[4] === 0x66 &&
          buffer[5] === 0x74 &&
          buffer[6] === 0x79 &&
          buffer[7] === 0x70
        ) {
          return 'audio/mp4';
        }
        return 'audio/mpeg';
      };

      if (audioType === 'url') {
        const response = await axios.get<ArrayBuffer>(audio, {
          responseType: 'arraybuffer',
        });
        const responseMimeType = normalizeMimeType(
          response.headers['content-type'] as string | undefined,
        );
        const responseBuffer = Buffer.from(response.data);
        const detectedType =
          normalizeMimeType(mimeTypeOverride) ||
          (responseMimeType && responseMimeType.startsWith('audio/')
            ? responseMimeType
            : detectAudioMime(responseBuffer));
        return {
          base64: responseBuffer.toString('base64'),
          mimeType: detectedType,
        };
      }

      const isDataUri = audio.startsWith('data:');
      const base64 = isDataUri ? (audio.split(',')[1] ?? '') : audio;
      const detectedType = isDataUri
        ? normalizeMimeType(
            audio.substring(audio.indexOf(':') + 1, audio.indexOf(';')),
          )
        : detectAudioMime(Buffer.from(base64, 'base64'));

      return {
        base64,
        mimeType: normalizeMimeType(mimeTypeOverride) || detectedType,
      };
    } catch {
      throw new BadRequestException({
        message: errorCodes.INVALID_REQUEST.message,
        code: errorCodes.INVALID_REQUEST.code,
      });
    }
  }

  estimateTtsCost(
    text: string,
    rates: ModelRates,
    chargeType: 'tokens' | 'audio_minutes' | 'character_count' = 'tokens',
  ): {
    estimatedCost: number;
    estimatedUsage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    characterCount?: number;
    estimatedAudioDurationSeconds?: number;
  } {
    const inputTokens = this.getTextNumberOfTokens(text);
    const outputTokens = Math.ceil(inputTokens * 0.025);
    const estimatedUsage = {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      ...(rates.audioOutput !== undefined
        ? { input_text_tokens: inputTokens, output_audio_tokens: outputTokens }
        : {}),
    };

    let characterCount: number | undefined;
    let estimatedAudioDurationSeconds: number | undefined;

    if (chargeType === 'character_count') {
      characterCount = this.codePointCount(text);
      const estimatedCost = this.calculateCost({
        rates,
        usage: estimatedUsage,
        chargeType,
        additionalData: { characterCount },
      });
      return { estimatedCost, estimatedUsage, characterCount };
    }

    if (chargeType === 'audio_minutes') {
      const charsPerSecond = 12.5;
      estimatedAudioDurationSeconds = text.length / charsPerSecond;
      const estimatedCost = this.calculateCost({
        rates,
        usage: estimatedUsage,
        chargeType,
        additionalData: { audioDurationSeconds: estimatedAudioDurationSeconds },
      });
      return { estimatedCost, estimatedUsage, estimatedAudioDurationSeconds };
    }

    const estimatedCost = this.calculateCost({
      usage: estimatedUsage,
      rates,
      chargeType,
    });
    return { estimatedCost, estimatedUsage };
  }

  async findOrCreateUserApiKey(userId: string) {
    const existingApiKey = await this.db.api_key.findFirst({
      where: {
        userId,
        created_source: request_source.labs,
        is_deleted: false,
      },
      select: {
        id: true,
      },
    });

    if (existingApiKey) {
      return existingApiKey;
    }

    const uniqueId = this.nanoid();
    const apiKey = `hypa_${uniqueId}${Date.now()}`;

    const apiKeyHash = await argon2.hash(apiKey, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const keyIndex = createHash('sha256').update(apiKey).digest('hex');

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx) => {
            const raceWinner = await tx.api_key.findFirst({
              where: {
                userId,
                created_source: request_source.labs,
                is_deleted: false,
              },
              select: {
                id: true,
              },
            });

            if (raceWinner) {
              return raceWinner;
            }

            return await tx.api_key.create({
              data: {
                key: apiKeyHash,
                key_index: keyIndex,
                label: 'labs',
                created_source: request_source.labs,
                user: {
                  connect: {
                    id: userId,
                  },
                },
              },
              select: {
                id: true,
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        const isRetryableConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2028');
        if (!isRetryableConflict || attempt === maxAttempts) {
          throw error;
        }
      }
    }

    throw new Error('Failed to resolve a user API key');
  }
}

@Global()
@Module({
  providers: [DeveloperSharedService],
  exports: [DeveloperSharedService],
})
export class DeveloperSharedModule {}
