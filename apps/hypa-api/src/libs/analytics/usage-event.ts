import { randomUUID } from 'crypto';
import { ANALYTICS } from '@hypa/config/analytics';

export const ALLOWED_PROPERTIES = new Set([
  'product',
  'surface',
  'feature',
  'capability',
  'provider',
  'model',
  'workflow_id',
  'trace_id',
  'latency_ms',
  'unit_type',
  'units',
  'cost_usd',
  'source_lang',
  'target_lang',
  'api_key_id',
  'error_code',
  'error_stage',
  'app_version',
  'environment',
  'is_internal',
  'backfill',
]);

export const short = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length <= 64 ? value : undefined;

export const parseDomains = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

export const parseEmails = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

export const isInternalEmail = (
  email: string | null | undefined,
  domains: string[],
  emails: string[] = [],
): boolean => {
  const address = email?.trim().toLowerCase();
  const domain = address?.split('@')[1];

  return (
    !!address &&
    (emails.includes(address) || (!!domain && domains.includes(domain)))
  );
};

export const environment = () =>
  process.env.NODE_ENV === 'production' ? 'production' : 'development';

export const webSocketSessionProperties = ({
  viaLabs,
  apiKeyId,
  startedAt,
  endedAt,
}: {
  viaLabs: boolean;
  apiKeyId?: string;
  startedAt: number;
  endedAt: number;
}) => {
  const { product, surface } = viaLabs
    ? ANALYTICS.apps['hypa-lab']
    : ANALYTICS.defaults;
  const ms = Math.max(0, endedAt - startedAt);

  return {
    product,
    surface,
    feature: 'transcribe',
    capability: 'asr',
    workflow_id: randomUUID(),
    latency_ms: ms,
    unit_type: 'audio_seconds',
    units: Math.round(ms / 1000),
    api_key_id: viaLabs ? undefined : apiKeyId,
    environment: environment(),
  };
};
