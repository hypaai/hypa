import { Text } from '@/components/ui/text';
import React, { useEffect, useMemo } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  StyleProp,
  TextStyle,
  TouchableWithoutFeedback,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { View } from './view';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useColor } from '@/hooks/use-theme-color';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_TRANSLATE_Y = -SCREEN_HEIGHT + 50;

type BottomSheetContentProps = {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
  rBottomSheetStyle: any;
  cardColor: string;
  mutedColor: string;
  scrollEnabled?: boolean;
  handleWidth?: number;
  handleHeight?: number;
  titleStyle?: StyleProp<TextStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  headerBorderColor?: string;
  showHeaderDivider?: boolean;
  headerPaddingHorizontal?: number;
  sheetBorderRadius?: number;
  bottomInset?: number;
};

const BottomSheetContent = ({
  children,
  title,
  style,
  rBottomSheetStyle,
  cardColor,
  mutedColor,
  scrollEnabled = true,
  handleWidth = 64,
  handleHeight = 6,
  titleStyle,
  contentContainerStyle,
  headerBorderColor,
  showHeaderDivider = false,
  headerPaddingHorizontal = 16,
  sheetBorderRadius = 26,
  bottomInset = 0,
}: BottomSheetContentProps) => {
  return (
    <Animated.View
      style={[
        {
          height: SCREEN_HEIGHT,
          width: '100%',
          position: 'absolute',
          top: SCREEN_HEIGHT,
          backgroundColor: cardColor,
          borderTopLeftRadius: sheetBorderRadius,
          borderTopRightRadius: sheetBorderRadius,
          paddingBottom: bottomInset,
        },
        rBottomSheetStyle,
        style,
      ]}>
      <View
        style={{
          width: '100%',
          paddingVertical: 12,
          alignItems: 'center',
        }}>
        <View
          style={{
            width: handleWidth,
            height: handleHeight,
            backgroundColor: mutedColor,
            borderRadius: 999,
          }}
        />
      </View>

      {title && (
        <View
          style={{
            marginHorizontal: headerPaddingHorizontal,
            marginTop: 4,
            paddingBottom: 8,
            borderBottomWidth: showHeaderDivider ? 1 : 0,
            borderBottomColor: headerBorderColor,
          }}>
          <Text style={[{ textAlign: 'center', fontSize: 16, fontWeight: '600' }, titleStyle]}>
            {title}
          </Text>
        </View>
      )}

      {scrollEnabled ? (
        <ScrollView
          style={{ flex: 1 }}
          contentInset={{ bottom: bottomInset + 56 }}
          contentContainerStyle={[
            { padding: 16, paddingBottom: bottomInset + 96 },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ bottom: bottomInset + 24 }}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            { flex: 1, padding: 16, paddingBottom: bottomInset + 96 },
            contentContainerStyle,
          ]}>
          {children}
        </View>
      )}
    </Animated.View>
  );
};

type BottomSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  enableBackdropDismiss?: boolean;
  title?: string;
  style?: ViewStyle;
  disablePanGesture?: boolean;
  scrollEnabled?: boolean;
  sheetBackgroundColor?: string;
  handleColor?: string;
  handleWidth?: number;
  handleHeight?: number;
  titleStyle?: StyleProp<TextStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  headerBorderColor?: string;
  showHeaderDivider?: boolean;
  headerPaddingHorizontal?: number;
  sheetBorderRadius?: number;
};

