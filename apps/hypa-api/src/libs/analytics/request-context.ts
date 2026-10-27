import { getVoiceEnrollmentBilling } from 'src/utils/voice-enrollment-billing';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  ANALYTICS,
  capabilityForRequestType,
  normalizeDimension,
} from '@hypa/config/analytics';

interface RequestContext {
  product: string;
  surface: string;
  feature?: string;
  workflowId: string;
  anonId?: string;
  appVersion?: string;
  capability?: string;
  provider?: string;
  model?: string;
  unitType?: string;
  units?: number;
  costUsd?: number;
  failure?: unknown;
}

const storage = new AsyncLocalStorage<RequestContext>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { headers: HEADERS, defaults } = ANALYTICS;

const uuid = (value: string | undefined) =>
  value && UUID.test(value) ? value : undefined;

const header = (
  headers: Request['headers'],
  name: string,
  maxLength = 64,
): string | undefined => {
  const value = headers[name];
  const first = Array.isArray(value) ? value[0] : value;

  return typeof first === 'string' && first && first.length <= maxLength
    ? first.trim()
    : undefined;
};

const contextFromHeaders = (headers: Request['headers']): RequestContext => {
  return {
    product:
      normalizeDimension('products', header(headers, HEADERS.product)) ??
      defaults.product,
    surface:
      normalizeDimension('surfaces', header(headers, HEADERS.surface)) ??
      defaults.surface,
    feature: normalizeDimension('features', header(headers, HEADERS.feature)),
    workflowId: uuid(header(headers, HEADERS.workflowId, 36)) ?? randomUUID(),
    anonId: uuid(header(headers, HEADERS.anonId, 36)),
    appVersion: header(headers, HEADERS.appVersion, 32),
  };
};

export const requestContextMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => storage.run(contextFromHeaders(req.headers), next);

export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore();

export const updateRequestContext = (patch: Partial<RequestContext>) => {
  const context = storage.getStore();

  if (context) Object.assign(context, patch);
};

interface UsageDetails {
  type: string;
  body: { provider?: unknown; model?: unknown };
  usage: { total_tokens: number };
  chargeType?: string;
  audioDurationSeconds?: number;
  characterCount?: number;
  actualCost: number;
}

export const recordUsageInContext = ({
  type,
  body,
  usage,
  chargeType,
  audioDurationSeconds,
  characterCount,
  actualCost,
}: UsageDetails) => {
  const by = {
    character_count: ['characters', characterCount],
    audio_minutes: ['audio_seconds', audioDurationSeconds],
  } as const;
  const enrollment = getVoiceEnrollmentBilling(body);
  const [unitType, units] = enrollment
    ? (['enrollment', enrollment.quantity] as const)
    : (by[chargeType as keyof typeof by] ??
      (['tokens', usage.total_tokens] as const));

  updateRequestContext({
    capability: capabilityForRequestType(type),
    provider: typeof body.provider === 'string' ? body.provider : undefined,
    model: typeof body.model === 'string' ? body.model : undefined,
    unitType,
    units: typeof units === 'number' ? units : undefined,
    costUsd: actualCost,
  });
};
