import { YarnGptDeveloperService } from '../developer/providers/yarngpt.provider.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { type Request } from 'express';
import { defer, finalize, Observable, tap } from 'rxjs';
import { abortOnDisconnect } from 'src/utils/request-abort';
import {
  DeveloperMtDto,
  DeveloperMtThinkingDto,
  DeveloperSpeechToTextDto,
  DeveloperTtsDto,
} from '../developer/developer.dto';
import { DeveloperSharedService } from '../developer/providers/shared.service';
import { OpenAiDeveloperService } from '../developer/providers/openai.provider.service';
import { TranslateService } from './translate.service';
import { AuthGuard } from '../auth/auth.guard';
import { sanitizeForLog } from '../../utils/log-utils';
import { GoogleDeveloperService } from '../developer/providers/google.provider.service';
import { MansaDeveloperService } from '../developer/providers/mansa.provider.service';
import { ElevenLabsDeveloperService } from '../developer/providers/elevenlabs.provider.service';
import { MetaDeveloperService } from '../developer/providers/meta.provider.service';
import {
  isAutoRoutableModel,
  isContributorModel,
  MODELS_BY_CAPABILITY,
  supportsExplanation,
} from '@hypa/config/models';
import { resolveProviderForModelFromProviderMap } from '@hypa/config/settings-resolvers';
import type { AutoSummary } from '@hypa/config/auto-routing';
import { AutoRouterService } from './auto-router/auto-router.service';

const MAX_THINKING_RETRIES = 2;

@UseGuards(AuthGuard)
@Controller('v2/translate')
export class TranslateController {
  @Inject(AutoRouterService)
  private readonly autoRouter: AutoRouterService;

  @Inject(YarnGptDeveloperService)
  private readonly yarnGptDev: YarnGptDeveloperService;

  private readonly logger = new Logger(TranslateController.name);

  constructor(
    private readonly translateService: TranslateService,
    private readonly openAiDev: OpenAiDeveloperService,
    private readonly googleDev: GoogleDeveloperService,
    private readonly mansaDev: MansaDeveloperService,
    private readonly sharedService: DeveloperSharedService,
    @Inject(ElevenLabsDeveloperService)
    private readonly elevenLabsDev: ElevenLabsDeveloperService,
    private readonly metaDev: MetaDeveloperService,
  ) {}

  private logRequest(route: string, req: Request, body: unknown) {
    this.logger.log({
      message: `/v2/translate/${route} request`,
      method: req.method,
      path: req.url,
      hasAuthorization: Boolean(req.headers.authorization),
      userId: req['userId'],
      apiKeyId: req['apiKeyId'],
      body: sanitizeForLog(body),
    });
  }

  private logResponse(route: string, response: unknown) {
    this.logger.log({
      message: `/v2/translate/${route} response`,
      response: sanitizeForLog(response),
    });
  }

  private async resolveProductCaller(req: Request) {
    const user = req['user'] as { id?: string } | undefined;
    const userId = (req['userId'] as string | undefined) || user?.id;

    if (!userId) {
      return { userId: undefined, apiKeyId: undefined };
    }

    const existingApiKeyId = req['apiKeyId'] as string | undefined;
    const apiKeyId =
      existingApiKeyId ||
      (await this.sharedService.findOrCreateUserApiKey(userId)).id;

    req['userId'] = userId;
    req['apiKeyId'] = apiKeyId;

    return { userId, apiKeyId };
  }

  private async requireProductUserId(req: Request) {
    const caller = await this.resolveProductCaller(req);

    if (!caller.userId) {
      throw new UnauthorizedException({
        message: 'Sign in to access translation history',
      });
    }

    return caller.userId;
  }

