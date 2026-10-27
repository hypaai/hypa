import { getUser } from '@/api/user';
import { LoadingState } from '@/components/modules/auth-states';
import Body from '@/components/shared/body';
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings';
import { queryClient } from '@/lib/query-client';
import { useQuery } from '@tanstack/react-query';
import { analytics } from '@/lib/analytics';
import { router, usePathname } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { useHypaKeyboardStatus } from './use-hypa-keyboard-status';
import Requirements from '@/components/shared/requirements';

type UserContextValue = {
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<any | null>;
  user: any | null;
};

const defaultUserContextValue: UserContextValue = {
  loading: true,
  logout: async () => {},
  refreshUser: async () => null,
  user: null,
};

const UserContext = React.createContext<UserContextValue>(defaultUserContextValue);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { settings, setSettings, isLoading: settingsLoading } = useKeyboardSettings();
  const hasResolvedOnce = useRef(false);
  const pathname = usePathname();
  const { enabled } = useHypaKeyboardStatus();
  const userQ = useQuery({
    queryFn: getUser,
    queryKey: ['user'],
    enabled: !!settings?.token,
  });

  const userData = userQ?.data?.data;

  const value: UserContextValue = {
    loading: userQ.isLoading,
    logout: async () => {
      if (settings) {
        await setSettings({
          ...settings,
          token: '',
        });
      }

      queryClient.removeQueries({ queryKey: ['user'] });
    },
    refreshUser: userQ.refetch,
    user: userData ?? null,
  };

  useEffect(() => analytics.syncUser(userData?.id), [userData?.id]);

  useEffect(() => {
    if (userQ.isLoading) return;
    if (userQ.isError) {
      hasResolvedOnce.current = true;
      router.navigate('/');
      return;
    }

    if (userQ.isSuccess && userData) {
      hasResolvedOnce.current = true;
      router.navigate('/home');
      return;
    }
  }, [userQ.isLoading, userQ.isError, userQ.isSuccess, userData]);

  useEffect(() => {
    if (!settingsLoading && !settings?.token) {
      hasResolvedOnce.current = true;
    }
  }, [settingsLoading, settings?.token]);

  if (!enabled) {
    return (
      <Body showBackground={false}>
        <Requirements />
      </Body>
    );
  }
  const isAuthRoute = pathname.startsWith('/auth');
  const isInitialLoading =
    !isAuthRoute &&
    !hasResolvedOnce.current &&
    (settingsLoading || (!!settings?.token && userQ.isLoading));
  if (isInitialLoading) {
    return (
      <Body showBackground={false}>
        <LoadingState message="Please Wait" subMessage="we could use a moment." />
      </Body>
    );
  }
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return React.useContext(UserContext);
}
