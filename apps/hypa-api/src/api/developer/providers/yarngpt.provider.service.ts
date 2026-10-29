import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import { YarnGptAiService } from 'src/ai/yarngpt.ai.service';
import { YarnGptOperationService } from './yarngpt-operation.service';
import {
  charge_type,
  developer_request_type,
} from 'src/generated/prisma/enums';
import { DeveloperTtsDto, developerReqType } from '../developer.dto';
import { DeveloperSharedService } from './shared.service';

@Injectable()
export class YarnGptDeveloperService {
  constructor(
    private readonly shared: DeveloperSharedService,
    private readonly operations: YarnGptOperationService,
  ) {}

  async generateTts(params: {
    body: DeveloperTtsDto;
    type: developerReqType;
    userId: string;
    apiKeyId: string;
    signal?: AbortSignal;
  }) {
    if (!process.env.YARNGPT_API_KEY)
      throw new ServiceUnavailableException('YarnGPT is unavailable');
    const model = this.shared.getModelInfo({
      provider: 'yarnGPT',
      model: params.body.model,
      type: 'TTS',
    });
    if (!model) throw new BadRequestException('Invalid YarnGPT model');
    const rate = model.rates?.input;
    if (
      model.charge_type !== 'character_count' ||
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      !model.timeout_ms ||
      model.timeout_ms <= 0
    ) {
      throw new BadGatewayException('YarnGPT model configuration unavailable');
    }
    const text = params.body.text.trim();
    const characterCount = Array.from(text).length;
    if (characterCount < 20 || characterCount > 15000)
      throw new BadRequestException('YarnGPT accepts 20 to 15,000 characters');
    const language = params.body.language ?? 'English';
    const languageIndex = model.languages.findIndex(
      (candidate) => candidate.toLowerCase() === language.toLowerCase(),
    );
    if (languageIndex < 0)
      throw new BadRequestException('Unsupported YarnGPT language');
    const canonicalLanguage = model.languages[languageIndex];
    const voice = params.body.voice ?? 'idera';
    if (!model.voices?.[canonicalLanguage.toLowerCase()]?.includes(voice))
      throw new BadRequestException('Unsupported YarnGPT voice');
    const usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      character_count: characterCount,
    };
    const rates = { input: rate, output: 0 };
    const cost = this.shared.calculateCost({
      usage,
      rates,
      chargeType: 'character_count',
      additionalData: { characterCount },
    });
    params.signal?.throwIfAborted();
    let audio: Awaited<ReturnType<YarnGptAiService['speech']>>;
    try {
      audio = await this.operations.execute(
        {
          userId: params.userId,
          apiKeyId: params.apiKeyId,
          model: model.name,
          text,
          voice,
          language: canonicalLanguage,
          apiUrl: String(model.base_apiURL),
          timeoutMs: model.timeout_ms,
          characterCount,
          rate,
          cost,
        },
        params.signal,
      );
    } catch (error) {
      if (params.signal?.aborted)
        throw new BadRequestException('Speech request cancelled');
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (error.code === 'ERR_CANCELED' || error.code === 'ECONNABORTED')
          throw new GatewayTimeoutException('YarnGPT timed out');
        if (status === 401 || status === 402 || status === 403)
          throw new ServiceUnavailableException('YarnGPT is unavailable');
        if (status === 429)
          throw new HttpException('YarnGPT is busy. Please retry later.', 429);
        if (status === 400 || status === 404 || status === 422)
          throw new BadRequestException('YarnGPT rejected the speech request');
      }
      if (error instanceof HttpException) throw error;
      if (
        (error instanceof Error || error instanceof DOMException) &&
        ['TimeoutError', 'AbortError'].includes(error.name)
      )
        throw new GatewayTimeoutException('YarnGPT timed out');
      throw new BadGatewayException('YarnGPT speech generation failed');
    }
    return {
      response: audio,
      usage,
      model: model.name,
      voice,
      language: canonicalLanguage,
      provider: 'yarnGPT',
    };
  }
}
