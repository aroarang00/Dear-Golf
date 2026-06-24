import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { SlideInRight } from 'react-native-reanimated'; // 깊은 화면 푸시 슬라이드 전환
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraggableRows } from './common/DraggableRows';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { storage, STORAGE_KEYS } from '../utils/storage';
import {
  subscribeMyCrews, subscribeCrewInvites, createCrew, updateCrewProfile,
  acceptCrewInvite, declineCrewInvite,
} from '../utils/crews';
import { uploadCrewImage } from '../utils/avatarStorage';
import { resolveMemberDisplay } from '../utils/friends';
import { showAppAlert } from './AppAlert';
import { showToast } from './AppToast';
import { CrewAlbumScreen } from './CrewAlbumScreen';
import { CrewCreateScreen } from './CrewCreateScreen';
import { CrewAvatar } from './common/CrewAvatar';

// 크루(친구 소수 그룹) 공유 앨범 — 진입 첫 화면 = 내가 속한 크루 리스트 (docs/crew-space-design.md §3.0).
//  ★목록은 DM(다크룸)과 다르게 — 친구화면 톤(페일스카이) 라이트 테마.
//  상호작용: 탭=앨범 입장 / 길게누르기=메뉴(이름 변경·즐겨찾기) — 탭과 안 엇갈리게.
//  ※ Phase 1 — mock 데이터로 화면 디자인 단계. 데이터(crews)·앨범·만들기는 이어서 연결.
const BG    = '#C8D9E6';                 // 페일스카이 배경 (친구화면 액센트색)
const INK   = '#1A3D52';                 // 본문(네이비)
const SUB   = 'rgba(26,61,82,0.55)';     // 보조 텍스트
const CARD  = '#FFFFFF';                 // 박스(초대·메뉴)
const SAGE  = '#8FB06B';                 // 크루 아이덴티티(홈 진입 아이콘과 동색)
const SAGE_DEEP = '#5E7E42';             // 헤더 화살표·크루 아이콘 — 페일스카이에서 또렷하게(진한 세이지)
const LINE  = 'rgba(26,61,82,0.12)';     // 헤어라인(카드 테두리 등)
const ROW_LINE = 'rgba(26,61,82,0.25)';  // 크루 목록 행 구분선 — 더 또렷하게
const BURGUNDY = '#6B1E2A';              // 새 글(게시글) N 배지 — 눈에 띄게(DM 안읽음과 동일 톤)
const ROW_H = 66;                        // 크루 행 고정 높이 — 드래그 순서변경 좌표 계산용
// 행 왼쪽 액센트 바 — 크루별 색(허전함 보완). id 해시로 안정 배정(정렬 바뀌어도 색 유지)
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const accentOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

