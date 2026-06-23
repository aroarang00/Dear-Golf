import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { subscribeCrew, leaveCrew } from '../utils/crews';
import { CrewInviteSheet } from './CrewInviteSheet';
import { resolveMemberDisplay, loadMyFriendsEnriched, loadSentRequests, sendFriendRequest } from '../utils/friends';
import { storage, STORAGE_KEYS } from '../utils/storage';

// 크루 멤버 관리 — 앨범 ⚙에서 진입 (docs/crew-space-design.md §3, 전원 동등).
//  멤버 목록(프로필 탭→DM) + 친구 초대 + 크루 나가기. 운영자 없음(누구나 초대, 본인 탈퇴 자유).
//  페일스카이 라이트. 멤버=크루 doc 구독(초대·탈퇴 즉시 반영), 표시명=보는 사람 별명 resolve.
const BG = '#C8D9E6', INK = '#1A3D52', SUB = 'rgba(26,61,82,0.55)', CARD = '#FFFFFF', SAGE_DEEP = '#5E7E42', LINE = 'rgba(26,61,82,0.12)';
const MAX_MEMBERS = 20;
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const colorOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

function Avatar({ n, c, size = 40, uri }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.4), color: '#fff' }}>{n}</Text>
    </View>
  );
}

export function CrewMembersScreen({ crew, onClose, onLeave, onOpenDM }) {
  useScreenBack(true, onClose);
  const currentUid = useCurrentUid();
  const crewId = crew?.id;

  const [crewDoc, setCrewDoc] = useState(crew?._doc || null);  // 라이브 크루 doc
  const [display, setDisplay] = useState({});                  // uid→{name,avatarUri,self}
  const [friends, setFriends] = useState(null);                // 초대용 내 친구 + 멤버 친구여부 판정
  const [sentSet, setSentSet] = useState(new Set());           // 보낸 친구신청(recipientUid) — '신청됨' 표시
  const [myName, setMyName] = useState('');                    // 친구신청 알림 표시용 내 닉네임
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);

  // 크루 doc 실시간 구독 — 초대(audience)·수락·탈퇴(memberUids) 즉시 반영
  useEffect(() => {
    if (!crewId) return;
    return subscribeCrew(crewId, (d) => { if (d) setCrewDoc(d); });
  }, [crewId]);

  const memberUids = crewDoc?.memberUids || [];
  const namesFallback = crewDoc?.names || {};

  // 멤버 표시명/아바타 resolve(보는 사람 별명 우선) — 멤버 구성 바뀔 때만
  useEffect(() => {
    if (!memberUids.length) { setDisplay({}); return; }
    let alive = true;
    resolveMemberDisplay(memberUids, { myUid: currentUid, namesFallback }).then((m) => { if (alive) setDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [memberUids.join(','), currentUid]);

  // 초대 친구 풀 + 보낸 친구신청 + 내 닉네임 로드(한 번)
  useEffect(() => {
    let alive = true;
    loadMyFriendsEnriched().then((l) => { if (alive) setFriends(l || []); }).catch(() => alive && setFriends([]));
    loadSentRequests().then((r) => { if (alive) setSentSet(new Set((r || []).map((x) => x.recipientUid))); }).catch(() => {});
    storage.load(STORAGE_KEYS.profile, null).then((p) => { if (alive && p?.nickname) setMyName(p.nickname); });
    return () => { alive = false; };
  }, []);

  const friendSet = useMemo(() => new Set((friends || []).map((f) => f.id)), [friends]);
  // 친구 신청 — 낙관적으로 '신청됨' 표시 후 전송(이미 친구/신청됨이면 무해)
  const requestFriend = async (m) => {
    if (!m?.id || sentSet.has(m.id)) return;
    setSentSet((p) => new Set(p).add(m.id));
    try { await sendFriendRequest(m.id, myName); }
    catch (e) { if (__DEV__) console.warn('[crewMembers] friendReq', e?.code, e?.message); }
  };

  // 멤버 표시 모델 — 나 먼저, 그 다음 가입순
  const members = useMemo(() => {
    const arr = memberUids.map((u) => {
      const d = display[u] || {};
      const name = d.name || namesFallback[u] || '친구';
      return { id: u, name, avatarUri: d.avatarUri || null, n: name.charAt(0), c: colorOf(u), self: u === currentUid };
    });
    return arr.sort((a, b) => (b.self === true) - (a.self === true));
  }, [memberUids.join(','), display, currentUid]);

  const atMax = members.length >= MAX_MEMBERS;
  const doLeave = () => {
    setLeaveAsk(false);
    if (crewId && currentUid) leaveCrew(crewId, currentUid);
    onLeave?.();
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
        {/* 크루 나가기 — 하단보다 헤더가 자연스러움(사용자 지정) */}
        <TouchableOpacity onPress={() => setLeaveAsk(true)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(178,59,59,0.5)' }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#B23B3B' }}>나가기</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => !atMax && setInviteOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }} style={{ padding: 4, marginLeft: 16 }}>
          <Icon name="personAdd" size={fs(23)} color={atMax ? SUB : SAGE_DEEP} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginBottom: 8 }}>{members.length}/{MAX_MEMBERS}명 · 누구나 초대할 수 있어요</Text>
        <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 0.5, borderColor: LINE, overflow: 'hidden' }}>
          {members.map((m, i) => {
            const isFriend = friendSet.has(m.id);
            const sent = sentSet.has(m.id);
            const inert = m.self || (!isFriend && sent);   // 나·신청됨은 탭 비활성
            // 행 전체가 액션(단일 TouchableOpacity=중첩 없어 iOS 안전): 친구=DM / 비친구=친구신청.
            //   ★비친구 DM은 규칙상(areFriends) 전송이 막혀 의미 없음 → 친구신청으로 분기(크루 멤버는 서로 친구 아닐 수 있음).
            return (
            <TouchableOpacity key={m.id} activeOpacity={inert ? 1 : 0.7} disabled={inert}
              onPress={() => { if (m.self) return; isFriend ? onOpenDM?.(m.id, m.name, m.avatarUri) : requestFriend(m); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: LINE }}>
              <Avatar n={m.n} c={m.c} uri={m.avatarUri} />
              <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(16), color: INK, marginLeft: 12 }} numberOfLines={1}>{m.name}</Text>
              {m.self ? (
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: SAGE_DEEP }}>나</Text>
              ) : friends === null ? null : isFriend ? (
                <Icon name="sendFilled" size={fs(30)} color={INK} strokeWidth={1.8} />
              ) : sent ? (
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: SUB }}>신청됨</Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="personAdd" size={fs(20)} color={SAGE_DEEP} strokeWidth={1.9} />
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: SAGE_DEEP }}>친구</Text>
                </View>
              )}
            </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* 친구 초대 시트 — 앨범 사람+와 동일 컴포넌트 공용 */}
      {inviteOpen && (
        <CrewInviteSheet crewId={crewId} memberUids={memberUids} onClose={() => setInviteOpen(false)} />
      )}

      {/* 나가기 확인 */}
      {leaveAsk && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setLeaveAsk(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,61,82,0.4)' }} />
          <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK, textAlign: 'center' }}>{members.length <= 1 ? '마지막 멤버예요' : '크루에서 나갈까요?'}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: members.length <= 1 ? '#B23B3B' : SUB, textAlign: 'center', marginTop: 8, lineHeight: fs(19) }}>
              {members.length <= 1 ? '나가면 이 크루의 사진·영상·글이 모두 삭제돼요. 되돌릴 수 없어요.' : '나가면 이 크루의 사진·글을 더 볼 수 없어요.'}
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 18, gap: 8 }}>
              <TouchableOpacity onPress={() => setLeaveAsk(false)} style={{ flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: LINE }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: SUB }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={doLeave} style={{ flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: '#B23B3B' }}>
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
