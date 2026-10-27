import React from 'react';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { BookA, Keyboard, Languages, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/hooks/use-theme-color';

const IosTabs = () => {
  const colors = useThemeColors();

  return (
    <NativeTabs tintColor={colors.tabBarActive} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="home" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Icon sf="keyboard" md="keyboard" />
        <NativeTabs.Trigger.Label>Keyboard</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="translate"
        disableAutomaticContentInsets
        disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf="globe" md="translate" />
        <NativeTabs.Trigger.Label>Translate</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="dictionary"
        disableAutomaticContentInsets
        disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'character.book.closed', selected: 'character.book.closed.fill' }}
          md="book"
        />
        <NativeTabs.Trigger.Label>Dictionary</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="settings"
        disableAutomaticContentInsets
        disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
};

const AndroidTabs = () => {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.tabBarBorder,
          backgroundColor: colors.tabBarBackground,
          elevation: 0,
          shadowOpacity: 0,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom || 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          paddingBottom: 4,
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Keyboard',
          tabBarIcon: ({ color }) => <Keyboard size={24} color={color} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="translate"
        options={{
          title: 'Translate',
          tabBarIcon: ({ color }) => <Languages size={24} color={color} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="dictionary"
        options={{
          title: 'Dictionary',
          tabBarIcon: ({ color }) => <BookA size={24} color={color} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Settings size={24} color={color} strokeWidth={2.2} />,
        }}
      />
    </Tabs>
  );
};

export default process.env.EXPO_OS === 'ios' ? IosTabs : AndroidTabs;
