import { Image, Platform, Text, View } from 'react-native';

import { SocialAuthButton } from '@/components/modules/auth/social-auth-button';
import Body from '@/components/shared/body';
import { FONTS } from '@/constants/fonts';
import { Button } from '@/components/ui/button';
import { useUser } from '@/lib/user-provider';
import { Redirect, router } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';
import { loginWithApple, loginWithGoogle } from '@/api/auth';
import { getPendingReferralCode } from '@/lib/referral-code-store';
import { useThemeColors } from '@/hooks/use-theme-color';

const Home = () => {
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [appleLoggingIn, setAppleLoggingIn] = React.useState(false);
  const { user } = useUser();
  const colors = useThemeColors();
  const handleGoogleSignIn = async () => {
    try {
      setLoggingIn(true);
      const pendingRefCode = await getPendingReferralCode();
      const { url } = await loginWithGoogle(pendingRefCode ?? undefined);
      router.push({
        pathname: '/auth/callback',
        params: { url },
      });
    } catch (error) {
      Alert.alert('Google sign-in failed', 'Unable to sign in with Google right now.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setAppleLoggingIn(true);
      const pendingRefCode = await getPendingReferralCode();
      const result = await loginWithApple(pendingRefCode ?? undefined);
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
      setAppleLoggingIn(false);
    }
  };

  if (user) {
    return <Redirect href="/home" />;
  }

  return (
    <Body>
      <View className="flex-1 items-center justify-between">
        <View></View>
        <View className="mt-20">
          <Image source={require('@/assets/images/logo.jpg')} className="mx-auto h-12 w-12" />
          <View className="items-center gap-2 p-2">
            <Text
              className="text-center text-4xl text-zinc-950 dark:text-zinc-50"
              style={{
                fontFamily: FONTS.alt.bold,
                maxWidth: 500,
              }}>
              Hypa Keyboard
            </Text>
            <Text
              className="text-center text-sm text-zinc-600 dark:text-zinc-400"
              style={{
                fontFamily: FONTS.main.regular,
                maxWidth: 400,
              }}>
              Type in any language, switch seamlessly, and let our keyboard do the rest. Experience
              the
            </Text>
          </View>
        </View>

        <View className="gap-3">
          <SocialAuthButton
            className="flex h-14 w-84 flex-row items-center justify-center"
            icon={require('@/assets/images/google.png')}
            label="Continue with Google"
            loading={loggingIn}
            loadingLabel="Connecting Google..."
            onPress={handleGoogleSignIn}
          />
          {Platform.OS === 'ios' && (
            <SocialAuthButton
              className="flex h-14 w-84 flex-row items-center justify-center"
              icon={require('@/assets/images/apple.png')}
              label="Continue with Apple"
              loading={appleLoggingIn}
              loadingLabel="Connecting Apple..."
              onPress={handleAppleSignIn}
            />
          )}
          <Button
            onPress={() => router.navigate('/home')}
            variant={'ghost'}
            className="h-14 w-84"
            size={'lg'}>
            <Text
              className="text-zinc-900 dark:text-zinc-50"
              style={{ fontFamily: FONTS.main.medium, color: colors.text }}>
              I'll do it later
            </Text>
          </Button>
        </View>
      </View>
    </Body>
  );
};

export default Home;
