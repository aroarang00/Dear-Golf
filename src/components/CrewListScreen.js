import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
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
import { UserContext } from '../contexts/UserContext';
import { maxCrewsOf } from '../utils/entitlements';
import { storage, STORAGE_KEYS } from '../utils/storage';
import {
  subscribeMyCrews, subscribeCrewInvites, createCrew, updateCrewProfile,
  acceptCrewInvite, declineCrewInvite, hasNewCommentsOnMyPosts,
} from '../utils/crews';
import { uploadCrewImage } from '../utils/avatarStorage';
import { resolveMemberDisplay, getCachedMemberDisplay } from '../utils/friends';
import { friendDisplayName, getCachedFriendMeta } from '../utils/friendGroups';   // 별명 캐시 — 첫 페인트 flicker 방지
import { showAppAlert } from './AppAlert';
import { showToast } from './AppToast';
import { CrewAlbumScreen } from './CrewAlbumScreen';
import { CrewCreateScreen } from './CrewCreateScreen';
import { CrewIntroModal } from './CrewIntroModal';
import { CrewAvatar } from './common/CrewAvatar';

// 크루(친구 소수 그룹) 공유 앨범 — 진입 첫 화면 = 내가 속한 크루 리스트 (docs/crew-space-design.md §3.0).
//  ★목록은 DM(다크룸)과 다르게 — 친구화면 톤(페일스카이) 라이트 테마.
//  상호작용: 탭=앨범 입장 / 길게누르기=메뉴(이름 변경) — 탭과 안 엇갈리게. (즐겨찾기는 드래그 순서변경으로 대체·폐기)
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
  if (uri) return <Image source={{ uri }} style={base} contentFit="cover" cachePolicy="memory-disk" transition={0} />;
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

