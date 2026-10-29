import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Share,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronUp,
  History,
  ImagePlus,
  Info,
  Keyboard,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  Volume2,
  Waves,
  X,
} from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { randomUUID } from "expo-crypto";
import { MODELS, getAssistantModels } from "@hypa/config/models";
import privacy from "@hypa/config/json/chat-privacy.json";
import { toolLabels } from "@hypa/intelligence-core/agent-stream";
import {
  archiveConversation,
  deleteConversation,
  listConversations,
  type ChatImage,
  type ChatMessage,
  type Conversation,
} from "@/api/conversations";
import Body from "@/components/shared/body";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { SelectorModal } from "@/components/modules/settings/selector-modal";
import { useSettings } from "@/context/settings-context";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useChatAudio } from "@/hooks/use-chat-audio";
import { useSpeechRecorder } from "@/hooks/use-speech-recorder";
import { useAiConsent } from "@/hooks/use-ai-consent";
import { useThemeColors } from "@/hooks/use-theme-color";
import { useToast } from "@/lib/toast";
import { fitChatImage } from "@/lib/chat-turn";
import { shareAudioFromUri } from "@/lib/share-audio";
import { languageCodeToName } from "@/lib/model-languages";
import { synthesizeSpeech } from "@/lib/product-api";
import { FONTS } from "@/constants/fonts";
import { Text } from "@/components/ui/text";

const STARTERS = [
  "Translate this for my mum and read it in Igbo.",
  "Explain this form in Hausa.",
  "What does ìfẹ́ mean?",
  "Help me price this order and draft a bilingual reply.",
];

