import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import type { LucideIcon } from 'lucide-react-native';
import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-color';

type StepperItemProps = {
  icon: LucideIcon;
  title: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  isLast?: boolean;
  onChange: (value: number) => void;
};

export function StepperItem({
  icon: Icon,
  title,
  value,
  unit,
  min,
  max,
  step = 1,
  isLast = false,
  onChange,
}: StepperItemProps) {
  const colors = useThemeColors();

  return (
    <View className={`flex-row items-center px-2 py-4 ${isLast ? '' : 'border-b border-zinc-100 dark:border-zinc-800'}`}>
      <View className="mr-4 h-10 w-10 items-center justify-center rounded-full bg-zinc-50 dark:bg-zinc-900">
        <Icon color="#52525B" size={20} strokeWidth={2} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
          {title}
        </Text>
        <Text className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400" style={{ fontFamily: FONTS.main.regular }}>
          {value}
          {unit}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          className="h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800"
          onPress={() => value > min && onChange(value - step)}>
          <Minus size={14} color={colors.iconMuted} strokeWidth={2.5} />
        </Pressable>
        <Pressable
          className="h-8 w-8 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100"
          onPress={() => value < max && onChange(value + step)}>
          <Plus size={14} color={colors.primaryForeground} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}
