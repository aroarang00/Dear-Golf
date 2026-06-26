import React, { useEffect, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';

// 라운지 친구지정(select) 초대 수신 — 홈 상단 배너([[roundup-invitation]]). 푸시를 꺼도 어디서든 인지하도록
//   라운지 탭 뱃지와 짝. 데이터·거절은 App이 단일 소스로 관리(FriendBadgeContext) — 여기선 표시 + 동선만.
//   탭/「초대 보기」 → onOpen(post)로 라운지 초대 상세(내 참여)로 이동(수락·정원 처리는 기존 라운지 로직 재사용).
//   「거절」 → declineRoundupInvite(로컬 가리기). 한 번에 1건씩, 처리하면 다음 건이 올라온다.
export function RoundupInviteInbox({ onOpen, onActiveChange }) {
  const { roundupInvites, declineRoundupInvite } = useContext(FriendBadgeContext);
  const glow = useRef(new Animated.Value(0)).current;

  const count = roundupInvites.length;
  // 받은 초대가 있을 때만 은은한 골드 글로우 루프 — shadow/border 애니라 useNativeDriver:false (ScheduleInviteInbox와 동일).
  useEffect(() => {
    if (!count) { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [count]);

  // 배너 표시 여부를 부모(홈)에 통지 — 떠 있는 동안 아래 카드와 겹치지 않게(일정 배너와 동일 규약).
  useEffect(() => { onActiveChange && onActiveChange(count > 0); }, [count]);

  if (!count) return null;
  const inv = roundupInvites[0]; // 가장 최근 1건 — 처리하면 다음 것이 올라옴
  const hostName = inv.authorName || '친구';
  const meta = [inv.course, inv.date, inv.time].filter(Boolean).join(' · ');

  return (
    <Animated.View style={{
      // iOS는 크루 아이콘 행과 너무 붙어 보여 위 여백을 조금 더(안드는 그대로) — 사용자 2026-06-26
      marginHorizontal: 20, marginTop: Platform.OS === 'ios' ? 22 : 12, borderRadius: 16,
      shadowColor: '#D9AF3C', shadowOffset: { width: 0, height: 0 },
      shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
      shadowRadius: glow.interpolate({ inputRange: [0, 1], outputRange: [16, 34] }),
      transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
    }}>
    <Animated.View style={{ backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 16, borderWidth: 2,
      borderColor: glow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(245,230,168,0.7)', 'rgba(245,230,168,1)'] }),
      paddingHorizontal: 14, paddingVertical: 10 }}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => onOpen && onOpen(inv)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <Text style={{ fontSize: fs(16) }}>⛳</Text>
          <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }} numberOfLines={1}>
            {hostName}님이 라운딩에 초대했어요{count > 1 ? ` 외 ${count - 1}건` : ''}
          </Text>
        </View>
        {!!meta && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.78)', marginBottom: 9 }} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={() => declineRoundupInvite(inv.id)} activeOpacity={0.85}
          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
            borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)' }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: 'rgba(255,255,255,0.85)' }}>거절</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onOpen && onOpen(inv)} activeOpacity={0.85}
          style={{ flex: 1.6, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: C.butter }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>초대 보기</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
    </Animated.View>
  );
}
