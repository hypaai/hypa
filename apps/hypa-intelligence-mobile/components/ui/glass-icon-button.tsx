import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Pressable, TouchableOpacity } from 'react-native';

export { isLiquidGlassAvailable };

type Props = {
  onPress?: () => void;
  size?: number;
  fallbackClassName?: string;
  children: React.ReactNode;
};

export function GlassIconButton({ onPress, size = 44, fallbackClassName, children }: Props) {
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
        onPress={onPress}
        activeOpacity={0.7}
        className={fallbackClassName}
        style={shape}>
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <GlassView isInteractive style={shape}>
      <Pressable
        onPress={onPress}
        style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </Pressable>
    </GlassView>
  );
}
