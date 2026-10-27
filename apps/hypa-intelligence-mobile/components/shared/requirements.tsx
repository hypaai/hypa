import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import {
  Check,
  Keyboard,
  Maximize2,
  Minimize2,
  type LucideIcon,
  Settings,
  ShieldAlert,
  ToggleRight,
} from 'lucide-react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

import Body from './body';
import { FONTS } from '@/constants/fonts';
import { showInputMethodPicker } from 'hypa-keyboard-input-method-picker';
import { useHypaKeyboardStatus } from '@/lib/use-hypa-keyboard-status';
import { Button } from '../ui/button';

const IOS_HOW_TO_VIDEO = require('@/assets/video/ios-how-to.mov');

type RequirementStep = {
  id: number;
  title: string;
  icon: LucideIcon;
  iconBgColor: string;
  iconColor: string;
  iconBorderColor?: string;
  actionLabel?: string;
  inlineHint?: boolean;
  multiline?: boolean;
};

const Requirements = () => {
  const { enabled, fullAccess, opened, selected, refresh } = useHypaKeyboardStatus();
  const isIOS = Platform.OS === 'ios';
  const activationConfirmed = isIOS ? opened : selected;
  const permissionConfirmed = isIOS ? fullAccess : enabled;
  const steps: RequirementStep[] = [
    {
      id: 1,
      title: enabled ? 'Hypa Keyboard is enabled' : 'Enable Hypa Keyboard',
      icon: enabled ? Check : Settings,
      multiline: true,
      iconBgColor: enabled ? '#111111' : '#F4F4F5',
      iconColor: enabled ? '#FFFFFF' : '#6B7280',
      actionLabel: enabled ? 'Enabled' : 'Take me there',
    },
    {
      id: 2,
      title: permissionConfirmed
        ? 'Permission confirmed'
        : isIOS
          ? 'Turn on Full Access'
          : 'Turn on Hypa Keyboard',
      iconBgColor: permissionConfirmed ? '#111111' : '#111111',
      iconColor: '#FFFFFF',
      icon: permissionConfirmed ? Check : ToggleRight,
    },
    {
      id: 3,
      title: permissionConfirmed
        ? isIOS
          ? 'Ready to open Hypa Intelligence'
          : 'Ready to choose as default'
        : isIOS
          ? 'Confirm the Full Access prompt'
          : 'Confirm the permission prompt',
      icon: permissionConfirmed ? Check : ShieldAlert,
      iconBgColor: '#FFFFFF',
      iconColor: '#111111',
      iconBorderColor: '#E4E4E7',
    },
    {
      id: 4,
      title: activationConfirmed
        ? isIOS
          ? 'Hypa Intelligence was opened'
          : 'Hypa Keyboard is your default'
        : isIOS
          ? 'Open Hypa Intelligence once'
          : 'Set it as your default keyboard',
      icon: activationConfirmed ? Check : ToggleRight,
      iconBgColor: activationConfirmed ? '#111111' : '#F4F4F5',
      iconColor: activationConfirmed ? '#FFFFFF' : '#6B7280',
      actionLabel: activationConfirmed
        ? isIOS
          ? 'Opened'
          : 'Selected'
        : isIOS
          ? 'How'
          : 'Set default',
    },
    {
      id: 5,
      title: activationConfirmed
        ? isIOS
          ? 'Activation confirmed'
          : 'Hypa Keyboard selected'
        : isIOS
          ? 'Choose it from the globe key'
          : 'Choose Hypa Keyboard',
      icon: Keyboard,
      iconBgColor: '#111111',
      iconColor: '#FFFFFF',
    },
    {
      id: 6,
      title: activationConfirmed ? 'Setup complete' : 'Come back here to continue',
      icon: Check,
      iconBgColor: activationConfirmed ? '#111111' : '#F4F4F5',
      iconColor: activationConfirmed ? '#FFFFFF' : '#111111',
      multiline: true,
    },
  ];

  const openKeyboardPicker = async () => {
    try {
      if (Platform.OS === 'android') {
        await showInputMethodPicker();
        refresh();
        return;
      }
      await Linking.openSettings();
    } catch {
      Alert.alert(
        'Unable to open keyboard picker',
        'Please open your device settings and choose Hypa Keyboard manually.'
      );
    }
  };

  const openKeyboardSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.INPUT_METHOD_SETTINGS');
        return;
      }
      await Linking.openSettings();
    } catch {
      Alert.alert(
        'Unable to open keyboard picker',
        'Please open your device settings and choose Hypa Keyboard manually.'
      );
    }
  };

  if (isIOS) {
    const isReady = enabled && fullAccess;
    const statusLabel = isReady ? 'Ready' : enabled ? 'Full Access needed' : 'Not enabled';

    return (
      <Body showBackground hideHorizontalInset hideTopInset>
        <View className="flex-1 px-5 pt-5">
          <Text
            className="text-center text-[20px] text-zinc-700 dark:text-white"
            style={{ fontFamily: FONTS.main.medium }}>
            Enable Hypa Keyboard
          </Text>

          <IOSKeyboardSetupCard
            isReady={isReady}
            onOpenSettings={openKeyboardSettings}
            statusLabel={statusLabel}
          />

          <View className="mt-auto items-center px-6 pt-16 pb-10">
            <Text
              className="text-center text-[13px] leading-5 text-zinc-400"
              style={{ fontFamily: FONTS.main.light }}>
              By installing, you are agreeing to Hypa Intelligence&apos;s{' '}
              <Text
                className="text-zinc-900 dark:text-white"
                style={{ fontFamily: FONTS.main.regular }}>
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                className="text-zinc-900 dark:text-white"
                style={{ fontFamily: FONTS.main.regular }}>
                Privacy Policy
              </Text>
            </Text>
          </View>
        </View>
      </Body>
    );
  }

  return (
    <Body showBackground hideHorizontalInset hideTopInset>
      <View className="flex-1 px-4 pt-5">
        <View className="mr-5 flex-row items-center justify-center gap-3">
          <Text
            className="text-center text-[20px] text-zinc-700 dark:text-white"
            style={{ fontFamily: FONTS.main.medium }}>
            Set Up Hypa Keyboard
          </Text>
        </View>

        <View className="mt-12 gap-7">
          {steps.map((step) => {
            const Icon = step.icon;

            return (
              <View key={step.id} className="flex-row items-start">
                <View className="mr-3 h-7 w-7 items-center justify-center rounded-full border border-zinc-900 dark:border-white">
                  <Text
                    className="text-[13px] text-zinc-900 dark:text-white"
                    style={{ fontFamily: FONTS.main.medium }}>
                    {step.id}
                  </Text>
                </View>

                <View className="mt-0.5 mr-3 h-7 w-7 items-center justify-center rounded-md">
                  <View
                    className="h-7 w-7 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: step.iconBgColor,
                      borderWidth: step.iconBorderColor ? 1 : 0,
                      borderColor: step.iconBorderColor,
                    }}>
                    <Icon color={step.iconColor} size={16} strokeWidth={2} />
                  </View>
                </View>

                <View className="flex-1 flex-row items-center">
                  <Text
                    className={`mt-1 flex-1 text-zinc-600 dark:text-white ${step.multiline ? 'leading-6' : ''}`}
                    style={{ fontFamily: FONTS.main.regular, fontSize: 16 }}>
                    {step.title}
                  </Text>

                  {step.id === 1 ? (
                    <Button variant="outline" onPress={openKeyboardSettings} disabled={enabled}>
                      <Text
                        className="text-[14px] text-zinc-900 dark:text-white"
                        style={{ fontFamily: FONTS.main.medium }}>
                        {step.actionLabel}
                      </Text>
                    </Button>
                  ) : null}
                  {step.id === 4 ? (
                    <Button
                      variant="outline"
                      onPress={openKeyboardPicker}
                      disabled={activationConfirmed}>
                      <Text
                        className="text-[14px] text-zinc-900 dark:text-white"
                        style={{ fontFamily: FONTS.main.medium }}>
                        {step.actionLabel}
                      </Text>
                    </Button>
                  ) : null}

                  {step.inlineHint ? (
                    <View className="ml-3 h-4 w-4 items-center justify-center rounded-full border border-zinc-900">
                      <Text
                        className="text-[10px] text-zinc-900"
                        style={{ fontFamily: FONTS.main.medium }}>
                        i
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View className="mt-auto items-center px-6 pt-16 pb-10">
          <Text
            className="text-center text-[13px] leading-5 text-zinc-400"
            style={{ fontFamily: FONTS.main.light }}>
            By installing, you are agreeing to Hypa Intelligence&apos;s{' '}
            <Text className="text-zinc-900" style={{ fontFamily: FONTS.main.regular }}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text className="text-zinc-900" style={{ fontFamily: FONTS.main.regular }}>
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
    </Body>
  );
};

type IOSKeyboardSetupCardProps = {
  isReady: boolean;
  onOpenSettings: () => void;
  statusLabel: string;
};

function IOSKeyboardSetupCard({
  isReady,
  onOpenSettings,
  statusLabel,
}: IOSKeyboardSetupCardProps) {
  const [isVideoExpanded, setIsVideoExpanded] = React.useState(false);
  const player = useVideoPlayer(IOS_HOW_TO_VIDEO, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  return (
    <View className="mt-8 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-md bg-zinc-900">
            {isReady ? (
              <Check color="#FFFFFF" size={20} strokeWidth={2.4} />
            ) : (
              <Settings color="#FFFFFF" size={20} strokeWidth={2.4} />
            )}
          </View>
          <View>
            <Text
              className="text-[16px] text-zinc-900 dark:text-white"
              style={{ fontFamily: FONTS.main.medium }}>
              Hypa Keyboard
            </Text>
            <Text
              className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400"
              style={{ fontFamily: FONTS.main.regular }}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      <View
        className="mt-5 overflow-hidden rounded-md bg-zinc-950"
        style={isVideoExpanded ? styles.iosHowToFrameExpanded : styles.iosHowToFrameCollapsed}>
        <VideoView
          allowsPictureInPicture={false}
          contentFit="cover"
          nativeControls={false}
          player={player}
          style={styles.iosHowToVideo}
        />
        <Button
          className="absolute top-2 right-2 h-8 w-8 border-zinc-200 bg-white/95 p-0"
          onPress={() => setIsVideoExpanded((current) => !current)}
          size="icon"
          variant="outline">
          {isVideoExpanded ? (
            <Minimize2 color="#111111" size={15} strokeWidth={2.4} />
          ) : (
            <Maximize2 color="#111111" size={15} strokeWidth={2.4} />
          )}
        </Button>
      </View>

      <Text
        className="mt-4 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
        style={{ fontFamily: FONTS.main.regular }}>
        Settings &gt; General &gt; Keyboard &gt; Keyboards &gt; Add New Keyboard. Select Hypa
        Keyboard, then turn on Allow Full Access.
      </Text>

      <View className="mt-5 flex-row gap-3">
        <Button className="flex-1" onPress={onOpenSettings}>
          <Text className="text-[14px] text-white" style={{ fontFamily: FONTS.main.medium }}>
            Open Settings
          </Text>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iosHowToFrameCollapsed: {
    alignSelf: 'center',
    width: '50%',
  },
  iosHowToFrameExpanded: {
    alignSelf: 'stretch',
    width: '100%',
  },
  iosHowToVideo: {
    aspectRatio: 9 / 16,
    width: '100%',
  },
});

export default Requirements;