  @Post('mt')
  @Sse()
  async translateText(
    @Body() body: DeveloperMtDto,
    @Req() req: Request,
  ): Promise<Observable<{ data: string }>> {
    const caller = await this.resolveProductCaller(req);
    this.logRequest('mt', req, body);
    const hypaOnly = await this.sharedService.isHypaOnly(caller.userId);
    if (hypaOnly && body.provider !== 'auto' && body.provider !== 'hypaai') {
      throw new ForbiddenException(
        'Only Hypa models are available for your account tier',
      );
    }

    if (body.provider === 'auto') {
      if (!body.target_lang) {
        throw new BadRequestException('Target language is required');
      }

      const sourceLang =
        !body.source_lang || /^auto(?:[ -]?detect)?$/i.test(body.source_lang)
          ? null
          : body.source_lang;

      const plan = await this.autoRouter.buildPlan({
        sourceLang,
        targetLang: body.target_lang,
      });
      const allowedPlan = hypaOnly
        ? {
            ...plan,
            entries: plan.entries.filter(
              (entry) => entry.provider === 'hypaai',
            ),
          }
        : plan;
      if (!allowedPlan.entries.length) {
        throw new BadRequestException(
          'No allowed translation model supports this language pair',
        );
      }

      let cleanup = () => {};
      const detectedByAttempt = new Map<string, string | undefined>();

      return defer(async () => {
        const { signal, cleanup: cancel } = abortOnDisconnect(req);
        cleanup = cancel;

        const result = await this.autoRouter.run({
          plan: allowedPlan,
          input: {
            text: body.text,
            sourceLang,
            targetLang: body.target_lang!,
            userId: caller.userId ?? 'anonymous',
            apiKeyId: caller.apiKeyId,
            preset: body,
            requestId: body.client_request_id,
          },
          signal,
          execute: async (entry, signal) => {
            const direct = await this.translateService.translateDirect({
              body: {
                ...body,
                provider: entry.provider as DeveloperMtDto['provider'],
                model: entry.model,
                source_lang: sourceLang ?? undefined,
                target_lang: body.target_lang,
                stream: false,
                thinking: false,
              },
              signal,
              userId: caller.userId,
              apiKeyId: caller.apiKeyId,
            });
            detectedByAttempt.set(
              `${entry.provider}:${entry.model}`,
              direct.detectedSourceLang,
            );
            return direct.text;
          },
        });
        const winner = result.summary.attempts
          .slice()
          .reverse()
          .find((attempt) => attempt.outcome === 'ok');
        if (!winner) throw new Error('Auto Router found no successful model');

        const resolvedSourceLang =
          sourceLang ??
          detectedByAttempt.get(`${winner.provider}:${winner.model}`) ??
          null;

        const saved = await this.translateService.recordProductTranslation({
          userId: caller.userId,
          body: {
            ...body,
            provider: winner.provider as DeveloperMtDto['provider'],
            model: winner.model,
            source_lang: resolvedSourceLang ?? body.source_lang,
          },
          outputText: result.text,
          autoResolution: result.summary,
        });
        const scope = this.resolutionScope(
          caller.userId,
          body.client_request_id?.trim(),
        );
        if (scope) {
          await this.autoRouter.rememberResolution({
            userId: scope,
            sourceText: body.text,
            targetText: result.text,
            provider: winner.provider,
            model: winner.model,
            auto: result.summary,
          });
        }
        return {
          data: JSON.stringify({
            choices: [{ message: { role: 'assistant', content: result.text } }],
            auto: result.summary,
            provider: winner.provider,
            model: winner.model,
            translationId: saved?.id,
            detected_source_lang: resolvedSourceLang,
            language: resolvedSourceLang,
            source_language: resolvedSourceLang,
          }),
        };
      }).pipe(finalize(() => cleanup()));
    }

    if (isContributorModel(body.provider, body.model)) {
      throw new BadRequestException(
        'Contributor models are only available in Lab and the developer API',
      );
    }

    if (
      body.provider === 'hypaai' ||
      body.provider === 'openai' ||
      body.provider === 'google' ||
      body.provider === 'meta' ||
      body.provider === 'mansa'
    ) {
      const { signal, cleanup } = abortOnDisconnect(req);
      try {
        const response$ = (await this.translateService.translateText({
          body,
          type: 'MT',
          userId: caller.userId,
          apiKeyId: caller.apiKeyId,
          signal,
        })) as Observable<{ data: string }>;

        return response$.pipe(
          tap((value) => this.logResponse('mt', value)),
          finalize(cleanup),
        );
      } catch (error) {
        cleanup();
        throw error;
      }
    }
    return this.sharedService.throwUnsupportedProviderError(body.provider);
  }

