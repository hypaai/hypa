import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_REFERRAL_CODE_KEY = 'hypa.pendingReferralCode';

export async function savePendingReferralCode(code: string): Promise<void> {
  const normalized = code.trim();
  if (!normalized) return;
  await AsyncStorage.setItem(PENDING_REFERRAL_CODE_KEY, normalized);
}

export async function getPendingReferralCode(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_REFERRAL_CODE_KEY);
}

export async function clearPendingReferralCode(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
}
