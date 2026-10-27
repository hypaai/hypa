import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { APP_ID, REFERRAL_APP_LINK } from '@/constants/app';

export function buildReferralLink(code: string): string {
  const params = new URLSearchParams({ ref: code, app: APP_ID });
  return `${REFERRAL_APP_LINK}?${params.toString()}`;
}

function buildInviteMessage(code: string, link: string): string {
  return `I've been using Hypa Intelligence to type and translate across African languages — you should try it. Use my code ${code} when you sign up: ${link}`;
}

export async function shareInvite(code: string): Promise<boolean> {
  const link = buildReferralLink(code);
  const result = await Share.share(
    { message: buildInviteMessage(code, link) },
    { dialogTitle: 'Invite a friend to Hypa' }
  );
  return result.action === Share.sharedAction;
}

export async function copyReferralCode(code: string): Promise<void> {
  await Clipboard.setStringAsync(code);
}

export async function copyReferralLink(code: string): Promise<void> {
  await Clipboard.setStringAsync(buildReferralLink(code));
}
