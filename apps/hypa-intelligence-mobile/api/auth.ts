import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { API_URL, apiPost } from '.';
import { APP_ID, KEYBOARD_AUTH_REDIRECT_URL } from '@/constants/app';

export async function loginWithGoogle(refCode?: string) {
  const params = new URLSearchParams({ app: APP_ID });
  const normalizedRefCode = refCode?.trim();
  if (normalizedRefCode) {
    params.set('refCode', normalizedRefCode);
  }

  const authUrl = `${API_URL}/auth/google?${params.toString()}`;
  const result = await WebBrowser.openAuthSessionAsync(
    authUrl,
    KEYBOARD_AUTH_REDIRECT_URL,
  );

  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in was canceled.');
  }
  return {
    url: result.url,
  };
}

type AuthResponse = {
  access_token: string;
};

export async function loginWithApple(
  refCode?: string,
): Promise<{ token: string } | null> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;

  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      return null;
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const normalizedRefCode = refCode?.trim();
  const { access_token } = await apiPost<AuthResponse>('/auth/apple', {
    identityToken: credential.identityToken,
    email: credential.email ?? undefined,
    first_name: credential.fullName?.givenName ?? undefined,
    last_name: credential.fullName?.familyName ?? undefined,
    app: APP_ID,
    ...(normalizedRefCode ? { refCode: normalizedRefCode } : {}),
  });

  return { token: access_token };
}

export async function loginWithEmail(input: {
  email: string;
  password: string;
}): Promise<{ token: string }> {
  const { access_token } = await apiPost<AuthResponse>('/auth/login', {
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });

  return { token: access_token };
}

export async function registerWithEmail(input: {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  refCode?: string;
}): Promise<{ token: string }> {
  const normalizedRefCode = input.refCode?.trim();
  const { access_token } = await apiPost<AuthResponse>('/auth/register', {
    email: input.email.trim().toLowerCase(),
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    password: input.password,
    app: APP_ID,
    ...(normalizedRefCode ? { refCode: normalizedRefCode } : {}),
  });

  return { token: access_token };
}
