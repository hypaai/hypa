import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FONTS } from '@/constants/fonts';
import type { LensMotion } from '@/hooks/use-lens-frames';
import type { LineWeight } from '@/lib/lens/line-colors';
import type { LineShape } from '@/lib/lens/overlay-geometry';
import { followMotion, predictMotion } from '@/lib/lens/motion-placement';

export type OverlayLine = LineShape & {
  key: string;
  background: string;
  color: string;
} & ({ loading: true } | { loading?: false; text: string; weight: LineWeight; fontSize: number });

export type MotionToView = { x: { x: number; y: number }; y: { x: number; y: number } };

const GLIDE_MS = 70;
const PAD_ALONG = 0.15;
const PAD_ACROSS = 0.1;

const FONT_BY_WEIGHT: Record<LineWeight, string> = {
  regular: FONTS.main.regular,
  medium: FONTS.main.medium,
  bold: FONTS.main.bold,
};

export function LensOverlay({
  lines,
  motion,
  motionToView,
}: {
  lines: OverlayLine[];
  motion: LensMotion;
  motionToView: SharedValue<MotionToView | null>;
}) {
  const offset = useSharedValue({ x: 0, y: 0 });

  useFrameCallback((frame) => {
    const toView = motionToView.value;
    if (!toView) return;
    const state = motion.getDirty();
    const { x, y } = predictMotion(state, Date.now());
    const target = {
      x: toView.x.x * x + toView.y.x * y,
      y: toView.x.y * x + toView.y.y * y,
    };
    offset.value = followMotion(offset.value, target, frame.timeSincePreviousFrame ?? 1000);
  });

  const follow = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value.x }, { translateY: offset.value.y }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, follow]}>
      {lines.map((line) => {
        if (line.loading) {
          const size = Math.min(22, Math.max(12, line.thickness * 0.8));
          return (
            <Patch key={line.key} line={line}>
              <View style={[StyleSheet.absoluteFill, styles.centered]}>
                <View
                  style={[
                    styles.spinner,
                    { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, backgroundColor: line.background },
                  ]}>
                  <ActivityIndicator size="small" color={line.color} style={{ transform: [{ scale: size / 20 }] }} />
                </View>
              </View>
            </Patch>
          );
        }
        return (
          <Patch key={line.key} line={line} filled>
            <View style={[StyleSheet.absoluteFill, styles.centered]}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.3}
                style={[
                  styles.text,
                  { color: line.color, fontFamily: FONT_BY_WEIGHT[line.weight], fontSize: line.fontSize },
                ]}>
                {line.text}
              </Text>
            </View>
          </Patch>
        );
      })}
    </Animated.View>
  );
}

function Patch({ line, filled, children }: { line: OverlayLine; filled?: boolean; children: ReactNode }) {
  const centerX = useSharedValue(line.centerX);
  const centerY = useSharedValue(line.centerY);
  const length = useSharedValue(line.length);
  const thickness = useSharedValue(line.thickness);
  const angle = useSharedValue(line.angle);

  useEffect(() => {
    const glide = { duration: GLIDE_MS };
    centerX.value = withTiming(line.centerX, glide);
    centerY.value = withTiming(line.centerY, glide);
    length.value = withTiming(line.length, glide);
    thickness.value = withTiming(line.thickness, glide);
    angle.value = withTiming(angle.value + ((((line.angle - angle.value + 540) % 360) + 360) % 360) - 180, glide);
  }, [angle, centerX, centerY, length, line.angle, line.centerX, line.centerY, line.length, line.thickness, thickness]);

  const placement = useAnimatedStyle(() => {
    const width = length.value + thickness.value * PAD_ALONG * 2;
    const height = thickness.value * (1 + PAD_ACROSS * 2);
    return {
      left: centerX.value - width / 2,
      top: centerY.value - height / 2,
      width,
      height,
      transform: [{ rotate: `${angle.value}deg` }],
    };
  });

  const feather = Math.max(1, line.thickness * 0.12);
  return (
    <Animated.View
      style={[
        styles.patch,
        placement,
        filled && { backgroundColor: line.background, boxShadow: `0 0 ${feather}px 0 ${line.background}` },
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  patch: {
    position: 'absolute',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  text: {
    includeFontPadding: false,
    textAlign: 'center',
  },
});
