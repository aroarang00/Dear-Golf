import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C } from '../constants/colors';
import { tabS } from '../styles/tabS';

const TAB_COLORS = [C.butter, C.paleSky, C.burgundy];

export function TabBar({ state, navigation }) {
  const labels = ['홈', '다이어리', '코스'];
  return (
    <View style={tabS.bar}>
      <View style={tabS.stripeRow}>
        {[0,1,2].map(i => (
          <View key={i} style={[tabS.stripeSegment, { backgroundColor: TAB_COLORS[i] }, state.index === i && tabS.stripeSegmentOn]} />
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
              <Text style={[tabS.label, focused ? tabS.labelOn : tabS.labelOff]}>{labels[i]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
