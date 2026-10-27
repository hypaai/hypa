import React, { useEffect } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View, Text, useColorScheme } from 'react-native';
import { Search, ChevronDown, Check } from 'lucide-react-native';

import { useDictionaryModelLanguages } from '@/hooks/use-dictionary-model-languages';
import { BottomSheet, useBottomSheet } from '@/components/ui/bottom-sheet';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: (word: string, lang: string) => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  placeholder?: string;
  languagePickerDisabled?: boolean;
};

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  language,
  onLanguageChange,
  placeholder = 'Search any word',
  languagePickerDisabled = false,
}: Props) {
  const { isVisible: langOpen, open, close } = useBottomSheet();
  const modelLanguages = useDictionaryModelLanguages();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const bg = isDark ? '#0b0b0b' : '#fff';
  const borderColor = isDark ? '#222' : '#e6e6e6';
  const textColor = isDark ? '#e5e5e5' : '#222';
  const muted = isDark ? '#999' : '#666';
  const primary = isDark ? '#3b82f6' : '#2563eb';

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed, language);
  };

  useEffect(() => {
    if (modelLanguages.includes(language)) return;
    const fallback = modelLanguages.includes('English') ? 'English' : modelLanguages[0];
    if (language !== fallback) onLanguageChange(fallback);
  }, [language, modelLanguages, onLanguageChange]);

  useEffect(() => {
    if (languagePickerDisabled) close();
  }, [close, languagePickerDisabled]);

  return (
    <>
      <View style={[styles.bar, { backgroundColor: bg, borderColor }]}>
        <TouchableOpacity
          accessibilityState={{ disabled: languagePickerDisabled }}
          disabled={languagePickerDisabled}
          style={[styles.langTrigger, languagePickerDisabled && styles.disabled]}
          onPress={open}
          activeOpacity={0.8}>
          <Text style={[styles.langText, { color: muted }]} numberOfLines={1}>
            {language}
          </Text>
          <ChevronDown size={14} color={muted} />
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: borderColor }]} />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={handleSubmit}
          placeholder={placeholder}
          placeholderTextColor={muted}
          style={[styles.input, { color: textColor }]}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: primary, opacity: value.trim() ? 1 : 0.35 }]}
          onPress={handleSubmit}
          disabled={!value.trim()}
          activeOpacity={0.8}>
          <Search size={16} color={'#fff'} />
        </TouchableOpacity>
      </View>

      <BottomSheet
        isVisible={langOpen}
        onClose={close}
        title="Select Language"
        snapPoints={[0.62, 0.9]}
        scrollEnabled
        sheetBackgroundColor={bg}
        handleColor={muted}
        handleWidth={40}
        handleHeight={4}
        sheetBorderRadius={20}
        showHeaderDivider
        headerBorderColor={borderColor}
        titleStyle={styles.sheetTitle}
        contentContainerStyle={styles.sheetContent}>
        {modelLanguages.map((lang) => {
          const isSelected = language === lang;
          return (
            <TouchableOpacity
              key={lang}
              style={[
                styles.langOption,
                isSelected && { backgroundColor: isDark ? '#111827' : '#eef2ff' },
              ]}
              onPress={() => {
                onLanguageChange(lang);
                close();
              }}
              activeOpacity={0.8}>
              <Text
                style={{
                  fontSize: 15,
                  color: isSelected ? textColor : muted,
                  fontWeight: isSelected ? '600' : '400',
                }}>
                {lang}
              </Text>
              {isSelected && <Check size={14} color={textColor} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    overflow: 'hidden',
  },
  langTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: '100%',
  },
  disabled: { opacity: 0.5 },
  langText: { fontSize: 14, fontWeight: '500', maxWidth: 80 },
  divider: { width: 1, height: '50%', opacity: 0.5 },
  input: { flex: 1, paddingHorizontal: 12, fontSize: 14, height: '100%' },
  searchBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginRight: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
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
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 4,
    borderRadius: 10,
  },
});
