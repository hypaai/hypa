import { FONTS } from '@/constants/fonts';
import { useHypaKeyboardStatus } from '@/lib/use-hypa-keyboard-status';
import { useUser } from '@/lib/user-provider';
import { Check } from 'lucide-react-native';
import React from 'react';
import { Alert, Linking, Platform, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { isHypaKeyboardEnabled, showInputMethodPicker } from 'hypa-keyboard-input-method-picker';
import { useThemeColors } from '@/hooks/use-theme-color';

const openDeviceKeyboardSettings = async () => {
  try {
    if (Platform.OS === 'android' && !isHypaKeyboardEnabled()) {
      await Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS');
      return;
    }

    await showInputMethodPicker();
  } catch {
    Alert.alert(
      'Unable to open keyboard settings',
      'Please open your device keyboard settings manually and enable Hypa Keyboard.'
    );
  }
};

export function SetupProgress() {
  const { user } = useUser();
  const { enabled } = useHypaKeyboardStatus();
  const colors = useThemeColors();
  const progress = [
    {
      label: 'Enable keyboard',
      completed: enabled,
      onPress: () => void openDeviceKeyboardSettings(),
    },
    {
      label: 'Choose your theme',
      completed: true,
      onPress: () => router.navigate('/settings'),
    },
    {
      label: 'Sign into your account',
      completed: !!user,
      onPress: user ? undefined : () => router.push('/'),
    },
  ];

  const completedSteps = progress.filter((p) => p.completed).length;

  if (completedSteps === progress.length) {
    return null;
  }

  return (
    <View className="mb-6 px-1">
      <View className="mb-4 flex-row items-center justify-between">
        <View>
          <Text
            className="text-[18px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}>
            Complete your setup
          </Text>
          <Text
            className="mt-1 text-[14px] text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.regular }}>
            {completedSteps} of {progress.length} steps completed
          </Text>
        </View>
      </View>

      <View className="rounded-3xl border border-zinc-100 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-950">
        {progress.map((p, index) => (
          <TouchableOpacity disabled={!p.onPress} key={p.label} onPress={p.onPress}>
            <View
              className={`flex-row items-center ${index != progress.length - 1 && 'border-b border-zinc-100 dark:border-zinc-800'} px-2 py-4`}>
              <View
                className={`mr-4 h-8 w-8 items-center justify-center rounded-full ${p.completed ? 'bg-zinc-50 dark:bg-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>
                {p.completed && <Check color={colors.icon} size={16} strokeWidth={2.5} />}
              </View>
              <Text
                className="flex-1 text-[15px] text-zinc-900 dark:text-zinc-50"
                style={{ fontFamily: FONTS.main.medium }}>
                {p.label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
