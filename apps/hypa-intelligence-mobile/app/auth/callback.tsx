import Body from '@/components/shared/body';
import { ErrorState, LoadingState, SuccessState } from '@/components/modules/auth-states';
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings';
import { loadKeyboardSettings } from '@/lib/keyboard-settings';
import { clearPendingReferralCode } from '@/lib/referral-code-store';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useUser } from '@/lib/user-provider';

type AuthStatus = 'loading' | 'success' | 'error';

const DEFAULT_ERROR = 'An error occurred while signing in.';

function normalizeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseTokenFromUrl(rawUrl?: string | null) {
  if (!rawUrl) {
    return null;
  }

  const [, hash = ''] = rawUrl.split('#');
  const queryStart = rawUrl.indexOf('?');
  const query = queryStart >= 0 ? rawUrl.slice(queryStart + 1).split('#')[0] : '';

  const queryParams = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);

  return queryParams.get('token') ?? hashParams.get('token');
}

const Callback = () => {
  const { url, token: routeToken } = useLocalSearchParams<{
    url?: string | string[];
    token?: string | string[];
  }>();
  const { setSettings } = useKeyboardSettings();

  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [errorMessage, setErrorMessage] = React.useState(DEFAULT_ERROR);
  const [retryKey, setRetryKey] = React.useState(0);
  const inflightRef = React.useRef(false);
  const processedTokenRef = React.useRef<string | null>(null);

  const rawUrl = normalizeParam(url);
  const directToken = normalizeParam(routeToken);
  const { refreshUser } = useUser();
  React.useEffect(() => {
    const token = directToken ?? parseTokenFromUrl(rawUrl);

    if (!token || token.length < 8) {
      setStatus('error');
      setErrorMessage('The callback did not include a valid token.');
      return;
    }

    if (inflightRef.current || processedTokenRef.current === token) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      const currentSettings = await loadKeyboardSettings();

      inflightRef.current = true;
      setStatus('loading');
      setErrorMessage(DEFAULT_ERROR);

      try {
        await setSettings({
          ...currentSettings,
          token,
        });
        refreshUser();

        await clearPendingReferralCode();

        if (!cancelled) {
          processedTokenRef.current = token;
          setStatus('success');
        }
      } catch (error) {
        try {
          await setSettings(currentSettings);
        } catch {}

        if (!cancelled) {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : DEFAULT_ERROR);
        }
      } finally {
        inflightRef.current = false;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [directToken, rawUrl, retryKey]);

  return (
    <Body showBackground={false}>
      <View className="flex-1 px-2">
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'success' ? <SuccessState onContinue={() => router.replace('/home')} /> : null}
        {status === 'error' ? (
          <ErrorState
            errorMessage={errorMessage}
            onRetry={() => {
              processedTokenRef.current = null;
              setStatus('loading');
              setErrorMessage(DEFAULT_ERROR);
              setRetryKey((current) => current + 1);
            }}
            onContinue={() => router.replace('/')}
          />
        ) : null}
      </View>
    </Body>
  );
};

export default Callback;
