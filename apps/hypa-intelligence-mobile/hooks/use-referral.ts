import { useInfiniteQuery } from '@tanstack/react-query';

import { getReferrals, type ReferralItem } from '@/api/referral';
import { buildReferralLink } from '@/lib/referral';
import { useUser } from '@/lib/user-provider';

const PAGE_SIZE = 20;

type UseReferralResult = {
  code: string | null;
  link: string | null;
  referrals: ReferralItem[];
  referredCount: number;
  hypaPoints: number;
  isSignedIn: boolean;
  isAuthLoading: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
};

export function useReferral(): UseReferralResult {
  const { user, loading: isAuthLoading } = useUser();
  const code: string | null = user?.referral_code ?? null;
  const hypaPoints: number = user?.referral_points ?? 0;

  const referralsQuery = useInfiniteQuery({
    queryKey: ['referrals', user?.id],
    enabled: !!user?.id,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getReferrals(pageParam, PAGE_SIZE),
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const pages = referralsQuery.data?.pages ?? [];
  const referrals = pages.flatMap((page) => page.data);
  const referredCount = pages[0]?.meta.total ?? referrals.length;

  return {
    code,
    link: code ? buildReferralLink(code) : null,
    referrals,
    referredCount,
    hypaPoints,
    isSignedIn: !!user,
    isAuthLoading,
    isLoading: referralsQuery.isLoading,
    isFetchingMore: referralsQuery.isFetchingNextPage,
    hasMore: !!referralsQuery.hasNextPage,
    loadMore: () => {
      if (referralsQuery.hasNextPage && !referralsQuery.isFetchingNextPage) {
        void referralsQuery.fetchNextPage();
      }
    },
    refetch: () => void referralsQuery.refetch(),
  };
}
