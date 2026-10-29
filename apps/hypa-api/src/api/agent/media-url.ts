import { createHmac, timingSafeEqual } from 'crypto';

const HOUR_MS = 60 * 60 * 1000;

export function signMediaUrl(
  key: string,
  now: number,
  secret: string,
  ttlMs = HOUR_MS,
  path = '/v2/agent/media',
): string {
  const ttl = Math.min(Math.max(ttlMs, 1), HOUR_MS);
  const exp = now + ttl;
  const sig = createHmac('sha256', secret).update(`${key}.${exp}`).digest('hex');
  return `${path}?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`;
}

export function mediaSecret(): string {
  const secret = process.env.AGENT_MEDIA_SECRET;
  if (!secret) throw new Error('AGENT_MEDIA_SECRET must be set');
  return secret;
}

export function mediaBaseUrl(): string {
  const base = process.env.BASE_URL?.trim().replace(/\/+$/, '');
  const invalid = () => new Error(
    'BASE_URL must be set to an absolute HTTP(S) URL without credentials, query, or fragment',
  );
  if (!base) throw invalid();
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw invalid();
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.includes('?') || url.href.includes('#')) {
    throw invalid();
  }
  return url.href.replace(/\/+$/, '');
}

export function mediaUrl(key: string, now = Date.now(), path?: string): string {
  const secret = mediaSecret();
  return mediaBaseUrl() + signMediaUrl(key, now, secret, undefined, path);
}

export function verifyMediaUrl(
  key: string,
  exp: number,
  sig: string,
  now: number,
  secret: string,
): boolean {
  if (!Number.isFinite(exp) || exp <= now || exp - now > HOUR_MS) return false;
  const expected = createHmac('sha256', secret).update(`${key}.${exp}`).digest('hex');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function mediaOwner(key: string): string | null {
  const slash = key.indexOf('/');
  if (slash <= 0) return null;
  return key.slice(0, slash);
}
