import { apiGet } from '.';

export type ReferralStatus = 'pending' | 'completed';

export type ReferredUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  created_at: string;
};

export type ReferralItem = {
  id: string;
  status: ReferralStatus;
  points_awarded: number;
  source_app: string | null;
  created_at: string;
  referred: ReferredUser | null;
};

type ReferralsMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ReferralsResponse = {
  message: string;
  data: ReferralItem[];
  meta: ReferralsMeta;
};

export async function getReferrals(
  page = 1,
  limit = 20,
): Promise<ReferralsResponse> {
  return apiGet<ReferralsResponse>('/profile/referrals', {
    params: { page, limit },
  });
}

export function referredDisplayName(referral: ReferralItem): string {
  const referred = referral.referred;
  if (!referred) return 'A friend';
  const name = [referred.first_name, referred.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || referred.email;
}
