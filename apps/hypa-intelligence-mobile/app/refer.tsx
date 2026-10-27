import React from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import Body from '@/components/shared/body';
import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  buildPlayStoreReferralUrl,
} from '@/constants/app';
import { savePendingReferralCode } from '@/lib/referral-code-store';

function firstParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveStoreUrl(code?: string): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/android/i.test(ua)) {
    return code ? buildPlayStoreReferralUrl(code) : PLAY_STORE_URL;
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    return APP_STORE_URL;
  }
  return 'https://hypaintelligence.com';
}

const Refer = () => {
  const { ref, code } = useLocalSearchParams<{ ref?: string; code?: string }>();

  React.useEffect(() => {
    const referralCode = firstParam(ref) ?? firstParam(code);

    const run = async () => {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.location.replace(resolveStoreUrl(referralCode));
        }
        return;
      }

      if (referralCode) {
        console.log('[Referral] referral code from deep link:', referralCode);
        await savePendingReferralCode(referralCode);
      }
      router.replace('/');
    };

    void run();
  }, [ref, code]);

  return (
    <Body showBackground={false}>
      <View className="flex-1 items-center justify-center">
        <Text
          className="text-zinc-500 dark:text-zinc-400"
          style={{ fontFamily: FONTS.main.regular }}>
          {Platform.OS === 'web' ? 'Taking you to the app...' : 'Setting things up...'}
        </Text>
      </View>
    </Body>
  );
};

export default Refer;
