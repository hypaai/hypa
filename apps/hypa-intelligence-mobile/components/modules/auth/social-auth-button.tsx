import React from 'react';
import { Image, type ImageSourcePropType, Text } from 'react-native';

import { Button } from '@/components/ui/button';
import { FONTS } from '@/constants/fonts';
import { useThemeColors } from '@/hooks/use-theme-color';

type SocialAuthButtonProps = {
  icon: ImageSourcePropType;
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  onPress: () => void;
  className?: string;
};

export function SocialAuthButton({
  icon,
  label,
  loadingLabel,
  loading = false,
  onPress,
  className = 'h-14 flex-row items-center justify-center gap-2',
}: SocialAuthButtonProps) {
  const colors = useThemeColors();

  return (
    <Button className={className} disabled={loading} onPress={onPress} size="lg">
      <Image source={icon} className="h-4 w-4" />
      <Text
        className="text-white dark:text-black"
        style={{ fontFamily: FONTS.main.medium, color: colors.primaryForeground }}>
        {loading ? loadingLabel ?? label : label}
      </Text>
    </Button>
  );
}
