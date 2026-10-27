import React from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { Check, Clock, Copy, Gift, Link2, Share2, Sparkles, Users } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';

import Body from '@/components/shared/body';
import Requirements from '@/components/shared/requirements';
import { SocialAuthButton } from '@/components/modules/auth/social-auth-button';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import { REFERRAL_POINTS_REWARD, buildReferralRewardSummary } from '@/constants/app';
import { referredDisplayName, type ReferralItem } from '@/api/referral';
import { loginWithApple, loginWithGoogle } from '@/api/auth';
import { useReferral } from '@/hooks/use-referral';
import { useHypaKeyboardStatus } from '@/lib/use-hypa-keyboard-status';
import { useThemeColors } from '@/hooks/use-theme-color';
import { copyReferralCode, copyReferralLink, shareInvite } from '@/lib/referral';
import { getPendingReferralCode } from '@/lib/referral-code-store';
import { goBackOrReturnTo } from '@/lib/navigation';
import { useToast } from '@/lib/toast';
import { BackButton } from '@/components/shared/back-button';

type StatCardProps = {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string;
};

const StatCard = ({ icon: IconComponent, label, value }: StatCardProps) => {
  const colors = useThemeColors();

  return (
    <View className="flex-1 rounded-2xl border border-zinc-100 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <IconComponent size={20} color={colors.iconMuted} strokeWidth={2.2} />
      <Text
        className="mt-3 text-[22px] text-zinc-900 dark:text-zinc-50"
        style={{ fontFamily: FONTS.main.semiBold }}>
        {value}
      </Text>
      <Text
        className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400"
        style={{ fontFamily: FONTS.main.regular }}>
        {label}
      </Text>
    </View>
  );
};

const formatJoinedDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

type ReferralRowProps = {
  item: ReferralItem;
  isLast: boolean;
};

