import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import {
  Check,
  Sparkles,
  ChevronDown,
} from "lucide-react-native";
import { FONTS } from "@/constants/fonts";
import type { LanguagePreset } from "@/constants/app";
import { useTheme, useThemeColors } from "@/hooks/use-theme-color";
import { BottomSheet, useBottomSheet } from "@/components/ui/bottom-sheet";

interface LanguageSelectorProps {
  value?: string;
  languages: LanguagePreset[];
  onChange?: (value: string) => void;
  title: string;
}

const LanguageSelector = ({
  value,
  languages,
  onChange,
  title,
}: LanguageSelectorProps) => {
  const {
    surface: cardColor,
    text: textColor,
    border,
    textMuted,
  } = useThemeColors();
  const { isDark } = useTheme();
  const { isVisible, open, close } = useBottomSheet();

  const suggestedLanguages = useMemo(() => {
    return languages;
  }, [languages]);

  const handleLanguageSelect = (language: LanguagePreset) => {
    onChange?.(language.name);
    close();
  };

  const renderSuggestedLanguageItem = useCallback(
    ({ item }: { item: LanguagePreset }) => {
      const isSelected = value === item.name;
      return (
        <TouchableOpacity
          onPress={() => handleLanguageSelect(item)}
          style={[
            styles.suggestedLanguageItem,
            isSelected && {
              backgroundColor: isDark ? '#111827' : '#eef2ff',
            },
          ]}
        >
          <View style={styles.languageItemContent}>
            {item.id === "auto" && (
              <Icon
                name={Sparkles}
                size={20}
                color={isSelected ? textColor : textMuted}
              />
            )}
            <Text
              style={[
                styles.languageItemText,
                { color: isSelected ? textColor : textMuted },
                isSelected && styles.selectedLanguageItemText,
              ]}
            >
              {item.name}
            </Text>
            {isSelected && <Icon name={Check} size={14} color={textColor} />}
          </View>
        </TouchableOpacity>
      );
    },
    [textColor, textMuted, value]
  );

  return (
    <View>
      <TouchableOpacity
        onPress={open}
        style={{
          backgroundColor: cardColor,
          borderRadius: 24,
          paddingHorizontal: 16,
          paddingVertical: 8,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 6,
          borderColor: border,
          borderWidth: 1,
          minWidth: 118,
          maxWidth: 150,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: FONTS.main.medium,
            fontSize: 14,
            color: textMuted,
            textTransform: "capitalize",
            flexShrink: 1,
            maxWidth: 80,
          }}
        >
          {value}
        </Text>
        <Icon name={ChevronDown} size={14} color={textMuted} />
      </TouchableOpacity>

      <BottomSheet
        isVisible={isVisible}
        onClose={close}
        title={title}
        snapPoints={[0.62, 0.9]}
        scrollEnabled
        sheetBackgroundColor={cardColor}
        handleColor={textMuted}
        handleWidth={40}
        handleHeight={4}
        sheetBorderRadius={20}
        showHeaderDivider
        headerBorderColor={border}
        titleStyle={styles.sheetTitle}
        contentContainerStyle={styles.sheetContent}
      >
        <FlatList
          data={suggestedLanguages}
          keyExtractor={(item) => item.id || item.name}
          renderItem={renderSuggestedLanguageItem}
          scrollEnabled={false}
        />
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  suggestedLanguageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 10,
    marginBottom: 8,
  },
  languageItemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
  },
  languageItemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.main.regular,
  },
  selectedLanguageItemText: {
    fontWeight: '600',
  },
});

export default LanguageSelector;
