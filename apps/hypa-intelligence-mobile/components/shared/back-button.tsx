import { ArrowLeft } from 'lucide-react-native';
import React from 'react';

import { GlassIconButton } from '@/components/ui/glass-icon-button';
import { useThemeColors } from '@/hooks/use-theme-color';

export const BACK_BUTTON_SIZE = 44;

export function BackButton({ onPress }: { onPress?: () => void }) {
  const colors = useThemeColors();

  return (
    <GlassIconButton onPress={onPress} size={BACK_BUTTON_SIZE}>
      <ArrowLeft color={colors.icon} size={24} />
    </GlassIconButton>
  );
}
