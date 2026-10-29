import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { type Request } from 'express';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { DictionaryService } from './dictionary.service';
import { AuthGuard } from '../auth/auth.guard';
import { User } from 'src/libs/shared/decorator/user.decorator';
import { type UserType } from 'src/db-types';
import { OpenAiAiService } from 'src/ai/openai.ai.service';
import {
  DictionarySearchDto,
  DictionaryTranslateDto,
  DictionaryTTSRequestDto,
  GetDictionaryHistoryDto,
} from './dictionary.dto';
import { HypaAiAiService } from 'src/ai/hypaai.ai.service';
import { DeveloperSharedService } from 'src/api/developer/providers/shared.service';
import {
  LEGACY_MODELS_BY_CAPABILITY as models,
  type LegacyModel,
} from '@hypa/config/legacy-models';
import {
  GoogleAiService,
  GoogleVertexAiService,
} from 'src/ai/google.ai.service';
import { isVertexGoogleModel } from '@hypa/config/google-models';
import {
  ASTRA_MAX_COMPLETION_TOKENS,
  ASTRA_MIN_COMPLETION_TOKENS,
  isGpt6AstraModel,
} from 'src/ai/openai.model';
import { isAxiosError } from 'axios';
import errorCodes from '@hypa/config/json/error-codes';
import { ChatMessage, ChatSyncResult } from 'src/ai/ai.types';
import { buildDictionaryPrompt } from 'src/ai/prompts/dictionary.prompts';
import { parseTranslation } from '@hypa/translate-core/thinking';
import { abortOnDisconnect } from 'src/utils/request-abort';

const DICTIONARY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_ROUTER_PROVIDER = 'auto';

interface DictionaryAcRequest {
  provider: string;
  model: LegacyModel;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  top_p: number;
  top_k: number;
  signal?: AbortSignal;
}

interface DictionaryAcCandidate {
  provider: string;
  model: LegacyModel;
}

@UseGuards(AuthGuard)
@Controller('dictionary')
export class DictionaryController {
  private readonly logger = new Logger(DictionaryController.name);

