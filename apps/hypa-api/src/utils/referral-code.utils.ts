import { randomInt } from 'crypto';

const REFERRAL_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_PREFIX = 'HYPA';
const REFERRAL_CODE_LENGTH = 6;

export const generateReferralCode = (): string => {
  let suffix = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    suffix += REFERRAL_CODE_CHARSET[randomInt(REFERRAL_CODE_CHARSET.length)];
  }
  return `${REFERRAL_CODE_PREFIX}-${suffix}`;
};
