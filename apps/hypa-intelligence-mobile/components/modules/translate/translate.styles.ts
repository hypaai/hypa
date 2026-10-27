import { StyleSheet } from "react-native";

import { FONTS } from "@/constants/fonts";

export const translateStyles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  languageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
    marginBottom: 8,
    justifyContent: "center",
  },
  swapButton: {
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
  },
  panelSlot: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  recordButton: {
    width: 54,
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    borderRadius: 15,
  },
  recordButtonIdle: {
    paddingHorizontal: 0,
  },
  recordButtonActive: {
    paddingHorizontal: 0,
  },
  recordTimer: {
    fontSize: 12,
    fontFamily: FONTS.main.medium,
  },
  sourceToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: -4,
    marginBottom: 0,
  },
  thinkingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  resultFooterWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  resultFooter: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: "space-between",
  },
});