  constructor(
    private readonly dictionaryService: DictionaryService,
    private readonly openAiService: OpenAiAiService,
    private readonly hypaAiService: HypaAiAiService,
    private readonly googleAiService: GoogleAiService,
    private readonly vertexAiService: GoogleVertexAiService,
    private readonly shared: DeveloperSharedService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private getSearchCacheKey(params: {
    word: string;
    language: string;
    modelName: string;
    provider?: string;
    culturalContext?: boolean;
    funFacts?: boolean;
    onlyCcAndFf?: boolean;
    outputLength?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
  }) {
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          word: params.word.trim().toLowerCase(),
          language: params.language.trim().toLowerCase(),
          modelName: params.modelName,
          provider: params.provider ?? AUTO_ROUTER_PROVIDER,
          culturalContext: Boolean(params.culturalContext),
          funFacts: Boolean(params.funFacts),
          onlyCcAndFf: Boolean(params.onlyCcAndFf),
          outputLength: params.outputLength ?? null,
          temperature: params.temperature ?? null,
          topP: params.topP ?? null,
          topK: params.topK ?? null,
        }),
      )
      .digest('hex');

    return `dictionary:search:v2:${hash}`;
  }

  private resolveAcProvider(provider?: string, modelName?: string) {
    const requested = provider?.trim();
    if (requested) return requested;

    const model = modelName?.trim();
    if (!model || model.toLowerCase() === AUTO_ROUTER_PROVIDER) {
      return AUTO_ROUTER_PROVIDER;
    }
    return (
      Object.keys(models.AC).find((candidate) =>
        models.AC[candidate]?.some((entry) => entry.name === model),
      ) ?? 'hypaai'
    );
  }

  private async resolveAcCandidates(
    provider: string,
    modelName: string | undefined,
    language: string,
    userId: string | undefined,
  ): Promise<DictionaryAcCandidate[]> {
    const hypaOnly = await this.shared.isHypaOnly(userId);

    if (provider !== AUTO_ROUTER_PROVIDER) {
      if (hypaOnly && provider !== 'hypaai') {
        throw new ForbiddenException(
          'Only Hypa models are available for your account tier',
        );
      }
      return [{ provider, model: this.resolveAcModel(provider, modelName) }];
    }

    const normalizedLanguage = language.trim().toLowerCase();
    const candidates = (
      hypaOnly ? ['hypaai'] : ['hypaai', 'google', 'openai']
    ).flatMap((candidateProvider) => {
      const supported = (models.AC[candidateProvider] ?? []).filter((model) =>
        model.languages.some(
          (candidateLanguage) =>
            candidateLanguage.toLowerCase() === normalizedLanguage,
        ),
      );
      const model =
        supported.find((candidate) => candidate.default) ?? supported[0];

      return model ? [{ provider: candidateProvider, model }] : [];
    });

    if (candidates.length === 0) {
      throw new BadRequestException({
        message: `No dictionary model supports ${language}.`,
        code: errorCodes.INVALID_MODEL.code,
      });
    }

    return candidates;
  }

  private resolveAcModel(provider: string, modelName?: string) {
    const providerModels = models.AC[provider] ?? [];

    if (providerModels.length === 0) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_PROVIDER.message} Provider "${provider}" has no dictionary model.`,
        code: errorCodes.INVALID_PROVIDER.code,
      });
    }

    const requested = modelName?.trim();
    if (!requested) {
      return providerModels.find((model) => model.default) ?? providerModels[0];
    }

    const match = providerModels.find((model) => model.name === requested);
    if (!match) {
      throw new BadRequestException({
        message: `${errorCodes.INVALID_MODEL.message} "${requested}" is not a dictionary model for "${provider}".`,
        code: errorCodes.INVALID_MODEL.code,
      });
    }

    return match;
  }

  private async runAcPrompt(
    request: DictionaryAcRequest,
  ): Promise<ChatSyncResult> {
    const { provider, model, messages, signal } = request;
    this.logger.debug({
      message: 'Dictionary prompt sent to AI provider',
      provider,
      model: model.name,
      messageCount: messages.length,
    });

    if (provider === 'hypaai') {
      return this.hypaAiService.chatSync(messages, model.base_apiURL!, {
        ...this.shared.resolveHypaAiUpstream(model),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        top_k: request.top_k,
        signal,
      });
    }

    if (provider === 'openai') {
      const isAstra = isGpt6AstraModel(model.name);
      const temperature = isAstra
        ? undefined
        : (model.fixedTemperature ?? request.temperature);

      return this.openAiService.chatSync(messages, model.name, {
        ...(isAstra
          ? {}
          : {
              temperature,
              top_p: request.top_p,
            }),
        max_tokens: isAstra
          ? Math.min(
              ASTRA_MAX_COMPLETION_TOKENS,
              Math.max(ASTRA_MIN_COMPLETION_TOKENS, request.max_tokens),
            )
          : Math.min(request.max_tokens, 2048),
        ...(model.reasoningEffort
          ? { reasoning_effort: model.reasoningEffort }
          : {}),
        ...(isAstra ? { omit_sampling: true } : {}),
        signal,
      });
    }

    if (provider === 'google') {
      return isVertexGoogleModel('AC', model.name)
        ? this.vertexAiService.chatSync(
            messages,
            model.name,
            model.base_apiURL!,
            {
              thinking: false,
              max_tokens: request.max_tokens,
              signal,
            },
          )
        : this.googleAiService.chatSync(
            messages,
            model.name,
            model.base_apiURL!,
            {
              thinking: false,
              temperature: request.temperature,
              top_p: request.top_p,
              top_k: request.top_k,
              max_tokens: request.max_tokens,
              signal,
            },
          );
    }

    throw new BadRequestException({
      message: `${errorCodes.INVALID_PROVIDER.message} Provider "${provider}" does not support dictionary lookups.`,
      code: errorCodes.INVALID_PROVIDER.code,
    });
  }

  private async runDictionaryLookup(
    body: DictionarySearchDto,
    language: string,
    candidate: DictionaryAcCandidate,
    signal: AbortSignal,
  ) {
    const messages: ChatMessage[] = buildDictionaryPrompt(
      language,
      body.word,
      undefined,
      candidate.provider,
    );
    const requestOptions = {
      provider: candidate.provider,
      model: candidate.model,
      messages,
      temperature: body.temperature ?? 0.3,
      max_tokens: body.output_length ?? 1500,
      top_p: body.top_p ?? 0.95,
      top_k: body.top_k ?? 40,
      signal,
    };
    const raw = body.only_cc_and_ff
      ? null
      : await this.runAcPrompt(requestOptions);
    const visibleContent = raw
      ? parseTranslation(raw.content).mainContent
      : undefined;
    if (raw && !visibleContent) {
      throw new ServiceUnavailableException({
        message: errorCodes.MODEL_UNAVAILABLE.message,
        code: errorCodes.MODEL_UNAVAILABLE.code,
      });
    }
    const parsed = raw
      ? this.dictionaryService.extractRawFromDict(visibleContent!, body.word)
      : { word: body.word };
    const [culturalResult, funFactResult] = await Promise.allSettled([
      body.cultural_context
        ? this.runAcPrompt({
            ...requestOptions,
            messages: buildDictionaryPrompt(
              language,
              body.word,
              { cultural_context: true },
              candidate.provider,
            ),
          }).then((result) => {
            const content = parseTranslation(result.content).mainContent;
            if (!content) throw new Error('Empty dictionary response');
            return this.dictionaryService.extractDescriptiveSection(content);
          })
        : Promise.resolve(undefined),
      body.fun_facts
        ? this.runAcPrompt({
            ...requestOptions,
            messages: buildDictionaryPrompt(
              language,
              body.word,
              { fun_fact: true },
              candidate.provider,
            ),
          }).then((result) => {
            const content = parseTranslation(result.content).mainContent;
            if (!content) throw new Error('Empty dictionary response');
            return this.dictionaryService.extractDescriptiveSection(content);
          })
        : Promise.resolve(undefined),
    ]);
    const cultural_context =
      culturalResult.status === 'fulfilled' ? culturalResult.value : undefined;
    const fun_facts =
      funFactResult.status === 'fulfilled' ? funFactResult.value : undefined;

    for (const [name, result] of [
      ['cultural context', culturalResult],
      ['fun fact', funFactResult],
    ] as const) {
      if (result.status === 'rejected') {
        this.logger.warn({
          message: `Dictionary ${name} enrichment failed`,
          provider: candidate.provider,
          model: candidate.model.name,
          error:
            result.reason instanceof Error
              ? result.reason.name
              : 'ProviderError',
        });
      }
    }

    return {
      raw,
      messages,
      cacheable:
        culturalResult.status === 'fulfilled' &&
        funFactResult.status === 'fulfilled',
      response: {
        ...parsed,
        cultural_context,
        language,
        fun_facts,
      },
    };
  }

  @Post()
  async search(
    @Body() body: DictionarySearchDto,
    @User() user: UserType | undefined,
    @Req() req: Request,
  ) {
    const { signal, cleanup } = abortOnDisconnect(req);
    try {
      const lang = body.language ?? 'English';
      const provider = this.resolveAcProvider(body.provider, body.model_name);
      const candidates = await this.resolveAcCandidates(
        provider,
        body.model_name,
        lang,
        user?.id,
      );
      const cacheKeyFor = (candidate: DictionaryAcCandidate) =>
        this.getSearchCacheKey({
          word: body.word,
          language: lang,
          modelName: candidate.model.name,
          provider: candidate.provider,
          culturalContext: body.cultural_context,
          funFacts: body.fun_facts,
          onlyCcAndFf: body.only_cc_and_ff,
          outputLength: body.output_length,
          temperature: body.temperature,
          topP: body.top_p,
          topK: body.top_k,
        });

      let lookup: Awaited<ReturnType<typeof this.runDictionaryLookup>> | null =
        null;
      let cached: Record<string, unknown> | null = null;
      let cacheKey = '';
      let lastError: unknown;
      for (const candidate of candidates) {
        if (signal.aborted) throw signal.reason;
        const candidateKey = cacheKeyFor(candidate);
        const hit =
          await this.cacheManager.get<Record<string, unknown>>(candidateKey);

        if (
          hit &&
          (!body.cultural_context || hit.cultural_context != null) &&
          (!body.fun_facts || hit.fun_facts != null)
        ) {
          cached = hit;
          cacheKey = candidateKey;
          break;
        }

        try {
          lookup = await this.runDictionaryLookup(
            body,
            lang,
            candidate,
            signal,
          );
          cacheKey = candidateKey;
          break;
        } catch (error) {
          lastError = error;
          if (signal.aborted) throw signal.reason ?? error;
          if (provider !== AUTO_ROUTER_PROVIDER) throw error;
        }
      }

      if (cached) {
        if (user) {
          await this.dictionaryService
            .saveSearch({
              word: body.word,
              language: lang,
              result: { cacheKey, cached: true, parsed: cached },
              userId: user.id,
            })
            .catch((er) => console.log(er));
        }

        return cached;
      }

      if (!lookup) throw lastError;

      const { raw, messages, response } = lookup;

      if (lookup.cacheable) {
        await this.cacheManager.set(
          cacheKey,
          response,
          DICTIONARY_CACHE_TTL_MS,
        );
      }

      if (user) {
        await this.dictionaryService
          .saveSearch({
            word: body.word,
            language: lang,
            result: { raw, prompt: messages, parsed: response },
            userId: user.id,
          })
          .catch((er) => console.log(er));
        console.log('after saving...');
      }

      return response;
    } catch (error) {
      console.log(error);
      if (error instanceof HttpException) throw error;
      if (isAxiosError(error)) {
        if (error.response?.status == 503) {
          throw new ServiceUnavailableException({
            message: errorCodes.MODEL_UNAVAILABLE.message,
            code: errorCodes.MODEL_UNAVAILABLE.code,
          });
        }
        throw new InternalServerErrorException({
          message: 'Internal Server error',
        });
      }
      throw new InternalServerErrorException({
        message: 'Internal Server error',
      });
    } finally {
      cleanup();
    }
  }

  @Post('tts')
  async tts(@Body() body: DictionaryTTSRequestDto) {
    const word = body.text.trim();
    const voice = body.voice?.trim() || 'Eniola';

    if (!word || !voice) {
      throw new BadRequestException('Word and voice are required');
    }
    console.log('het here');

    return this.hypaAiService.tts({
      text: word,
      voice,
      presets: body.preset,
    });
  }

  @Post('translate')
  async translate(@Body() body: DictionaryTranslateDto) {
    const model = models.MT.hypaai.find((m) => m.default == true);

    if (!model) {
      throw new BadRequestException({
        message: 'Not Model Available.a',
      });
    }

    const outputText = await this.hypaAiService.translateFull({
      text: body.text,
      source_lang: body.source_lang,
      target_lang: body.target_lang,
      preset: {
        model: model.name,
      },
    });

    return {
      type: 'dictionary.translation.completed',
      output_text: outputText.split('</think>').at(-1)?.trim() ?? outputText,
      source_lang: body.source_lang,
      target_lang: body.target_lang,
    };
  }

  @Get('history')
  async getHistory(
    @Query() query: GetDictionaryHistoryDto,
    @User() user: UserType,
  ) {
    return this.dictionaryService.getHistory({
      query,
      userId: user.id,
    });
  }

  @Delete('history/:id')
  async deleteHistory(@Param('id') id: string, @User() user: UserType) {
    return this.dictionaryService.deleteSearch(id, user.id);
  }
}
