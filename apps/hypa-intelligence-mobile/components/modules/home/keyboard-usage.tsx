import React from 'react';
import { Text, View } from 'react-native';
import LottieView from 'lottie-react-native';

import { FONTS } from '@/constants/fonts';
import type { KeyboardSettings } from '@/lib/keyboard-settings';

const metrics = [
  {
    label: 'Words saved',
    lottie: require('@/assets/lotties/dictionary-lookup.json'),
  },
  {
    label: 'Active streak',
    lottie: require('@/assets/lotties/fire-orange.json'),
  },
  { label: 'Words typed', lottie: require('@/assets/lotties/typing.json') },
];

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('en', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);

export function KeyboardUsage({ usageStats }: { usageStats: KeyboardSettings['usageStats'] }) {
  const resolvedMetrics = [
    { ...metrics[0], value: formatCompactNumber(usageStats.wordsSaved) },
    {
      ...metrics[1],
      lottie:
        usageStats.streakDays === 0
          ? require('@/assets/lotties/streak-0.json')
          : require('@/assets/lotties/fire-orange.json'),
      value: `${usageStats.streakDays}`,
    },
    { ...metrics[2], value: formatCompactNumber(usageStats.wordsTyped) },
  ];

  return (
    <View>
      <View className="flex-row items-center justify-between px-1">
        <View>
          <Text
            className="text-[20px] text-zinc-900 dark:text-zinc-50"
            style={{ fontFamily: FONTS.main.medium }}>
            Activity and usage
          </Text>
          <Text
            className="mt-1 text-[14px] leading-6 text-zinc-500 dark:text-zinc-400"
            style={{ fontFamily: FONTS.main.regular }}>
            A snapshot of your weekly keyboard activity.
          </Text>
        </View>
      </View>

      <View className="mt-5 gap-3">
        <View className="rounded-3xl bg-zinc-900 px-5 py-5 shadow-sm dark:bg-zinc-100">
          <View className="flex-row items-center justify-between">
            <View>
              <Text
                className="text-[12px] tracking-[1.5px] text-zinc-400 uppercase dark:text-zinc-500"
                style={{ fontFamily: FONTS.main.medium }}>
                {resolvedMetrics[0].label}
              </Text>
              <Text
                className="mt-1 text-[32px] text-white dark:text-zinc-950"
                style={{ fontFamily: FONTS.main.medium }}>
                {resolvedMetrics[0].value}
              </Text>
            </View>

            <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white/10 dark:bg-zinc-800">
              <LottieView
                autoPlay
                loop
                source={resolvedMetrics[0].lottie}
                style={{ width: 38, height: 38 }}
              />
            </View>
          </View>
        </View>

        <View className="flex-row gap-3">
          {resolvedMetrics.slice(1).map((metric) => (
            <View
              key={metric.label}
              className="flex-1 rounded-3xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
              <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-zinc-50 dark:bg-zinc-900">
                <LottieView
                  autoPlay
                  loop
                  source={metric.lottie}
                  style={{ width: 32, height: 32 }}
                />
              </View>
              <Text
                className="mt-4 text-[22px] text-zinc-900 dark:text-zinc-50"
                style={{ fontFamily: FONTS.main.medium }}>
                {metric.value}
              </Text>
              <Text
                className="mt-1 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400"
                style={{ fontFamily: FONTS.main.regular }}>
                {metric.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