  private resolutionScope(userId?: string, requestId?: string) {
    if (userId) return userId;
    return requestId ? `anonymous:${requestId}` : undefined;
  }

  private async resolveAutoThinkingTarget(
    body: DeveloperMtThinkingDto,
    userId?: string,
  ): Promise<
    { provider: string; model: string; auto?: AutoSummary } | undefined
  > {
    const requestId = body.client_request_id?.trim();
    const byRequest =
      requestId && userId
        ? await this.autoRouter.getCompletedResolution(userId, requestId)
        : undefined;
    const scope = this.resolutionScope(userId, requestId);
    const remembered = scope
      ? await this.autoRouter.getRememberedResolution({
          userId: scope,
          sourceText: body.source_text,
          targetText: body.target_text,
        })
      : undefined;
    const byRecord =
      (byRequest ?? remembered)
        ? undefined
        : await this.translateService.findTranslationModel({
            userId,
            translationId: requestId,
            sourceText: body.source_text,
            targetText: body.target_text,
          });

    const hinted = body.model?.trim();
    const hintedProvider = hinted
      ? resolveProviderForModelFromProviderMap(
          MODELS_BY_CAPABILITY.MT,
          hinted,
          '',
        )
      : '';
    const byHint =
      hinted && hintedProvider && isAutoRoutableModel(hintedProvider, hinted)
        ? { provider: hintedProvider, model: hinted }
        : undefined;

    const selected = byRequest ?? remembered ?? byRecord ?? byHint;
    if (!selected) return undefined;

    const auto = [remembered, byRecord].find(
      (entry) =>
        entry?.provider === selected.provider && entry.model === selected.model,
    )?.auto;
    return { provider: selected.provider, model: selected.model, auto };
  }