const ReferralRow = ({ item, isLast }: ReferralRowProps) => {
  const completed = item.status === 'completed';
  const joined = formatJoinedDate(item.created_at);

  return (
    <View className={`py-4 ${isLast ? '' : 'border-b border-zinc-100 dark:border-zinc-800'}`}>
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text
            className="text-[15px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}
            numberOfLines={1}>
            {referredDisplayName(item)}
          </Text>
          {joined ? (
            <Text
              className="mt-0.5 text-[12px] text-zinc-400 dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.regular }}>
              Joined {joined}
            </Text>
          ) : null}
        </View>
        {completed ? (
          <View className="flex-row items-center gap-1">
            <Check size={15} color="#34C759" strokeWidth={2.8} />
            <Text
              className="text-[13px] text-green-600 dark:text-green-400"
              style={{ fontFamily: FONTS.main.semiBold }}>
              +{item.points_awarded} pts
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-1">
            <Clock size={14} color="#A1A1AA" strokeWidth={2.4} />
            <Text
              className="text-[13px] text-zinc-500 dark:text-zinc-400"
              style={{ fontFamily: FONTS.main.medium }}>
              Pending
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const HOW_IT_WORKS = [
  'Share your code with friends who type or translate in African languages.',
  'They download Hypa and enter your code when they sign up.',
  `Each friend who signs up with your code earns you ${REFERRAL_POINTS_REWARD} Hypa points.`,
];

const Referral = () => {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { enabled } = useHypaKeyboardStatus();
  const {
    code,
    referrals,
    referredCount,
    hypaPoints,
    isSignedIn,
    isAuthLoading,
    isLoading,
    isFetchingMore,
    hasMore,
    loadMore,
  } = useReferral();
  const colors = useThemeColors();
  const { showSuccess, showError } = useToast();
  const [copied, setCopied] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [isAppleLoading, setIsAppleLoading] = React.useState(false);

  if (!enabled) {
    return <Requirements />;
  }

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const pendingRefCode = await getPendingReferralCode();
      const { url } = await loginWithGoogle(pendingRefCode ?? undefined);
      router.push({ pathname: '/auth/callback', params: { url } });
    } catch (error) {
      Alert.alert(
        'Google sign-in failed',
        error instanceof Error ? error.message : 'Unable to sign in with Google right now.'
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setIsAppleLoading(true);
      const pendingRefCode = await getPendingReferralCode();
      const result = await loginWithApple(pendingRefCode ?? undefined);
      if (!result) return;
      router.push({ pathname: '/auth/callback', params: { token: result.token } });
    } catch (error) {
      Alert.alert(
        'Apple sign-in failed',
        error instanceof Error ? error.message : 'Unable to sign in with Apple right now.'
      );
    } finally {
      setIsAppleLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await copyReferralCode(code);
      setCopied(true);
      showSuccess('Code copied', 'Your referral code is on the clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showError('Copy failed', 'Could not copy your code. Try again.');
    }
  };

  const handleCopyLink = async () => {
    if (!code) return;
    try {
      await copyReferralLink(code);
      showSuccess('Link copied', 'Your referral link is on the clipboard.');
    } catch {
      showError('Copy failed', 'Could not copy your link. Try again.');
    }
  };

  const handleShare = async () => {
    if (!code) return;
    try {
      setIsSharing(true);
      await shareInvite(code);
    } catch {
      showError('Share failed', 'Could not open the share sheet. Try again.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Body showBackground={false}>
      <View className="flex-1 px-1 pt-4">
        <View className="mb-6 flex-row items-center justify-between">
          <BackButton onPress={() => goBackOrReturnTo(returnTo, '/profile')} />
          <Text
            className="text-[20px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}>
            Refer a friend
          </Text>
          <View className="w-11" />
        </View>

        {isAuthLoading && !isSignedIn ? (
          <View className="mt-6 flex-1 items-center justify-center">
            <Text
              className="text-[14px] text-zinc-500 dark:text-zinc-400"
              style={{ fontFamily: FONTS.main.regular }}>
              Loading...
            </Text>
          </View>
        ) : !isSignedIn ? (
          <View className="mt-6 flex-1 gap-4 px-2">
            <Text
              className="text-[18px] text-zinc-900 dark:text-zinc-50"
              style={{ fontFamily: FONTS.main.medium }}>
              Sign in to get your code
            </Text>
            <Text
              className="max-w-72 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
              style={{ fontFamily: FONTS.main.regular }}>
              Referral codes are tied to your account. Sign in to get yours and start inviting
              friends.
            </Text>
            <SocialAuthButton
              icon={require('@/assets/images/google.png')}
              label="Continue with Google"
              loading={isGoogleLoading}
              loadingLabel="Connecting Google..."
              onPress={() => void handleGoogleSignIn()}
            />
            {Platform.OS === 'ios' && (
              <SocialAuthButton
                icon={require('@/assets/images/apple.png')}
                label="Continue with Apple"
                loading={isAppleLoading}
                loadingLabel="Connecting Apple..."
                onPress={() => void handleAppleSignIn()}
              />
            )}
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}>
            <View className="mb-6 items-center rounded-3xl bg-zinc-900 px-6 py-8 dark:bg-zinc-100">
              <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-white/10 dark:bg-black/10">
                <Gift size={26} color={colors.primaryForeground} strokeWidth={2.2} />
              </View>
              <Text
                className="text-center text-[16px] text-white dark:text-zinc-900"
                style={{ fontFamily: FONTS.main.regular }}>
                {buildReferralRewardSummary(REFERRAL_POINTS_REWARD)}
              </Text>
            </View>

            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Your code
            </Text>
            <Pressable
              onPress={() => void handleCopy()}
              className="mb-6 flex-row items-center justify-between rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-4 dark:border-zinc-700 dark:bg-zinc-950">
              <Text
                className="text-[22px] tracking-[2px] text-zinc-900 dark:text-zinc-50"
                style={{ fontFamily: FONTS.main.semiBold }}>
                {code ?? '···'}
              </Text>
              <View className="flex-row items-center gap-1.5">
                {copied ? (
                  <Check size={18} color="#34C759" strokeWidth={2.6} />
                ) : (
                  <Copy size={18} color={colors.iconMuted} strokeWidth={2.2} />
                )}
                <Text
                  className="text-[14px] text-zinc-500 dark:text-zinc-400"
                  style={{ fontFamily: FONTS.main.medium }}>
                  {copied ? 'Copied' : 'Copy'}
                </Text>
              </View>
            </Pressable>

            <Button
              className="mb-3 h-14 flex-row items-center justify-center gap-2"
              size="lg"
              disabled={isSharing || !code}
              onPress={() => void handleShare()}>
              <Share2 color={colors.primaryForeground} size={18} strokeWidth={2.4} />
              <Text style={{ fontFamily: FONTS.main.medium }}>
                {isSharing ? 'Opening...' : 'Share invite'}
              </Text>
            </Button>

            <Button
              className="mb-8 h-14 flex-row items-center justify-center gap-2"
              size="lg"
              variant="outline"
              disabled={!code}
              onPress={() => void handleCopyLink()}>
              <Link2 color={colors.icon} size={18} strokeWidth={2.4} />
              <Text
                className="text-zinc-900 dark:text-zinc-50"
                style={{ fontFamily: FONTS.main.medium }}>
                Copy link
              </Text>
            </Button>

            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Your rewards
            </Text>
            <View className="mb-8 flex-row gap-3">
              <StatCard
                icon={Users}
                label="Referred"
                value={isLoading ? '—' : String(referredCount)}
              />
              <StatCard
                icon={Sparkles}
                label="Hypa points"
                value={isLoading ? '—' : String(hypaPoints)}
              />
            </View>

            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              Referral activity
            </Text>
            <View className="mb-8 rounded-3xl border border-zinc-100 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
              {referrals.length === 0 ? (
                <View className="py-8">
                  <Text
                    className="text-center text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
                    style={{ fontFamily: FONTS.main.regular }}>
                    {isLoading
                      ? 'Loading your referrals...'
                      : "No referrals yet. Share your code — each friend who signs up with it will show up here."}
                  </Text>
                </View>
              ) : (
                <>
                  {referrals.map((item, index) => (
                    <ReferralRow
                      key={item.id}
                      item={item}
                      isLast={index === referrals.length - 1}
                    />
                  ))}
                  {hasMore ? (
                    <Button
                      variant="link"
                      className="py-4"
                      disabled={isFetchingMore}
                      onPress={loadMore}>
                      <Text
                        className="text-[14px] text-zinc-500 dark:text-zinc-400"
                        style={{ fontFamily: FONTS.main.medium }}>
                        {isFetchingMore ? 'Loading...' : 'Load more'}
                      </Text>
                    </Button>
                  ) : null}
                </>
              )}
            </View>

            <Text
              className="px-2 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
              style={{ fontFamily: FONTS.main.medium }}>
              How it works
            </Text>
            <View className="rounded-3xl border border-zinc-100 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
              {HOW_IT_WORKS.map((step, index) => (
                <View
                  key={step}
                  className={`flex-row items-start gap-3 py-4 ${
                    index === HOW_IT_WORKS.length - 1
                      ? ''
                      : 'border-b border-zinc-100 dark:border-zinc-800'
                  }`}>
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100">
                    <Text
                      className="text-[12px] text-white dark:text-zinc-900"
                      style={{ fontFamily: FONTS.main.semiBold }}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text
                    className="flex-1 text-[14px] leading-6 text-zinc-600 dark:text-zinc-300"
                    style={{ fontFamily: FONTS.main.regular }}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </Body>
  );
};

export default Referral;
