import { useUniwind } from "uniwind";

import { Colors, type ColorKey, type ThemeColors, type ThemeName } from "@/lib/colors";

type ColorOverrides = { light?: string; dark?: string };

export const useTheme = (): { theme: ThemeName; isDark: boolean; colors: ThemeColors } => {
    const { theme } = useUniwind();
    const resolvedTheme: ThemeName = theme === "dark" ? "dark" : "light";
    return {
        theme: resolvedTheme,
        isDark: resolvedTheme === "dark",
        colors: Colors[resolvedTheme],
    };
};

export const useColor = (colorName: ColorKey, overrides?: ColorOverrides): string => {
    const { theme, colors } = useTheme();
    const override = overrides?.[theme];
    return override ?? colors[colorName];
};

export const useThemeColors = (): ThemeColors => useTheme().colors;
