import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { tabS } from '../styles/tabS';

// 탭 순서: 홈 · 라운지 · MY · 친구 · 코스
const TAB_COLORS = [C.butter, C.navy, C.warmGray, C.paleSky, C.butter];

export function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[tabS.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={tabS.stripeRow}>
        {state.routes.map((route, i) => (
          <View key={route.key} style={[tabS.stripeSegment, { backgroundColor: TAB_COLORS[i % TAB_COLORS.length] }, state.index === i && tabS.stripeSegmentOn]} />
        ))}
      </View>
      <View style={tabS.tabRow}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const handlePress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          return (
            <TouchableOpacity key={route.key} style={tabS.tab}
              onPress={handlePress} activeOpacity={0.7}>
              <Text numberOfLines={1} style={[tabS.label, focused ? tabS.labelOn : tabS.labelOff]}>{route.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
