import React from 'react';
import { FlatList, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown, Volume2, X } from 'lucide-react-native';

import { BottomSheet, useBottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import { useThemeColors } from '@/hooks/use-theme-color';

type VoiceSelectorProps = {
  value?: string;
  voices: string[];
  onChange?: (value: string) => void;
  title: string;
  disabled?: boolean;
};

const VoiceSelector = ({ value, voices, onChange, title, disabled }: VoiceSelectorProps) => {
  const { surface: cardColor, text: textColor, primary, border } = useThemeColors();
  const { isVisible, open, close } = useBottomSheet();

  const handleVoiceSelect = (voice: string) => {
    onChange?.(voice);
    close();
  };

  const renderVoiceItem = ({ item }: { item: string }) => {
    const isSelected = value === item;
    return (
      <TouchableOpacity
        onPress={() => handleVoiceSelect(item)}
        style={[
          styles.voiceItem,
          {
            backgroundColor: isSelected ? primary : 'transparent',
            borderColor: border,
          },
        ]}>
        <View style={styles.voiceItemContent}>
          <Icon name={Volume2} size={18} color={isSelected ? cardColor : textColor} />
          <Text style={[styles.voiceItemText, { color: isSelected ? cardColor : textColor }]}>
            {item}
          </Text>
          {isSelected && <Icon name={Check} size={16} color={cardColor} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <TouchableOpacity
        onPress={open}
        disabled={disabled}
        style={{ alignItems: 'center', flexDirection: 'row', gap: 6, opacity: disabled ? 0.3 : 1 }}>
        <Icon name={Volume2} size={14} color={textColor} />
        <Text
          numberOfLines={1}
          style={{ fontFamily: FONTS.main.semiBold, color: textColor, fontSize: 12, maxWidth: 96 }}>
          {value || 'Auto'}
        </Text>
        <Icon name={ChevronDown} size={14} color={textColor} />
      </TouchableOpacity>

      <BottomSheet
        isVisible={isVisible}
        onClose={close}
        snapPoints={[0.5, 0.6]}
        scrollEnabled={false}
        title={title}>
        <View style={styles.bottomSheetContent}>
          <View style={styles.sheetHeader}>
            <Text
              style={{ flex: 1, color: textColor, fontFamily: FONTS.main.semiBold, fontSize: 20 }}>
              {title || 'Voice'}
            </Text>
            <Pressable onPress={close} style={{ padding: 8 }}>
              <Icon name={X} size={20} color={textColor} />
            </Pressable>
          </View>
          <FlatList
            data={voices}
            keyExtractor={(item) => item}
            renderItem={renderVoiceItem}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  voiceItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  voiceItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceItemText: {
    fontSize: 14,
    fontFamily: FONTS.main.medium,
    flex: 1,
  },
});

export default VoiceSelector;
