import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { HER_VERSION, herScore } from '@hypa/config/her';
import {
  isAutoRoutableModel,
  MODELS_BY_CAPABILITY,
  type CapabilityModel,
} from '@hypa/config/models';
import { wilsonBound } from '@hypa/config/ranking';
import { supportsMtPair } from '@hypa/config/mt-pair-support';
import { EmptyError } from 'rxjs';
import { canonicalLanguage, normalizeAutoLanguagePair } from './auto-language';
import {
  assertUsableTranslation,
  EmptyTranslationError,
  ProviderConfigurationError,
} from '../mt/translation-output';
import type {
  AutoTier,
  BenchmarkStatus,
  AutoAttemptOutcome,
  AutoAttempt,
  AutoSummary,
  AutoProgress,
} from '@hypa/config/auto-routing';
export type {
  AutoTier,
  BenchmarkStatus,
  AutoAttemptOutcome,
  AutoAttempt,
  AutoSummary,
  AutoPreview,
  AutoProgress,
  AutoProgressType,
} from '@hypa/config/auto-routing';
import { DbService } from 'src/libs/db/db.service';
import { DeveloperSharedService } from '../../developer/providers/shared.service';
import { AutoAttemptBilling } from '../../developer/providers/translation-billing';
import {
  TranslateMtService,
  type MtTranslateInput,
} from '../mt/translate-mt.service';
import { createHash } from 'crypto';
import { parseTranslation } from '@hypa/translate-core/thinking';

const normalizeResolutionText = (text: string) =>
  (parseTranslation(text ?? '').mainContent ?? '').trim();

const DATASET_BY_CAPABILITY = { MT: 't2t' } as const;
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 12_000;
const DEADLINE_MS = 35_000;
const MIN_ATTEMPT_MS = 2_000;
const COOLDOWN_MS = 30_000;
const AUTO_PROGRESS_TTL_MS = DEADLINE_MS + 10_000;
const AUTO_RESOLUTION_TTL_MS = 60 * 60 * 1000;

interface AutoPlanEntry {
  provider: string;
  model: string;
  displayName: string;
  tier: AutoTier;
  her?: number;
  sampleCount?: number;
  rank?: number;
}

interface AutoPlan {
  entries: AutoPlanEntry[];
  benchmarkStatus: BenchmarkStatus;
}

interface AutoTerminalAttempt extends Omit<AutoAttempt, 'outcome'> {
  outcome: AutoAttemptOutcome | 'aborted';
  reason?: string;
}

interface AutoRunInput {
  text: string;
  sourceLang: string | null;
  targetLang: string;
  userId: string;
  apiKeyId?: string;
  preset: MtTranslateInput['preset'];
  requestId?: string;
}

interface AutoProgressState {
  events: AutoProgress[];
}

type MetricMap = Record<string, number>;
type LanguageMetricBucket = { metrics: MetricMap; sampleCount: number };

type BenchmarkRow = {
  provider: string;
  model: string;
  taskType?: string;
  datasetKey?: string;
  hidden?: boolean;
  metrics: unknown;
  sampleCount: number;
  language_metrics: unknown;
};

class AttemptTimeoutError extends Error {
  constructor() {
    super('Auto translation attempt timed out');
    this.name = 'AttemptTimeoutError';
  }
}

const asMetrics = (value: unknown): MetricMap | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, metric]) => typeof metric === 'number')) return null;
  return Object.fromEntries(entries);
};

const asLanguageMetricBucket = (
  value: unknown,
): LanguageMetricBucket | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const bucket = value as { metrics?: unknown; sampleCount?: unknown };
  const metrics = asMetrics(bucket.metrics);
  if (!metrics || typeof bucket.sampleCount !== 'number') return null;
  return { metrics, sampleCount: bucket.sampleCount };
};

const languageSet = (model: CapabilityModel): Set<string> =>
  new Set(
    model.languages
      .map((language) => canonicalLanguage(language))
      .filter((language): language is string => Boolean(language))
      .map((language) => language.toLowerCase()),
  );

