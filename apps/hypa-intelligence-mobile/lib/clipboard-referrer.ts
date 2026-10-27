import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { extractReferralCode } from '@hypa/config/referral';

import { getPendingReferralCode, savePendingReferralCode } from '@/lib/referral-code-store';

const CLIPBOARD_REFERRAL_CHECKED_KEY = 'hypa.clipboardReferralChecked';

export async function readReferralCodeFromClipboard(): Promise<string | null> {
  const hasString = await Clipboard.hasStringAsync();
  if (!hasString) return null;

  const contents = await Clipboard.getStringAsync();
  return extractReferralCode(contents);
}

export async function captureClipboardReferralCode(): Promise<void> {
  const alreadyChecked = await AsyncStorage.getItem(CLIPBOARD_REFERRAL_CHECKED_KEY);
  if (alreadyChecked) return;

  try {
    if (await getPendingReferralCode()) return;

    const code = await readReferralCodeFromClipboard();
    if (!code) return;

    await savePendingReferralCode(code);
  } finally {
    await AsyncStorage.setItem(CLIPBOARD_REFERRAL_CHECKED_KEY, '1');
  }
}