  private async generateAutoThinking(
    body: DeveloperMtThinkingDto,
    req: Request,
    caller: { userId?: string; apiKeyId?: string },
    resolved?: { provider: string; model: string; auto?: AutoSummary },
  ) {
    const hypaOnly = await this.sharedService.isHypaOnly(caller.userId);
    const defaultAc =
      resolved &&
      MODELS_BY_CAPABILITY.AC[resolved.provider]?.find(
        (model) => model.default,
      );
    const steps = [
      resolved && {
        path: 'normal',
        provider: resolved.provider,
        model: resolved.model,
      },
      resolved &&
        defaultAc && {
          path: 'ac_fallback',
          provider: resolved.provider,
          model: defaultAc.name,
        },
    ];
    const tried: Array<{ provider: string; model: string }> = [];

    const { signal, cleanup } = abortOnDisconnect(req);
    try {
      for (const step of steps) {
        if (
          !step ||
          !supportsExplanation(step.provider) ||
          (hypaOnly && step.provider !== 'hypaai') ||
          !MODELS_BY_CAPABILITY.MT[step.provider]?.some(
            (model) => model.name === step.model,
          ) ||
          tried.some(
            (entry) =>
              entry.provider === step.provider && entry.model === step.model,
          )
        ) {
          continue;
        }
        tried.push({ provider: step.provider, model: step.model });
        this.logger.log({
          event: 'auto_thinking.route',
          path: step.path,
          provider: step.provider,
          model: step.model,
        });
        try {
          const response =
            await this.translateService.generateTranslationThinking({
              body: {
                ...body,
                provider: step.provider as DeveloperMtDto['provider'],
                model: step.model,
              },
              type: 'MT',
              userId: caller.userId,
              apiKeyId: caller.apiKeyId,
              signal,
            });
          this.logResponse('mt/thinking', response);
          return {
            ...response,
            provider: step.provider,
            model: step.model,
            auto: resolved?.auto,
          };
        } catch (error) {
          if (signal.aborted) throw error;
          this.logger.warn({
            event: 'auto_thinking.attempt_failed',
            path: step.path,
            provider: step.provider,
            model: step.model,
            errorClass: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }

      return await this.generateRoutedThinking({
        body,
        caller,
        hypaOnly,
        signal,
        exclude: tried,
        auto: resolved?.auto,
      });
    } finally {
      cleanup();
    }
  }

  private async generateRoutedThinking({
    body,
    caller,
    hypaOnly,
    signal,
    exclude,
    auto,
  }: {
    body: DeveloperMtThinkingDto;
    caller: { userId?: string; apiKeyId?: string };
    hypaOnly: boolean;
    signal: AbortSignal;
    exclude: Array<{ provider: string; model: string }>;
    auto?: AutoSummary;
  }) {
    const plan = await this.autoRouter.buildPlan({
      sourceLang: body.source_lang,
      targetLang: body.target_lang,
    });
    const entries = plan.entries.filter(
      (entry) =>
        supportsExplanation(entry.provider) &&
        (!hypaOnly || entry.provider === 'hypaai') &&
        !exclude.some(
          (tried) =>
            tried.provider === entry.provider && tried.model === entry.model,
        ),
    );
    const skipped = plan.entries
      .filter((entry) => !supportsExplanation(entry.provider))
      .map((entry) => `${entry.provider}:${entry.model}`);

    for (let retry = 0; ; retry++) {
      this.logger.log({
        event: 'auto_thinking.route',
        path:
          retry > 0
            ? 'router_retry'
            : skipped.length > 0
              ? 'skipped_unexplainable'
              : 'router',
        retry,
        skipped,
      });
      const responses = new Map<
        string,
        Awaited<ReturnType<TranslateService['generateTranslationThinking']>>
      >();
      try {
        const result = await this.autoRouter.run({
          plan: { ...plan, entries },
          input: {
            text: body.source_text,
            sourceLang: body.source_lang,
            targetLang: body.target_lang,
            userId: caller.userId ?? 'anonymous',
            apiKeyId: caller.apiKeyId,
            preset: body,
          },
          signal,
          execute: async (entry, attemptSignal) => {
            let response: Awaited<
              ReturnType<TranslateService['generateTranslationThinking']>
            >;
            try {
              response =
                await this.translateService.generateTranslationThinking({
                  body: {
                    ...body,
                    provider: entry.provider as DeveloperMtDto['provider'],
                    model: entry.model,
                  },
                  type: 'MT',
                  userId: caller.userId,
                  apiKeyId: caller.apiKeyId,
                  signal: attemptSignal,
                });
            } catch (error) {
              if (attemptSignal.aborted) throw error;
              throw new ServiceUnavailableException(
                'The model could not explain this translation',
              );
            }
            responses.set(`${entry.provider}:${entry.model}`, response);
            return response.thinking;
          },
        });
        const winner = result.summary.attempts
          .slice()
          .reverse()
          .find((attempt) => attempt.outcome === 'ok');
        const response =
          winner && responses.get(`${winner.provider}:${winner.model}`);
        if (!winner || !response) {
          throw new Error('Auto Router found no successful model');
        }
        this.logResponse('mt/thinking', response);
        return {
          ...response,
          provider: winner.provider,
          model: winner.model,
          auto,
        };
      } catch (error) {
        if (signal.aborted) throw error;
        if (retry >= MAX_THINKING_RETRIES) {
          throw new ServiceUnavailableException(
            'No model could explain this translation right now. Please try again.',
          );
        }
      }
    }
  }

  @Post('mt/thinking')
  async generateTranslationThinking(
    @Body() body: DeveloperMtThinkingDto,
    @Req() req: Request,
  ) {
    const caller = await this.resolveProductCaller(req);
    this.logRequest('mt/thinking', req, body);

    if (body.provider === 'auto') {
      const resolved = await this.resolveAutoThinkingTarget(
        body,
        caller.userId,
      );
      return this.generateAutoThinking(body, req, caller, resolved);
    }

    if (
      body.provider !== 'hypaai' &&
      (await this.sharedService.isHypaOnly(caller.userId))
    ) {
      throw new ForbiddenException(
        'Only Hypa models are available for your account tier',
      );
    }

    const { signal, cleanup } = abortOnDisconnect(req);
    try {
      const response = await this.translateService.generateTranslationThinking({
        body,
        type: 'MT',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
        signal,
      });
      this.logResponse('mt/thinking', response);
      return response;
    } finally {
      cleanup();
    }
  }

  @Post('tts')
  async generateTts(@Body() body: DeveloperTtsDto, @Req() req: Request) {
    const caller = await this.resolveProductCaller(req);
    this.logRequest('tts', req, body);

    if (body.provider === 'openai') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.openAiDev.generateTts({
        body,
        type: 'TTS',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('tts', response);
      return response;
    }
    if (body.provider === 'mansa' || body.provider === 'yarnGPT') {
      if (!caller.userId || !caller.apiKeyId)
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      const provider =
        body.provider === 'mansa' ? this.mansaDev : this.yarnGptDev;
      return provider.generateTts({
        body,
        type: 'TTS',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
    }
    if (body.provider === 'elevenlabs') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.elevenLabsDev.generateTts({
        body,
        type: 'TTS',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('tts', response);
      return response;
    }
    if (body.provider === 'google') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.googleDev.generateTts({
        body,
        type: 'TTS',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('tts', response);
      return response;
    }
    if (body.provider === 'hypaai') {
      const response = await this.translateService.generateTts({
        body,
        type: 'TTS',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('tts', response);
      return response;
    }
    return this.sharedService.throwUnsupportedProviderError(body.provider);
  }

  @Post('stt')
  async speechToText(
    @Body() body: DeveloperSpeechToTextDto,
    @Req() req: Request,
  ) {
    const caller = await this.resolveProductCaller(req);
    this.logRequest('stt', req, body);

    if (body.provider === 'openai') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.openAiDev.speechToText({
        body,
        type: 'ASR',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('stt', response);
      return response;
    }
    if (body.provider === 'elevenlabs') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.elevenLabsDev.speechToText({
        body,
        type: 'ASR',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('stt', response);
      return response;
    }
    if (body.provider === 'meta') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.metaDev.transcribe({
        body,
        type: 'ASR',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('stt', response);
      return response;
    }
    if (body.provider === 'google') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.googleDev.speechToText({
        body,
        type: 'ASR',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('stt', response);
      return response;
    }
    if (body.provider === 'hypaai') {
      const response = await this.translateService.speechToText({
        body,
        type: 'ASR',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('stt', response);
      return response;
    }
    if (body.provider === 'mansa') {
      if (!caller.userId || !caller.apiKeyId) {
        return this.sharedService.throwUnsupportedProviderError(body.provider);
      }
      const response = await this.mansaDev.speechToText({
        body,
        type: 'ASR',
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
      });
      this.logResponse('stt', response);
      return response;
    }
    return this.sharedService.throwUnsupportedProviderError(body.provider);
  }

  @Get('history')
  async getHistory(
    @Req() req: Request,
    @Query('limit') limit = 20,
    @Query('filter') filter: 'all' | 'bookmarks' = 'all',
    @Query('cursor') cursor?: string,
  ) {
    const userId = await this.requireProductUserId(req);

    return this.translateService.getHistory({
      userId,
      limit: Number(limit),
      filter,
      cursor,
    });
  }

  @Post(':id/bookmark')
  async updateBookmark(
    @Param('id') id: string,
    @Body() body: { bookmarked: boolean },
    @Req() req: Request,
  ) {
    const userId = await this.requireProductUserId(req);

    return {
      success: true,
      data: await this.translateService.updateBookmark({
        id,
        userId,
        bookmarked: !!body.bookmarked,
      }),
    };
  }

  @Post(':id/feedback')
  async updateFeedback(
    @Param('id') id: string,
    @Body() body: { liked: boolean | null; correction?: string },
    @Req() req: Request,
  ) {
    const userId = await this.requireProductUserId(req);

    return {
      success: true,
      data: await this.translateService.updateFeedback({
        id,
        userId,
        liked: typeof body.liked === 'boolean' ? body.liked : null,
        correction:
          typeof body.correction === 'string' ? body.correction : undefined,
      }),
    };
  }

  @Delete(':id')
  async deleteTranslation(@Param('id') id: string, @Req() req: Request) {
    const userId = await this.requireProductUserId(req);
    return this.translateService.deleteTranslation(id, userId);
  }
}
