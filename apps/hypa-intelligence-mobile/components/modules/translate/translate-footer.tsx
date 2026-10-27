import React from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";

import { Text } from "@/components/ui/text";
import { FONTS } from "@/constants/fonts";

type TranslateFooterProps = {
  background: string;
  primary: string;
  text: string;
  isValid: boolean;
  isClearMode: boolean;
  isTranslating: boolean;
  isTranscribing: boolean;
  onPress: () => void;
};

export const TranslateFooter = ({
  background,
  primary,
  text,
  isValid,
  isClearMode,
  isTranslating,
  isTranscribing,
  onPress,
}: TranslateFooterProps) => (
  <View>
    <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
      <TouchableOpacity
        disabled={isClearMode ? false : !isValid || isTranslating || isTranscribing}
        onPress={onPress}
        activeOpacity={0.86}
        style={{
          alignSelf: "center",
          width: "100%",
          minHeight: 40,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isClearMode ? background : primary,
          opacity: isClearMode || (isValid && !isTranscribing) ? 1 : 0.5,
        }}>
        {isTranslating ? (
          <ActivityIndicator color={isClearMode ? text : background} />
        ) : isClearMode ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <X size={16} color={text} />
            <Text style={{ color: text, fontFamily: FONTS.main.medium }}>Clear</Text>
          </View>
        ) : (
          <Text style={{ color: background, fontFamily: FONTS.main.medium }}>Translate</Text>
        )}
      </TouchableOpacity>
    </View>
  </View>
);
