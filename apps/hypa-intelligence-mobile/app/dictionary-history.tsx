import React from 'react';
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native';
import { Bookmark, Clock3, SearchX, Trash2 } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';

import Body from '@/components/shared/body';
import { Text } from '@/components/ui/text';
import { FONTS } from '@/constants/fonts';
import type { DictionaryHistoryEntry } from '@/api/dictionary';
import { useDictionaryHistory } from '@/hooks/use-dictionary-history';
import { useDictionaryBookmarks } from '@/hooks/use-dictionary-bookmarks';
import { useThemeColors } from '@/hooks/use-theme-color';
import { goBackOrReturnTo, withReturnTo } from '@/lib/navigation';
import { adaptDictionaryResult } from '@/lib/dictionary';
import { useDictionarySearch } from '@/providers/dictionary-search-provider';
import { useToast } from '@/lib/toast';
import { BackButton } from '@/components/shared/back-button';

const DictionaryHistory = () => {
  const colors = useThemeColors();
  const toast = useToast();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [activeTab, setActiveTab] = React.useState<'history' | 'bookmarks'>('history');
  const { primeResult } = useDictionarySearch();
  const { history, isLoading, isError, deleteEntry } = useDictionaryHistory({
    limit: 50,
  });
  const {
    bookmarks,
    isLoading: areBookmarksLoading,
    isBookmarked,
    toggleBookmark,
    removeBookmark,
  } = useDictionaryBookmarks();

  const entries = history;
  const items = activeTab === 'history' ? entries : bookmarks;

  const removeItem = async (id: string) => {
    try {
      await deleteEntry(id);
      toast.showSuccess('History deleted');
    } catch (error) {
      toast.showError(
        'Delete failed',
        error instanceof Error ? error.message : 'Unable to delete this word.',
      );
    }
  };

  const openItem = (item: DictionaryHistoryEntry) => {
    if (item.result?.parsed) {
      primeResult(
        { word: item.word, language: item.language },
        item.result.parsed,
      );
    }
    router.push({
      pathname: '/word/[word]',
      params: { word: item.word, lang: item.language, ...withReturnTo('/dictionary-history') },
    });
  };

  const openBookmark = (item: (typeof bookmarks)[number]) => {
    router.push({
      pathname: '/word/[word]',
      params: {
        word: item.word,
        lang: item.language,
        ...withReturnTo('/dictionary-history'),
      },
    });
  };

  const renderItem = ({ item }: { item: DictionaryHistoryEntry }) => {
    const preview = item.result?.parsed?.definitions?.[0]?.text ?? 'Tap to view definition';
    const bookmarked = isBookmarked(item.word, item.language);
    const adapted = item.result?.parsed
      ? adaptDictionaryResult(item.result.parsed, item.language)
      : undefined

    return (
      <TouchableOpacity
        className="mb-3 gap-2 rounded-[18px] border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
        onPress={() => openItem(item)}
        activeOpacity={0.75}>
        <View className="flex-row items-center justify-between gap-3">
          <Text
            numberOfLines={1}
            className="flex-1 text-[14px] text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.medium }}>
            {item.language}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={(event) => {
              event.stopPropagation()
              if (!adapted) return
              void toggleBookmark({
                word: item.word,
                language: item.language,
                result: adapted,
              })
            }}
            activeOpacity={0.75}
            className={`h-9 w-9 items-center justify-center rounded-full border ${bookmarked ? 'bg-zinc-950 dark:bg-zinc-50' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <Bookmark
              size={16}
              color={bookmarked ? colors.primaryForeground : colors.iconSubtle}
              fill={bookmarked ? colors.primaryForeground : 'transparent'}
            />
          </TouchableOpacity>
        </View>

        <Text
          numberOfLines={1}
          className="text-[17px] text-zinc-950 dark:text-zinc-50"
          style={{ fontFamily: FONTS.main.medium, fontStyle: 'italic' }}>
          {item.word}
        </Text>

        <Text
          className="text-[15px] leading-6 text-zinc-500 dark:text-zinc-400"
          numberOfLines={2}
          style={{ fontFamily: FONTS.main.regular }}>
          {preview}
        </Text>

        <TouchableOpacity
          className="absolute right-3 bottom-3 rounded-full bg-red-50 p-2 dark:bg-red-950/40"
          onPress={(event) => {
            event.stopPropagation()
            void removeItem(item.id)
          }}
          activeOpacity={0.75}>
          <Trash2 size={17} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderBookmarkItem = ({ item }: { item: (typeof bookmarks)[number] }) => {
    const preview =
      item.result?.definitions?.[0]?.text ?? 'Tap to view definition'

    return (
      <TouchableOpacity
        className="mb-3 gap-2 rounded-[18px] border border-zinc-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
        onPress={() => openBookmark(item)}
        activeOpacity={0.75}>
        <View className="flex-row items-center justify-between gap-3">
          <Text
            numberOfLines={1}
            className="flex-1 text-[14px] text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.medium }}>
            {item.language}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={(event) => {
              event.stopPropagation()
              void removeBookmark({ word: item.word, language: item.language })
                .then(() => {
                  toast.showSuccess('Bookmark removed');
                })
                .catch((error) => {
                  toast.showError(
                    'Remove failed',
                    error instanceof Error
                      ? error.message
                      : 'Unable to remove bookmark.',
                  );
                })
            }}
            activeOpacity={0.75}
            className="h-9 w-9 items-center justify-center rounded-full bg-zinc-950 dark:bg-zinc-50">
            <Bookmark size={16} color={colors.primaryForeground} fill={colors.primaryForeground} />
          </TouchableOpacity>
        </View>

        <Text
          numberOfLines={1}
          className="text-[17px] text-zinc-950 dark:text-zinc-50"
          style={{ fontFamily: FONTS.main.medium, fontStyle: 'italic' }}>
          {item.word}
        </Text>

        <Text
          className="text-[15px] leading-6 text-zinc-500 dark:text-zinc-400"
          numberOfLines={2}
          style={{ fontFamily: FONTS.main.regular }}>
          {preview}
        </Text>
      </TouchableOpacity>
    )
  }

  return (
    <Body showBackground={false} enableScroll={false}>
      <View className="flex-1 px-1 pt-4">
        <View className="mb-5 flex-row items-center justify-between">
          <BackButton onPress={() => goBackOrReturnTo(returnTo, '/(dashboard)/dictionary')} />
          <Text className="text-[20px] text-zinc-900 dark:text-zinc-50" style={{ fontFamily: FONTS.main.medium }}>
            Dictionary History
          </Text>
          <View className="w-11" />
        </View>

        <View className="mb-4 flex-row rounded-full border border-zinc-100 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-950">
          {(['history', 'bookmarks'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${activeTab === tab ? 'bg-zinc-950 dark:bg-zinc-50' : ''}`}
              onPress={() => setActiveTab(tab)}>
              {tab === 'history' ? (
                <Clock3 size={16} color={activeTab === tab ? colors.primaryForeground : colors.iconSubtle} />
              ) : (
                <Bookmark size={16} color={activeTab === tab ? colors.primaryForeground : colors.iconSubtle} />
              )}
              <Text
                className={`text-[14px] capitalize ${activeTab === tab ? 'text-white dark:text-zinc-950' : 'text-zinc-500 dark:text-zinc-400'}`}
                style={{ fontFamily: FONTS.main.medium }}>
                {tab === 'history' ? 'History' : 'Bookmarks'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {((activeTab === 'history' && isLoading) ||
          (activeTab === 'bookmarks' && areBookmarksLoading)) ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.spinner} />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center">
            <SearchX size={36} color="#A1A1AA" />
            <Text className="mt-3 text-zinc-500 dark:text-zinc-400" style={{ fontFamily: FONTS.main.regular }}>
              Could not load dictionary history.
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            {activeTab === 'history' ? (
              <Clock3 size={36} color="#A1A1AA" />
            ) : (
              <Bookmark size={36} color="#A1A1AA" />
            )}
            <Text className="mt-3 text-zinc-500 dark:text-zinc-400" style={{ fontFamily: FONTS.main.regular }}>
              {activeTab === 'history' ? 'No words yet.' : 'No bookmarks saved.'}
            </Text>
          </View>
        ) : activeTab === 'history' ? (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 34 }}
          />
        ) : (
          <FlatList
            data={bookmarks}
            keyExtractor={(item) => item.id}
            renderItem={renderBookmarkItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 34 }}
          />
        )}
      </View>
    </Body>
  );
};

export default DictionaryHistory;
