import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Share,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Bookmark,
  Clock3,
  Share as ShareIcon,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react-native';
import { RectButton, Swipeable } from 'react-native-gesture-handler';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import Body from '@/components/shared/body';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import {
  deleteTranslation,
  getTranslationHistory,
  updateTranslationBookmark,
  updateTranslationFeedback,
  type TranslationHistoryItem,
  type TranslationHistoryResponse,
} from '@/lib/product-api';
import { useThemeColors } from '@/hooks/use-theme-color';
import { goBackOrReturnTo, withReturnTo } from '@/lib/navigation';
import { BackButton } from '@/components/shared/back-button';

type Segment = { text: string; bold: boolean; italic: boolean };

function parseMarkdown(input: string): Segment[] {
  const segments: Segment[] = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), bold: false, italic: false });
    }
    if (match[2] !== undefined) {
      segments.push({ text: match[2], bold: true, italic: true });
    } else if (match[3] !== undefined) {
      segments.push({ text: match[3], bold: true, italic: false });
    } else if (match[4] !== undefined) {
      segments.push({ text: match[4], bold: false, italic: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), bold: false, italic: false });
  }

  return segments.length ? segments : [{ text: input, bold: false, italic: false }];
}

const stripThinking = (value: string) =>
  value.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

const StyledText = ({
  children,
  color,
  numberOfLines,
  baseStyle,
}: {
  children: string;
  color: string;
  numberOfLines?: number;
  baseStyle?: any;
}) => {
  const segments = parseMarkdown(children);

  return (
    <Text numberOfLines={numberOfLines} ellipsizeMode="tail" style={[{ color }, baseStyle]}>
      {segments.map((segment, index) => {
        const boldStyle = segment.bold
          ? {
              fontWeight: '700' as const,
              ...(Platform.OS === 'android' ? { fontFamily: 'sans-serif-medium' } : {}),
            }
          : {};
        const italicStyle = segment.italic ? { fontStyle: 'italic' as const } : {};

        return (
          <Text key={`${segment.text}-${index}`} style={[{ color }, boldStyle, italicStyle]}>
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
};

const TranslateHistory = () => {
  const colors = useThemeColors();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<'history' | 'bookmarks'>('history');
  const pageSize = 50;

  const historyQuery = useInfiniteQuery({
    queryKey: ['keyboard-translate-history', activeTab],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getTranslationHistory({
        filter: activeTab === 'history' ? 'all' : 'bookmarks',
        limit: pageSize,
        cursor: pageParam,
      }),
    getNextPageParam: (lastPage: TranslationHistoryResponse) =>
      lastPage.meta.nextCursor ?? undefined,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['keyboard-translate-history'] });

  const bookmarkMutation = useMutation({
    mutationFn: (item: TranslationHistoryItem) =>
      updateTranslationBookmark({
        userId: 'local',
        translationId: item.id,
        bookmarked: !item.bookmarked,
      }),
    onSuccess: refresh,
    onError: (error) =>
      Alert.alert('Bookmark failed', error instanceof Error ? error.message : 'Unable to update bookmark.'),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ item, liked }: { item: TranslationHistoryItem; liked: boolean | null }) =>
      updateTranslationFeedback({ translationId: item.id, liked }),
    onSuccess: refresh,
    onError: (error) =>
      Alert.alert('Feedback failed', error instanceof Error ? error.message : 'Unable to update feedback.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: TranslationHistoryItem) => deleteTranslation(item.id),
    onSuccess: refresh,
    onError: (error) =>
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this translation.'),
  });

  const entries = React.useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.translations) ?? [],
    [historyQuery.data?.pages]
  );

  const tabs = [
    { key: 'history' as const, label: 'History' },
    { key: 'bookmarks' as const, label: 'Bookmarks' },
  ];

  const openItem = (item: TranslationHistoryItem) => {
    router.replace({
      pathname: '/(dashboard)/translate',
      params: {
        historySourceLang: item.sourceLanguage,
        historyTargetLang: item.targetLanguage,
        historySourceText: item.originalText,
        historyTranslatedText: item.translatedText,
        historyId: item.id,
        ...withReturnTo('/translate-history'),
      },
    } as any);
  };

  const shareItem = async (item: TranslationHistoryItem) => {
    await Share.share({
      message: `${stripThinking(item.originalText)}\n\nTranslation: ${stripThinking(item.translatedText)}`,
    });
  };

  const handleLoadMore = () => {
    if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
      void historyQuery.fetchNextPage();
    }
  };

  const renderTabs = () => (
    <View className="mb-4 flex-row rounded-full border border-zinc-100 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${isActive ? 'bg-zinc-950 dark:bg-zinc-50' : ''}`}
            onPress={() => setActiveTab(tab.key)}>
            {tab.key === 'history' ? (
              <Clock3 size={16} color={isActive ? colors.primaryForeground : colors.iconSubtle} />
            ) : (
              <Bookmark size={16} color={isActive ? colors.primaryForeground : colors.iconSubtle} />
            )}
            <Text
              className={`text-[14px] ${isActive ? 'text-white dark:text-zinc-950' : 'text-zinc-500 dark:text-zinc-400'}`}
              style={{ fontFamily: FONTS.main.medium }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderEntryCard = ({ item }: { item: TranslationHistoryItem }) => {
    const isLiked = item.liked === true;
    const isDisliked = item.liked === false;
    const original = stripThinking(item.originalText);
    const translated = stripThinking(item.translatedText);

    const renderLeftActions = () => (
      <View className="flex-row overflow-hidden rounded-l-[18px]" style={{ width: 120 }}>
        <RectButton
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          onPress={() =>
            feedbackMutation.mutate({ item, liked: isLiked ? null : true })
          }>
          <ThumbsUp size={20} color={colors.icon} fill={isLiked ? colors.icon : 'transparent'} />
        </RectButton>
        <RectButton
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          onPress={() => void shareItem(item)}>
          <ShareIcon size={20} color={colors.icon} />
        </RectButton>
      </View>
    );

    const renderRightActions = () => (
      <View className="flex-row overflow-hidden rounded-r-[18px]" style={{ width: 120 }}>
        <RectButton
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDisliked ? '#F59E0B' : 'transparent',
          }}
          onPress={() =>
            feedbackMutation.mutate({ item, liked: isDisliked ? null : false })
          }>
          <ThumbsDown size={20} color={isDisliked ? 'white' : colors.icon} />
        </RectButton>
        <RectButton
          style={{ width: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EF4444' }}
          onPress={() => deleteMutation.mutate(item)}>
          <Trash2 size={20} color="white" />
        </RectButton>
      </View>
    );

    return (
      <View className="mb-3 overflow-hidden rounded-[18px]">
        <Swipeable
          renderLeftActions={renderLeftActions}
          renderRightActions={renderRightActions}
          leftThreshold={60}
          rightThreshold={60}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openItem(item)}
            className="gap-2 rounded-[18px] border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <View className="flex-row items-center justify-between gap-3">
              <Text
                numberOfLines={1}
                className="flex-1 text-[14px] text-zinc-500 dark:text-zinc-400"
                style={{ fontFamily: FONTS.main.medium }}>
                {item.sourceLanguage} to {item.targetLanguage}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => bookmarkMutation.mutate(item)}
                className={`h-9 w-9 items-center justify-center rounded-full border ${item.bookmarked ? 'bg-zinc-950 dark:bg-zinc-50' : 'border-zinc-200 dark:border-zinc-800'}`}>
                <Bookmark
                  size={16}
                  color={item.bookmarked ? colors.primaryForeground : colors.iconSubtle}
                  fill={item.bookmarked ? colors.primaryForeground : 'transparent'}
                />
              </TouchableOpacity>
            </View>

            <StyledText
              color={colors.text}
              numberOfLines={1}
              baseStyle={{
                fontFamily: FONTS.main.medium,
                fontSize: 16,
                fontStyle: 'italic',
              }}>
              {original}
            </StyledText>

            <StyledText
              color={colors.textMuted}
              numberOfLines={1}
              baseStyle={{
                fontFamily: FONTS.main.regular,
                fontSize: 15,
                fontStyle: 'italic',
              }}>
              {translated}
            </StyledText>
          </TouchableOpacity>
        </Swipeable>
      </View>
    );
  };

  const renderEmpty = () => {
    if (historyQuery.isLoading) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.spinner} />
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center px-8">
        <Icon name={activeTab === 'history' ? Clock3 : Bookmark} size={34} color={colors.iconSubtle} />
        <Text className="mt-3 text-center text-[16px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
          {activeTab === 'history' ? 'No history yet' : 'No bookmarks saved'}
        </Text>
        <Text className="mt-2 text-center text-zinc-500 dark:text-zinc-400" style={{ fontFamily: FONTS.main.regular }}>
          {activeTab === 'history'
            ? 'Your text translations will show up here.'
            : 'Bookmark a translation to keep it close.'}
        </Text>
      </View>
    );
  };

  return (
    <Body showBackground={false} enableScroll={false}>
      <View className="flex-1 px-1 pt-4">
        <View className="mb-5 flex-row items-center justify-between">
          <BackButton onPress={() => goBackOrReturnTo(returnTo, '/(dashboard)/translate')} />
          <Text className="text-[20px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
            Translate History
          </Text>
          <View className="w-11" />
        </View>

        {renderTabs()}

        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntryCard}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: 34,
            flexGrow: entries.length === 0 ? 1 : undefined,
          }}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={
            historyQuery.isFetchingNextPage ? (
              <View className="items-center py-5">
                <ActivityIndicator color={colors.spinner} />
              </View>
            ) : null
          }
        />
      </View>
    </Body>
  );
};

export default TranslateHistory;
