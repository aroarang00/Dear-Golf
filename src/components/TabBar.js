import React, { useContext } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { tabS } from '../styles/tabS';
import { ROUTES } from '../constants/routes';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import { AttentionMotion } from './common/AttentionMotion';

// 탭 순서: 홈 · 라운지 · MY · 친구 · 코스
const TAB_COLORS = [C.butter, C.navy, C.warmGray, C.paleSky, C.butter];

export function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const { friendReqCount, scheduleInviteCount } = useContext(FriendBadgeContext);
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
          // 친구 탭 — 받은 친구신청 / 홈 탭 — 받은 일정 전파 초대 있으면 라벨이 진동(점 대신 흔들림으로 주목, 사용자 2026-06-20).
          //   친구 관계 알림은 친구 탭 소관, 일정 초대는 홈 탭 소관 ([[schedule-propagation-spec]]).
          const alertFriend = route.name === ROUTES.FRIENDS && friendReqCount > 0;
          const alertHome = route.name === ROUTES.HOME && scheduleInviteCount > 0;
          return (
            <TouchableOpacity key={route.key} style={tabS.tab}
              onPress={handlePress} activeOpacity={0.7}>
              <AttentionMotion type="shake" enabled={alertFriend || alertHome}>
                {/* 알림 있으면 진동 + 라벨 버건디 + 글자 위 가운데 버건디 점 — 다른 탭에 있을 때도 인지(사용자 2026-06-20) */}
                <View>
                  <Text numberOfLines={1} style={[tabS.label, focused ? tabS.labelOn : tabS.labelOff,
                    (alertFriend || alertHome) && { color: C.burgundy }]}>{route.name}</Text>
                  {(alertFriend || alertHome) && (
                    <View pointerEvents="none" style={{ position: 'absolute', top: -6, left: 0, right: 0, alignItems: 'center' }}>
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.burgundy }} />
                    </View>
                  )}
                </View>
              </AttentionMotion>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