// 목록 시각 — DM 목록과 동일 상대표현. 오늘=시간 / 어제 / N일 전(~6) / N주 전(~4) / 그 이상=날짜.
function fmtTime(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    const h = d.getHours(), m = d.getMinutes();
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  }
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  const days = Math.round((t - a) / 86400000);
  if (days === 1) return '어제';
  if (days <= 6) return `${days}일 전`;
  if (days <= 34) return `${Math.floor(days / 7)}주 전`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function MiniAvatar({ n, c, i, uri }) {
  const base = { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: '#fff', marginLeft: i === 0 ? 0 : -10 };
  if (uri) return <Image source={{ uri }} style={base} contentFit="cover" transition={200} />;
  return (
    <View style={{ ...base, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#fff' }}>{n}</Text>
    </View>
  );
}

// 아바타 스택 — 최대 max개만 겹쳐 표시, 나머지는 +N (20명이어도 4개+N). total=실제 인원.
function AvatarStack({ avatars, total, max = 4 }) {
  const shown = (avatars || []).slice(0, max);
  const extra = (total || (avatars || []).length) - shown.length;
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((a, i) => <MiniAvatar key={i} n={a.n} c={a.c} uri={a.uri} i={i} />)}
      {extra > 0 && (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(26,61,82,0.45)', borderWidth: 1.5, borderColor: '#fff',
          alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export function CrewListScreen({ onClose, onOpenDM }) {
  useScreenBack(true, onClose);
  const currentUid = useCurrentUid();

  const [crewDocs, setCrewDocs] = useState(null);    // 내 크루 원본 doc (null=로딩 중)
  const [inviteDocs, setInviteDocs] = useState([]);  // 내게 온 초대 doc
  const [favSet, setFavSet] = useState({});          // {crewId:true} — 즐겨찾기(기기 로컬, per-user)
  const [aliasMap, setAliasMap] = useState({});      // {crewId:alias} — 나만 보는 크루 별명(기기 로컬, 서버 name 불변)
  const [seenSet, setSeenSet] = useState({});        // {crewId:postCount} — 마지막으로 본 시점의 글 수(새 글 갯수 산출, 기기 로컬)
  const [crewOrder, setCrewOrder] = useState(null);  // [crewId,...] 수동 순서(드래그). null=미로드, []=설정 안 함
  const [people, setPeople] = useState({});          // uid→{name,avatarUri} — 초대 표시 enrich(내 별명·사진)
  const [myName, setMyName] = useState('');

  // 실시간 구독 — 열린 동안만(uid 바뀌면 재구독). cross-user 쓰기 0(셀프토글)이라 CF 불필요.
  useEffect(() => {
    if (!currentUid) { setCrewDocs([]); setInviteDocs([]); return; }
    const un1 = subscribeMyCrews(currentUid, setCrewDocs);
    const un2 = subscribeCrewInvites(currentUid, setInviteDocs);
    return () => { un1(); un2(); };
  }, [currentUid]);

  // 즐겨찾기 로컬 로드(서버 미저장) + 내 닉(수락 시 names 기록용)
  useEffect(() => {
    let alive = true;
    storage.load(STORAGE_KEYS.crewFavorites, {}).then((f) => { if (alive) setFavSet(f || {}); });
    storage.load(STORAGE_KEYS.crewAliases, {}).then((a) => { if (alive) setAliasMap(a || {}); });
    storage.load(STORAGE_KEYS.crewSeen, {}).then((s) => { if (alive) setSeenSet(s || {}); });
    storage.load(STORAGE_KEYS.crewOrder, []).then((o) => { if (alive) setCrewOrder(Array.isArray(o) ? o : []); });
    storage.load(STORAGE_KEYS.profile, null).then((p) => { if (alive && p?.nickname) setMyName(p.nickname); });
    return () => { alive = false; };
  }, []);

  // 초대 표시 enrich — 초대자·멤버 uid를 내 친구 별명/프로필로 resolve(없으면 저장 names 폴백)
  useEffect(() => {
    const uids = [];
    (inviteDocs || []).forEach((d) => {
      if (d.creatorUid) uids.push(d.creatorUid);
      (d.memberUids || []).slice(0, 4).forEach((u) => uids.push(u));
    });
    if (!uids.length) { setPeople({}); return; }
    let alive = true;
    resolveMemberDisplay(uids, { myUid: currentUid }).then((m) => { if (alive) setPeople(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [inviteDocs, currentUid]);

  const [editingId, setEditingId] = useState(null);   // 이름변경 중인 크루
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState(null);        // 길게누르기 메뉴 대상 크루
  const [openCrew, setOpenCrew] = useState(null);      // 앨범(상세) 열린 크루
  const [createOpen, setCreateOpen] = useState(false); // 크루 만들기

  // doc → 목록 표시 모델 (최근활동순 정렬, 즐겨찾기 플래그)
  const crews = useMemo(() => (crewDocs || []).map((d) => {
    const ts = d.lastPostAt || d.updatedAt || d.createdAt;
    const postCount = d.postCount || 0;
    const raw = seenSet[d.id];
    // 본 시점 글 수. 레거시(이전 점 버전의 millis 값)나 비정상은 무시(0) — postCount는 현실적으로 1e6 미만.
    const seen = (typeof raw === 'number' && raw >= 0 && raw < 1e6) ? raw : 0;
    // 마지막 글이 내 글이면 배지 억제 — 내가 방금 올린 글이 '새 글'로 뜨던 문제(addCrewPost가 lastPostBy 기록).
    const newCount = (d.lastPostBy && d.lastPostBy === currentUid) ? 0 : Math.max(0, postCount - seen);
    return {
      id: d.id, name: aliasMap[d.id] || d.name || '크루', members: (d.memberUids || []).length,
      last: fmtTime(ts), newCount,
      fav: !!favSet[d.id], _ts: ts?.toMillis ? ts.toMillis() : 0,
      themeColor: d.themeColor || null, imageUrl: d.imageUrl || null, description: d.description || '',  // 크루 프로필·성격(목록 카드)
      _doc: d,    // 앨범·멤버 화면에서 memberUids·names·notice 사용
    };
  }).sort((a, b) => b._ts - a._ts), [crewDocs, favSet, aliasMap, seenSet, currentUid]);

  // 크루 입장/퇴장 시 본 시점 글 수 갱신(새 글 갯수 0으로) — 현재 doc의 postCount 기준
  const markCrewSeen = (id) => {
    const d = (crewDocs || []).find((x) => x.id === id);
    if (!d) return;
    const pc = d.postCount || 0;
    setSeenSet((prev) => {
      if (prev[id] === pc) return prev;
      const next = { ...prev, [id]: pc };
      storage.save(STORAGE_KEYS.crewSeen, next);
      return next;
    });
  };

  // doc → 초대 표시 — 내 친구 별명/프로필 우선(people), 없으면 저장 names 폴백
  const invites = useMemo(() => (inviteDocs || []).map((d) => {
    const ids = d.memberUids || [];
    const names = d.names || {};
    return {
      id: d.id, name: d.name || '크루',
      inviter: people[d.creatorUid]?.name || names[d.creatorUid] || '친구', members: ids.length,
      avatars: ids.slice(0, 4).map((u) => {
        const pm = people[u];
        if (pm?.avatarUri) return { uri: pm.avatarUri };
        return { n: (pm?.name || names[u] || '?').trim().charAt(0) || '?', c: accentOf(u) };
      }),
    };
  }), [inviteDocs, people]);

  // 수락/거절 — 셀프 토글(onSnapshot이 목록 자동 갱신, 로컬 상태 변경 불필요)
  const acceptInvite = (iv) => { if (currentUid) acceptCrewInvite(iv.id, currentUid, myName); };
  const rejectInvite = (iv) => { if (currentUid) declineCrewInvite(iv.id, currentUid); };

  const handleCreate = async ({ name, friendUids = [], names = {}, creatorName = '', themeColor = '', description = '', photoUri = null }) => {
    setCreateOpen(false);
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    try {
      const id = await createCrew({ creatorUid: currentUid, creatorName, name, friendUids, names, themeColor, description });
      if (!id) { showAppAlert('만들기 실패', '잠시 후 다시 시도해주세요.'); return; }
      showToast(`크루 '${name}'를 만들었어요`);
      // 사진을 골랐으면 생성 후(crewId 필요) 업로드 → imageUrl 반영. 실패해도 크루는 색+이니셜로 유지(치명적 아님).
      if (photoUri) {
        uploadCrewImage(currentUid, id, photoUri)
          .then((url) => { if (url) return updateCrewProfile(id, { imageUrl: url }); })
          .catch((e) => __DEV__ && console.warn('[crew] cover upload', e?.message));
      }
    } catch (e) {
      if (__DEV__) console.warn('[crew] createCrew', e?.code, e?.message);
      showAppAlert('만들기 실패', e?.code === 'permission-denied'
        ? '크루 보안 규칙이 아직 적용되지 않았어요. 규칙 배포 후 다시 시도해주세요.'
        : (e?.message || '잠시 후 다시 시도해주세요.'));
    }
  };

  const startEdit = (c) => { setEditingId(c.id); setDraft(c.name); };
  // 별명 저장 — 기기 로컬(나만 보기). 서버 name은 안 건드림(전원 그룹명 변경 방지).
  //   비우거나 원래(서버) 이름과 같으면 별명 해제 → 원래 이름으로 복귀.
  const saveEdit = () => {
    const nm = draft.trim();
    if (editingId) {
      setAliasMap((prev) => {
        const next = { ...prev };
        const serverName = (crewDocs || []).find((x) => x.id === editingId)?.name || '';
        if (!nm || nm === serverName) delete next[editingId]; else next[editingId] = nm;
        storage.save(STORAGE_KEYS.crewAliases, next);
        return next;
      });
    }
    setEditingId(null);
  };
  const toggleFav = () => {
    const id = menuFor.id;
    setFavSet((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      storage.save(STORAGE_KEYS.crewFavorites, next);
      return next;
    });
    setMenuFor(null);
  };

  const loading = crewDocs === null;
  // 표시 순서 — 수동 순서(드래그) 있으면 그게 우선(없는 건 기본순으로 뒤에), 없으면 즐겨찾기 우선.
  const ordered = useMemo(() => {
    const list = [...crews];
    const ord = crewOrder || [];
    if (ord.length) {
      const idx = Object.fromEntries(ord.map((id, i) => [id, i]));
      return list.sort((a, b) => {
        const ai = idx[a.id], bi = idx[b.id];
        if (ai != null && bi != null) return ai - bi;
        if (ai != null) return -1;
        if (bi != null) return 1;
        return 0;   // 둘 다 수동순서에 없으면 crews 기본순(_ts) 유지(안정 정렬)
      });
    }
    return list.sort((a, b) => (b.fav === true) - (a.fav === true));
  }, [crews, crewOrder]);
  const onReorderCrews = (orderedIds) => {
    setCrewOrder(orderedIds);
    storage.save(STORAGE_KEYS.crewOrder, orderedIds);
  };
  const isEmpty = !loading && invites.length === 0 && crews.length === 0;

  // 앨범(상세) 열림 — 같은 Modal 안에서 리스트↔앨범 전환(DM 목록↔대화방과 동일). 닫을 때 본 시각 갱신(새 글 표시 해제)
  if (openCrew) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewAlbumScreen crew={openCrew} onClose={() => { markCrewSeen(openCrew.id); setOpenCrew(null); }} onOpenDM={onOpenDM} />
    </Animated.View>
  );
  if (createOpen) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewCreateScreen onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
    </Animated.View>
  );

  return (
    // RN Modal 안에선 루트 SafeAreaProvider가 안 닿아 top inset이 0 → 헤더(뒤로가기)가 노치 밑으로 올라가 안 눌림.
    //   DMListScreen과 동일 처리: 자체 Provider로 재측정([[dm-design]] iOS safe-area 버그).
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ← 닫기 · 제목 · ＋ 만들기 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        {/* 타이틀 = 홈 진입점과 동일한 크루 아이콘(진한 세이지, 키움) */}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Icon name="crew" size={fs(34)} color={SAGE_DEEP} strokeWidth={1.8} />
        </View>
        {/* 크루 만들기 — '＋ 만들기'로 명확히(친구초대 personAdd 아이콘과 혼동 방지). personAdd는 앨범·멤버서 초대 전용 */}
        <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: SAGE_DEEP,
            borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: '#fff', marginTop: -1 }}>＋</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: '#fff' }}>만들기</Text>
        </TouchableOpacity>
      </View>
      {/* 헤더 ↔ 목록 사이 세이지 색상바 — 밋밋함 보완(경계선 대체) */}
      <LinearGradient colors={['#5E7E42', '#8FB06B', 'rgba(143,176,107,0.15)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 5 }} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={SAGE_DEEP} />
        </View>
      ) : isEmpty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: 'rgba(143,176,107,0.6)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Icon name="crew" size={fs(38)} color={SAGE} strokeWidth={1.6} />
          </View>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK, marginBottom: 6 }}>아직 크루가 없어요</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB, textAlign: 'center', lineHeight: fs(19) }}>
            친한 친구들과 사진·영상을 함께 모으는{'\n'}프라이빗 공간을 만들어보세요.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          {/* 초대됨 — "초대됨 N" 헤더 + 컴팩트 행(여러 개여도 안 밀림) */}
          {invites.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: SAGE_DEEP, letterSpacing: 1, marginBottom: 8 }}>초대됨 {invites.length}</Text>
              <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 0.5, borderColor: LINE, overflow: 'hidden' }}>
                {invites.map((iv, i) => (
                  <View key={iv.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11,
                    borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: LINE }}>
                    <AvatarStack avatars={iv.avatars} total={iv.members} max={3} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }} numberOfLines={1}>{iv.name}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 2 }} numberOfLines={1}>{iv.inviter}님 초대 · {iv.members}명</Text>
                    </View>
                    <TouchableOpacity onPress={() => rejectInvite(iv)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: SUB }}>거절</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => acceptInvite(iv)} style={{ backgroundColor: SAGE_DEEP, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 6, marginLeft: 2 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#fff' }}>수락</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 내 크루 N — 목록 개수 라벨(밋밋함 보완 + 구조) */}
          {crews.length > 0 && (
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: SUB, letterSpacing: 0.5, marginBottom: 4 }}>
              내 크루 {crews.length}
            </Text>
          )}

          {/* 내 크루 — 탭=앨범 입장 / 길게=메뉴 / 우측 ≡ 핸들 잡고 위아래로 끌어 순서변경. 수동 순서 없으면 즐겨찾기 우선. */}
          <DraggableRows items={ordered} rowHeight={ROW_H} onReorder={onReorderCrews}
            renderItem={(c, drag) => editingId === c.id ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', height: ROW_H, borderBottomWidth: 1, borderBottomColor: ROW_LINE }}>
                <TextInput value={draft} onChangeText={setDraft} autoFocus maxLength={10}
                  allowFontScaling={false} onSubmitEditing={saveEdit} returnKeyType="done"
                  placeholder="크루 이름" placeholderTextColor={SUB}
                  style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, paddingVertical: 4,
                    borderBottomWidth: 1.5, borderBottomColor: SAGE, marginRight: 10 }} />
                <TouchableOpacity onPress={saveEdit} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, backgroundColor: SAGE }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>저장</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', height: ROW_H, borderBottomWidth: 1, borderBottomColor: ROW_LINE }}>
                <TouchableOpacity activeOpacity={0.6} onPress={() => { markCrewSeen(c.id); setOpenCrew(c); }}
                  onLongPress={() => setMenuFor(c)} delayLongPress={280}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%' }}>
                  {/* 크루 프로필 — 색+이니셜(또는 사진). 기존 크루는 themeColor 없으면 accentOf 폴백 */}
                  <CrewAvatar name={c.name} color={c.themeColor || accentOf(c.id)} imageUrl={c.imageUrl} size={42} radius={12} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK }} numberOfLines={1}>{c.name}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB, marginLeft: 6 }}>{c.members}명</Text>
                      {c.fav && <View style={{ marginLeft: 6 }}><Icon name="heartFilled" size={fs(13)} /></View>}
                    </View>
                    {/* 둘째 줄 — 크루 성격(없으면 생략, 카드 한 줄로) */}
                    {c.description ? (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: SUB, marginTop: 3 }} numberOfLines={1}>{c.description}</Text>
                    ) : null}
                  </View>
                  {/* 우측 — 마지막 대화 시간 + 새 글 뱃지 */}
                  <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB }}>{c.last}</Text>
                    {c.newCount > 0 && (
                      <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: BURGUNDY,
                        alignItems: 'center', justifyContent: 'center', marginTop: 5 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>{c.newCount > 99 ? '99+' : c.newCount}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                {/* 드래그 핸들(≡) — 잡고 위아래로 끌어 순서변경 (셰브론 › 대체) */}
                <GestureDetector gesture={drag}>
                  <View style={{ paddingLeft: 10, paddingRight: 4, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    {[0, 1, 2].map((k) => <View key={k} style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: 'rgba(26,61,82,0.4)' }} />)}
                  </View>
                </GestureDetector>
              </View>
            )} />
        </ScrollView>
      )}

      {/* 길게누르기 메뉴 — 이름 변경 · 즐겨찾기 (중첩 Modal 회피 위해 화면 내 오버레이) */}
      {menuFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setMenuFor(null)}
            style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD,
            borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 }}>
            <View style={{ alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }}>{menuFor.name}</Text>
            </View>
            <TouchableOpacity onPress={toggleFav}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
              <View style={{ width: 28 }}><Icon name={menuFor.fav ? 'heart' : 'heartFilled'} size={fs(18)} color={INK} /></View>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>{menuFor.fav ? '즐겨찾기 해제' : '즐겨찾기'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { startEdit(menuFor); setMenuFor(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
              <View style={{ width: 28 }}><Icon name="pen" size={fs(18)} color={INK} strokeWidth={1.7} /></View>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>이름 변경 (나만 보기)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
