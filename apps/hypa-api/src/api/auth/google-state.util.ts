import { createHmac, timingSafeEqual } from 'node:crypto';

const GOOGLE_STATE_VERSION = '1';
const GOOGLE_STATE_MAX_AGE_SECONDS = 10 * 60;
const GOOGLE_STATE_CLOCK_SKEW_SECONDS = 30;

interface GoogleOAuthState {
  app?: string;
  refCode?: string;
}

const getGoogleStateSecret = () =>
  process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.JWT_SECRET;

const isMatchingSignature = (value: string, signature: string) => {
  const expected = Buffer.from(value, 'base64url');
  const actual = Buffer.from(signature, 'base64url');

  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const encodeGoogleState = (state: GoogleOAuthState): string => {
  const params = new URLSearchParams();
  const stateSecret = getGoogleStateSecret();
  if (!stateSecret) {
    throw new Error('Google OAuth state signing secret is not configured');
  }

  params.set('version', GOOGLE_STATE_VERSION);
  params.set('issuedAt', `${Math.floor(Date.now() / 1_000)}`);
  params.set('app', state.app || 'chat');
  if (state.refCode) {
    params.set('refCode', state.refCode);
  }
  const payload = params.toString();
  const signature = createHmac('sha256', stateSecret)
    .update(payload)
    .digest('base64url');
  params.set('signature', signature);

  return params.toString();
};

const decodeVerifiedGoogleState = (
  value: unknown,
): GoogleOAuthState | undefined => {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  const stateSecret = getGoogleStateSecret();
  if (!stateSecret) {
    return undefined;
  }

  const params = new URLSearchParams(value);
  const signature = params.get('signature');
  if (!signature || params.getAll('signature').length !== 1) {
    return undefined;
  }

  params.delete('signature');
  const expectedSignature = createHmac('sha256', stateSecret)
    .update(params.toString())
    .digest('base64url');
  if (!isMatchingSignature(expectedSignature, signature)) {
    return undefined;
  }

  const issuedAt = Number(params.get('issuedAt'));
  const now = Math.floor(Date.now() / 1_000);
  if (
    params.get('version') !== GOOGLE_STATE_VERSION ||
    !Number.isSafeInteger(issuedAt) ||
    issuedAt > now + GOOGLE_STATE_CLOCK_SKEW_SECONDS ||
    now - issuedAt > GOOGLE_STATE_MAX_AGE_SECONDS
  ) {
    return undefined;
  }

  const app = params.get('app') ?? undefined;
  const refCode = params.get('refCode') ?? undefined;
  if (!app) {
    return undefined;
  }

  return { app, refCode };
};

export const isGoogleStateValid = (state?: unknown): boolean =>
  Boolean(decodeVerifiedGoogleState(state));

export const decodeGoogleState = (state?: unknown): GoogleOAuthState => {
  return decodeVerifiedGoogleState(state) ?? {};
};