export function CrewListScreen({ onClose, onOpenDM, onOpenRoundup, reopenCrewId, onReopenConsumed }) {
  useScreenBack(true, onClose);
  const currentUid = useCurrentUid();
  const { userProfile } = React.useContext(UserContext);   // 등급 한도(entitlements.maxCrews) 읽기용

  const [crewDocs, setCrewDocs] = useState(null);    // 내 크루 원본 doc (null=로딩 중)
  const [inviteDocs, setInviteDocs] = useState([]);  // 내게 온 초대 doc
  const [aliasMap, setAliasMap] = useState({});      // {crewId:alias} — 나만 보는 크루 별명(기기 로컬, 서버 name 불변)
  const [seenSet, setSeenSet] = useState({});        // {crewId:postCount} — 마지막으로 본 시점의 글 수(목록 '새 글 N' 배지 산출, 기기 로컬)
  const [seenLoaded, setSeenLoaded] = useState(false); // crewSeen 로드 완료 — baseline 레이스 가드(로드 전 {}일 때 baseline 돌면 실제 seen 덮어씀)
  const [seenAtMap, setSeenAtMap] = useState({});    // {crewId:millis} — 마지막으로 앨범 닫은 시각(앨범 NEW·내글 새댓글 판단, 기기 로컬)
  const [reactSet, setReactSet] = useState({});      // {crewId:true} — 내 글에 안 본 새 댓글 있는 크루(7b, 목록 진입 시 조회)
  const [seenAtLoaded, setSeenAtLoaded] = useState(false); // crewSeenAt 로드 완료 — reactSet 조회를 그 뒤 1회만(여닫을 때마다 N재조회 churn 방지)
  const [crewOrder, setCrewOrder] = useState(null);  // [crewId,...] 수동 순서(드래그). null=미로드, []=설정 안 함
  const [people, setPeople] = useState({});          // uid→{name,avatarUri} — 초대 표시 enrich(내 별명·사진)
  const [myName, setMyName] = useState('');
  const [mutedMap, setMutedMap] = useState({});      // {crewId:true} — 새 글 알림 음소거(멤버 화면서 토글, 기기 로컬). 행에 표시

  // 실시간 구독 — 열린 동안만(uid 바뀌면 재구독). cross-user 쓰기 0(셀프토글)이라 CF 불필요.
  useEffect(() => {
    if (!currentUid) { setCrewDocs([]); setInviteDocs([]); return; }
    const un1 = subscribeMyCrews(currentUid, setCrewDocs);
    const un2 = subscribeCrewInvites(currentUid, setInviteDocs);
    return () => { un1(); un2(); };
  }, [currentUid]);

  // 로컬 메타 로드(별명·본 시점·순서·음소거) + 내 닉(수락 시 names 기록용)
  useEffect(() => {
    let alive = true;
    storage.load(STORAGE_KEYS.crewAliases, {}).then((a) => { if (alive) setAliasMap(a || {}); });
    storage.load(STORAGE_KEYS.crewSeen, {}).then((s) => { if (alive) { setSeenSet(s || {}); setSeenLoaded(true); } });
    storage.load(STORAGE_KEYS.crewSeenAt, {}).then((s) => { if (alive) { setSeenAtMap(s || {}); setSeenAtLoaded(true); } });
    storage.load(STORAGE_KEYS.crewOrder, []).then((o) => { if (alive) setCrewOrder(Array.isArray(o) ? o : []); });
    storage.load(STORAGE_KEYS.crewMuted, {}).then((m) => { if (alive) setMutedMap(m || {}); });
    storage.load(STORAGE_KEYS.profile, null).then((p) => { if (alive && p?.nickname) setMyName(p.nickname); });
    return () => { alive = false; };
  }, []);

  // 첫 설치·재설치·새 크루 가입 시 '새 글 N' 도배 방지 — crewSeen에 기록 없는 크루는 '지금 글 수'를 본 것으로 baseline.
  //   앱 삭제 시 allowBackup:false로 로컬 읽음기록이 초기화돼 전부 NEW로 뜨던 것 억제(홈 아이콘·친구 피드와 동일 발상, [[crew-new-signal]]).
  //   ★seen 로드 완료 후에만 — 로드 전 {}일 때 돌면 실제 본 글수를 덮어써 NEW가 영영 안 뜸.
  useEffect(() => {
    if (!seenLoaded || !crewDocs?.length) return;
    setSeenSet((prev) => {
      let changed = false; const next = { ...prev };
      crewDocs.forEach((d) => { if (d?.id && next[d.id] === undefined) { next[d.id] = d.postCount || 0; changed = true; } });
      if (changed) storage.save(STORAGE_KEYS.crewSeen, next);
      return changed ? next : prev;
    });
  }, [crewDocs, seenLoaded]);

  // 초대 표시 enrich — 초대자·멤버 uid를 내 친구 별명/프로필로 resolve(없으면 저장 names 폴백)
  useEffect(() => {
    const uids = [];
    (inviteDocs || []).forEach((d) => {
      if (d.creatorUid) uids.push(d.creatorUid);
      (d.memberUids || []).slice(0, 4).forEach((u) => uids.push(u));
    });
    if (!uids.length) { setPeople({}); return; }
    let alive = true;
    setPeople((prev) => ({ ...getCachedMemberDisplay(uids, { myUid: currentUid }), ...prev }));   // 캐시 즉시 → 아바타 깜빡임 방지
    resolveMemberDisplay(uids, { myUid: currentUid }).then((m) => { if (alive) setPeople(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [inviteDocs, currentUid]);

  // '내 글 새 반응' 신호(7b) — 목록 진입(+크루 집합 변경, 본 시각 로드 완료) 시 크루별 1회 조회.
  //   seenAt 변경(여닫기)마다 재조회하면 전 크루 N getDocs churn → 의존성에서 빼고, 닫을 땐 markCrewSeenAt이 점만 즉시 제거.
  const crewIdsSig = useMemo(() => (crewDocs || []).map((d) => d.id).sort().join(','), [crewDocs]);
  useEffect(() => {
    if (!currentUid || !seenAtLoaded || !crewDocs || !crewDocs.length) { setReactSet({}); return; }
    let alive = true;
    const ids = crewDocs.map((d) => d.id);
    Promise.all(ids.map((id) => hasNewCommentsOnMyPosts(id, currentUid, seenAtMap[id] || 0).then((v) => [id, v]).catch(() => [id, false])))
      .then((pairs) => { if (!alive) return; const next = {}; pairs.forEach(([id, v]) => { if (v) next[id] = true; }); setReactSet(next); });
    return () => { alive = false; };
  }, [currentUid, crewIdsSig, seenAtLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const [openCrew, setOpenCrew] = useState(null);      // 앨범(상세) 열린 크루
  // 복귀(reopenCrewId)면 마운트 첫 렌더부터 슬라이드 생략 — 안드는 리마운트라 초기값이 true면 SlideInRight가
  //   모달 슬라이드업과 동시에 재생돼 끊김. 목록 탭 진입(reopenCrewId 없음)만 슬라이드.
  const albumAnimRef = useRef(!reopenCrewId);
  // ★복귀 시(reopenCrewId) openCrew가 비어 있어도 그 앨범을 '렌더에서 파생'해 즉시 띄운다 — iOS(마운트 유지)·안드(리마운트)
  //   양쪽에서 목록 플래시 0. CrewAlbumScreen이 crewId만으로 자체 구독해 내용 채움. 아래 effect가 실제 doc으로 승격.
  const albumCrew = openCrew || (reopenCrewId ? { id: reopenCrewId, __stub: true } : null);
  const [createOpen, setCreateOpen] = useState(false); // 크루 만들기
  const [showIntro, setShowIntro] = useState(false);   // 크루 소개(이용안내)
  // 모집 보고 복귀 — reopenCrewId를 별명·본문 갖춘 doc으로 승격해 openCrew에 심고 1회 소비(이후 reopenCrewId 비어도 앨범 유지).
  useEffect(() => {
    if (!reopenCrewId) return;
    albumAnimRef.current = false;        // 복귀 앨범은 슬라이드 생략
    if (!crewDocs) return;               // doc 로드 후 승격(그 전엔 위 albumCrew(stub)로 이미 떠 있음)
    const c = crewDocs.find((d) => d.id === reopenCrewId);
    // ★찾았을 때만 승격+소비 — 못 찾으면(탈퇴·제거·일시적 빈 스냅샷=Firestore 블립) 소비 안 하고 stub 유지.
    //   crewDocs 갱신 시 재시도해 블립서 회복, 정말 멤버 아니면 사용자가 뒤로가기로 탈출(onClose가 소비). 목록으로 튕김 방지.
    if (c) { setOpenCrew({ ...c, name: aliasMap[c.id] || c.name, _seenAt: seenAtMap[c.id] || 0 }); onReopenConsumed?.(); }
  }, [reopenCrewId, crewDocs]); // eslint-disable-line react-hooks/exhaustive-deps
  // 첫 진입 시 크루 소개 1회 자동 표시 — 라운지 소개와 동일 패턴(crewIntroSeen)
  useEffect(() => {
    storage.load(STORAGE_KEYS.crewIntroSeen, false).then(seen => {
      if (!seen) { setShowIntro(true); storage.save(STORAGE_KEYS.crewIntroSeen, true); }
    });
  }, []);

  // doc → 목록 표시 모델 (최근활동순 정렬)
  const crews = useMemo(() => (crewDocs || []).map((d) => {
    const ts = d.lastPostAt || d.updatedAt || d.createdAt;
    const postCount = d.postCount || 0;
    const raw = seenSet[d.id];
    // 본 시점 글 수. 레거시(이전 점 버전의 millis 값)나 비정상은 무시(0) — postCount는 현실적으로 1e6 미만.
    const seen = (typeof raw === 'number' && raw >= 0 && raw < 1e6) ? raw : 0;
    // 마지막 글이 내 글이면 배지 억제 — 내가 방금 올린 글이 '새 글'로 뜨던 문제(addCrewPost가 lastPostBy 기록).
    const newCount = (raw === undefined || (d.lastPostBy && d.lastPostBy === currentUid)) ? 0 : Math.max(0, postCount - seen); // raw 없음=첫 관측(도배 방지, baseline 저장 전까지)
    return {
      id: d.id, name: aliasMap[d.id] || d.name || '크루', members: (d.memberUids || []).length,
      last: fmtTime(ts), newCount,
      _ts: ts?.toMillis ? ts.toMillis() : 0,
      themeColor: d.themeColor || null, imageUrl: d.imageUrl || null, description: d.description || '',  // 크루 프로필·성격(목록 카드)
      _doc: d,    // 앨범·멤버 화면에서 memberUids·names·notice 사용
    };
  }).sort((a, b) => b._ts - a._ts), [crewDocs, aliasMap, seenSet, currentUid]);

  // 크루 입장/퇴장 시 본 시점 글 수 갱신(목록 '새 글 N' 0으로) — 현재 doc의 postCount 기준
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
  // 앨범 닫을 때 '마지막 본 시각' 갱신 — 앨범 NEW 점·내 글 새 댓글 강조는 이 시각 기준(열 때가 아니라 닫을 때라
  //   앨범 안에서는 열기 직전 값으로 NEW가 보이고, 닫고 다시 열면 그새 활동만 NEW로). Date.now 로컬 기기 시계로 충분.
  const markCrewSeenAt = (id) => {
    const now = Date.now();
    setSeenAtMap((prev) => {
      const next = { ...prev, [id]: now };
      storage.save(STORAGE_KEYS.crewSeenAt, next);
      return next;
    });
    setReactSet((prev) => { if (!prev[id]) return prev; const n = { ...prev }; delete n[id]; return n; }); // 본 즉시 점 제거(재조회 기다리지 않게)
  };

  // doc → 초대 표시 — 내 친구 별명/프로필 우선(people), 없으면 저장 names 폴백
  const invites = useMemo(() => {
    const cachedMeta = getCachedFriendMeta();   // 별명 캐시 — people 로드 전 첫 페인트에 초대자 별명 즉시 적용
    return (inviteDocs || []).map((d) => {
    const ids = d.memberUids || [];
    const names = d.names || {};
    return {
      id: d.id, name: d.name || '크루',
      inviter: friendDisplayName(cachedMeta, d.creatorUid, people[d.creatorUid]?.name || names[d.creatorUid] || '친구'), members: ids.length,
      avatars: ids.slice(0, 4).map((u) => {
        const pm = people[u];
        if (pm?.avatarUri) return { uri: pm.avatarUri };
        return { n: (friendDisplayName(cachedMeta, u, pm?.name || names[u] || '?')).trim().charAt(0) || '?', c: accentOf(u) };
      }),
    };
    });
  }, [inviteDocs, people]);

  // 수락/거절 — 셀프 토글(onSnapshot이 목록 자동 갱신, 로컬 상태 변경 불필요)
  const acceptInvite = async (iv) => {
    if (!currentUid) return;
    try { await acceptCrewInvite(iv.id, currentUid, myName); }
    catch (e) {
      if (e?.message === 'full') showAppAlert('정원이 찼어요', '이 크루는 인원이 다 찼어요 (최대 20명).');
      else if (__DEV__) console.warn('[crew] accept invite', e?.message);
    }
  };
  const rejectInvite = (iv) => { if (currentUid) declineCrewInvite(iv.id, currentUid).catch(e => __DEV__ && console.warn('[crew] decline invite', e?.message)); };

  // 내가 만든 크루 개수 상한 — entitlements.maxCrews(기본 5, 결제로 상향). 참여·초대받은 크루는 무제한. 초과 시 새 생성 차단(기존 유지).
  //   ★클라 가드 = 즉시 피드백(UX). 진짜 우회 차단(서버 강제)은 생성 CF(별도 단계). 유료화 = users.entitlements.maxCrews↑.
  const myCreatedCount = () => (crewDocs || []).filter((d) => d?.creatorUid === currentUid).length;
  const maxCrews = maxCrewsOf(userProfile);
  const atCrewCreateLimit = () => myCreatedCount() >= maxCrews;
  const openCreate = () => {
    if (atCrewCreateLimit()) {
      showAppAlert(`크루는 최대 ${maxCrews}개까지 만들 수 있어요`, '새 크루를 만들려면 기존 크루를 정리한 뒤 다시 시도해주세요.');
      return;
    }
    setCreateOpen(true);
  };

  const handleCreate = async ({ name, friendUids = [], names = {}, creatorName = '', themeColor = '', description = '', photoUri = null }) => {
    setCreateOpen(false);
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    // 안전 재확인 — 폼 진입~제출 사이 다른 기기에서 늘었을 수 있어 제출 시점에 다시 상한 검사.
    if (atCrewCreateLimit()) {
      showAppAlert(`크루는 최대 ${maxCrews}개까지 만들 수 있어요`, '새 크루를 만들려면 기존 크루를 정리한 뒤 다시 시도해주세요.');
      return;
    }
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


  const loading = crewDocs === null;
  // 표시 순서 — 수동 순서(드래그) 있으면 그게 우선(없는 건 기본순으로 뒤에), 없으면 최근활동순.
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
    return list;   // 수동 순서 없으면 최근활동순(crews 기본 _ts 정렬) 유지
  }, [crews, crewOrder]);
  const onReorderCrews = (orderedIds) => {
    setCrewOrder(orderedIds);
    storage.save(STORAGE_KEYS.crewOrder, orderedIds);
  };
  const isEmpty = !loading && invites.length === 0 && crews.length === 0;

  // 앨범(상세) 열림 — 같은 Modal 안에서 리스트↔앨범 전환(DM 목록↔대화방과 동일). 닫을 때 본 시각 갱신(새 글 표시 해제)
  if (albumCrew) return (
    <Animated.View style={{ flex: 1 }} entering={albumAnimRef.current ? SlideInRight.duration(230) : undefined}>
      <CrewAlbumScreen crew={albumCrew} seenAt={albumCrew._seenAt || 0}
        onClose={() => { markCrewSeen(albumCrew.id); markCrewSeenAt(albumCrew.id);
          storage.load(STORAGE_KEYS.crewMuted, {}).then((m) => setMutedMap(m || {}));     // 멤버 화면서 토글했을 수 있어 재로드
          storage.load(STORAGE_KEYS.crewAliases, {}).then((a) => setAliasMap(a || {}));   // 멤버 화면서 별명 바꿨을 수 있어 재로드
          setOpenCrew(null); onReopenConsumed?.(); }} onOpenDM={onOpenDM}
        onOpenRoundup={(id, host) => onOpenRoundup?.(id, host, albumCrew?.id)} />
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
        {/* 이용안내(크루 소개) — 우리 book 아이콘. 첫 진입 1회 자동 + 여기서 다시 보기 */}
        <TouchableOpacity onPress={() => setShowIntro(true)} hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
          style={{ padding: 6, marginRight: 4 }}>
          <Icon name="book" size={fs(23)} color={SAGE_DEEP} strokeWidth={1.8} />
        </TouchableOpacity>
        {/* 크루 만들기 — '＋ 만들기'로 명확히(친구초대 personAdd 아이콘과 혼동 방지). personAdd는 앨범·멤버서 초대 전용 */}
        <TouchableOpacity onPress={openCreate} hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
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

          {/* 내 크루 — 탭=앨범 입장 / 길게눌러 끌어 순서변경(핸들·메뉴 없이 심플하게) */}
          <DraggableRows items={ordered} rowHeight={ROW_H} onReorder={onReorderCrews}
            renderItem={(c, drag) => (
              <GestureDetector gesture={drag}>
                <View style={{ flexDirection: 'row', alignItems: 'center', height: ROW_H, borderBottomWidth: 1, borderBottomColor: ROW_LINE }}>
                  <TouchableOpacity activeOpacity={0.6} onPress={() => { albumAnimRef.current = true; markCrewSeen(c.id); setOpenCrew({ ...c, _seenAt: seenAtMap[c.id] || 0 }); }}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%' }}>
                    {/* 크루 프로필 — 색+이니셜(또는 사진). 기존 크루는 themeColor 없으면 accentOf 폴백 */}
                    <CrewAvatar name={c.name} color={c.themeColor || accentOf(c.id)} imageUrl={c.imageUrl} size={42} radius={12} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK }} numberOfLines={1}>{c.name}</Text>
                        {/* 내 글에 안 본 새 댓글 — 빨간 하트(목록서 가장 끌어당기는 '내 것 반응' 신호). 새 글 N 배지(우측 버건디)와 구분 */}
                        {reactSet[c.id] && (
                          <View style={{ marginLeft: 6 }}>
                            <Icon name="heartFilled" size={fs(14)} color="#E5484D" />
                          </View>
                        )}
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB, marginLeft: 6 }}>{c.members}명</Text>
                        {/* 새 글 알림 음소거 표시 — 멤버 화면 스피커로 끈 크루(홈 NEW 신호 제외됨)임을 목록에서 알림.
                            아이콘만이면 작아서 안 보여 라벨 칩으로(중장년 발견성). 읽기전용 — 끄기/켜기는 멤버 화면서. */}
                        {mutedMap[c.id] && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 7, backgroundColor: 'rgba(26,61,82,0.07)' }}>
                            <Icon name="speakerOff" size={fs(15)} color={SUB} strokeWidth={2.2} />
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(10.5), color: SUB, marginLeft: 3 }} allowFontScaling={false}>알림 꺼짐</Text>
                          </View>
                        )}
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
                </View>
              </GestureDetector>
            )} />
        </ScrollView>
      )}

      <CrewIntroModal visible={showIntro} onClose={() => setShowIntro(false)} onCreatePress={() => setCreateOpen(true)} />
    </SafeAreaView>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
