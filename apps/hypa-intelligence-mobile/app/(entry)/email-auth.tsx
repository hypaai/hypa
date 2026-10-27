import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';

import Body from '@/components/shared/body';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import { loginWithEmail, registerWithEmail } from '@/api/auth';
import { getPendingReferralCode } from '@/lib/referral-code-store';
import { readReferralCodeFromClipboard } from '@/lib/clipboard-referrer';
import { useThemeColors } from '@/hooks/use-theme-color';
import { BackButton } from '@/components/shared/back-button';
import { extractReferralCode, isReferralCode } from '@hypa/config/referral';

type Mode = 'login' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EmailAuth = () => {
  const { mode: initialMode } = useLocalSearchParams<{ mode?: Mode }>();
  const colors = useThemeColors();

  const [mode, setMode] = React.useState<Mode>(initialMode === 'signup' ? 'signup' : 'login');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [refCode, setRefCode] = React.useState('');

  const isSignup = mode === 'signup';

  React.useEffect(() => {
    let cancelled = false;

    const applyCode = (candidate: string | null | undefined) => {
      const found = extractReferralCode(candidate);
      if (found && !cancelled) {
        setRefCode((current) => current || found);
        return true;
      }
      return false;
    };

    void (async () => {
      if (applyCode(await getPendingReferralCode())) return;
      applyCode(await readReferralCodeFromClipboard().catch(() => null));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();

    if (!EMAIL_RE.test(trimmedEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    if (isSignup && (!firstName.trim() || !lastName.trim())) {
      Alert.alert('Missing name', 'Enter your first and last name.');
      return;
    }

    if (isSignup ? password.length < 6 : password.length < 1) {
      Alert.alert(
        'Invalid password',
        isSignup ? 'Password must be at least 6 characters.' : 'Enter your password.'
      );
      return;
    }

    try {
      setSubmitting(true);
      const result = isSignup
        ? await registerWithEmail({
            email: trimmedEmail,
            first_name: firstName,
            last_name: lastName,
            password,
            refCode: refCode.trim() || undefined,
          })
        : await loginWithEmail({ email: trimmedEmail, password });

      router.push({ pathname: '/auth/callback', params: { token: result.token } });
    } catch (error) {
      Alert.alert(
        isSignup ? 'Sign up failed' : 'Sign in failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((current) => (current === 'login' ? 'signup' : 'login'));
    setPassword('');
  };

  return (
    <Body showBackground={false}>
      <View className="flex-1 px-1 pt-4">
        <View className="mb-8 flex-row items-center justify-between">
          <BackButton onPress={() => router.replace('/')} />
          <Text
            className="text-[20px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}>
            {isSignup ? 'Create account' : 'Sign in'}
          </Text>
          <View className="w-11" />
        </View>

        <View className="px-2">
          <Text
            className="text-[26px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}>
            {isSignup ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text
            className="mt-2 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.regular }}>
            {isSignup
              ? 'Sign up to save your keyboard setup and keep your preferences in sync.'
              : 'Sign in to keep your keyboard settings in sync.'}
          </Text>

          <View className="mt-8 gap-4">
            {isSignup ? (
              <View className="flex-row gap-3">
                <View className="flex-1 gap-2">
                  <Label style={{ fontFamily: FONTS.main.medium }}>First name</Label>
                  <Input
                    className="h-14 rounded-lg"
                    placeholder="First name"
                    autoCapitalize="words"
                    value={firstName}
                    onChangeText={setFirstName}
                    editable={!submitting}
                  />
                </View>
                <View className="flex-1 gap-2">
                  <Label style={{ fontFamily: FONTS.main.medium }}>Last name</Label>
                  <Input
                    className="h-14 rounded-lg"
                    placeholder="Last name"
                    autoCapitalize="words"
                    value={lastName}
                    onChangeText={setLastName}
                    editable={!submitting}
                  />
                </View>
              </View>
            ) : null}

            <View className="gap-2">
              <Label style={{ fontFamily: FONTS.main.medium }}>Email</Label>
              <Input
                className="h-14 rounded-lg"
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                editable={!submitting}
              />
            </View>

            <View className="gap-2">
              <Label style={{ fontFamily: FONTS.main.medium }}>Password</Label>
              <View className="relative justify-center">
                <Input
                  className="h-14 rounded-lg pr-12"
                  placeholder="Password"
                  autoCapitalize="none"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  editable={!submitting}
                />
                <Pressable
                  className="absolute right-4"
                  hitSlop={10}
                  onPress={() => setShowPassword((current) => !current)}>
                  {showPassword ? (
                    <EyeOff size={20} color={colors.iconMuted} />
                  ) : (
                    <Eye size={20} color={colors.iconMuted} />
                  )}
                </Pressable>
              </View>
            </View>

            {isSignup ? (
              <View className="gap-2">
                <Label style={{ fontFamily: FONTS.main.medium }}>Referral code (optional)</Label>
                <Input
                  className="h-14 rounded-lg"
                  placeholder="HYPA-XXXXXX"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={refCode}
                  onChangeText={(text) => setRefCode(text.toUpperCase())}
                  editable={!submitting}
                />
                {refCode.trim() && !isReferralCode(refCode) ? (
                  <Text
                    className="text-[12px] text-zinc-400 dark:text-zinc-500"
                    style={{ fontFamily: FONTS.main.regular }}>
                    Enter a valid code like HYPA-XXXXXX, or leave blank.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Button
              className="mt-2 h-14 items-center justify-center"
              size="lg"
              disabled={submitting}
              onPress={() => void handleSubmit()}>
              <Text style={{ fontFamily: FONTS.main.medium }}>
                {submitting
                  ? isSignup
                    ? 'Creating account...'
                    : 'Signing in...'
                  : isSignup
                    ? 'Create account'
                    : 'Sign in'}
              </Text>
            </Button>

            <Pressable className="mt-2 items-center py-2" onPress={toggleMode} disabled={submitting}>
              <Text
                className="text-[14px] text-zinc-500 dark:text-zinc-400"
                style={{ fontFamily: FONTS.main.regular }}>
                {isSignup ? 'Already have an account? ' : "Don't have an account? "}
                <Text
                  className="text-zinc-900 dark:text-zinc-50"
                  style={{ fontFamily: FONTS.main.medium }}>
                  {isSignup ? 'Sign in' : 'Create one'}
                </Text>
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Body>
  );
};

export default EmailAuth;
