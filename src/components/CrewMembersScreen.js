import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';

// 크루 멤버 관리 — 앨범 ⚙에서 진입 (docs/crew-space-design.md §3, 전원 동등).
//  멤버 목록(프로필 탭→DM) + 친구 초대 + 크루 나가기. 운영자 없음(누구나 초대, 본인 탈퇴 자유).
//  페일스카이 라이트. ※ Phase 1 — mock.
const BG = '#C8D9E6', INK = '#1A3D52', SUB = 'rgba(26,61,82,0.55)', CARD = '#FFFFFF', SAGE_DEEP = '#5E7E42', LINE = 'rgba(26,61,82,0.12)';
const MAX_MEMBERS = 20;
const INIT_MEMBERS = [
  { id: 'me', n: '나', c: '#5E7E42', name: '나', self: true },
  { id: 'm1', n: '민', c: '#5B86A8', name: '민수' },
  { id: 'm2', n: '영', c: '#8FB06B', name: '영지' },
  { id: 'm3', n: '수', c: '#C98B7F', name: '수진' },
];
const FRIEND_POOL = [
  { id: 'f4', n: '준', c: '#9B7FB0', name: '준호' },
  { id: 'f5', n: '태', c: '#5E7E42', name: '태현' },
  { id: 'f6', n: '지', c: '#C9A24B', name: '지원' },
];

function Avatar({ n, c, size = 40, uri }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.4), color: '#fff' }}>{n}</Text>
    </View>
  );
}

export function CrewMembersScreen({ crew, onClose, onLeave }) {
  useAndroidBack(true, onClose);
  const [members, setMembers] = useState(INIT_MEMBERS);
  const [profileFor, setProfileFor] = useState(null);  // DM 시트
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sel, setSel] = useState([]);
  const [leaveAsk, setLeaveAsk] = useState(false);

  const pool = FRIEND_POOL.filter((f) => !members.some((m) => m.id === f.id));
  const atMax = members.length >= MAX_MEMBERS;
  const toggle = (id) => setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : ((members.length + p.length >= MAX_MEMBERS) ? p : [...p, id]));
  const invite = () => {
    const add = pool.filter((f) => sel.includes(f.id));
    setMembers((prev) => [...prev, ...add]);
    setSel([]); setInviteOpen(false);
  };

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ← · 멤버 N · ＋초대 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: INK, marginLeft: 6 }}>멤버 {members.length}</Text>
        <TouchableOpacity onPress={() => !atMax && setInviteOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Icon name="personAdd" size={fs(23)} color={atMax ? SUB : SAGE_DEEP} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginBottom: 8 }}>{members.length}/{MAX_MEMBERS}명 · 누구나 초대할 수 있어요</Text>
        <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 0.5, borderColor: LINE, overflow: 'hidden' }}>
          {members.map((m, i) => (
            <TouchableOpacity key={m.id} activeOpacity={m.self ? 1 : 0.7} onPress={() => !m.self && setProfileFor(m)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: LINE }}>
              <Avatar n={m.n} c={m.c} uri={m.uri} />
              <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(15), color: INK, marginLeft: 12 }}>{m.name}</Text>
              {m.self && <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: SAGE_DEEP }}>나</Text>}
              {!m.self && <Icon name="paperPlane" size={fs(17)} color="rgba(26,61,82,0.3)" strokeWidth={1.7} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* 크루 나가기 */}
        <TouchableOpacity onPress={() => setLeaveAsk(true)} activeOpacity={0.8}
          style={{ marginTop: 22, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 11 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: '#B23B3B' }}>크루 나가기</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 프로필 → DM 시트 */}
      {profileFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setProfileFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
              <Avatar n={profileFor.n} c={profileFor.c} uri={profileFor.uri} size={36} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: INK, marginLeft: 12 }}>{profileFor.name}</Text>
            </View>
            <TouchableOpacity onPress={() => { /* TODO DM 라우팅 */ setProfileFor(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 16 }}>
              <View style={{ width: 28 }}><Icon name="paperPlane" size={fs(18)} color={SAGE_DEEP} strokeWidth={1.7} /></View>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(14.5), color: INK }}>메시지 보내기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 친구 초대 시트 */}
      {inviteOpen && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => { setInviteOpen(false); setSel([]); }} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 28, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
              <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: INK }}>친구 초대</Text>
              <TouchableOpacity onPress={invite} disabled={sel.length === 0}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: sel.length ? SAGE_DEEP : 'rgba(94,126,66,0.4)' }}>초대 {sel.length || ''}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {pool.length === 0 && <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: SUB, padding: 20, textAlign: 'center' }}>초대할 친구가 없어요.</Text>}
              {pool.map((f) => {
                const on = sel.includes(f.id);
                return (
                  <TouchableOpacity key={f.id} activeOpacity={0.7} onPress={() => toggle(f.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 11 }}>
                    <Avatar n={f.n} c={f.c} uri={f.uri} size={36} />
                    <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14.5), color: INK, marginLeft: 12 }}>{f.name}</Text>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: on ? SAGE_DEEP : 'rgba(26,61,82,0.25)', backgroundColor: on ? SAGE_DEEP : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Text style={{ fontSize: fs(13), color: '#fff' }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* 나가기 확인 */}
      {leaveAsk && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setLeaveAsk(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,61,82,0.4)' }} />
          <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: INK, textAlign: 'center' }}>크루에서 나갈까요?</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB, textAlign: 'center', marginTop: 8, lineHeight: fs(19) }}>나가면 이 크루의 사진·글을 더 볼 수 없어요.</Text>
            <View style={{ flexDirection: 'row', marginTop: 18, gap: 8 }}>
              <TouchableOpacity onPress={() => setLeaveAsk(false)} style={{ flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: LINE }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: SUB }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setLeaveAsk(false); onLeave?.(); }} style={{ flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: '#B23B3B' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }}>나가기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
