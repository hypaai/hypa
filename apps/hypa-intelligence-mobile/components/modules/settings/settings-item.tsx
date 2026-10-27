import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

type SettingsItemProps = {
  icon: LucideIcon;
  title: string;
  value?: string;
  hasChevron?: boolean;
  isLast?: boolean;
  control?: React.ReactNode;
  onPress?: () => void;
};

export function SettingsItem({
  icon: Icon,
  title,
  value,
  hasChevron = false,
  isLast = false,
  control = null,
  onPress,
}: SettingsItemProps) {
  const Container = onPress ? Pressable : View;

  return (
    <Container
      className={`flex-row items-center px-2 py-4 ${isLast ? '' : 'border-b border-zinc-100 dark:border-zinc-800'}`}
      onPress={onPress}>
      <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-zinc-50 dark:bg-zinc-900">
        <Icon color="#52525B" size={20} strokeWidth={2} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
          {title}
        </Text>
        {value ? (
          <Text
            className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.regular }}>
            {value}
          </Text>
        ) : null}
      </View>
      {control ? (
        <View className="ml-2">{control}</View>
      ) : hasChevron ? (
        <ChevronRight color="#A1A1AA" size={18} strokeWidth={2.4} />
      ) : null}
    </Container>
  );
}
