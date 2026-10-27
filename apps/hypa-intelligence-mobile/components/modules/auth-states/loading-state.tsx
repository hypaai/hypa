import { FONTS } from '@/constants/fonts';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-color';

export function LoadingState({ message, subMessage }: { message?: string; subMessage?: string }) {
  const colors = useThemeColors();

  return (
    <View className="flex-1 items-center justify-center px-6 py-10">
      <ActivityIndicator size="small" color={colors.spinnerMuted} />

      <Text
        className="mt-6 text-center text-[30px] text-zinc-900 dark:text-zinc-50"
        style={{ fontFamily: FONTS.alt.bold }}>
        {message || 'Signing you in'}
      </Text>
      <Text
        className="mt-3 max-w-72 text-center text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
        style={{ fontFamily: FONTS.main.regular }}>
        {subMessage || 'Please wait while we sign you in.'}
      </Text>
    </View>
  );
}
