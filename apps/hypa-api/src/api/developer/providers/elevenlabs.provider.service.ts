import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import errorCodes from '@hypa/config/json/error-codes';
import voiceConfig from '@hypa/config/json/voices';
import {
  ELEVENLABS_MAX_CHARACTERS,
  ElevenLabsAiService,
  ElevenLabsAsrResult,
  ElevenLabsTtsResult,
} from 'src/ai/elevenlabs.ai.service';
import {
  charge_type,
  developer_request_type,
} from 'src/generated/prisma/enums';
import {
  ChargeType,
  DeveloperSpeechToTextDto,
  DeveloperTtsDto,
  developerReqType,
} from '../developer.dto';
import { DeveloperSharedService } from './shared.service';
import { Prisma } from 'src/generated/prisma/client';

interface GenerateTtsParams {
  body: DeveloperTtsDto;
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

@Injectable()
export class ElevenLabsDeveloperService {
  constructor(
    private readonly shared: DeveloperSharedService,
    private readonly elevenLabs: ElevenLabsAiService,
  ) {}

  async generateTts(params: GenerateTtsParams) {
    const modelData = await this.shared.getModelInfo({
      provider: 'elevenlabs',
      model: params.body.model,
      type: 'TTS',
    });
    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    const inputRate = modelData.rates?.input;
    const outputRate = modelData.rates?.output;
    if (
      typeof inputRate !== 'number' ||
      !Number.isFinite(inputRate) ||
      typeof outputRate !== 'number' ||
      !Number.isFinite(outputRate) ||
      inputRate < 0 ||
      outputRate < 0 ||
      modelData.charge_type !== 'character_count'
    ) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    if (params.body.text.length > ELEVENLABS_MAX_CHARACTERS) {
      throw new BadRequestException({
        message: `This ElevenLabs model accepts at most ${ELEVENLABS_MAX_CHARACTERS.toLocaleString()} characters per request.`,
        code: errorCodes.INVALID_REQUEST.code,
      });
    }

    const languages = modelData.languages ?? [];
    const languageCodes = modelData.languageCodes ?? [];
    const requestedLanguage = params.body.language?.trim() || 'English';
    const languageIndex = languages.findIndex(
      (language) => language.toLowerCase() === requestedLanguage.toLowerCase(),
    );
    if (languageIndex < 0 || !languageCodes[languageIndex]) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_LANGUAGE.message} Supported languages: ${languages.join(', ')}`,
        code: errorCodes.INVALID_LANGUAGE.code,
      });
    }

    const language = languages[languageIndex];
    const languageCode = languageCodes[languageIndex];
    const languageKey = language.toLowerCase();
    const voicesForLanguage = modelData.voices?.[languageKey] ?? [];
    const requestedVoice = params.body.voice?.trim();
    const voice = requestedVoice
      ? voicesForLanguage.find(
          (candidate) =>
            candidate.toLowerCase() === requestedVoice.toLowerCase(),
        )
      : undefined;
    if (!voice) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_VOICE.message} Supported voices for "${language}": ${voicesForLanguage.join(', ')}`,
        code: errorCodes.INVALID_VOICE.code,
      });
    }

    const voiceId = voiceConfig.elevenlabs[voice];
    if (!voiceId) {
      throw new BadGatewayException({
        message: errorCodes.MODEL_UNAVAILABLE.message,
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    const characterCount = Array.from(params.body.text).length;
    const zeroTokens = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const rates = { input: inputRate, output: outputRate };
    const estimatedCost = this.shared.calculateCost({
      usage: zeroTokens,
      rates,
      chargeType: 'character_count',
      additionalData: { characterCount },
    });

    params.signal?.throwIfAborted();
    await this.shared.checkBalance(params.userId, estimatedCost);
    await this.shared.deductBalance(params.userId, estimatedCost);

    let result: ElevenLabsTtsResult;
    try {
      result = await this.elevenLabs.ttsRequest({
        text: params.body.text,
        voiceId,
        model: modelData.name,
        languageCode,
        baseUrl: modelData.base_apiURL,
        signal: params.signal,
      });
      params.signal?.throwIfAborted();
    } catch (error) {
      await this.shared.refundBalance(
        params.userId,
        estimatedCost,
        'ElevenLabs TTS API call failed',
      );
      throw error;
    }

    const usage = {
      ...zeroTokens,
      character_count: characterCount,
      ...(typeof result.character_cost === 'number' &&
      Number.isFinite(result.character_cost) &&
      result.character_cost >= 0
        ? { provider_character_cost: result.character_cost }
        : {}),
    };
    const actualCost = estimatedCost;

    await this.shared.recordDevRequest({
      body: { ...params.body, billing_usage: usage },
      type: developer_request_type.text_to_speech,
      usage,
      rates,
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      chargeType: charge_type.character_count,
      characterCount,
      actualCost,
    });

    return {
      response: {
        audio_b64: result.audio_b64,
        audio_type: result.audio_type,
        sample_rate: result.sample_rate,
      },
      usage,
      model: modelData.name,
      voice,
      language,
      provider: 'elevenlabs',
    };
  }

  async speechToText(params: SpeechToTextParams) {
    const modelData = await this.shared.getModelInfo({
      provider: 'elevenlabs',
      model: params.body.model,
      type: 'ASR',
    });
    if (!modelData) {
      throw new BadRequestException({
        message: errorCodes.INVALID_PROVIDER.message,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    const inputRate = modelData.rates?.input;
    const outputRate = modelData.rates?.output;
    const chargeType = modelData.charge_type as ChargeType | undefined;
    if (
      typeof inputRate !== 'number' ||
      !Number.isFinite(inputRate) ||
      typeof outputRate !== 'number' ||
      !Number.isFinite(outputRate) ||
      chargeType !== 'audio_minutes'
    ) {
      throw new BadGatewayException({
        message: 'Model rates unavailable',
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }

    const { base64, mimeType } = await this.shared.decodeAudio({
      audio: params.body.audio,
      audioType: params.body.audio_type,
      mimeType: params.body.mime_type,
    });
    const normalizedMimeType = mimeType?.split(';')[0].trim().toLowerCase();
    if (!normalizedMimeType?.startsWith('audio')) {
      throw new BadRequestException({
        message: errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }

    const audioBuffer = Buffer.from(base64, 'base64');
    if (audioBuffer.length === 0) {
      throw new BadRequestException({
        message: errorCodes.INVALID_FORMAT.message,
        code: errorCodes.INVALID_FORMAT.code,
      });
    }

    const audioDurationSeconds = await this.shared.getAudioDurationSeconds(
      audioBuffer,
      normalizedMimeType,
    );
    const rates = { input: inputRate, output: outputRate };
    const zeroTokens = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const estimatedCost = this.shared.calculateCost({
      usage: zeroTokens,
      rates,
      chargeType,
      additionalData: { audioDurationSeconds },
    });

    params.signal?.throwIfAborted();
    await this.shared.checkBalance(params.userId, estimatedCost);
    await this.shared.deductBalance(params.userId, estimatedCost);

    let result: ElevenLabsAsrResult;
    let actualCost: number;
    let billableSeconds: number;
    let outstanding = new Prisma.Decimal(estimatedCost);
    let failureStage = 'provider';
    try {
      result = await this.elevenLabs.asrRequest({
        audioBuffer,
        mimeType: normalizedMimeType,
        model: modelData.name,
        baseUrl: modelData.base_apiURL,
        signal: params.signal,
      });
      params.signal?.throwIfAborted();
      const duration = result.audio_duration_secs ?? audioDurationSeconds;
      if (
        !result.text.trim() ||
        typeof duration !== 'number' ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        throw new BadRequestException({
          message: errorCodes.INCOMPLETE_RESPONSE.message,
          code: errorCodes.INCOMPLETE_RESPONSE.code,
        });
      }
      billableSeconds = duration;
      actualCost = this.shared.calculateCost({
        usage: zeroTokens,
        rates,
        chargeType,
        additionalData: { audioDurationSeconds: billableSeconds },
      });
      failureStage = 'adjustment';
      const difference = new Prisma.Decimal(actualCost).minus(estimatedCost);
      if (difference.gt(0)) {
        await this.shared.deductBalance(params.userId, difference.toNumber());
        outstanding = outstanding.plus(difference);
      } else if (difference.lt(0)) {
        await this.shared.refundBalance(
          params.userId,
          difference.abs().toNumber(),
          'ElevenLabs ASR cost adjustment',
        );
        outstanding = outstanding.plus(difference);
      }
      params.signal?.throwIfAborted();
    } catch (error) {
      if (outstanding.gt(0)) {
        try {
          await this.shared.refundBalance(
            params.userId,
            outstanding.toNumber(),
            'ElevenLabs ASR failed or settlement incomplete',
          );
          outstanding = new Prisma.Decimal(0);
        } catch (refundError) {
          Logger.error({
            message: 'ElevenLabs ASR recovery refund failed',
            userId: params.userId,
            model: modelData.name,
            outstandingUsd: outstanding.toString(),
            failureStage,
            originalErrorName:
              error instanceof Error ? error.name : 'UnknownError',
            refundErrorName:
              refundError instanceof Error ? refundError.name : 'UnknownError',
          });
        }
      }
      throw error;
    }
    const transcript = result.text.trim();
    const usage = { ...zeroTokens, billable_seconds: billableSeconds };

    await this.shared.recordCompletedDevRequest({
      body: { ...params.body, billing_usage: usage },
      type: developer_request_type.speech_to_text,
      usage,
      rates,
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      chargeType,
      audioDurationSeconds: billableSeconds,
      actualCost,
    });

    return {
      response: { text: transcript },
      usage,
      model: modelData.name,
      provider: 'elevenlabs',
    };
  }
}
