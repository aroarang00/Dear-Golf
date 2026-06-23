import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { inviteToCrew, MAX_MEMBERS } from '../utils/crews';
import { loadMyFriendsEnriched } from '../utils/friends';

// 크루 친구 초대 시트 — 현재 화면 위에 바로 뜨는 바텀 시트(앨범 사람+ · 멤버화면 + 공용).
//   친구 풀(멤버 제외) 다중선택 → inviteToCrew(audience 추가). 정원(MAX_MEMBERS) 한도 내 선택만 허용.
const INK = '#1A3D52', SUB = 'rgba(26,61,82,0.55)', CARD = '#FFFFFF', SAGE_DEEP = '#5E7E42', LINE = 'rgba(26,61,82,0.12)';
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const colorOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

function Avatar({ n, c, size = 36, uri }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.4), color: '#fff' }}>{n}</Text>
    </View>
  );
}

export function CrewInviteSheet({ crewId, memberUids = [], friends: friendsProp, onClose }) {
  const insets = useSafeAreaInsets();
  // 친구 목록 — 부모(앨범)가 이미 로드한 걸 prop으로 주면 재로드 안 함 → 로딩·높이 점프 0(2026-06-24).
  //   prop 미제공(멤버 화면 등)일 때만 자체 로드(하위호환). null=로딩.
  const [friends, setFriends] = useState(friendsProp ?? null);
  const [sel, setSel] = useState([]);

  useEffect(() => {
    if (friendsProp !== undefined) { setFriends(friendsProp); return; }
    let alive = true;
    loadMyFriendsEnriched().then((l) => { if (alive) setFriends(l || []); }).catch(() => alive && setFriends([]));
    return () => { alive = false; };
  }, [friendsProp]);

  const pool = useMemo(() => (friends || []).filter((f) => !memberUids.includes(f.id)), [friends, memberUids]);
  const remaining = Math.max(0, MAX_MEMBERS - memberUids.length);   // 더 받을 수 있는 인원
  const atMax = remaining <= 0;
  const toggle = (id) => setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : (p.length >= remaining ? p : [...p, id]));
  const invite = () => {
    const add = (friends || []).filter((f) => sel.includes(f.id));
    if (crewId && add.length) {
      const names = {};
      add.forEach((f) => { names[f.id] = f.customName || f.name || ''; });
      inviteToCrew(crewId, add.map((f) => f.id), names);   // audience 추가(수락 시 멤버 합류)
    }
    onClose?.();
  };

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
      {/* 시트 — 아래서 위로 슬라이드업(SlideInDown=reanimated에선 아래서 진입, 명명 주의). friends를 부모가 프리페치해
          prop으로 주므로 로딩·점프 없이 즉시 리스트라 minHeight 불필요 — 내용 높이대로, 길면 maxHeight 70%(2026-06-24). */}
      <Animated.View entering={SlideInDown.duration(240)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 18 + insets.bottom, maxHeight: '70%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
          <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK }}>친구 초대</Text>
          <TouchableOpacity onPress={invite} disabled={sel.length === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: sel.length ? SAGE_DEEP : 'rgba(94,126,66,0.4)' }}>초대 {sel.length || ''}</Text>
          </TouchableOpacity>
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
              const on = sel.includes(f.id);
              const dn = f.customName || f.name || '친구';
              return (
                <TouchableOpacity key={f.id} activeOpacity={0.7} onPress={() => toggle(f.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 11 }}>
                  <Avatar n={dn.charAt(0)} c={colorOf(f.id)} uri={f.avatarUri} size={36} />
                  <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(16), color: INK, marginLeft: 12 }} numberOfLines={1}>{dn}</Text>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: on ? SAGE_DEEP : 'rgba(26,61,82,0.25)', backgroundColor: on ? SAGE_DEEP : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Text style={{ fontSize: fs(13), color: '#fff' }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
