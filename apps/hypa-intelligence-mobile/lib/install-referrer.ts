import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getPendingReferralCode, savePendingReferralCode } from '@/lib/referral-code-store';

const INSTALL_REFERRER_CHECKED_KEY = 'hypa.installReferrerChecked';

function parseReferralCode(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const params = new URLSearchParams(referrer);
    const code = params.get('ref') || params.get('code');
    return code?.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

export async function captureInstallReferralCode(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const alreadyChecked = await AsyncStorage.getItem(INSTALL_REFERRER_CHECKED_KEY);
  if (alreadyChecked) return;

  try {
    const applicationModule = await import('expo-application').catch(() => null);
    const getInstallReferrerAsync = applicationModule?.getInstallReferrerAsync;

    if (!getInstallReferrerAsync) {
      return;
    }

    const referrer = await getInstallReferrerAsync();
    console.log('[Referral] install referrer:', referrer);
    const code = referrer ? parseReferralCode(referrer) : null;

    if (code) {
      console.log('[Referral] referral code from install referrer:', code);
      if (!(await getPendingReferralCode())) {
        await savePendingReferralCode(code);
      }
    }
  } finally {
    await AsyncStorage.setItem(INSTALL_REFERRER_CHECKED_KEY, '1');
  }
}