const supportsLanguage = (model: CapabilityModel, language: string) =>
  languageSet(model).has(language.toLowerCase());

const getErrorStatus = (error: unknown): number | undefined => {
  if (error instanceof HttpException) return error.getStatus();
  const value = error as {
    status?: number;
    statusCode?: number;
    response?: { status?: number; statusCode?: number };
  };
  const status =
    value?.status ??
    value?.statusCode ??
    value?.response?.status ??
    value?.response?.statusCode;
  return typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
    ? status
    : undefined;
};

@Injectable()
export class AutoRouterService {
  @Inject(DeveloperSharedService)
  private readonly shared: DeveloperSharedService;
  private readonly logger = new Logger(AutoRouterService.name);

  constructor(
    private readonly db: DbService,
    private readonly translateMtService: TranslateMtService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async buildPlan({
    sourceLang,
    targetLang,
  }: {
    sourceLang: string | null;
    targetLang: string;
  }): Promise<AutoPlan> {
    const { sourceLang: normalizedSource, targetLang: normalizedTarget } =
      normalizeAutoLanguagePair({ sourceLang, targetLang });
    const sourceIsAutoDetect = normalizedSource === null;
    const candidates = Object.entries(MODELS_BY_CAPABILITY.MT).flatMap(
      ([provider, models]) =>
        models
          .filter((model) => {
            if (!isAutoRoutableModel(provider, model.name)) return false;
            if (
              !normalizedTarget ||
              !supportsLanguage(model, normalizedTarget)
            ) {
              return false;
            }
            if (
              normalizedSource &&
              !supportsLanguage(model, normalizedSource)
            ) {
              return false;
            }
            return (
              !(sourceIsAutoDetect && model.requiresSourceLanguage) &&
              supportsMtPair(provider, normalizedSource, normalizedTarget)
            );
          })
          .map((model) => ({ provider, model })),
    );

    if (candidates.length === 0) {
      throw new BadRequestException('No MT model supports this language pair');
    }

    let rows: BenchmarkRow[] = [];
    let benchmarkStatus: BenchmarkStatus = 'ok';
    try {
      rows = await this.db.benchmark_result.findMany({
        where: {
          taskType: 'MT',
          datasetKey: DATASET_BY_CAPABILITY.MT,
          hidden: false,
        },
        select: {
          provider: true,
          model: true,
          metrics: true,
          sampleCount: true,
          language_metrics: true,
        },
      });
    } catch (error) {
      benchmarkStatus = 'unavailable';
      try {
        this.logger.warn(
          `Auto benchmark query failed: ${this.errorClass(error)}`,
        );
      } catch {}
    }

    const rowsByModel = new Map<string, BenchmarkRow>();
    for (const row of rows) {
      rowsByModel.set(`${row.provider}:${row.model}`, row);
    }

    const scored = candidates.map(({ provider, model }) => {
      const row = rowsByModel.get(`${provider}:${model.name}`);
      const overall = row ? this.score(row.metrics, row.sampleCount) : null;
      let language: { her: number; sampleCount: number; rank: number } | null =
        null;

      if (row && normalizedTarget && row.language_metrics) {
        const buckets = row.language_metrics as Record<string, unknown>;
        const matchingBucket = Object.entries(buckets).find(
          ([languageName]) =>
            canonicalLanguage(languageName)?.toLowerCase() ===
            normalizedTarget.toLowerCase(),
        )?.[1];
        if (matchingBucket) {
          const bucket = asLanguageMetricBucket(matchingBucket);
          if (bucket) language = this.score(bucket.metrics, bucket.sampleCount);
        }
      }

      return { provider, model, overall, language };
    });

    if (
      benchmarkStatus === 'ok' &&
      !scored.some((item) => item.overall || item.language)
    ) {
      benchmarkStatus = 'no_scores';
    }

    const used = new Set<string>();
    const entries: AutoPlanEntry[] = [];
    const addTier = (
      tier: AutoTier,
      values: typeof scored,
      scoreKey: 'language' | 'overall' | null,
    ) => {
      const sorted = [...values].sort((a, b) =>
        this.compareScored(a, b, scoreKey),
      );
      for (const item of sorted) {
        const key = `${item.provider}:${item.model.name}`;
        if (used.has(key)) continue;
        const score = scoreKey ? item[scoreKey] : null;
        entries.push({
          provider: item.provider,
          model: item.model.name,
          displayName: item.model.displayName || item.model.name,
          tier,
          ...(score && {
            her: score.her,
            sampleCount: score.sampleCount,
            rank: score.rank,
          }),
        });
        used.add(key);
      }
    };

    addTier(
      'language',
      scored.filter((item) => item.language !== null),
      'language',
    );
    addTier(
      'overall',
      scored.filter((item) => item.language === null && item.overall !== null),
      'overall',
    );

    addTier(
      'default',
      scored.filter(({ model }) => model.default),
      null,
    );

    addTier(
      'unscored',
      scored.filter((item) => !used.has(`${item.provider}:${item.model.name}`)),
      null,
    );

    return { entries, benchmarkStatus };
  }

  async getProgress(
    userId: string,
    requestId: string,
  ): Promise<AutoProgress[]> {
    try {
      const state = await this.cacheManager.get<AutoProgressState>(
        this.progressKey(userId, requestId),
      );
      return state?.events ?? [];
    } catch {
      return [];
    }
  }

  async getCompletedResolution(userId: string, requestId: string) {
    const events = await this.getProgress(userId, requestId);
    const completed = events
      .slice()
      .reverse()
      .find(
        (event) => event.type === 'completed' && event.provider && event.model,
      );
    return completed?.provider && completed.model
      ? { provider: completed.provider, model: completed.model }
      : undefined;
  }

  async rememberResolution(params: {
    userId: string;
    sourceText: string;
    targetText: string;
    provider: string;
    model: string;
    auto: AutoSummary;
  }) {
    try {
      await this.cacheManager.set(
        this.resolutionKey(params.userId, params.sourceText, params.targetText),
        { provider: params.provider, model: params.model, auto: params.auto },
        AUTO_RESOLUTION_TTL_MS,
      );
    } catch {}
  }

  async getRememberedResolution(params: {
    userId: string;
    sourceText: string;
    targetText: string;
  }) {
    try {
      const stored = await this.cacheManager.get<{
        provider?: string;
        model?: string;
        auto?: AutoSummary;
      }>(
        this.resolutionKey(params.userId, params.sourceText, params.targetText),
      );
      return stored?.provider && stored.model
        ? { provider: stored.provider, model: stored.model, auto: stored.auto }
        : undefined;
    } catch {
      return undefined;
    }
  }

  async run({
    plan,
    input: originalInput,
    signal,
    execute,
  }: {
    plan: AutoPlan;
    input: AutoRunInput;
    signal: AbortSignal;
    execute?: (entry: AutoPlanEntry, signal: AbortSignal) => Promise<string>;
  }): Promise<{ text: string; summary: AutoSummary }> {
    const input = {
      ...originalInput,
      ...normalizeAutoLanguagePair(originalInput),
    };
    const startedAt = Date.now();
    const deadline = startedAt + DEADLINE_MS;
    const attempts: AutoTerminalAttempt[] = [];
    const cooling = await this.coolingEntries(plan.entries);
    const available = plan.entries.filter(
      (entry) => !cooling.has(this.entryKey(entry)),
    );
    for (const entry of plan.entries) {
      if (signal.aborted) {
        this.logFinished(
          input,
          plan,
          attempts,
          'aborted',
          Date.now() - startedAt,
        );
        throw signal.reason ?? new Error('Request aborted');
      }

      const entryCooling = cooling.has(this.entryKey(entry));
      if (entryCooling && available.length > 0) {
        attempts.push({
          provider: entry.provider,
          model: entry.model,
          displayName: entry.displayName,
          outcome: 'skipped_cooldown',
          ms: 0,
          reason: 'Skipped because the model is cooling down',
        });
        continue;
      }

      const attemptCount = attempts.filter(
        (attempt) => attempt.outcome !== 'skipped_cooldown',
      ).length;
      const remaining = deadline - Date.now();
      if (attemptCount >= MAX_ATTEMPTS || remaining < MIN_ATTEMPT_MS) break;

      await this.publishProgress(input, {
        type: attemptCount > 0 ? 'fallback' : 'attempt',
        provider: entry.provider,
        model: entry.model,
        displayName: entry.displayName,
      });

      const attemptStartedAt = Date.now();
      const timeoutMs = Math.min(ATTEMPT_TIMEOUT_MS, remaining);
      let timedOut = false;
      const controller = new AbortController();
      const onRequestAbort = () => controller.abort(signal.reason);
      signal.addEventListener('abort', onRequestAbort, { once: true });
      if (signal.aborted) onRequestAbort();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let removeAbort: () => void = () => undefined;
      const billing = execute
        ? undefined
        : new AutoAttemptBilling(this.shared, input.userId);

      try {
        const providerPromise = execute
          ? execute(entry, controller.signal)
          : this.translateMtService.translate({
              provider: entry.provider,
              model: entry.model,
              text: input.text,
              sourceLang: input.sourceLang,
              targetLang: input.targetLang,
              preset: input.preset,
              userId: input.userId,
              ...(input.apiKeyId && { apiKeyId: input.apiKeyId }),
              signal: controller.signal,
              validateOutput: assertUsableTranslation,
              billing,
            });
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort(new AttemptTimeoutError());
            reject(new AttemptTimeoutError());
          }, timeoutMs);
        });
        const abortPromise = new Promise<never>((_, reject) => {
          const onAbort = () => {
            const reason = signal.reason;
            reject(
              reason instanceof Error ? reason : new Error('Request aborted'),
            );
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
          removeAbort = () => signal.removeEventListener('abort', onAbort);
        });

        const text = await Promise.race([
          providerPromise,
          timeoutPromise,
          abortPromise,
        ]);
        if (signal.aborted) throw signal.reason ?? new Error('Request aborted');
        assertUsableTranslation(text);
        if (timeoutId) clearTimeout(timeoutId);
        await billing?.accept();

        const ms = Date.now() - attemptStartedAt;
        attempts.push({
          provider: entry.provider,
          model: entry.model,
          displayName: entry.displayName,
          outcome: 'ok',
          ms,
        });
        const summary = this.summary(plan, entry, attempts);
        await this.publishProgress(input, {
          type: 'completed',
          provider: entry.provider,
          model: entry.model,
          displayName: entry.displayName,
        });
        this.logFinished(input, plan, attempts, 'ok', Date.now() - startedAt);
        return { text, summary };
      } catch (error) {
        controller.abort();
        await billing?.abandon();
        if (signal.aborted) {
          attempts.push({
            provider: entry.provider,
            model: entry.model,
            displayName: entry.displayName,
            outcome: 'aborted',
            ms: Date.now() - attemptStartedAt,
            reason: 'Request was aborted before the provider returned',
          });
          this.logFinished(
            input,
            plan,
            attempts,
            'aborted',
            Date.now() - startedAt,
          );
          throw error;
        }

        const ms = Date.now() - attemptStartedAt;
        const outcome: AutoAttemptOutcome = timedOut ? 'timeout' : 'error';
        attempts.push({
          provider: entry.provider,
          model: entry.model,
          displayName: entry.displayName,
          outcome,
          ms,
          reason: this.failureReason(error),
        });
        try {
          this.logger.warn({
            event: 'auto_router.attempt_failed',
            provider: entry.provider,
            model: entry.model,
            errorClass: this.errorClass(error),
            status: getErrorStatus(error),
            reason: this.failureReason(error),
            ms,
          });
        } catch {}

        if (!this.isRetryable(error)) {
          this.logFinished(
            input,
            plan,
            attempts,
            'error',
            Date.now() - startedAt,
          );
          throw error;
        }

        await this.setCooling(entry);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        removeAbort();
        signal.removeEventListener('abort', onRequestAbort);
      }
    }

    this.logFinished(
      input,
      plan,
      attempts,
      'unavailable',
      Date.now() - startedAt,
    );
    await this.publishProgress(input, { type: 'failed' });
    throw new ServiceUnavailableException(
      'Translation is temporarily unavailable. Please try again.',
    );
  }

  private score(metrics: unknown, sampleCount: number) {
    const parsed = asMetrics(metrics);
    const her = parsed ? herScore(parsed) : null;
    if (
      her === null ||
      !Number.isFinite(her) ||
      !Number.isFinite(sampleCount) ||
      sampleCount <= 0
    ) {
      return null;
    }
    return {
      her,
      sampleCount,
      rank: wilsonBound(her, sampleCount, 'upper'),
    };
  }

  private compareScored(
    a: {
      provider: string;
      model: CapabilityModel;
      language: ReturnType<AutoRouterService['score']>;
      overall: ReturnType<AutoRouterService['score']>;
    },
    b: {
      provider: string;
      model: CapabilityModel;
      language: ReturnType<AutoRouterService['score']>;
      overall: ReturnType<AutoRouterService['score']>;
    },
    scoreKey: 'language' | 'overall' | null,
  ) {
    const aScore = scoreKey ? a[scoreKey] : null;
    const bScore = scoreKey ? b[scoreKey] : null;
    if (aScore && bScore && Math.abs(aScore.rank - bScore.rank) > 1e-6) {
      return aScore.rank - bScore.rank;
    }
    const sampleDifference =
      (bScore?.sampleCount ?? 0) - (aScore?.sampleCount ?? 0);
    if (sampleDifference !== 0) return sampleDifference;
    if (a.provider === 'hypaai' && b.provider !== 'hypaai') return -1;
    if (b.provider === 'hypaai' && a.provider !== 'hypaai') return 1;
    return `${a.provider}:${a.model.name}`.localeCompare(
      `${b.provider}:${b.model.name}`,
    );
  }

  private async coolingEntries(entries: AutoPlanEntry[]) {
    const cooling = new Set<string>();
    for (const entry of entries) {
      try {
        if (await this.cacheManager.get(this.cooldownKey(entry))) {
          cooling.add(this.entryKey(entry));
        }
      } catch {
        return new Set<string>();
      }
    }
    return cooling;
  }

  private async setCooling(entry: AutoPlanEntry) {
    try {
      await this.cacheManager.set(this.cooldownKey(entry), true, COOLDOWN_MS);
    } catch {}
  }

  private entryKey(entry: AutoPlanEntry) {
    return `${entry.provider}:${entry.model}`;
  }

  private cooldownKey(entry: AutoPlanEntry) {
    return `auto-cooldown:MT:${entry.provider}:${entry.model}`;
  }

  private progressKey(userId: string, requestId: string) {
    return `auto-progress:MT:${userId}:${requestId}`;
  }

  private resolutionKey(
    userId: string,
    sourceText: string,
    targetText: string,
  ) {
    const hash = createHash('sha256')
      .update(
        `${normalizeResolutionText(sourceText)}\u0000${normalizeResolutionText(targetText)}`,
      )
      .digest('hex');
    return `auto-resolution:MT:${userId}:${hash}`;
  }

  private async publishProgress(
    input: AutoRunInput,
    progress: Omit<AutoProgress, 'sequence'>,
  ) {
    if (!input.requestId) return;

    try {
      const key = this.progressKey(input.userId, input.requestId);
      const previous = await this.cacheManager.get<AutoProgressState>(key);
      const event: AutoProgress = {
        ...progress,
        sequence: (previous?.events.at(-1)?.sequence ?? 0) + 1,
      };
      await this.cacheManager.set(
        key,
        {
          events: [...(previous?.events ?? []), event].slice(-10),
        },
        AUTO_PROGRESS_TTL_MS,
      );
    } catch {}
  }

  private summary(
    plan: AutoPlan,
    entry: AutoPlanEntry,
    attempts: AutoTerminalAttempt[],
  ): AutoSummary {
    return {
      policy: 'auto-mt-1',
      herVersion: HER_VERSION,
      benchmarkStatus: plan.benchmarkStatus,
      tier: entry.tier,
      ...(entry.her !== undefined ? { her: entry.her } : {}),
      ...(entry.sampleCount !== undefined
        ? { sampleCount: entry.sampleCount }
        : {}),
      attempts: attempts
        .filter(
          (
            attempt,
          ): attempt is AutoTerminalAttempt & { outcome: AutoAttemptOutcome } =>
            attempt.outcome !== 'aborted',
        )
        .map(({ provider, model, displayName, outcome, ms }) => ({
          provider,
          model,
          displayName,
          outcome,
          ms,
        })),
    };
  }

  private isRetryable(error: unknown) {
    if (
      error instanceof AttemptTimeoutError ||
      error instanceof EmptyTranslationError ||
      error instanceof EmptyError ||
      error instanceof ProviderConfigurationError
    ) {
      return true;
    }
    const value = error as { code?: string };
    const status = getErrorStatus(error);
    if (status === 401 || status === 403) return false;
    if (status !== undefined) return status === 429 || status >= 500;

    const code = value?.code?.toUpperCase() ?? '';
    if (
      [
        'ECONNABORTED',
        'ETIMEDOUT',
        'ECONNRESET',
        'ENOTFOUND',
        'ERR_NETWORK',
        'ECONNREFUSED',
        'EAI_AGAIN',
        'EHOSTUNREACH',
        'ENETUNREACH',
      ].includes(code)
    ) {
      return true;
    }
    return false;
  }

  private errorClass(error: unknown) {
    if (error instanceof HttpException) return 'HttpException';
    if (error instanceof Error) return 'Error';
    return 'UnknownError';
  }

  private failureReason(error: unknown) {
    if (error instanceof AttemptTimeoutError)
      return 'Provider exceeded the attempt timeout';
    if (error instanceof EmptyTranslationError || error instanceof EmptyError)
      return 'Provider returned unusable output';
    if (error instanceof ProviderConfigurationError)
      return 'Provider configuration unavailable';
    const status = getErrorStatus(error);
    if (status === 401 || status === 403)
      return 'Provider authentication failed';
    if (status === 429) return 'Provider rate limit exceeded';
    if (status !== undefined && status >= 500)
      return 'Provider unavailable (HTTP ' + status + ')';
    if (status !== undefined && status >= 400)
      return 'Provider rejected the request (HTTP ' + status + ')';
    return this.isRetryable(error)
      ? 'Provider connection or configuration failure'
      : 'Provider request failed';
  }

  private logFinished(
    input: AutoRunInput,
    plan: AutoPlan,
    attempts: AutoTerminalAttempt[],
    outcome: string,
    totalMs: number,
  ) {
    try {
      this.logger.log({
        event: 'auto_router.finished',
        userId: input.userId,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        policy: 'auto-mt-1',
        benchmarkStatus: plan.benchmarkStatus,
        plan: plan.entries,
        attempts,
        attemptSummary: attempts.map((attempt, index) => {
          const label =
            attempt.outcome === 'ok'
              ? 'SUCCESS'
              : attempt.outcome === 'timeout'
                ? 'TIMEOUT'
                : attempt.outcome === 'error'
                  ? 'ERROR'
                  : attempt.outcome === 'aborted'
                    ? 'ABORTED'
                    : 'SKIPPED_COOLDOWN';
          const reason = attempt.reason ? `: ${attempt.reason}` : '';
          return `${index + 1}. ${attempt.displayName} (${attempt.provider}/${attempt.model}) ${label} in ${attempt.ms}ms${reason}`;
        }),
        outcome,
        totalMs,
      });
    } catch {}
  }
}
