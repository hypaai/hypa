import { Text } from '@/components/ui/text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { FONTS } from '@/constants/fonts';
import { Check } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-color';

type SelectorOption = { name: string; displayName: string } | string;

type SelectorModalProps = {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  isOptionDisabled?: (params: { option: SelectorOption; name: string; label: string }) => boolean;
  hideSelectedIndicator?: boolean;
  renderOption?: (params: {
    option: SelectorOption;
    name: string;
    label: string;
    isSelected: boolean;
    isDisabled: boolean;
  }) => React.ReactNode;
  renderTrailing?: (params: {
    option: SelectorOption;
    name: string;
    label: string;
    isSelected: boolean;
    isDisabled: boolean;
  }) => React.ReactNode;
};

export function SelectorModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
  isOptionDisabled,
  hideSelectedIndicator = false,
  renderOption,
  renderTrailing,
}: SelectorModalProps) {
  const colors = useThemeColors();

  return (
    <BottomSheet
      isVisible={visible}
      onClose={onClose}
      title={title}
      snapPoints={[0.62, 0.9]}
      scrollEnabled
      handleColor={colors.border}
      handleWidth={40}
      handleHeight={4}
      sheetBorderRadius={20}
      showHeaderDivider
      headerBorderColor={colors.border}
      titleStyle={{
        textAlign: 'center',
        fontSize: 16,
        fontFamily: FONTS.main.medium,
        color: colors.text,
      }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 40,
      }}>
      {options.map((option) => {
        const name = typeof option === 'string' ? option : option.name;
        const label = typeof option === 'string' ? option : option.displayName;
        const isSelected = selected === name;
        const isDisabled = isOptionDisabled?.({ option, name, label }) ?? false;

        return (
          <Pressable
            key={name}
            className={`mb-1 flex-row items-center justify-between rounded-2xl px-4 py-4 ${
              isSelected ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-50 dark:bg-zinc-900'
            } ${isDisabled ? 'opacity-50' : ''}`}
            disabled={isDisabled}
            onPress={() => {
              onSelect(name);
              onClose();
            }}>
            <View className="flex-1">
              {renderOption ? (
                renderOption({ option, name, label, isSelected, isDisabled })
              ) : (
                <Text
                  className="text-[15px]"
                  style={{
                    fontFamily: FONTS.main.medium,
                    color: isSelected ? colors.primaryForeground : colors.text,
                  }}>
                  {label}
                </Text>
              )}
            </View>
            {renderTrailing ? (
              renderTrailing({ option, name, label, isSelected, isDisabled })
            ) : !hideSelectedIndicator && isSelected ? (
              <Check size={18} color={colors.primaryForeground} strokeWidth={2.5} />
            ) : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}
