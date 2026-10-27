import React from 'react';
import { Alert, Platform, View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { loginWithApple, loginWithGoogle } from '@/api/auth';
import { SocialAuthButton } from '@/components/modules/auth/social-auth-button';
import ProfileDetailRow from '@/components/modules/profile/profile-detail-row';
import Body from '@/components/shared/body';
import Requirements from '@/components/shared/requirements';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import { useKeyboardSettings } from '@/hooks/use-keyboard-settings';
import { useUser } from '@/lib/user-provider';
import { useHypaKeyboardStatus } from '@/lib/use-hypa-keyboard-status';
import { VERSION_BUILD } from '@/constants/app';
import { languageCodeToName } from '@/lib/model-languages';
import { goBackOrReturnTo } from '@/lib/navigation';
import { BackButton } from '@/components/shared/back-button';

const THEME_LABELS: Record<string, string> = {
  '#121214': 'Midnight',
  '#14281D': 'Forest',
  '#241623': 'Sunset',
};

function getLanguageLabel(languageId?: string) {
  return languageCodeToName(languageId) || 'English';
}

function getThemeLabel(surface?: string) {
  if (!surface) {
    return 'Custom';
  }

  return THEME_LABELS[surface] ?? 'Custom';
}

const Profile = () => {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { enabled } = useHypaKeyboardStatus();
  const { settings, isLoading: isLoadingSettings } = useKeyboardSettings();
  const { loading: isLoadingUser, logout, user } = useUser();
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [isAppleLoading, setIsAppleLoading] = React.useState(false);

  const hasToken = Boolean(settings?.token?.trim());
  const isLoggedIn = Boolean(user && hasToken);
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  const displayName = fullName || user?.email || 'Guest';
  const profileInitial = displayName.charAt(0).toUpperCase();

  const languageLabel = getLanguageLabel(settings?.languageId);
  const themeLabel = getThemeLabel(settings?.themeDark.surface);

  if (!enabled) {
    return <Requirements />;
  }

  if (isLoadingSettings || (hasToken && isLoadingUser)) {
    return (
      <Body showBackground={false}>
        <View className="flex-1 items-center justify-center">
          <Text
            className="text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.regular }}>
            Loading profile...
          </Text>
        </View>
      </Body>
    );
  }

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      const { url } = await loginWithGoogle();
      router.push({
        pathname: '/auth/callback',
        params: { url },
      });
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
      const result = await loginWithApple();
      if (!result) return;
      router.push({
        pathname: '/auth/callback',
        params: { token: result.token },
      });
    } catch (error) {
      Alert.alert(
        'Apple sign-in failed',
        error instanceof Error ? error.message : 'Unable to sign in with Apple right now.'
      );
    } finally {
      setIsAppleLoading(false);
    }
  };

  return (
    <Body showBackground={false}>
      <View className="flex-1 px-1 pt-4">
        <View className="mb-6 flex-row items-center justify-between">
          <BackButton onPress={() => goBackOrReturnTo(returnTo, '/home')} />

          <Text
            className="text-[20px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}>
            Profile
          </Text>

          <View className="w-7" />
        </View>

        <View className="px-2 py-4">
          <View className="flex-row items-center gap-4">
            <Avatar alt={displayName} className="h-16 w-16">
              <AvatarFallback className="bg-zinc-100 dark:bg-zinc-900">
                <Text
                  className="text-[20px] text-black dark:text-zinc-50"
                  style={{ fontFamily: FONTS.main.medium }}>
                  {profileInitial}
                </Text>
              </AvatarFallback>
            </Avatar>

            <View className="flex-1">
              <Text
                className="text-[24px] text-zinc-900 dark:text-zinc-50"
                style={{ fontFamily: FONTS.main.medium }}>
                {displayName}
              </Text>
              <Text
                className="mt-1 text-[14px] text-zinc-500 dark:text-zinc-400"
                style={{ fontFamily: FONTS.main.regular }}>
                {isLoggedIn
                  ? (user?.email ?? 'Signed in')
                  : 'Sign in to keep your keyboard settings in sync.'}
              </Text>
            </View>
          </View>
        </View>

        {isLoggedIn ? (
          <>
            <View className="mt-6 border-t border-zinc-200 dark:border-zinc-800">
              <Text
                className="px-2 pt-4 pb-3 text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
                style={{ fontFamily: FONTS.main.medium }}>
                Account
              </Text>

              <ProfileDetailRow title="Email" value={user?.email ?? 'No email'} />
              <ProfileDetailRow title="Provider" value={user?.auth_provider ?? 'Google'} />
              <ProfileDetailRow title="Language" value={languageLabel} />
              <ProfileDetailRow title="Theme" value={themeLabel} />
              <ProfileDetailRow
                isLast
                title="Refer a friend"
                value="Invite friends and earn rewards"
                onPress={() => router.push('/referral')}
              />
            </View>

            <View className="mt-auto px-2 pt-10 pb-2">
              <Button
                className="h-14 flex-row items-center justify-center gap-2 bg-red-500"
                onPress={() => void logout().then(() => router.replace('/'))}
                size="lg">
                <LogOut color="#FFFFFF" size={18} strokeWidth={2.4} />
                <Text className="text-white" style={{ fontFamily: FONTS.main.medium }}>
                  Sign out
                </Text>
              </Button>
            </View>
          </>
        ) : (
          <View className="mt-6 gap-4 px-2">
            <Text
              className="max-w-72 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
              style={{ fontFamily: FONTS.main.regular }}>
              Sign in to save your keyboard setup and keep your preferences in sync across sessions.
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
        )}

        <View className="mt-8 mb-8 items-center">
          <Text
            className="text-[13px] text-zinc-400 dark:text-zinc-500"
            style={{ fontFamily: FONTS.main.regular }}>
            {VERSION_BUILD}
          </Text>
        </View>
      </View>
    </Body>
  );
};

export default Profile;
