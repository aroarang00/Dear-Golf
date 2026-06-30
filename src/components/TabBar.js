import React, { useContext } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
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
          // 친구 탭 — 받은 친구신청 / 홈 탭 — 받은 일정 전파 초대 있으면 라벨이 진동 + 버건디(점 대신 흔들림으로 주목).
          //   친구 관계 알림은 친구 탭, 일정 초대는 홈 탭 소관 ([[schedule-propagation-spec]], [[roundup-invitation]]).
          // ★라운지(받은 친구지정 초대)는 탭 신호 없음 — 수락(서버 반영 지연)·거절(로컬 가리기) 타이밍이 어긋나
          //   '답했는데 더 떨던/색 남던' 거슬림 제거(사용자 2026-06-30). 라운딩 초대는 홈 배너 + 라운지 화면 안에서 인지.
          const alertFriend = route.name === ROUTES.FRIENDS && friendReqCount > 0;
          const alertHome = route.name === ROUTES.HOME && scheduleInviteCount > 0;
          const alerting = alertFriend || alertHome;
          return (
            <TouchableOpacity key={route.key} style={tabS.tab}
              onPress={handlePress} activeOpacity={0.7}>
              <AttentionMotion type="shake" enabled={alerting}>
                {/* 알림 있으면 진동 + 라벨 버건디 — 다른 탭에 있을 때도 인지(사용자 2026-06-20).
                    점(dot)은 제거 — 탭바 높이 축소로 상단 삼색바와 맞닿아 어색했음(사용자 2026-06-26). */}
                {/* 알림 라벨 — 포커스 안 된 탭은 labelOff(얇은 weight+opacity 0.5)라 버건디만 덮으면 가늘게 보임 →
                    굵게(F.sysB)+불투명도 1로 또렷하게(사용자 2026-06-26). */}
                <Text numberOfLines={1} style={[tabS.label, focused ? tabS.labelOn : tabS.labelOff,
                  alerting && { color: C.burgundy, fontFamily: F.sysB, opacity: 1 }]}>{route.name}</Text>
              </AttentionMotion>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
