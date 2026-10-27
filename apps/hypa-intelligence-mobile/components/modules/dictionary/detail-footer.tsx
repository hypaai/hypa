import React from 'react';
import { StyleSheet, View } from 'react-native';

import { FONTS } from '@/constants/fonts';
import { useThemeColors } from '@/hooks/use-theme-color';
import { Text } from '@/components/ui/text';

export function DictionaryDetailFooter() {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <Text
        className="text-center text-[14px]"
        style={[styles.copyright, { color: colors.textMuted, fontFamily: FONTS.main.medium }]}>
        {`© ${new Date().getFullYear()} Hypa. All rights reserved.`}
      </Text>
      <Text
        className="text-center text-[14px]"
        style={[styles.tagline, { color: colors.textMuted, fontFamily: FONTS.main.regular }]}>
        Preserving humanity&apos;s linguistic heritage.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 28,
    paddingBottom: 16,
    alignItems: 'center',
  },
  copyright: {
    textAlign: 'center',
  },
  tagline: {
    marginTop: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
