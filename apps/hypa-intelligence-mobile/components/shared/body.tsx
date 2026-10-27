import { View, ScrollView, ImageBackground, RefreshControl } from 'react-native';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Body = ({
  children,
  hideBottomInset,
  hideTopInset,
  hideHorizontalInset,
  enableScroll = true,
  refreshing = false,
  onRefresh,
  showBackground = true,
}: {
  children: React.ReactNode;
  hideBottomInset?: boolean;
  hideTopInset?: boolean;
  hideHorizontalInset?: boolean;
  enableScroll?: boolean;
  refreshing?: boolean;
  showBackground?: boolean;
  onRefresh?: () => void;
}) => {
  const inset = useSafeAreaInsets();

  const content = (
    <View
      style={{
        flex: 1,
        paddingTop: hideTopInset ? 0 : inset.top,
        paddingBottom: hideBottomInset ? 0 : inset.bottom,
      }}>
      {enableScroll ? (
        <ScrollView
          scrollEnabled
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
          contentContainerStyle={{
            flexGrow: 1,
            marginHorizontal: hideHorizontalInset ? 0 : 14,
          }}>
          {children}
        </ScrollView>
      ) : (
        <View
          style={{
            flex: 1,
            marginHorizontal: hideHorizontalInset ? 0 : 14,
          }}>
          {children}
        </View>
      )}
    </View>
  );

  if (!showBackground) {
    return content;
  }

  return (
    <ImageBackground
      source={require('@/assets/images/grid.jpg')}
      imageStyle={{ opacity: 0.03 }}
      style={{ flex: 1, width: '100%' }}>
      {content}
    </ImageBackground>
  );
};

export default Body;
