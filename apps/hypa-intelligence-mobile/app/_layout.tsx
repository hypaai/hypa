import '@/global.css';

import { UserProvider } from '@/lib/user-provider';
import { DictionarySearchProvider } from '@/providers/dictionary-search-provider';
import { SettingsProvider } from '@/context/settings-context';
import { NAV_THEME } from '@/lib/theme';
import { ToastProvider } from '@/lib/toast';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Outfit_100Thin,
  Outfit_200ExtraLight,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
  useFonts,
} from '@expo-google-fonts/outfit';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUniwind } from 'uniwind';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { reopenTracker } from '@hypa/config/analytics-native';
import { analytics } from '@/lib/analytics';
import { captureInstallReferralCode } from '@/lib/install-referrer';
import { captureClipboardReferralCode } from '@/lib/clipboard-referrer';

export {
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { theme } = useUniwind();

  useEffect(() => {
    analytics.start();
    const subscription = AppState.addEventListener(
      'change',
      reopenTracker(() => analytics.appOpened())
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void (async () => {
      await captureInstallReferralCode();
      await captureClipboardReferralCode();
    })();
  }, []);

  const [fontsLoaded] = useFonts({
    Outfit_100Thin,
    Outfit_200ExtraLight,
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black,

    'ClashDisplay-Extralight': require('../assets/fonts/clash-display/ClashDisplay-Extralight.otf'),
    'ClashDisplay-Light': require('../assets/fonts/clash-display/ClashDisplay-Light.otf'),
    'ClashDisplay-Regular': require('../assets/fonts/clash-display/ClashDisplay-Regular.otf'),
    'ClashDisplay-Medium': require('../assets/fonts/clash-display/ClashDisplay-Medium.otf'),
    'ClashDisplay-Semibold': require('../assets/fonts/clash-display/ClashDisplay-Semibold.otf'),
    'ClashDisplay-Bold': require('../assets/fonts/clash-display/ClashDisplay-Bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <UserProvider>
          <DictionarySearchProvider>
            <ThemeProvider value={NAV_THEME[theme ?? 'light']}>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider>
                  <ToastProvider>
                    <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(entry)" options={{ headerShown: false }} />
                      <Stack.Screen name="refer" options={{ headerShown: false }} />
                      <Stack.Screen name="+not-found" />
                    </Stack>
                  </ToastProvider>
                </SafeAreaProvider>
              </GestureHandlerRootView>
              <PortalHost />
            </ThemeProvider>
          </DictionarySearchProvider>
        </UserProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
