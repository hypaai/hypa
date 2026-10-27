import { Switch as NativeSwitch, type SwitchProps } from 'react-native';

import { useThemeColors } from '@/hooks/use-theme-color';

type Props = Omit<SwitchProps, 'value' | 'onValueChange'> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

function Switch({ checked, onCheckedChange, ...props }: Props) {
  const colors = useThemeColors();

  return (
    <NativeSwitch
      value={checked}
      onValueChange={onCheckedChange}
      trackColor={{ true: colors.primary }}
      thumbColor={checked ? colors.primaryForeground : undefined}
      {...props}
    />
  );
}

export { Switch };
