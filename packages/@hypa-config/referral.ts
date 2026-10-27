const REFERRAL_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const REFERRAL_CODE_PATTERN = `HYPA-[${REFERRAL_CODE_CHARSET}]{6}`
const REFERRAL_CODE_RE = new RegExp(`^${REFERRAL_CODE_PATTERN}$`)
const REFERRAL_CODE_SEARCH_RE = new RegExp(REFERRAL_CODE_PATTERN)

export function isReferralCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && REFERRAL_CODE_RE.test(value.trim())
}

export function extractReferralCode(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.match(REFERRAL_CODE_SEARCH_RE)
  return match ? match[0] : null
}
