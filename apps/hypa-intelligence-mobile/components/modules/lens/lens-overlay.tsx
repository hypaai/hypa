import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
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
// Generous padding so ascenders, descenders and OCR's tight boxes never let the source text show.
const PAD_ALONG = 0.35;
const PAD_ACROSS = 0.28;
const PULSE_MS = 700;
const REVEAL_MS = 160;
const SKELETON_HEIGHT = 0.42;
const SKELETON_MIN = 0.12;
const SKELETON_MAX = 0.32;

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
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

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
      {lines.map((line) => (
        <Patch key={line.key} line={line}>
          <LineContent line={line} pulse={pulse} />
        </Patch>
      ))}
    </Animated.View>
  );
}

function LineContent({ line, pulse }: { line: OverlayLine; pulse: SharedValue<number> }) {
  const arrived = useSharedValue(line.loading ? 0 : 1);
  const [text, setText] = useState<Extract<OverlayLine, { text: string }> | null>(line.loading ? null : line);

  useEffect(() => {
    if (line.loading) {
      arrived.value = withTiming(0, { duration: REVEAL_MS });
      return;
    }
    setText(line);
    arrived.value = withTiming(1, { duration: REVEAL_MS });
  }, [arrived, line]);

  const skeleton = useAnimatedStyle(() => ({
    opacity: (1 - arrived.value) * (SKELETON_MIN + (SKELETON_MAX - SKELETON_MIN) * pulse.value),
  }));
  const reveal = useAnimatedStyle(() => ({ opacity: arrived.value }));

  const barHeight = Math.max(3, line.thickness * SKELETON_HEIGHT);
  // Text starts where the source line starts, like a paragraph, not floating in the middle of its patch.
  const inset = line.thickness * PAD_ALONG;
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, styles.start, { paddingHorizontal: inset }, skeleton]}>
        <View
          style={{
            width: '100%',
            height: barHeight,
            borderRadius: barHeight / 2,
            backgroundColor: line.color,
          }}
        />
      </Animated.View>
      {text ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.start, { paddingHorizontal: inset }, reveal]}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.3}
            style={[styles.text, { color: text.color, fontFamily: FONT_BY_WEIGHT[text.weight], fontSize: text.fontSize }]}>
            {text.text}
          </Text>
        </Animated.View>
      ) : null}
    </>
  );
}

function Patch({ line, children }: { line: OverlayLine; children: ReactNode }) {
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

  const feather = Math.max(2, line.thickness * 0.2);
  return (
    <Animated.View
      style={[
        styles.patch,
        placement,
        { backgroundColor: line.background, borderRadius: feather / 2, boxShadow: `0 0 ${feather}px ${feather / 2}px ${line.background}` },
      ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  patch: {
    position: 'absolute',
  },
  start: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  text: {
    includeFontPadding: false,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
});
