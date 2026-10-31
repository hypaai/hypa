import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Image, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetch as expoFetch } from "expo/fetch";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { AlertCircle, Camera, Check, Copy, X } from "lucide-react-native";
import { streamAgent, toolLabels } from "@hypa/intelligence-core/agent-stream";
import { API_URL } from "@/api";
import { Text } from "@/components/ui/text";
import { FONTS } from "@/constants/fonts";
import { useSettings } from "@/context/settings-context";
import { useAiConsent } from "@/hooks/use-ai-consent";
import { useThemeColors } from "@/hooks/use-theme-color";
import { fitChatImage } from "@/lib/chat-turn";

type Phase = "camera" | "review" | "working" | "done" | "failed" | "cancelled";

/**
 * Opened by the keyboard's Ask camera button (keyboards can't use the camera).
 * The run uses the keyboard's requestId, so the keyboard picks up the answer
 * from the agent status endpoint when the user switches back.
 */
export default function AskCamera() {
  const params = useLocalSearchParams<{
    requestId?: string;
    input?: string;
    language?: string;
    provider?: string;
    model?: string;
  }>();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings, behavior, updateBehavior } = useSettings();
  const runWithConsent = useAiConsent({
    hasConsent: behavior.aiDataSharingConsent,
    updateBehavior,
  });
  const [phase, setPhase] = useState<Phase>("camera");
  const [photo, setPhoto] = useState<string>();
  const photoData = useRef("");
  // What the user typed in the keyboard; editable here, and empty falls back to the default.
  const [request, setRequest] = useState(params.input ?? "");
  const [status, setStatus] = useState("Reading your photo…");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  // The keyboard only watches its own requestId, and the server rejects a reused one.
  const sentKeyboardRun = useRef(false);
  const [linked, setLinked] = useState(true);

  const language = params.language || "English";
  const defaultInstruction = `Read the text in this photo. If it isn't in ${language}, translate it into ${language}.`;

  const capture = useCallback(async () => {
    setPhase("camera");
    setError("");
    try {
      if (!(await ImagePicker.requestCameraPermissionsAsync()).granted)
        throw new Error("Allow camera access in Settings to take a photo.");
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
      if (result.canceled || !result.assets[0]) {
        // Android can hand the user straight back to the app they were typing in.
        if (Platform.OS === "android") {
          BackHandler.exitApp();
          return;
        }
        setPhase("cancelled");
        return;
      }
      const asset = result.assets[0];
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize(fitChatImage(asset.width, asset.height));
      const rendered = await context.renderAsync();
      let image;
      try {
        image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      } finally {
        rendered.release();
        context.release();
      }
      if (!image.base64) throw new Error("Unable to prepare this photo.");
      photoData.current = image.base64;
      setPhoto(image.uri);
      setPhase("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
      setPhase("failed");
    }
  }, []);

  const send = useCallback(async () => {
    setError("");
    try {
      setPhase("working");
      setAnswer("");
      const linkedRun = Boolean(params.requestId) && !sentKeyboardRun.current;
      sentKeyboardRun.current = true;
      setLinked(linkedRun);
      await streamAgent({
        connection: { baseUrl: API_URL, token: settings?.token?.trim() || undefined, fetch: expoFetch as typeof fetch },
        body: {
          requestId: linkedRun ? params.requestId! : randomUUID(),
          input: request.trim() || defaultInstruction,
          provider: params.provider || settings?.assistantProvider || "meta",
          model: params.model || settings?.assistantModel || "muse-spark-1.3",
          surface: "keyboard",
          language,
          attachments: [{ data: photoData.current, mime: "image/jpeg" }],
        },
        onEvent: (event) => {
          if (event.type === "tool_call" && event.name !== "finish")
            setStatus(`${toolLabels(event.name).running}…`);
          else if (event.type === "done") {
            setAnswer(event.text);
            setPhase("done");
          } else if (event.type === "error") {
            setError(event.message);
            setPhase("failed");
          }
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Please try again.");
      setPhase("failed");
    }
  }, [defaultInstruction, language, params.model, params.provider, params.requestId, request, settings]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void capture();
  }, [capture]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const muted = { color: colors.textMuted, fontFamily: FONTS.main.regular, fontSize: 15 };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10}>
          <X color={colors.icon} size={22} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.text, fontFamily: FONTS.main.medium, fontSize: 17 }}>
          Ask Hypa
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 24 }}>
        {photo && (
          <Image
            source={{ uri: photo }}
            style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: colors.muted }}
            resizeMode="cover"
          />
        )}
        {phase === "review" ? (
          <>
            <TextInput
              value={request}
              onChangeText={setRequest}
              placeholder={defaultInstruction}
              placeholderTextColor={colors.placeholder}
              multiline
              style={{
                minHeight: 52,
                maxHeight: 140,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 18,
                backgroundColor: colors.muted,
                color: colors.inputText,
                fontFamily: FONTS.main.regular,
                fontSize: 16,
              }}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void capture()}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.muted,
                }}
              >
                <Text style={{ color: colors.text, fontFamily: FONTS.main.medium, fontSize: 16 }}>Retake</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => runWithConsent(() => void send())}
                style={{
                  flex: 2,
                  height: 48,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                }}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: FONTS.main.medium, fontSize: 16 }}>
                  Ask Hypa
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          phase !== "camera" && phase !== "cancelled" && (
            <Text style={muted} numberOfLines={2}>{request.trim() || defaultInstruction}</Text>
          )
        )}

        {phase === "working" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={colors.spinner} />
            <Text style={{ color: colors.text, fontFamily: FONTS.main.medium, fontSize: 16 }}>{status}</Text>
          </View>
        )}

        {phase === "done" && (
          <>
            <Text style={{ color: colors.text, fontFamily: FONTS.main.regular, fontSize: 20, lineHeight: 28 }} selectable>
              {answer}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Check color={colors.icon} size={18} />
              <Text style={{ ...muted, flex: 1 }}>
                {!linked
                  ? "Copy it, then paste it in your keyboard."
                  : Platform.OS === "android"
                    ? "Ready in your keyboard."
                    : "Ready in your keyboard. Tap ◀ at the top-left to go back."}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void Clipboard.setStringAsync(answer);
                setCopied(true);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" }}
            >
              <Copy color={colors.icon} size={18} />
              <Text style={{ color: colors.text, fontFamily: FONTS.main.medium, fontSize: 15 }}>
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
            {Platform.OS === "android" && (
              <Pressable
                accessibilityRole="button"
                onPress={() => BackHandler.exitApp()}
                style={{
                  height: 48,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                }}
              >
                <Text style={{ color: colors.primaryForeground, fontFamily: FONTS.main.medium, fontSize: 16 }}>
                  Back to App
                </Text>
              </Pressable>
            )}
          </>
        )}

        {(phase === "failed" || phase === "cancelled") && (
          <>
            {phase === "cancelled" && (
              <Text style={muted}>No photo taken. Tap ◀ at the top-left to go back, or take one now.</Text>
            )}
            {phase === "failed" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <AlertCircle color={colors.icon} size={18} />
                <Text style={{ ...muted, flex: 1, color: colors.text }}>{error}</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => (phase === "failed" && photo ? runWithConsent(() => void send()) : void capture())}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.primary,
              }}
            >
              <Camera color={colors.primaryForeground} size={18} />
              <Text style={{ color: colors.primaryForeground, fontFamily: FONTS.main.medium, fontSize: 16 }}>
                {phase === "failed" && photo ? "Try again" : "Take photo"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
