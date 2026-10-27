import { Button } from '@/components/ui/button';
import { FONTS } from '@/constants/fonts';
import { useThemeColors } from '@/hooks/use-theme-color';
import { ArrowRight } from 'lucide-react-native';
import LottieView from 'lottie-react-native';
import React from 'react';
import { Text, View } from 'react-native';

export function SuccessState({ onContinue }: { onContinue: () => void }) {
  const colors = useThemeColors();

  return (
    <View className="flex-1 justify-center px-4 py-10">
      <LottieView
        autoPlay
        loop
        source={require('@/assets/lotties/success.json')}
        style={{ width: 104, height: 104 }}
      />

      <Text
        className="mt-6 text-[12px] tracking-[1.6px] text-green-600 dark:text-green-400 uppercase"
        style={{ fontFamily: FONTS.main.medium }}>
        All set
      </Text>
      <Text className="mt-2 text-[30px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.alt.bold }}>
        You&apos;re signed in
      </Text>
      <Text
        className="mt-3 max-w-80 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
        style={{ fontFamily: FONTS.main.regular }}>
        Your account is connected successfully.
      </Text>

      <Button className="mt-8 h-14 rounded-[20px]" onPress={onContinue} size="lg">
        <Text className="text-white dark:text-zinc-950" style={{ fontFamily: FONTS.main.medium }}>
          Continue
        </Text>
        <ArrowRight color={colors.primaryForeground} size={18} />
      </Button>
    </View>
  );
}
