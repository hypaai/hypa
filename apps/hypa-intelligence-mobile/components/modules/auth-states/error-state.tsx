import { Button } from '@/components/ui/button';
import { FONTS } from '@/constants/fonts';
import { useThemeColors } from '@/hooks/use-theme-color';
import { RefreshCw } from 'lucide-react-native';
import LottieView from 'lottie-react-native';
import React from 'react';
import { Text, View } from 'react-native';

type ErrorStateProps = {
  errorMessage: string;
  onRetry: () => void;
  onContinue: () => void;
};

export function ErrorState({ errorMessage, onRetry, onContinue }: ErrorStateProps) {
  const colors = useThemeColors();

  return (
    <View className="flex-1 justify-center px-4 py-10">
      <LottieView
        autoPlay
        loop
        source={require('@/assets/lotties/failed.json')}
        style={{ width: 104, height: 104 }}
      />

      <Text
        className="mt-6 text-[12px] tracking-[1.6px] text-red-500 dark:text-red-400 uppercase"
        style={{ fontFamily: FONTS.main.medium }}>
        Something went wrong
      </Text>
      <Text className="mt-2 text-[30px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.alt.bold }}>
        Sign-in failed
      </Text>
      <Text
        className="mt-3 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
        style={{ fontFamily: FONTS.main.regular }}>
        {errorMessage}
      </Text>

      <View className="mt-8 gap-3">
        <Button className="h-14 rounded-[20px]" onPress={onRetry} size="lg">
          <RefreshCw color={colors.primaryForeground} size={18} />
          <Text className="text-white dark:text-zinc-950" style={{ fontFamily: FONTS.main.medium }}>
            Try again
          </Text>
        </Button>

        <Button className="h-14 rounded-[20px]" onPress={onContinue} size="lg" variant="outline">
          <Text className="text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
            Back to home
          </Text>
        </Button>
      </View>
    </View>
  );
}
