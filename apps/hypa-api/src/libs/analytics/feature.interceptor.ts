import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { ANALYTICS } from '@hypa/config/analytics';
import { AnalyticsService } from './analytics.service';
import { FEATURE_META, FeatureMeta } from './feature.decorator';
import { getRequestContext } from './request-context';
import { environment, short } from './usage-event';

const errorDetails = (error: unknown) => {
  const status = error instanceof HttpException ? error.getStatus() : 500;
  const response =
    error instanceof HttpException ? error.getResponse() : undefined;
  const code =
    typeof response === 'object' && response !== null && 'code' in response
      ? String((response as { code: unknown }).code)
      : String(status);
  const stage =
    status === 408 || status === 504
      ? 'timeout'
      : status === 502 || status === 503
        ? 'provider'
        : status >= 400 && status < 500
          ? 'validation'
          : 'internal';

  return { error_code: short(code) ?? String(status), error_stage: stage };
};

@Injectable()
export class FeatureInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly analytics: AnalyticsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<FeatureMeta | undefined>(
      FEATURE_META,
      context.getHandler(),
    );

    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest();
    const startedAt = Date.now();
    const report = (error?: unknown) => {
      const ctx = getRequestContext();
      error ??= ctx?.failure;
      const userId: string | undefined =
        typeof request.userId === 'string' ? request.userId : undefined;
      const distinctId = userId ?? ctx?.anonId;

      if (!ctx || !distinctId) return;
      const body = request.body ?? {};
      const capability = ctx.capability ?? meta.capability;
      const lookup = capability === 'lookup';

      void this.analytics.capture({
        event: error ? ANALYTICS.events.failed : ANALYTICS.events.completed,
        distinctId,
        userId,
        properties: {
          product: ctx.product,
          surface: ctx.surface,
          feature: ctx.feature ?? meta.feature,
          capability,
          provider: ctx.provider ?? short(body.provider),
          model: ctx.model ?? short(body.model),
          workflow_id: ctx.workflowId,
          latency_ms: Date.now() - startedAt,
          source_lang: short(body.source_lang ?? body.language),
          target_lang: short(body.target_lang),
          api_key_id:
            ctx.product === ANALYTICS.defaults.product &&
            typeof request.apiKeyId === 'string'
              ? request.apiKeyId
              : undefined,
          app_version: ctx.appVersion,
          environment: environment(),
          ...(error
            ? errorDetails(error)
            : {
                unit_type: ctx.unitType ?? (lookup ? 'lookups' : undefined),
                units: ctx.units ?? (lookup ? 1 : undefined),
                cost_usd: ctx.costUsd,
              }),
        },
      });
    };

    return next.handle().pipe(
      tap({
        complete: () => report(),
        error: (error) => report(error ?? new Error('unknown')),
      }),
    );
  }
}
