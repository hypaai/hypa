import { useEffect, useRef } from "react";
import { Dimensions, Platform, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { FONTS } from "@/constants/fonts";
import { useThemeColors } from "@/hooks/use-theme-color";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TOAST_HEIGHT = 72;
const TOAST_MARGIN = 16;

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onDismiss: (id: string) => void;
  index: number;
}

const TYPE_COLORS = {
  success: "#34C759",
  error: "#FF3B30",
  warning: "#FF9500",
  info: "#007AFF",
};

const TYPE_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const Toast = ({
  id,
  type,
  title,
  message,
  duration = 4000,
  onDismiss,
  index,
}: ToastProps) => {
  const colors = useThemeColors();
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.94);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accentColor = TYPE_COLORS[type];
  const IconComponent = TYPE_ICONS[type];

  const clearDismissTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const dismiss = () => {
    clearDismissTimer();
    if (Platform.OS === "ios") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    translateX.value = withTiming(SCREEN_WIDTH, { duration: 240 });
    opacity.value = withTiming(0, { duration: 220 }, () => {
      runOnJS(onDismiss)(id);
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      translateY.value = withSpring(TOAST_MARGIN + index * (TOAST_HEIGHT + 8), {
        damping: 20,
        stiffness: 300,
      });
      opacity.value = withTiming(1, { duration: 220 });
      scale.value = withSpring(1, { damping: 16, stiffness: 360 });
    }, index * 80);

    if (duration > 0) {
      timeoutRef.current = setTimeout(dismiss, duration);
    }

    return () => {
      clearTimeout(timer);
      clearDismissTimer();
    };
  }, [duration, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.toast,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        animatedStyle,
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: `${accentColor}18` }]}>
        <Icon name={IconComponent} size={20} color={accentColor} />
      </View>

      <View style={styles.content}>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: colors.text, fontFamily: FONTS.main.semiBold }]}>
          {title}
        </Text>
        {!!message && (
          <Text
            numberOfLines={2}
            style={[styles.message, { color: colors.textMuted, fontFamily: FONTS.main.regular }]}>
            {message}
          </Text>
        )}
      </View>

      <Pressable
        onPress={dismiss}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        style={[styles.closeButton, { backgroundColor: `${colors.text}10` }]}>
        <Icon name={X} size={14} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: 0,
    left: TOAST_MARGIN,
    right: TOAST_MARGIN,
    height: TOAST_HEIGHT,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Toast;
