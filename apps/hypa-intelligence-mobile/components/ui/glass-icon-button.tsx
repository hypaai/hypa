import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Pressable, TouchableOpacity } from 'react-native';

export { isLiquidGlassAvailable };

type Props = {
  onPress?: () => void;
  size?: number;
  fallbackClassName?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  children: React.ReactNode;
};

export function GlassIconButton({
  onPress,
  size = 44,
  fallbackClassName,
  accessibilityLabel,
  disabled,
  children,
}: Props) {
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel, disabled };
  const shape = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  if (!isLiquidGlassAvailable()) {
    return (
      <TouchableOpacity
        {...a11y}
        onPress={onPress}
        activeOpacity={0.7}
        className={fallbackClassName}
        style={[shape, disabled && { opacity: 0.4 }]}>
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <GlassView isInteractive style={[shape, disabled && { opacity: 0.4 }]}>
      <Pressable
        {...a11y}
        onPress={onPress}
        style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Pressable>
    </GlassView>
  );
}
