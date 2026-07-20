import React, { useContext } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { tabS } from '../styles/tabS';
import { ROUTES } from '../constants/routes';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import { AttentionMotion } from './common/AttentionMotion';
import { Icon } from './common/Icon';

// 탭별 커스텀 SVG 아이콘 — 홈·라운지(클럽하우스)·MY(다이어리)·친구·코스(골프 깃발). 라벨 없이 아이콘만.
const TAB_ICONS = {
  [ROUTES.HOME]: 'home',
  [ROUTES.LOUNGE]: 'clubhouse',
  [ROUTES.MY]: 'book',
  [ROUTES.FRIENDS]: 'people',
  [ROUTES.COURSE]: 'flag',
};

// 화면 배경에 맞춘 바 테마 — 홈(어두운 이미지)은 밝은 유리+흰 아이콘, 그 외(밝은 배경)는 밝은 유리+어두운 아이콘.
//   전역 투명 바가 밝은/어두운 배경 모두에서 예쁘고 아이콘도 또렷하게 보이도록 활성 탭에 따라 전환.
// on=선택(선명), off=비선택(연함). 홈은 버터, 그 외(밝은 배경)는 차콜.
const THEME_HOME = { bg: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.3)', chip: 'rgba(245,230,168,0.2)', on: C.butter, off: 'rgba(245,230,168,0.5)', alert: '#FF9086' };
const THEME_LIGHT = { bg: 'rgba(255,255,255,0.62)', border: 'rgba(255,255,255,0.85)', chip: 'rgba(61,57,53,0.1)', on: C.charcoal, off: 'rgba(61,57,53,0.5)', alert: C.burgundy };

export function TabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const { friendReqCount, scheduleInviteCount } = useContext(FriendBadgeContext);
  const onHome = state.routes[state.index]?.name === ROUTES.HOME;
  const t = onHome ? THEME_HOME : THEME_LIGHT;
  return (
    <View style={[tabS.wrap, { paddingBottom: insets.bottom + 12 }]}>
      <View style={tabS.pillShadow}>
        <View style={[tabS.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const handlePress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!event.defaultPrevented) navigation.navigate(route.name);
            };
            // 친구 탭 — 받은 친구신청 / 홈 탭 — 받은 일정 전파 초대 있으면 아이콘 진동 + 알림색(주목).
            //   ★라운지는 신호 없음 — 수락/거절 타이밍 어긋남 거슬림 제거(사용자 2026-06-30). ([[schedule-propagation-spec]])
            const alertFriend = route.name === ROUTES.FRIENDS && friendReqCount > 0;
            const alertHome = route.name === ROUTES.HOME && scheduleInviteCount > 0;
            const alerting = alertFriend || alertHome;
            const color = alerting ? t.alert : focused ? t.on : t.off;
            return (
              <TouchableOpacity key={route.key} style={tabS.tab} onPress={handlePress} activeOpacity={0.7}>
                <AttentionMotion type="shake" enabled={alerting}>
                  {/* 배경을 항상 지정(비선택=투명) — 안드 Fabric에서 배경이 동적 생성될 때 borderRadius 미적용(네모) 방지 */}
                  <View style={[tabS.iconWrap, { backgroundColor: focused ? t.chip : 'transparent' }]}>
                    {/* 선택=크게·굵게·선명 / 비선택=작게·가늘게·연하게 */}
                    <Icon name={TAB_ICONS[route.name] || 'home'} size={focused ? 27 : 22} color={color} strokeWidth={focused ? 2.4 : 1.9} />
                  </View>
                </AttentionMotion>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}