export function BottomSheet({
  isVisible,
  onClose,
  children,
  snapPoints = [0.3, 0.6, 0.9],
  enableBackdropDismiss = true,
  title,
  style,
  disablePanGesture = false,
  scrollEnabled = true,
  sheetBackgroundColor,
  handleColor,
  handleWidth,
  handleHeight,
  titleStyle,
  contentContainerStyle,
  headerBorderColor,
  showHeaderDivider,
  headerPaddingHorizontal,
  sheetBorderRadius,
}: BottomSheetProps) {
  const mutedColor = useColor('textMuted');
  const backgroundColor = useColor('background');
  const { keyboardHeight, isKeyboardVisible } = useKeyboardHeight();
  const insets = useSafeAreaInsets();

  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });
  const opacity = useSharedValue(0);
  const currentSnapIndex = useSharedValue(0);
  const keyboardHeightSV = useSharedValue(0);

  const snapPointsKey = snapPoints.join(',');
  const stableSnapPoints = useMemo(() => [...snapPoints].sort((a, b) => a - b), [snapPointsKey]);

  const adjustedSnapPoints = useMemo(() => {
    if (Platform.OS === 'android' && insets.bottom > 0) {
      const offset = insets.bottom / SCREEN_HEIGHT;
      return stableSnapPoints.map((point) => Math.min(point + offset, 0.95));
    }
    return stableSnapPoints;
  }, [stableSnapPoints, insets.bottom]);

  const snapPointsHeights = useMemo(
    () => adjustedSnapPoints.map((point) => -SCREEN_HEIGHT * point),
    [adjustedSnapPoints]
  );
  const defaultHeight = snapPointsHeights[0];

  const [modalVisible, setModalVisible] = React.useState(false);
  const requestedVisibleRef = React.useRef(isVisible);
  requestedVisibleRef.current = isVisible;

  const hideModalIfStillClosed = React.useCallback(() => {
    if (!requestedVisibleRef.current) {
      setModalVisible(false);
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      setModalVisible(true);
      translateY.value = withSpring(defaultHeight, {
        damping: 50,
        stiffness: 400,
      });
      opacity.value = withTiming(1, { duration: 300 });
      currentSnapIndex.value = 0;
    } else {
      translateY.value = withSpring(0, { damping: 50, stiffness: 400 });
      opacity.value = withTiming(0, { duration: 300 }, () => {
        runOnJS(hideModalIfStillClosed)();
      });
    }
  }, [defaultHeight, hideModalIfStillClosed, isVisible]);

  const scrollTo = (destination: number) => {
    'worklet';
    translateY.value = withSpring(destination, { damping: 50, stiffness: 400 });
  };

  useEffect(() => {
    keyboardHeightSV.value = keyboardHeight;

    if (isVisible) {
      const currentSnapHeight = snapPointsHeights[currentSnapIndex.value];
      const destination = isKeyboardVisible
        ? currentSnapHeight - keyboardHeight
        : currentSnapHeight;
      scrollTo(destination);
    }
  }, [keyboardHeight, isKeyboardVisible, isVisible, snapPointsHeights]);

  const findClosestSnapPoint = (currentY: number) => {
    'worklet';
    const adjustedY = currentY + keyboardHeightSV.value;

    let closest = snapPointsHeights[0];
    let minDistance = Math.abs(adjustedY - closest);
    let closestIndex = 0;

    for (let i = 0; i < snapPointsHeights.length; i++) {
      const snapPoint = snapPointsHeights[i];
      const distance = Math.abs(adjustedY - snapPoint);
      if (distance < minDistance) {
        minDistance = distance;
        closest = snapPoint;
        closestIndex = i;
      }
    }
    currentSnapIndex.value = closestIndex;
    return closest;
  };

  const findDirectionalSnapPoint = (currentY: number, velocityY: number) => {
    'worklet';
    const adjustedY = currentY + keyboardHeightSV.value;
    const currentIndex = currentSnapIndex.value;
    const dragThreshold = 24;
    const velocityThreshold = 180;

    if (
      velocityY < -velocityThreshold ||
      adjustedY < snapPointsHeights[currentIndex] - dragThreshold
    ) {
      const nextIndex = Math.min(currentIndex + 1, snapPointsHeights.length - 1);
      currentSnapIndex.value = nextIndex;
      return snapPointsHeights[nextIndex];
    }

    if (
      velocityY > velocityThreshold ||
      adjustedY > snapPointsHeights[currentIndex] + dragThreshold
    ) {
      const nextIndex = Math.max(currentIndex - 1, 0);
      currentSnapIndex.value = nextIndex;
      return snapPointsHeights[nextIndex];
    }

    return findClosestSnapPoint(currentY);
  };


  const animateClose = () => {
    'worklet';
    translateY.value = withSpring(0, { damping: 50, stiffness: 400 });
    opacity.value = withTiming(0, { duration: 300 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newY = context.value.y + event.translationY;
      if (newY <= 0 && newY >= MAX_TRANSLATE_Y) {
        translateY.value = newY;
      }
    })
    .onEnd((event) => {
      const currentY = translateY.value;
      const velocity = event.velocityY;

      if (velocity > 500 && currentY > -SCREEN_HEIGHT * 0.2) {
        animateClose();
        return;
      }

      const closestSnapPoint = findDirectionalSnapPoint(currentY, velocity);
      const finalDestination = closestSnapPoint - keyboardHeightSV.value;
      scrollTo(finalDestination);
    });

  const rBottomSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const rBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const handleBackdropPress = () => {
    if (enableBackdropDismiss) {
      animateClose();
    }
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      statusBarTranslucent
      animationType="none"
      presentationStyle="overFullScreen">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)' }, rBackdropStyle]}>
          <TouchableWithoutFeedback onPress={handleBackdropPress}>
            <Animated.View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>

          {disablePanGesture ? (
            <BottomSheetContent
              children={children}
              title={title}
              style={style}
              rBottomSheetStyle={rBottomSheetStyle}
              cardColor={sheetBackgroundColor ?? backgroundColor}
              mutedColor={handleColor ?? mutedColor}
              scrollEnabled={scrollEnabled}
              handleWidth={handleWidth}
              handleHeight={handleHeight}
              titleStyle={titleStyle}
              contentContainerStyle={contentContainerStyle}
              headerBorderColor={headerBorderColor}
              showHeaderDivider={showHeaderDivider}
              headerPaddingHorizontal={headerPaddingHorizontal}
              sheetBorderRadius={sheetBorderRadius}
              bottomInset={insets.bottom}
            />
          ) : (
            <GestureDetector gesture={gesture}>
              <BottomSheetContent
                children={children}
                title={title}
                style={style}
                rBottomSheetStyle={rBottomSheetStyle}
                cardColor={sheetBackgroundColor ?? backgroundColor}
                mutedColor={handleColor ?? mutedColor}
                scrollEnabled={scrollEnabled}
                handleWidth={handleWidth}
                handleHeight={handleHeight}
                titleStyle={titleStyle}
                contentContainerStyle={contentContainerStyle}
                headerBorderColor={headerBorderColor}
                showHeaderDivider={showHeaderDivider}
                headerPaddingHorizontal={headerPaddingHorizontal}
                sheetBorderRadius={sheetBorderRadius}
                bottomInset={insets.bottom}
              />
            </GestureDetector>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export function useBottomSheet() {
  const [isVisible, setIsVisible] = React.useState(false);

  const open = React.useCallback(() => {
    setIsVisible(true);
  }, []);

  const close = React.useCallback(() => {
    setIsVisible(false);
  }, []);

  const toggle = React.useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  return {
    isVisible,
    open,
    close,
    toggle,
  };
}
