import React from 'react';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import { useThemeColors } from '@/hooks/use-theme-color';

type ProfileDetailRowProps = {
  title: string;
  value: string;
  onPress?: () => void;
  isLast?: boolean;
};

const ProfileDetailRow = ({ title, value, onPress, isLast = false }: ProfileDetailRowProps) => {
  const Container = onPress ? Pressable : View;
  const colors = useThemeColors();

  return (
    <Container
      className={`flex-row items-center justify-between px-2 py-4 ${isLast ? '' : 'border-b border-zinc-100 dark:border-zinc-800'}`}
      onPress={onPress}>
      <View className="flex-1 pr-4">
        <Text className="text-[16px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
          {title}
        </Text>
        <Text
          className="mt-1 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
          style={{ fontFamily: FONTS.main.regular }}>
          {value}
        </Text>
      </View>

      {onPress ? <ChevronRight color={colors.iconSubtle} size={18} strokeWidth={2.4} /> : null}
    </Container>
  );
};

export default ProfileDetailRow;