export function ChatScreen({
  id,
  resetKey,
}: {
  id?: string;
  resetKey?: string;
}) {
  const chat = useAgentChat(id, resetKey);
  const colors = useThemeColors();
  const {
    settings,
    languages,
    behavior,
    updateBehavior,
    updateSettings,
    resolvePlaybackVoice,
  } = useSettings();
  const toast = useToast();
  const audio = useChatAudio(chat.connection);
  const queryClient = useQueryClient();
  const focused = useIsFocused();
  const focusRef = useRef(focused);
  focusRef.current = focused;
  const list = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<ChatImage[]>([]);
  const [picking, setPicking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceRef = useRef(false);
  const [menu, setMenu] = useState<ChatMessage | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const locked = chat.busy || Boolean(chat.pending);
  const mounted = useRef(true);
  const session = useRef(0);
  const recordingOwner = useRef<number | null>(null);
  const runWithConsent = useAiConsent({
    hasConsent: behavior.aiDataSharingConsent,
    updateBehavior,
  });
  const token = chat.connection.token;
  const imageSource = (uri: string) => ({
    uri,
    ...(uri.startsWith(chat.connection.baseUrl) && token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : {}),
  });
  const report = useCallback(
    (error: unknown) =>
      toast.showError(
        "Chat",
        error instanceof Error ? error.message : "Please try again.",
      ),
    [toast],
  );
  const stopVoice = useCallback(() => {
    voiceRef.current = false;
    recordingOwner.current = null;
    setVoiceMode(false);
    audio.stop();
  }, [audio.stop]);
  const startListening = useRef<() => void>(() => {});

  useEffect(() => {
    session.current++;
    setDraft("");
    setImages([]);
    setPhoto(null);
    setMenu(null);
    stopVoice();
  }, [token, id, resetKey, stopVoice]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      session.current++;
    };
  }, []);
  useFocusEffect(
    useCallback(
      () => () => {
        session.current++;
        stopVoice();
      },
      [stopVoice],
    ),
  );

  const afterReply = useCallback(
    async (reply: ChatMessage | null) => {
      if (!reply || reply.status !== "success" || !focusRef.current) {
        if (voiceRef.current) stopVoice();
        return;
      }
      if (reply.audioUrl && (voiceRef.current || behavior.autoPlayAudio)) {
        await audio.play(
          reply.id,
          () => audio.resolveUrl(reply.audioUrl!),
          () => {
            if (voiceRef.current && focusRef.current) startListening.current();
          },
        );
      } else if (voiceRef.current) {
        stopVoice();
        toast.showInfo(
          "No spoken reply was returned. Tap the microphone to continue.",
        );
      }
    },
    [audio.play, audio.resolveUrl, behavior.autoPlayAudio, stopVoice, toast],
  );

  const submit = useCallback(
    async (text: string, attachments: ChatImage[] = [], voice = false) => {
      audio.stop();
      const owner = session.current;
      const reply = await chat.send(text, attachments, voice);
      if (owner !== session.current || !mounted.current) return;
      await afterReply(reply);
    },
    [chat.send, audio.stop, afterReply],
  );
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const recorder = useSpeechRecorder({
    asrModel: settings?.sttModel ?? "",
    provider: settings?.sttProvider,
    onTranscript: (text) => {
      if (
        recordingOwner.current !== session.current ||
        !mounted.current ||
        !focusRef.current
      )
        return;
      recordingOwner.current = null;
      void submitRef.current(text, [], voiceRef.current).catch(report);
    },
    runWithConsent,
    stopPlayers: audio.stop,
    toast,
  });
  startListening.current = () => {
    if (!mounted.current || !focusRef.current) return;
    recordingOwner.current = session.current;
    const owner = session.current;
    void recorder.startRecording().then((started) => {
      if (!started && owner === session.current) stopVoice();
    });
  };
  const cancelRecorder = useRef(recorder.cancelRecording);
  cancelRecorder.current = recorder.cancelRecording;
  useFocusEffect(
    useCallback(
      () => () => {
        void cancelRecorder.current();
      },
      [],
    ),
  );
  useEffect(() => {
    void cancelRecorder.current();
  }, [token, id, resetKey]);

  const chats = useInfiniteQuery({
    queryKey: ["agent-chats", chat.userId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listConversations(chat.connection, pageParam),
    getNextPageParam: (page) =>
      page.meta.page < page.meta.totalPages ? page.meta.page + 1 : undefined,
    enabled: Boolean(chat.userId && historyOpen),
  });
  const conversations = chats.data?.pages.flatMap((page) => page.data) ?? [];
  const assistantOptions = useMemo(
    () =>
      Object.keys(MODELS).flatMap((provider) =>
        getAssistantModels(provider).map((model) => ({
          name: `${provider}/${model.name}`,
          displayName: `${provider} · ${model.displayName}`,
        })),
      ),
    [],
  );
  const selectedAssistant = `${settings?.assistantProvider ?? "meta"}/${settings?.assistantModel ?? "muse-spark-1.3"}`;

  const pickImages = async (camera: boolean) => {
    if (images.length >= 4) {
      toast.showInfo("Attach up to four photos.");
      return;
    }
    const owner = session.current;
    setPicking(true);
    try {
      if (
        camera &&
        !(await ImagePicker.requestCameraPermissionsAsync()).granted
      )
        throw new Error("Camera permission is required to take a photo.");
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: 4 - images.length,
            quality: 1,
          });
      if (result.canceled) return;
      const added: ChatImage[] = [];
      for (const asset of result.assets.slice(0, 4 - images.length)) {
        const context = ImageManipulator.manipulate(asset.uri);
        context.resize(fitChatImage(asset.width, asset.height));
        const rendered = await context.renderAsync();
        try {
          const image = await rendered.saveAsync({
            format: SaveFormat.JPEG,
            compress: 0.8,
            base64: true,
          });
          if (!image.base64) throw new Error("Unable to prepare this photo.");
          added.push({
            uri: image.uri,
            data: image.base64,
            mime: "image/jpeg",
          });
        } finally {
          rendered.release();
          context.release();
        }
      }
      if (owner !== session.current || !mounted.current) return;
      if (
        [...images, ...added].reduce(
          (sum, image) => sum + (image.data?.length ?? 0),
          0,
        ) >
        8 * 1024 * 1024
      )
        throw new Error(
          "These photos are too large together. Attach fewer photos.",
        );
      setImages((current) => [...current, ...added].slice(0, 4));
    } catch (error) {
      if (owner === session.current) report(error);
    } finally {
      if (mounted.current) setPicking(false);
    }
  };

  const updateChat = async (item: Conversation, remove: boolean) => {
    if (!remove && item.kind === "keyboard") return;
    try {
      if (remove) await deleteConversation(chat.connection, item.id);
      else await archiveConversation(chat.connection, item.id);
      await queryClient.invalidateQueries({
        queryKey: ["agent-chats", chat.userId],
      });
      if (chat.chatId === item.id) {
        stopVoice();
        chat.reset();
        router.replace("/chat");
      }
    } catch (error) {
      report(error);
    }
  };
  const deleteCurrent = () => {
    if (!chat.chatId || locked) return;
    Alert.alert(
      "Delete chat?",
      "This removes this chat’s messages, images and audio.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void updateChat(
              { id: chat.chatId!, title: "", created_at: "" },
              true,
            ),
        },
      ],
    );
  };
  const speak = async (message: ChatMessage) => {
    const language = settings?.ttsLanguage || languages.targetLang;
    const voice = resolvePlaybackVoice("output", language);
    if (!voice) {
      toast.showInfo(
        "Your speech model has no voice for this language. Choose one in Settings.",
      );
      return;
    }
    await audio.play(message.id, async () => {
      const result = await synthesizeSpeech({
        text: message.content,
        language: languageCodeToName(language) || language,
        voice,
        model: settings?.ttsModel ?? "",
        provider: settings?.ttsProvider,
      });
      return `data:${result.audio_type};base64,${result.audio_b64}`;
    });
  };
  const iconButton = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={action}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        backgroundColor: pressed ? colors.muted : "transparent",
      })}
    >
      {icon}
    </Pressable>
  );
  const messageSize = voiceMode
    ? { fontSize: 26, lineHeight: 34 }
    : { fontSize: 16, lineHeight: 24 };
  const canSend =
    !locked &&
    !picking &&
    !recorder.isRecording &&
    !recorder.isBusy &&
    Boolean(draft.trim() || images.length);
  const send = () =>
    runWithConsent(() => {
      const text = draft;
      const attached = images;
      setDraft("");
      setImages([]);
      void submit(text, attached).catch(report);
    });
  const toggleRecording = () => {
    if (recorder.isRecording) void recorder.stopRecording();
    else
      runWithConsent(() => {
        recordingOwner.current = session.current;
        void recorder.startRecording();
      });
  };
  const modelName =
    assistantOptions.find((option) => option.name === selectedAssistant)
      ?.displayName ?? "meta · Muse Spark 1.3";

  return (
    <Body
      showBackground={false}
      enableScroll={false}
      hideBottomInset={process.env.EXPO_OS !== "ios"}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={process.env.EXPO_OS === "ios" ? insets.top : 0}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingTop: 8,
          }}
        >
          {id &&
            iconButton(
              "Back to Chat",
              <ArrowLeft color={colors.icon} size={21} />,
              () => router.back(),
            )}
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              color: colors.text,
              fontFamily: FONTS.main.semiBold,
              fontSize: 26,
              lineHeight: 34,
            }}
          >
            Chat
          </Text>
          {token &&
            iconButton(
              "Chat history",
              <History color={colors.icon} size={21} />,
              () => setHistoryOpen(true),
              locked,
            )}
          {chat.chatId &&
            token &&
            iconButton(
              "Delete chat",
              <Trash2 color={colors.icon} size={19} />,
              deleteCurrent,
              locked,
            )}
          <GlassIconButton
            accessibilityLabel="New chat"
            fallbackClassName="bg-zinc-100 dark:bg-zinc-900"
            disabled={locked}
            onPress={() => {
              stopVoice();
              setDraft("");
              setImages([]);
              if (id)
                router.replace({
                  pathname: "/chat",
                  params: { new: randomUUID() },
                });
              else chat.reset();
            }}
          >
            <Plus color={colors.icon} size={22} />
          </GlassIconButton>
          <GlassIconButton
            accessibilityLabel="Profile"
            fallbackClassName="bg-zinc-100 dark:bg-zinc-900"
            onPress={() => router.push("/profile")}
          >
            <UserRound color={colors.icon} size={20} />
          </GlassIconButton>
        </View>
        <View
          style={{
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 12,
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Assistant model: ${modelName}. Change`}
            onPress={() => setPickerOpen(true)}
            style={{
              flexShrink: 1,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingVertical: 5,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: colors.muted,
            }}
          >
            <Sparkles color={colors.iconMuted} size={13} />
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: FONTS.main.medium,
                fontSize: 13,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {modelName}
            </Text>
            <ChevronDown color={colors.iconMuted} size={13} />
          </Pressable>
          {!token && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/profile")}
              hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
            >
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: FONTS.main.medium,
                  fontSize: 13,
                  textDecorationLine: "underline",
                }}
              >
                Sign in to keep your chats
              </Text>
            </Pressable>
          )}
        </View>
        {chat.error ? (
          <View
            style={{
              gap: 10,
              padding: 14,
              marginTop: 8,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", gap: 8 }}>
              <AlertCircle color={colors.icon} size={18} />
              <Text selectable style={{ color: colors.text, flex: 1 }}>
                {chat.error}
              </Text>
            </View>
            {chat.pending && !chat.busy && (
              <Pressable
                accessibilityRole="button"
                onPress={() => void chat.reconnect()}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                }}
              >
                <Text
                  style={{
                    color: colors.primaryForeground,
                    fontFamily: FONTS.main.medium,
                  }}
                >
                  Reconnect
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
        <FlatList
          ref={list}
          data={chat.messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={{ gap: 20, paddingVertical: 16, flexGrow: 1 }}
          onContentSizeChange={() =>
            list.current?.scrollToEnd({ animated: false })
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ gap: 14, flex: 1, justifyContent: "center" }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 24,
                  fontFamily: FONTS.main.medium,
                }}
              >
                {chat.loading
                  ? "Loading your chat…"
                  : "What can I help you do?"}
              </Text>
              {!chat.loading &&
                STARTERS.map((starter) => (
                  <Pressable
                    key={starter}
                    onPress={() => setDraft(starter)}
                    style={{
                      padding: 16,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text }}>{starter}</Text>
                  </Pressable>
                ))}
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.role === "user";
            return (
              <Pressable
                onLongPress={() => setMenu(item)}
                delayLongPress={300}
                accessibilityLabel={`${mine ? "You" : "Hypa"}: ${item.content}`}
                accessibilityHint="Long press for options"
                style={
                  mine
                    ? {
                        gap: 8,
                        alignSelf: "flex-end",
                        maxWidth: "85%",
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 22,
                        borderBottomRightRadius: 6,
                        backgroundColor: colors.muted,
                      }
                    : { gap: 8, alignSelf: "stretch" }
                }
              >
                {!mine && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Image
                      source={require("@/assets/images/icon.png")}
                      accessibilityIgnoresInvertColors
                      style={{ width: 22, height: 22, borderRadius: 11 }}
                    />
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontFamily: FONTS.main.medium,
                        fontSize: 13,
                      }}
                    >
                      Hypa
                    </Text>
                  </View>
                )}
                {item.images?.length ? (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      flexWrap: "wrap",
                      justifyContent: mine ? "flex-end" : "flex-start",
                    }}
                  >
                    {item.images.map((image) => (
                      <Pressable
                        key={image.uri}
                        accessibilityLabel="Open attached photo"
                        onPress={() => setPhoto(image.uri)}
                      >
                        <Image
                          source={imageSource(image.uri)}
                          style={{ width: 120, height: 120, borderRadius: 14 }}
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {mine ? (
                  item.content ? (
                    <Text
                      selectable
                      style={{
                        color: colors.text,
                        fontFamily: FONTS.main.regular,
                        ...messageSize,
                      }}
                    >
                      {item.content}
                    </Text>
                  ) : null
                ) : item.content ? (
                  <Markdown
                    style={{
                      body: {
                        color: colors.text,
                        fontFamily: FONTS.main.regular,
                        ...messageSize,
                      },
                      strong: { fontFamily: FONTS.main.semiBold },
                      heading1: {
                        fontFamily: FONTS.main.semiBold,
                        fontSize: 22,
                        lineHeight: 30,
                      },
                      heading2: {
                        fontFamily: FONTS.main.semiBold,
                        fontSize: 19,
                        lineHeight: 27,
                      },
                      heading3: {
                        fontFamily: FONTS.main.semiBold,
                        fontSize: 17,
                      },
                      bullet_list_icon: { color: colors.textMuted },
                      ordered_list_icon: { color: colors.textMuted },
                      blockquote: {
                        backgroundColor: colors.muted,
                        borderLeftColor: colors.border,
                        borderLeftWidth: 3,
                        paddingHorizontal: 12,
                      },
                      code_inline: {
                        color: colors.text,
                        backgroundColor: colors.muted,
                        borderRadius: 4,
                      },
                      fence: {
                        color: colors.text,
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: 12,
                        padding: 12,
                      },
                      code_block: {
                        color: colors.text,
                        backgroundColor: colors.muted,
                        borderColor: colors.border,
                        borderRadius: 12,
                        padding: 12,
                      },
                      link: {
                        color: colors.text,
                        textDecorationLine: "underline",
                      },
                      hr: { backgroundColor: colors.border },
                    }}
                  >
                    {item.content}
                  </Markdown>
                ) : null}
                {item.status === "pending" && (
                  <View
                    accessibilityLiveRegion="polite"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 22,
                    }}
                  >
                    <TypingDots color={colors.textMuted} />
                    {!!item.activity && (
                      <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                        {item.activity}
                      </Text>
                    )}
                  </View>
                )}
                {item.failedTools?.map((failure) => (
                  <View
                    key={failure}
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "flex-start",
                    }}
                  >
                    <AlertCircle
                      color={colors.iconMuted}
                      size={15}
                      style={{ marginTop: 2 }}
                    />
                    <Text
                      selectable
                      style={{ color: colors.textMuted, flex: 1, fontSize: 14 }}
                    >
                      {failure}
                    </Text>
                  </View>
                ))}
                {!!item.steps?.length && (
                  <View style={{ gap: 6 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        expanded[item.id]
                          ? "Hide tool steps"
                          : "Show tool steps"
                      }
                      onPress={() =>
                        setExpanded((current) => ({
                          ...current,
                          [item.id]: !current[item.id],
                        }))
                      }
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {item.steps.map((step) => (
                        <View
                          key={step.id}
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                step.status === "failed"
                                  ? colors.text
                                  : colors.textMuted,
                              fontSize: 12,
                              fontFamily: FONTS.main.medium,
                            }}
                          >
                            {step.status === "failed"
                              ? `${step.label} failed`
                              : step.label}
                          </Text>
                        </View>
                      ))}
                      {expanded[item.id] ? (
                        <ChevronUp color={colors.iconSubtle} size={16} />
                      ) : (
                        <ChevronDown color={colors.iconSubtle} size={16} />
                      )}
                    </Pressable>
                    {expanded[item.id] && (
                      <View
                        style={{
                          borderRadius: 14,
                          backgroundColor: colors.muted,
                          paddingHorizontal: 12,
                        }}
                      >
                        {item.steps.map((step, index) => (
                          <View
                            key={step.id}
                            style={{
                              paddingVertical: 10,
                              gap: 2,
                              borderTopWidth: index ? 1 : 0,
                              borderColor: colors.border,
                            }}
                          >
                            <Text
                              selectable
                              style={{ color: colors.text, fontSize: 14 }}
                            >
                              {toolLabels(step.name).done} · {step.status}
                              {step.ms != null
                                ? ` · ${(step.ms / 1000).toFixed(1)} s`
                                : ""}
                            </Text>
                            <Text
                              selectable
                              style={{ color: colors.textMuted, fontSize: 13 }}
                            >
                              {[step.provider, step.model]
                                .filter(Boolean)
                                .join(" / ")}{" "}
                              {step.detail}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
                {item.audioUrl && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      audio.playingId === item.id ? "Stop audio" : "Play reply"
                    }
                    onPress={() => {
                      if (
                        audio.playingId === item.id ||
                        audio.loadingId === item.id
                      )
                        audio.stop();
                      else {
                        stopVoice();
                        void audio
                          .play(item.id, () => audio.resolveUrl(item.audioUrl!))
                          .catch(report);
                      }
                    }}
                    style={{
                      alignSelf: mine ? "flex-end" : "flex-start",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      minHeight: 36,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    {audio.playingId === item.id ? (
                      <Square
                        color={colors.icon}
                        size={14}
                        fill={colors.icon}
                      />
                    ) : (
                      <Volume2 color={colors.icon} size={16} />
                    )}
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 13,
                        fontFamily: FONTS.main.medium,
                      }}
                    >
                      {audio.loadingId === item.id
                        ? "Loading…"
                        : audio.playingId === item.id
                          ? "Stop"
                          : "Listen"}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
        {voiceMode && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop voice mode"
            onPress={() => {
              stopVoice();
              void recorder.cancelRecording();
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              alignSelf: "center",
              paddingVertical: 8,
              paddingHorizontal: 14,
              marginBottom: 8,
              borderRadius: 999,
              backgroundColor: colors.primary,
            }}
          >
            <Waves color={colors.primaryForeground} size={16} />
            <Text
              style={{
                color: colors.primaryForeground,
                fontFamily: FONTS.main.medium,
                fontSize: 13,
              }}
            >
              Voice mode · tap to stop
            </Text>
          </Pressable>
        )}
        <View
          style={{
            borderRadius: 26,
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 6,
            marginBottom: 8,
          }}
        >
          {images.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, padding: 6 }}
            >
              {images.map((image, index) => (
                <View key={image.uri}>
                  <Image
                    source={{ uri: image.uri }}
                    style={{ width: 64, height: 64, borderRadius: 14 }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={10}
                    onPress={() =>
                      setImages((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.primary,
                    }}
                  >
                    <X color={colors.primaryForeground} size={13} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          {recorder.isRecording || recorder.isTranscribing ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                minHeight: 48,
                paddingHorizontal: 12,
              }}
            >
              {recorder.isRecording ? (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#EF4444",
                  }}
                />
              ) : (
                <TypingDots color={colors.textMuted} />
              )}
              <Text style={{ color: colors.text, flex: 1 }}>
                {recorder.isRecording
                  ? `Listening… ${recorder.remainingSeconds}s`
                  : "Transcribing…"}
              </Text>
              {recorder.isRecording && (
                <Text style={{ color: colors.textSubtle, fontSize: 13 }}>
                  Tap stop to send
                </Text>
              )}
            </View>
          ) : (
            <TextInput
              accessibilityLabel="Message Hypa"
              placeholder="Ask in any language…"
              placeholderTextColor={colors.placeholder}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={20000}
              editable={!locked && !recorder.isBusy}
              style={{
                color: colors.inputText,
                fontFamily: FONTS.main.regular,
                fontSize: 16,
                lineHeight: 22,
                maxHeight: 140,
                minHeight: 44,
                paddingHorizontal: 12,
                paddingTop: 12,
                paddingBottom: 8,
              }}
            />
          )}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {iconButton(
              "Attach photos",
              <ImagePlus color={colors.iconMuted} size={21} />,
              () => void pickImages(false),
              locked || picking || recorder.isRecording,
            )}
            {iconButton(
              "Take photo",
              <Camera color={colors.iconMuted} size={21} />,
              () => void pickImages(true),
              locked || picking || recorder.isRecording,
            )}
            {iconButton(
              voiceMode ? "Stop voice mode" : "Start voice mode",
              <Waves
                color={voiceMode ? colors.icon : colors.iconMuted}
                size={21}
              />,
              () => {
                if (voiceRef.current) {
                  stopVoice();
                  void recorder.cancelRecording();
                } else
                  runWithConsent(() => {
                    voiceRef.current = true;
                    setVoiceMode(true);
                    startListening.current();
                  });
              },
              !voiceMode && (locked || recorder.isBusy || recorder.isRecording),
            )}
            {iconButton(
              "What Hypa stores",
              <Info color={colors.iconSubtle} size={19} />,
              () => setPrivacyOpen(true),
            )}
            <View style={{ flex: 1 }} />
            {(draft.trim() || images.length) && !recorder.isRecording ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                onPress={send}
                disabled={!canSend}
                style={{
                  width: 40,
                  height: 40,
                  margin: 2,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: canSend ? colors.primary : colors.border,
                }}
              >
                <ArrowUp
                  color={canSend ? colors.primaryForeground : colors.disabled}
                  size={20}
                />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  recorder.isRecording
                    ? "Stop recording and send"
                    : "Record voice message"
                }
                onPress={toggleRecording}
                disabled={locked || recorder.isBusy}
                style={{
                  width: 40,
                  height: 40,
                  margin: 2,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: locked || recorder.isBusy ? 0.4 : 1,
                  backgroundColor: recorder.isRecording
                    ? "#EF4444"
                    : colors.primary,
                }}
              >
                {recorder.isRecording ? (
                  <Square color="#FFFFFF" size={14} fill="#FFFFFF" />
                ) : (
                  <Mic color={colors.primaryForeground} size={19} />
                )}
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <SelectorModal
        visible={pickerOpen}
        title="Assistant model"
        options={assistantOptions}
        selected={selectedAssistant}
        onClose={() => setPickerOpen(false)}
        onSelect={(value) => {
          const [provider, ...model] = value.split("/");
          void updateSettings({
            assistantProvider: provider,
            assistantModel: model.join("/"),
          });
        }}
      />
      <BottomSheet
        isVisible={Boolean(menu)}
        onClose={() => setMenu(null)}
        title="Message"
        snapPoints={[0.48]}
        scrollEnabled
      >
        {menu &&
          [
            [
              "Copy",
              () => {
                audio.stop();
                void Clipboard.setStringAsync(menu.content);
              },
            ],
            [
              "Share text",
              () => {
                stopVoice();
                void Share.share({ message: menu.content }).catch(report);
              },
            ],
            [
              `Speak in ${languageCodeToName(settings?.ttsLanguage ?? "") || languages.targetLang}`,
              () =>
                runWithConsent(() => {
                  stopVoice();
                  void speak(menu).catch(report);
                }),
            ],
            ...(menu.audioUrl
              ? [
                  [
                    "Share audio",
                    () => {
                      stopVoice();
                      void audio
                        .resolveUrl(menu.audioUrl!)
                        .then((uri) => shareAudioFromUri(uri, "audio/wav"))
                        .then((shared) => {
                          if (!shared)
                            toast.showInfo(
                              "Sharing is not available on this device.",
                            );
                        })
                        .catch(report);
                    },
                  ],
                ]
              : []),
            ...(menu.role === "assistant" && !locked
              ? [
                  [
                    "Regenerate · new answer, new charge",
                    () =>
                      runWithConsent(() => {
                        stopVoice();
                        void chat
                          .regenerate(menu.id)
                          .then(afterReply)
                          .catch(report);
                      }),
                  ],
                ]
              : []),
          ].map(([label, action], index) => (
            <Pressable
              key={String(label)}
              accessibilityRole="button"
              onPress={() => {
                (action as () => void)();
                setMenu(null);
              }}
              style={({ pressed }) => ({
                padding: 18,
                borderTopWidth: index ? 1 : 0,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.muted : "transparent",
              })}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>
                {String(label)}
              </Text>
            </Pressable>
          ))}
      </BottomSheet>
      <BottomSheet
        isVisible={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="What Hypa stores"
        snapPoints={[0.65]}
        scrollEnabled
      >
        {privacy.points.map((point) => (
          <Text
            selectable
            key={point}
            style={{
              color: colors.text,
              padding: 14,
              fontSize: 16,
              lineHeight: 24,
            }}
          >
            {point}
          </Text>
        ))}
      </BottomSheet>
      <Modal
        visible={Boolean(photo)}
        onRequestClose={() => setPhoto(null)}
        animationType="slide"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          {iconButton("Close photo", <X color={colors.icon} size={25} />, () =>
            setPhoto(null),
          )}
          <ScrollView
            maximumZoomScale={4}
            centerContent
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          >
            {photo && (
              <Image
                source={imageSource(photo)}
                resizeMode="contain"
                style={{ width, height: height * 0.8 }}
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={historyOpen && Boolean(token)}
        onRequestClose={() => setHistoryOpen(false)}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 8,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                color: colors.text,
                fontSize: 24,
                fontFamily: FONTS.main.semiBold,
              }}
            >
              Your chats
            </Text>
            {iconButton(
              "Close history",
              <X color={colors.icon} size={23} />,
              () => setHistoryOpen(false),
            )}
          </View>
          {chats.error && (
            <Pressable onPress={() => void chats.refetch()}>
              <Text style={{ color: colors.text }}>
                Unable to load chats. Tap to retry.
              </Text>
            </Pressable>
          )}
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            onEndReached={() => {
              if (chats.hasNextPage && !chats.isFetchingNextPage)
                void chats.fetchNextPage();
            }}
            ListEmptyComponent={
              <Text style={{ color: colors.textMuted, paddingVertical: 20 }}>
                {chats.isLoading
                  ? "Loading chats…"
                  : "Your signed-in chats will appear here."}
              </Text>
            }
            renderItem={({ item }) => (
              <Swipeable
                enabled={item.kind !== "keyboard"}
                renderRightActions={() => (
                  <Pressable
                    onPress={() => void updateChat(item, false)}
                    style={{
                      justifyContent: "center",
                      padding: 18,
                      backgroundColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.text }}>Archive</Text>
                  </Pressable>
                )}
              >
                <Pressable
                  onPress={() => {
                    setHistoryOpen(false);
                    router.push({
                      pathname: "/chat/[id]",
                      params: { id: item.id },
                    });
                  }}
                  onLongPress={() =>
                    Alert.alert(item.title, "Delete this chat and its media?", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => void updateChat(item, true),
                      },
                    ])
                  }
                  style={{
                    padding: 18,
                    borderBottomWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    flexDirection: "row",
                    gap: 10,
                  }}
                >
                  {item.kind === "keyboard" && (
                    <Keyboard color={colors.icon} size={19} />
                  )}
                  <Text
                    numberOfLines={2}
                    style={{ color: colors.text, flex: 1 }}
                  >
                    {item.kind === "keyboard"
                      ? "Keyboard · pinned"
                      : item.title}
                  </Text>
                </Pressable>
              </Swipeable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </Body>
  );
}

function TypingDots({ color }: { color: string }) {
  return (
    <View
      accessibilityLabel="Working"
      style={{ flexDirection: "row", gap: 4, alignItems: "center", height: 16 }}
    >
      {[0, 1, 2].map((index) => (
        <Dot key={index} color={color} delay={index * 160} />
      ))}
    </View>
  );
}

function Dot({ color, delay }: { color: string; delay: number }) {
  const opacity = useSharedValue(0.25);
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 360 }),
          withTiming(0.25, { duration: 360 }),
        ),
        -1,
      ),
    );
  }, [delay, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: color },
        style,
      ]}
    />
  );
}
