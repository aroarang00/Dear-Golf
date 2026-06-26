import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { subscribeCrew, leaveCrew, toggleCrewAdmin } from '../utils/crews';
import { CrewInviteSheet } from './CrewInviteSheet';
import { CrewEditScreen } from './CrewEditScreen';
import { resolveMemberDisplay, loadMyFriendsEnriched, loadSentRequests, sendFriendRequest } from '../utils/friends';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { showAppAlert } from './AppAlert';

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

// 역할 배지 — 크루장(네이비)·운영진(세이지)
function RoleBadge({ text, bg, fg }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 6 }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(10.5), color: fg }} allowFontScaling={false}>{text}</Text>
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
  const [editOpen, setEditOpen] = useState(false);   // 크루 편집(크루장 전용)
  // 알림(홈 새 글 점) 음소거 — 크루별 로컬(per-user). 멤버 N 옆 스피커 토글 ([[crew-new-signal]])
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    let alive = true;
    storage.load(STORAGE_KEYS.crewMuted, {}).then(m => { if (alive) setMuted(!!(m && m[crewId])); }).catch(() => {});
    return () => { alive = false; };
  }, [crewId]);
  const toggleMuted = async () => {
    if (!crewId) return;
    const m = (await storage.load(STORAGE_KEYS.crewMuted, {})) || {};
    const next = { ...m };
    if (next[crewId]) delete next[crewId]; else next[crewId] = true;
    await storage.save(STORAGE_KEYS.crewMuted, next);
    setMuted(!!next[crewId]);
  };

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

  // 역할 — 크루장(creatorUid) / 운영진(adminUids)
  const creatorUid = crewDoc?.creatorUid;
  const adminUids = crewDoc?.adminUids || [];
  const iAmMaster = !!currentUid && currentUid === creatorUid;
  // 멤버 표시 모델 — 나 먼저, 그 다음 가입순. 역할(크루장·운영진) 포함.
  const members = useMemo(() => {
    const arr = memberUids.map((u) => {
      const d = display[u] || {};
      const name = d.name || namesFallback[u] || '친구';
      return { id: u, name, avatarUri: d.avatarUri || null, n: name.charAt(0), c: colorOf(u), self: u === currentUid,
        isMaster: u === creatorUid, isAdmin: adminUids.includes(u) };
    });
    return arr.sort((a, b) => (b.self === true) - (a.self === true));
  }, [memberUids.join(','), display, currentUid, creatorUid, adminUids.join(',')]);

  const atMax = members.length >= MAX_MEMBERS;
  const doLeave = async () => {
    setLeaveAsk(false);
    if (!crewId || !currentUid) { onLeave?.(); return; }
    // await + 에러 안내 — 규칙 거부/네트워크 실패 시 조용히 닫혀 서버엔 멤버로 남던 것 방지(2026-06-26 감사)
    try {
      await leaveCrew(crewId, currentUid);
      onLeave?.();
    } catch (e) {
      if (__DEV__) console.warn('[crew] leave failed', e?.message);
      showAppAlert('나가기에 실패했어요', '잠시 후 다시 시도해주세요.');
    }
  };

  // 크루 편집(크루장 전용) — 멤버 화면 위에 풀스크린으로. 서버 name·색·성격·사진을 현재값으로 초기화.
  if (editOpen) {
    return (
      <CrewEditScreen
        crew={{ id: crewId, name: crewDoc?.name, themeColor: crewDoc?.themeColor, imageUrl: crewDoc?.imageUrl, description: crewDoc?.description }}
        onClose={() => setEditOpen(false)} />
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ← · 멤버 N · ＋초대 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: INK }}>멤버 {members.length}</Text>
        </View>
        {/* 크루 편집 — 크루장 전용(이름·색·성격·사진) */}
        {iAmMaster && (
          <TouchableOpacity onPress={() => setEditOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: 9, borderWidth: 1, borderColor: SAGE_DEEP, marginRight: 8 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: SAGE_DEEP }}>편집</Text>
          </TouchableOpacity>
        )}
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

        {/* 새 글 알림 토글 — 헤더 스피커 아이콘만이면 작아서 안 보여 라벨 행으로(중장년 발견성).
            끄면 홈 크루 새 글 'NEW' 신호에서 이 크루 제외(본인만, 기기 로컬). [[crew-new-signal]] */}
        <TouchableOpacity onPress={toggleMuted} activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 }}>
          <Icon name={muted ? 'speakerOff' : 'speaker'} size={fs(22)} color={muted ? '#B23B3B' : SAGE_DEEP} strokeWidth={2.2} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14.5), color: INK }}>새 글 알림</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 2 }} numberOfLines={1}>
              {muted ? '꺼짐 · 홈에서 이 크루 새 글 신호가 안 떠요' : '켜짐 · 새 글이 올라오면 홈에 표시돼요'}
            </Text>
          </View>
          {/* 탭하면 바뀌는 동작 라벨 — 음소거 상태면 '켜기', 켜진 상태면 '끄기' */}
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginLeft: 10,
            backgroundColor: muted ? 'rgba(94,126,66,0.12)' : 'rgba(178,59,59,0.08)' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: muted ? SAGE_DEEP : '#B23B3B' }}>{muted ? '켜기' : '끄기'}</Text>
          </View>
        </TouchableOpacity>

        <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 0.5, borderColor: LINE, overflow: 'hidden' }}>
          {members.map((m, i) => {
            const isFriend = friendSet.has(m.id);
            const sent = sentSet.has(m.id);
            // 크루장 시야에선 행 탭(친구 액션) 비활성 — 우측 '운영진 지정/해제' 칩만 동작. 일반 시야는 기존 친구=DM/신청.
            const inert = m.self || iAmMaster || (!isFriend && sent);
            return (
            <TouchableOpacity key={m.id} activeOpacity={inert ? 1 : 0.7} disabled={inert}
              onPress={() => { if (m.self || iAmMaster) return; isFriend ? onOpenDM?.(m.id, m.name, m.avatarUri) : requestFriend(m); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: LINE }}>
              <Avatar n={m.n} c={m.c} uri={m.avatarUri} />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                <Text style={{ flexShrink: 1, fontFamily: F.sysM, fontSize: fs(16), color: INK }} numberOfLines={1}>{m.name}</Text>
                {m.isMaster && <RoleBadge text="크루리더" bg={INK} fg="#fff" />}
                {m.isAdmin && !m.isMaster && <RoleBadge text="서브리더" bg="rgba(94,126,66,0.16)" fg={SAGE_DEEP} />}
              </View>
              {m.self ? (
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: SAGE_DEEP, marginLeft: 8 }}>나</Text>
              ) : iAmMaster ? (
                <TouchableOpacity onPress={() => toggleCrewAdmin(crewId, m.id, !m.isAdmin)} activeOpacity={0.8}
                  style={{ marginLeft: 8, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, borderWidth: 1,
                    borderColor: m.isAdmin ? 'rgba(178,59,59,0.45)' : SAGE_DEEP }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: m.isAdmin ? '#B23B3B' : SAGE_DEEP }}>
                    {m.isAdmin ? '서브리더 해제' : '서브리더 지정'}
                  </Text>
                </TouchableOpacity>
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

      {/* 친구 초대 시트 — 앨범 사람+와 동일 컴포넌트 공용.
          friends는 이 화면이 이미 프리로드(loadMyFriendsEnriched)한 값을 prop으로 넘긴다 — 시트 self-load 시
          entering 애니가 로딩(빈) 높이를 캡처해 한두 명만 보이던 버그 방지(2026-06-26 테스터 리포트). */}
      {inviteOpen && (
        <CrewInviteSheet crewId={crewId} memberUids={memberUids}
          audienceUids={crewDoc?.audienceUids || []} declinedUids={crewDoc?.declinedUids || []}
          friends={friends} onClose={() => setInviteOpen(false)} />
      )}

      {/* 나가기 확인 */}
      {leaveAsk && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setLeaveAsk(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,61,82,0.4)' }} />
          <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 20, width: '100%' }}>
            {/* 경고 문구는 로컬 members.length(구독 스냅샷) 기반 휴리스틱 — 동시에 다른 멤버가 나가면 '마지막 멤버' 판정이
                실제와 잠깐 어긋날 수 있다. 단 실제 데이터 삭제는 CF(onCrewEmptied: memberUids→[] → onCrewDeleted)가
                보장하므로 안전(문구만 오해 소지). 정확한 마지막-멤버 판정이 필요해지면 leaveCrew를 트랜잭션으로 승격할 것. (AUDIT M5) */}
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
