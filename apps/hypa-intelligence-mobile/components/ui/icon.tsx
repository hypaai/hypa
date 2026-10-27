import { LucideProps } from "lucide-react-native";
import React from "react";

type Props = LucideProps & {
  lightColor?: string;
  darkColor?: string;
  name?: React.ComponentType<LucideProps>;
  as?: React.ComponentType<LucideProps>;
};

export function Icon({
  lightColor,
  darkColor,
  name: IconComponent,
  as,
  color,
  size = 24,
  strokeWidth = 1.8,
  ...rest
}: Props) {
  const iconColor = color;

  const Component = IconComponent ?? as;
  if (!Component) return null;

  return (
    <Component
      color={iconColor}
      size={size}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      {...rest}
    />
  );
}
