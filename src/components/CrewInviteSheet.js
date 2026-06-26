import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { inviteToCrew, MAX_MEMBERS } from '../utils/crews';
import { loadMyFriendsEnriched } from '../utils/friends';
import { showAppAlert } from './AppAlert';

// 크루 친구 초대 시트 — 현재 화면 위에 바로 뜨는 바텀 시트(앨범 사람+ · 멤버화면 + 공용).
//   친구 풀(멤버 제외) 다중선택 → inviteToCrew(audience 추가). 정원(MAX_MEMBERS) 한도 내 선택만 허용.
const INK = '#1A3D52', SUB = 'rgba(26,61,82,0.55)', CARD = '#FFFFFF', SAGE_DEEP = '#5E7E42', LINE = 'rgba(26,61,82,0.12)';
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const colorOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

function Avatar({ n, c, size = 36, uri }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={200} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.4), color: '#fff' }}>{n}</Text>
    </View>
  );
}

export function CrewInviteSheet({ crewId, memberUids = [], audienceUids = [], declinedUids = [], friends: friendsProp, onClose }) {
  const insets = useSafeAreaInsets();
  // 친구 목록 — 부모(앨범)가 이미 로드한 걸 prop으로 주면 재로드 안 함 → 로딩·높이 점프 0(2026-06-24).
  //   prop 미제공(멤버 화면 등)일 때만 자체 로드(하위호환). null=로딩.
  const [friends, setFriends] = useState(friendsProp ?? null);
  const [selected, setSelected] = useState(() => new Set());  // 이번에 고른(아직 안 보낸) uid
  const [sending, setSending] = useState(false);              // 상단 '초대 N' 전송 중

  useEffect(() => {
    if (friendsProp !== undefined) { setFriends(friendsProp); return; }
    let alive = true;
    loadMyFriendsEnriched().then((l) => { if (alive) setFriends(l || []); }).catch(() => alive && setFriends([]));
    return () => { alive = false; };
  }, [friendsProp]);

  // '초대중' 표시 대상 = audience(미수락) 中 거절 안 한 사람. 거절자(declined)는 audience에 남아있어도
  //   재초대 가능하게 '초대' 버튼 노출(inviteToCrew가 declined 해제).
  const pendingSet = useMemo(() => {
    const dec = new Set(declinedUids || []);
    return new Set((audienceUids || []).filter((u) => !dec.has(u)));
  }, [audienceUids, declinedUids]);

  const pool = useMemo(() => (friends || []).filter((f) => !memberUids.includes(f.id)), [friends, memberUids]);
  const atMax = memberUids.length >= MAX_MEMBERS;   // 정원 — 더 못 받음

  // 행 탭 = 선택 토글(아직 전송 X). 상단 '초대 N'을 눌러야 실제로 보냄 — 보내기 전 자유롭게 가감.
  const toggle = (id) => {
    if (atMax) return;
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  // 상단 '초대 N' — 고른 전원을 한 번에 초대(audience 추가) 후 닫기. 실패 시 시트 유지.
  const sendInvites = async () => {
    if (!crewId || selected.size === 0 || sending) return;
    setSending(true);
    const add = (friends || []).filter((f) => selected.has(f.id));
    const names = {};
    add.forEach((f) => { names[f.id] = f.customName || f.name || ''; });
    try {
      await inviteToCrew(crewId, add.map((f) => f.id), names);
      onClose?.();
    } catch (e) {
      if (__DEV__) console.warn('[crew] invite failed', e?.message);
      showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.');
      setSending(false);
    }
  };

  const count = selected.size;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
      {/* 시트 — 아래서 위로 슬라이드업(SlideInDown=reanimated에선 아래서 진입, 명명 주의).
          minHeight 고정 — 부모 friends가 아직 null(로딩)일 때 열면 entering 애니가 접힌(스피너) 높이를 잡아
          친구 도착 후 한두 명만 보이던 잔존 버그 방지(2026-06-26). 안정 높이 위에서 리스트가 채워짐. */}
      <Animated.View entering={SlideInDown.duration(240)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 18 + insets.bottom, minHeight: '45%', maxHeight: '78%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
          <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK }}>친구 초대</Text>
          {/* 상단 = 실제 전송. 고른 사람 있으면 '초대 N'(세이지 채움), 없으면 '닫기'(평문) */}
          {count > 0 ? (
            <TouchableOpacity onPress={sendInvites} disabled={sending} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ minWidth: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: SAGE_DEEP, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7 }}>
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>초대 {count}</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: SUB }}>닫기</Text>
            </TouchableOpacity>
          )}
        </View>
        {atMax && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#B23B3B', paddingHorizontal: 18, paddingTop: 10 }}>정원({MAX_MEMBERS}명)이 찼어요.</Text>
        )}
        <ScrollView keyboardShouldPersistTaps="handled">
          {friends === null
            ? <View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator color={SAGE_DEEP} /></View>
            : pool.length === 0
            ? <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: SUB, padding: 20, textAlign: 'center' }}>초대할 친구가 없어요.</Text>
            : pool.map((f) => {
              const dn = f.customName || f.name || '친구';
              const isPending = pendingSet.has(f.id);
              const isSel = selected.has(f.id);
              if (isPending) {
                // 초대중 — 이미 초대돼 수락 대기 중(선택 불가)
                return (
                  <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 }}>
                    <Avatar n={dn.charAt(0)} c={colorOf(f.id)} uri={f.avatarUri} size={36} />
                    <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(16), color: INK, marginLeft: 12 }} numberOfLines={1}>{dn}</Text>
                    <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 6 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: SUB }}>초대중</Text>
                    </View>
                  </View>
                );
              }
              // 행 전체 탭 = 선택 토글. 우측 알약이 상태 표시(선택=세이지채움 '선택됨' / 미선택=테두리 '초대')
              return (
                <TouchableOpacity key={f.id} activeOpacity={0.7} onPress={() => toggle(f.id)} disabled={atMax}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10 }}>
                  <Avatar n={dn.charAt(0)} c={colorOf(f.id)} uri={f.avatarUri} size={36} />
                  <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(16), color: INK, marginLeft: 12 }} numberOfLines={1}>{dn}</Text>
                  {isSel ? (
                    <View style={{ minWidth: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: SAGE_DEEP }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }}>✓ 선택됨</Text>
                    </View>
                  ) : (
                    <View style={{ minWidth: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 6.5, borderWidth: 1.5, borderColor: atMax ? LINE : SAGE_DEEP }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: atMax ? SUB : SAGE_DEEP }}>초대</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
