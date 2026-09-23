import React, { useState, useEffect, useContext, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { loadMyFriends, loadFriendProfiles } from '../utils/friends';
import { loadFriendData, friendDisplayName } from '../utils/friendGroups'; // 대문 '즐겨찾는 친구' 표시명 = 내가 붙인 별명 우선
import { subscribeMyCrews, subscribeCrewInvites } from '../utils/crews';
import { loadAllRoundups } from '../utils/roundup'; // 대문 하단 '지금 모집 중' 미리보기(2026-08-27)
import { SchedulesContext } from '../contexts/SchedulesContext'; // 대문 '함께하는 다음 라운딩'(2026-08-27)
import { db } from '../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';   // 내 즐겨찾기(users.favoriteUids) 1회 읽기
import { storage, STORAGE_KEYS } from '../utils/storage'; // 크루 별명·본 글 수·음소거(기기 로컬) — 대문 크루 칩 NEW 점
import { Image as ExpoImage } from 'expo-image';
import { CrewAvatar } from './common/CrewAvatar';
import { Icon } from './common/Icon';
import { RoundupTab } from './RoundupTab';
import { FriendsScreen } from './FriendsScreen';
import { SettlementModal } from './SettlementModal'; // 정산 — 라운지 헤더 버튼에서 정식 메뉴로 승격(2026-08-26)
import { CrewListScreen } from './CrewListScreen';   // 크루 — 홈 모달에서 모임 탭으로 이사(2026-08-26)
import { DMChatScreen } from './DMChatScreen';       // 크루에서 멤버 DM 열기 + 메시지 카드 대화방
import { DMListScreen } from './DMListScreen';       // 메시지(DM) 목록 — 홈 레일 폐지로 사라진 진입점, 대문에 정착(2026-08-27)
import { UserContext } from '../contexts/UserContext'; // 차단 목록 — DM 안읽음 집계서 제외
import { loadUnreadTotal } from '../utils/dm';
import { SurfaceLight, PressScale, LIFT_AMBIENT_SOFT, LIFT_CONTACT_SOFT } from './common/Surface'; // 카드 입체감 — 홈과 같은 부품(2026-09-22, 사용자 "모임 카드도 밋밋해"). ★크림 바탕이라 soft 그림자(진한 건 "지저분")

// ★모임 탭 — 탭 5→4 재편(2026-08-26). 라운지(모집)·친구·크루·정산을 한 지붕으로.
//   v2 = '대문(허브)' 방식(사용자 선택 2026-08-26, 상단 세그먼트는 "탭 안 탭이라 어수선" 폐기):
//   첫 화면 = 큼직한 카드 4장(친구·크루·라운딩 모집·정산, 살아있는 숫자·배지) → 탭하면 그 화면으로,
//   ‹ 모임 으로 대문 복귀. "모임 = 들어가는 방" 컨셉 그대로 — 대문에서 방을 고른다. 중장년 명확성 우선.
//   - 각 화면은 기존 그대로 통째 재사용(embedded 모드), 첫 진입 때 마운트 후 display 토글로 상태 유지
//     (★언마운트 전환 금지: 남은 route.params(openPostId 등)를 재마운트 effect가 다시 읽어 옛 글이 또 열린다).
//   - ★크루만 예외 = 활성일 때만 마운트(CrewListScreen의 useScreenBack이 숨김 상태서도 하드웨어 백을 가로챔).
//   - 진입 파라미터로 화면 직행: 친구={view:'friends'|openFinder} / 크루={view:'crew'|openCrew|reopenCrew}
//     / 정산={view:'settle'} / 모집=옛 라운지 파라미터(openPostId·openNoti·openView). 파라미터 없으면 대문.

// 섹션 상단 바 테마 — 아래 화면의 헤더/바탕색과 이어 보이게.
//   ★친구·라운딩 모집·크루는 스트립 없음 — 각 화면 헤더가 ‹ 모임·섹션명까지 한 줄로 품음(두 줄 헤더 두꺼움 정리,
//     친구·모집 2026-08-26 → 크루 2026-09-23 "크루 아이콘 헤더까지 두 줄이라 불필요하게 넓다")
const STRIP = {
  settle: { bg: C.bgPrimary, on: C.charcoal },
};
const SECTION_LABEL = { friends: '친구', crew: '크루', roundup: '라운딩 모집', settle: '정산' };

// 대문 카드 — 채움+여백(테두리 없음, [[feedback-minimal-borders]]), 커스텀 SVG 아이콘([[feedback-custom-svg-emoji]]).
const HUB = {
  friends: { bg: C.paleSky, fg: C.navy, icon: 'people', label: '친구' },
  crew: { bg: '#E6EDDC', fg: '#5E7E42', icon: 'crew', label: '크루' },
  roundup: { bg: C.navy, fg: C.bgPrimary, icon: 'clubhouse', label: '라운딩 모집', tone: 'dark' },
  settle: { bg: '#F3E7BE', fg: C.charcoal, icon: 'wallet', label: '정산' },
};

export function MeetScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const p = route?.params || {};
  const initialSeg = (p.openPostId || p.openNoti || p.openView || p.view === 'roundup') ? 'roundup'
    : p.view === 'settle' ? 'settle'
    : (p.view === 'crew' || p.openCrew || p.reopenCrew) ? 'crew'
    : (p.view === 'friends' || p.openFinder) ? 'friends' : 'hub';
  const [seg, setSeg] = useState(initialSeg);
  const [mounted, setMounted] = useState(() => ({ [initialSeg]: true }));
  const go = (k) => { setSeg(k); setMounted(m => (m[k] ? m : { ...m, [k]: true })); };

  const currentUid = useCurrentUid();
  const [crewReturnId, setCrewReturnId] = useState(() => (p.reopenCrew ? (p.reopenCrewId || null) : null)); // 모집 닫고 크루로 복귀할 앨범 id
  const [crewDm, setCrewDm] = useState(null); // 크루 멤버 DM {uid,name,avatar} — 화면 위 Modal

  // 메시지(DM) — 홈 우측 레일 폐지(2026-08 개편)로 목록 진입점이 사라졌던 것을 대문 카드로 정착(2026-08-27).
  //   단일 Modal서 목록↔대화방 전환(옛 홈 모달 이식, [[dm-design]]). 안읽음은 대문에 돌아올 때마다 재집계.
  const [dmOpen, setDmOpen] = useState(false);
  const [dmChat, setDmChat] = useState(null);   // { uid, name, avatar } 선택 시 대화방
  const [dmUnread, setDmUnread] = useState(0);
  const { userProfile } = useContext(UserContext);
  const blockedUsers = userProfile?.blockedUsers; // 차단한 상대의 안읽음은 배지에서 제외(홈 시절과 동일 계산)
  useEffect(() => {
    if (dmOpen || seg !== 'hub') return; // 대화 보는 중·섹션에선 생략 — 대문 복귀 때 다시 센다
    loadUnreadTotal(blockedUsers).then(setDmUnread).catch(() => {});
  }, [dmOpen, seg, blockedUsers]);

  useEffect(() => {
    if (p.view === 'friends' || p.openFinder) go('friends');
    else if (p.view === 'settle') go('settle');
    else if (p.view === 'crew' || p.openCrew) go('crew');
    else if (p.view === 'roundup' || p.openPostId || p.openNoti || p.openView) go('roundup');
    // view만 소비 — 모집/친구 화면이 각자 읽는 파라미터(openPostId·openFinder 등)는 그대로 둔다
    if (p.view || p.openCrew) navigation.setParams({ view: undefined, openCrew: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.view, p.openFinder, p.openPostId, p.openNoti, p.openView, p.openCrew]);

  // 크루서 연 모집을 닫고 돌아옴(RoundupTab이 reopenCrew 실어 navigate) — 크루 화면으로 복귀 + 그 앨범 재오픈
  useEffect(() => {
    if (!p.reopenCrew) return;
    setCrewReturnId(p.reopenCrewId || null);
    go('crew');
    navigation.setParams({ reopenCrew: undefined, reopenCrewId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reopenCrew]);

  // 섹션에서 하드웨어 뒤로가기 → 대문. 섹션 안의 깊은 화면(모집 상세·친구 프로필·크루 앨범·정산 작성)은
  //   각자 나중에 등록한 핸들러가 먼저 받으므로(LIFO) 여기까지 안 내려온다 — 한 단계씩 자연스럽게 벗겨진다.
  useAndroidBack(seg !== 'hub', () => go('hub'));

  // 하단 탭 '모임' 재탭 → 대문 복귀(사용자 2026-08-26). 다른 탭에서 눌러 들어올 땐(미포커스) 그대로 —
  //   섹션 상태 유지(위 파라미터 직행 로직과 충돌 안 함). GuideScreen tabPress 패턴과 동일.
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    const un = navigation.addListener('tabPress', () => {
      if (navigation.isFocused?.()) setSeg('hub');
    });
    return un;
  }, [navigation]);

  // 대문 숫자 — 친구 수(대문에 돌아올 때마다 재조회)·크루 수/초대(실시간)·친구 신청(공용 컨텍스트)
  const { friendReqCount } = useContext(FriendBadgeContext);
  const [friendCount, setFriendCount] = useState(null);
  const [crewCount, setCrewCount] = useState(null);
  const [crewDocs, setCrewDocs] = useState([]);       // 대문 '내 크루' 칩(같은 구독에서 받음)
  const [crewInviteCount, setCrewInviteCount] = useState(0);
  const [hubPosts, setHubPosts] = useState([]);
  useEffect(() => {
    if (seg !== 'hub') return undefined;
    let alive = true;
    loadMyFriends().then(fs => { if (alive) setFriendCount((fs || []).length); }).catch(() => {});
    // '지금 모집 중인 라운딩' 미리보기 — 대문 하단이 휑하다는 지적(2026-08-27, A안). 전체공개 글만(가볍게),
    //   티오프+5h 지난 글 제외, 가까운 날짜순(오픈형=일정 미정은 뒤), 최대 3개.
    loadAllRoundups().then(list => {
      if (!alive) return;
      const now = Date.now();
      const within = (p) => {
        if (!p.date) return true;
        const [y, m, d] = String(p.date).split('.').map(Number);
        const [hh, mm] = String(p.time || '07:00').split(':').map(Number);
        const tee = new Date(y, m - 1, d, hh, mm).getTime();
        return Number.isNaN(tee) ? true : now <= tee + 5 * 3600 * 1000;
      };
      const live = (list || []).filter(within);
      const dated = live.filter(p => p.date).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
      const open = live.filter(p => !p.date);
      setHubPosts([...dated, ...open].slice(0, 3));
    }).catch(() => {});
    return () => { alive = false; };
  }, [seg]);
  useEffect(() => {
    if (!currentUid) return undefined;
    const un1 = subscribeMyCrews(currentUid, (list) => { setCrewCount((list || []).length); setCrewDocs(list || []); });
    const un2 = subscribeCrewInvites(currentUid, (list) => setCrewInviteCount((list || []).length));
    return () => { un1 && un1(); un2 && un2(); };
  }, [currentUid]);

  // ── 대문 채움 콘텐츠(2026-08-27, "허전하다" ①+②) ──
  // ① 함께하는 다음 라운딩 — 동반자 있는 다가오는 일정 최대 2건(가까운 순)
  const { schedules } = useContext(SchedulesContext);
  const togetherNext = useMemo(() => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayKey = `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`;
    return (schedules || [])
      .filter(s => s?.date && s.date >= todayKey && (s.companions || []).filter(c => !(typeof c === 'object' && c?.isMe)).length > 0)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, 2);
  }, [schedules]);
  // ② 즐겨찾는 친구 바로가기(2026-09-23, 사용자 제안) — 옛 '자주 함께한 골프 친구'는 동반자 '이름' 빈도 집계라
  //   같은 사람이 실명·별명으로 두 번 떠 혼동("뒤죽박죽"). 친구 탭 즐겨찾기(users.favoriteUids, 카드 오른쪽 스와이프)를
  //   그대로 꺼내 놓고, 표시명은 내가 붙인 별명 우선, 탭하면 그 친구 프로필로 직행. 대문에 돌아올 때마다 재조회.
  const [favFriends, setFavFriends] = useState([]);   // [{ uid, name, avatar }]
  useEffect(() => {
    if (seg !== 'hub' || !currentUid) return undefined;
    let alive = true;
    (async () => {
      try {
        const [friends, meSnap, fd] = await Promise.all([
          loadMyFriends(), getDoc(doc(db, 'users', currentUid)), loadFriendData().catch(() => ({ friendMeta: {} })),
        ]);
        const favs = (meSnap.exists() ? meSnap.data().favoriteUids : []) || [];
        const friendSet = new Set((friends || []).map(f => f.otherUid));
        const uids = favs.filter(u => friendSet.has(u));   // 즐겨찾기 뒤 친구 끊긴 uid 제외
        if (!uids.length) { if (alive) setFavFriends([]); return; }
        const profiles = await loadFriendProfiles(uids).catch(() => ({}));
        if (!alive) return;
        setFavFriends(uids.map(u => ({
          uid: u,
          name: friendDisplayName(fd?.friendMeta, u, profiles[u]?.nickname),
          avatar: /^https?:/.test(profiles[u]?.avatarUrl || '') ? profiles[u].avatarUrl : null,
        })));
      } catch { /* 무시 — 섹션만 안 뜬다 */ }
    })();
    return () => { alive = false; };
  }, [seg, currentUid]);

  // ③ 내 크루 바로가기(2026-09-23) — 크루는 상한이 있어 몇 개 안 되니 전부, 최근 활동순(lastPostAt). 새 글은 점(목록 NEW와 같은 판정:
  //   본 글 수(crewSeen)보다 많고 · 마지막 글이 내 글 아니고 · 음소거 아님). 탭 → 크루 앨범 직행(모집→크루 복귀 경로 재사용).
  const [crewLocal, setCrewLocal] = useState({ aliases: {}, seen: {}, muted: {} });
  useEffect(() => {
    if (seg !== 'hub') return undefined;
    let alive = true;
    Promise.all([storage.load(STORAGE_KEYS.crewAliases, {}), storage.load(STORAGE_KEYS.crewSeen, {}), storage.load(STORAGE_KEYS.crewMuted, {})])
      .then(([aliases, seen, muted]) => { if (alive) setCrewLocal({ aliases: aliases || {}, seen: seen || {}, muted: muted || {} }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [seg]);
  const hubCrews = useMemo(() => (crewDocs || []).map((d) => {
    const ts = d.lastPostAt || d.updatedAt || d.createdAt;
    const raw = crewLocal.seen[d.id];
    const seen = (typeof raw === 'number' && raw >= 0 && raw < 1e6) ? raw : 0;
    const hasNew = raw !== undefined && !crewLocal.muted[d.id] && !(d.lastPostBy && d.lastPostBy === currentUid) && (d.postCount || 0) > seen;
    return { id: d.id, name: crewLocal.aliases[d.id] || d.name || '크루', themeColor: d.themeColor || null, imageUrl: d.imageUrl || null,
      hasNew, _ts: ts?.toMillis ? ts.toMillis() : 0 };
  }).sort((a, b) => b._ts - a._ts), [crewDocs, crewLocal, currentUid]);

  const hubSub = {
    friends: friendCount == null ? '' : `${friendCount}명`,
    crew: crewCount == null ? '' : `${crewCount}개`,
    roundup: '파트너 찾기',
    settle: '걷기 · 회비 장부',
  };
  const hubBadge = {
    friends: friendReqCount > 0 ? `신청 ${friendReqCount}` : null,
    crew: crewInviteCount > 0 ? `초대 ${crewInviteCount}` : null,
  };
  const hubCard = (k) => {
    const c = HUB[k];
    return (
      /* 입체감(2026-09-22) — 홈 D-N 카드와 같은 문법: 두 겹 그림자(PressScale shadow) + 표면 빛(SurfaceLight) + 눌림 반응.
         ★flex:1은 바깥 View에 — PressScale의 style은 Pressable 안쪽 뷰로 가서 행에서 폭이 글자 길이대로 잡혔다(카드 4장 폭 제각각, 사용자 지적). */
      <View key={k} style={{ flex: 1 }}>
      <PressScale onPress={() => go(k)} shadow={{ radius: 18, bg: c.bg, soft: true }}
        contentStyle={{ height: 122, padding: 16, justifyContent: 'space-between' }}>
        <SurfaceLight radius={18} tone={c.tone || 'light'} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Icon name={c.icon} size={fs(28)} color={c.fg} strokeWidth={1.9} />
          {hubBadge[k] ? (
            <View style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>{hubBadge[k]}</Text>
            </View>
          ) : null}
        </View>
        <View>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: c.fg }}>{c.label}</Text>
          {hubSub[k] ? (
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: c.fg, opacity: 0.72, marginTop: 3 }}>{hubSub[k]}</Text>
          ) : null}
        </View>
      </PressScale>
      </View>
    );
  };

  const th = seg === 'hub' ? null : STRIP[seg];
  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {seg === 'hub' ? (
        /* ── 대문 — 방 고르기. 카드에 살아있는 숫자(명수·개수·신청·초대)로 들어올 이유를 보여준다.
            하단이 휑해 '지금 모집 중인 라운딩' 미리보기 추가(2026-08-27, A안) — 대문을 살아있는 입구로 ── */
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal, paddingHorizontal: 20, marginTop: 16 }}>모임</Text>
          {/* 콘텐츠가 늘어(사람·약속·모집) 작은 폰에서 넘칠 수 있어 스크롤로 */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
          <View style={{ paddingHorizontal: 16, marginTop: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {hubCard('friends')}
              {hubCard('crew')}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {hubCard('roundup')}
              {hubCard('settle')}
            </View>
            {/* 메시지(DM) — 와이드 슬림 카드. 다크 배경=DM 방(#211E1B 다크 룸) 톤 예고, 배지=버건디(카드 문법 통일) */}
            <PressScale onPress={() => setDmOpen(true)} shadow={{ radius: 18, bg: '#211E1B', soft: true }}
              contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 16 }}>
              <SurfaceLight radius={18} tone="dark" />
              <Icon name="chat" size={fs(23)} color={C.butter} strokeWidth={1.9} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.butter }}>메시지</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(255,255,255,0.55)' }}>친구와 1:1 대화</Text>
              {dmUnread > 0 ? (
                <View style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>새 메시지 {dmUnread}</Text>
                </View>
              ) : null}
              <Text style={{ fontFamily: F.sys, fontSize: fs(18), color: 'rgba(255,255,255,0.5)' }}>›</Text>
            </PressScale>
          </View>

          {/* ② 즐겨찾는 친구 — 친구 탭 즐겨찾기 그대로(아바타+내 별명). 탭→그 친구 프로필 직행(2026-09-23).
              즐겨찾기가 없으면 친구가 있을 때만 한 줄 안내(어디서 만드는지). */}
          {(favFriends.length > 0 || (friendCount > 0)) && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 20 }}>즐겨찾는 친구</Text>
              {favFriends.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingTop: 11 }}>
                  {favFriends.map((f) => (
                    <TouchableOpacity key={f.uid} activeOpacity={0.8} style={{ alignItems: 'center', width: 58 }}
                      onPress={() => { navigation.setParams({ openFriendUid: f.uid }); go('friends'); }}>
                      {f.avatar ? (
                        <ExpoImage source={{ uri: f.avatar }} contentFit="cover" transition={0} style={{ width: 46, height: 46, borderRadius: 23 }} />
                      ) : (
                        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.navy }}>{(f.name || '친').slice(0, 1)}</Text>
                        </View>
                      )}
                      <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: C.charcoal, marginTop: 5 }}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, paddingHorizontal: 20, marginTop: 8 }}>
                  친구 카드를 오른쪽으로 밀어 즐겨찾기하면 여기 모여요
                </Text>
              )}
            </View>
          )}

          {/* ③ 내 크루 — 전부, 최근 활동순. 새 글이면 버건디 점. 탭→크루 앨범 직행(2026-09-23) */}
          {hubCrews.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 20 }}>내 크루</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingTop: 11 }}>
                {hubCrews.map((c) => (
                  <TouchableOpacity key={c.id} activeOpacity={0.8} style={{ alignItems: 'center', width: 64 }}
                    onPress={() => { setCrewReturnId(c.id); go('crew'); }}>
                    <View>
                      <CrewAvatar name={c.name} color={c.themeColor || HUB.crew.fg} imageUrl={c.imageUrl} size={46} radius={14} />
                      {c.hasNew && (
                        <View style={{ position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: 5.5,
                          backgroundColor: C.burgundy, borderWidth: 1.5, borderColor: C.bgPrimary }} />
                      )}
                    </View>
                    <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: C.charcoal, marginTop: 5 }}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* ① 함께하는 다음 라운딩 — 동반자 있는 다가오는 일정 최대 2건. 탭→홈(히어로 카드에서 상세)(2026-08-27) */}
          {togetherNext.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 4 }}>함께하는 다음 라운딩</Text>
              <View style={[{ backgroundColor: C.bgSecondary, borderRadius: 14, marginTop: 10 }, LIFT_AMBIENT_SOFT]}>
              <View style={[{ backgroundColor: C.bgSecondary, borderRadius: 14, paddingHorizontal: 14 }, LIFT_CONTACT_SOFT]}>
                <SurfaceLight radius={14} />
                {togetherNext.map((s, i) => {
                  const names = (s.companions || [])
                    .filter(c => !(typeof c === 'object' && c?.isMe))
                    .map(c => (typeof c === 'string' ? c : (c?.name || '')).trim()).filter(Boolean);
                  const label = names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}명` : '');
                  return (
                    <TouchableOpacity key={s.id || i} activeOpacity={0.7}
                      // 탭 → 홈에서 그 일정의 시트 바로 열기(일정 공지·변경 알림과 같은 openScheduleSheetId 경로).
                      //   전엔 홈 메인으로만 보내 "탭했는데 홈만 뜬다"(사용자 2026-09-23). id 없는 옛 일정은 홈만.
                      onPress={() => navigation.navigate(ROUTES.HOME, (s.id || s.groupId) ? { openScheduleSheetId: s.id || s.groupId } : undefined)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
                        borderBottomWidth: i < togetherNext.length - 1 ? 0.5 : 0, borderBottomColor: C.hairline }}>
                      <Icon name="calendar" size={fs(18)} color={C.navy} strokeWidth={1.8} />
                      <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal }}>{s.course || '라운딩'}</Text>
                        <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>
                          {s.date?.slice(5)}{s.time ? ' ' + s.time : ''}{label ? ` · ${label}` : ''}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(18), color: C.warmGray }}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              </View>
            </View>
          )}

          {/* 지금 모집 중인 라운딩 — 최신 전체공개 글 최대 3개. 탭=그 글로 직행(openPostId, 크루→모집과 같은 경로) */}
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>지금 모집 중인 라운딩</Text>
              {hubPosts.length > 0 && (
                <TouchableOpacity onPress={() => go('roundup')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.warmGray }}>전체보기 ›</Text>
                </TouchableOpacity>
              )}
            </View>
            {hubPosts.length === 0 ? (
              <PressScale onPress={() => go('roundup')} shadow={{ radius: 14, bg: C.bgSecondary, soft: true }}
                contentStyle={{ paddingVertical: 20, alignItems: 'center' }}>
                <SurfaceLight radius={14} />
                <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>
                  아직 모집 중인 글이 없어요
                </Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.navy, marginTop: 6 }}>첫 모집글을 올려보세요 ›</Text>
              </PressScale>
            ) : (
              <View style={[{ backgroundColor: C.bgSecondary, borderRadius: 14 }, LIFT_AMBIENT_SOFT]}>
              <View style={[{ backgroundColor: C.bgSecondary, borderRadius: 14, paddingHorizontal: 14 }, LIFT_CONTACT_SOFT]}>
                <SurfaceLight radius={14} />
                {hubPosts.map((p, i) => (
                  <TouchableOpacity key={p.id} activeOpacity={0.7}
                    onPress={() => navigation.navigate(ROUTES.MEET, { openPostId: p.id, openPostHost: p.authorUid || undefined })}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
                      borderBottomWidth: i < hubPosts.length - 1 ? 0.5 : 0, borderBottomColor: C.hairline }}>
                    <Icon name="clubhouse" size={fs(19)} color={C.navy} strokeWidth={1.8} />
                    <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.charcoal }}>{p.course || '라운딩 모집'}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>
                        {p.date ? `${p.date.slice(5)}${p.time ? ' ' + p.time : ''}` : '일정 미정'}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.navy, marginRight: 4 }}>
                      {(p.joined || 1)}/{p.capacity || 4}명
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(18), color: C.warmGray }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              </View>
            )}
          </View>
          </ScrollView>
        </View>
      ) : !th ? null : (
        /* ── 섹션 상단 바 — ‹ 모임(대문 복귀) + 섹션 이름. 배경은 아래 화면 헤더 색과 이어지게 ── */
        <View style={{ paddingTop: insets.top, backgroundColor: th.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 }}>
            <TouchableOpacity onPress={() => go('hub')} activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}>
              <Text style={{ fontSize: fs(21), color: th.on, fontWeight: '600', marginTop: -2 }}>‹</Text>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(13.5), color: th.on, opacity: 0.85 }}>모임</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: th.on, marginLeft: 8 }}>{SECTION_LABEL[seg]}</Text>
          </View>
        </View>
      )}
      {mounted.roundup && (
        <View style={{ flex: 1, display: seg === 'roundup' ? 'flex' : 'none' }}>
          <RoundupTab asScreen embedded visible navigation={navigation} route={route} onBack={() => go('hub')} />
        </View>
      )}
      {mounted.friends && (
        <View style={{ flex: 1, display: seg === 'friends' ? 'flex' : 'none' }}>
          <FriendsScreen embedded navigation={navigation} route={route} onBack={() => go('hub')} />
        </View>
      )}
      {mounted.settle && (
        <View style={{ flex: 1, display: seg === 'settle' ? 'flex' : 'none' }}>
          <SettlementModal embedded visible />
        </View>
      )}
      {/* ★크루는 display 토글이 아니라 활성일 때만 마운트 — CrewListScreen(useScreenBack)이 마운트 내내
          하드웨어 뒤로가기를 가로채서, 숨겨둔 채 두면 다른 화면의 뒤로가기까지 먹는다.
          ★판 자체에 paddingBottom 금지 — 스크롤 영역이 잘려 '하단 벽'(사용자 2026-08-26). 탭바 회피는 콘텐츠 패딩. */}
      {seg === 'crew' && (
        <View style={{ flex: 1 }}>
          <CrewListScreen embedded onClose={() => go('hub')}
            reopenCrewId={crewReturnId} onReopenConsumed={() => setCrewReturnId(null)}
            onOpenDM={(uid, name, avatar) => { if (uid && uid !== currentUid) setCrewDm({ uid, name, avatar }); }}
            onOpenRoundup={(id, hostUid, crewId) => {
              // 크루서 모집글 열기 — 같은 탭이라 화면 전환만(옛 홈 모달 시절의 iOS/안드 분기 불필요).
              //   openPostReturn:'crew' → 상세 닫으면 RoundupTab이 reopenCrew를 실어 되돌려보낸다(위 effect가 수신).
              if (!id) return;
              navigation.navigate(ROUTES.MEET, { openPostId: id, openPostHost: hostUid || undefined, openPostReturn: 'crew', openPostCrewId: crewId || undefined });
            }} />
        </View>
      )}
      {/* 메시지(DM) — 대문 '메시지' 카드 진입 = 대화 목록(인스타식). 단일 Modal서 목록↔대화방 전환([[dm-design]]).
          옛 홈 우상단 💬 모달을 그대로 이식(2026-08-27). 크루 멤버 DM 모달(아래)과는 진입 경로가 달라 동시에 안 뜬다. */}
      <Modal visible={dmOpen} transparent animationType="slide"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => (dmChat ? setDmChat(null) : setDmOpen(false))}>
        {dmChat ? (
          <DMChatScreen friendUid={dmChat.uid} friendName={dmChat.name} friendAvatarUri={dmChat.avatar || null} onClose={() => setDmChat(null)}
            onOpenRoundup={(postId, hostUid, scope) => {
              setDmChat(null); setDmOpen(false);
              // 친구지정(select)=내 참여 초대장(openView:'mine'), 그 외(친구모집 등)=모집 상세 — 같은 탭이라 파라미터만
              if (scope === 'select') navigation.navigate(ROUTES.MEET, { openView: 'mine' });
              else navigation.navigate(ROUTES.MEET, { openPostId: postId, openPostHost: hostUid });
            }} />
        ) : (
          <DMListScreen onClose={() => { setDmOpen(false); setDmChat(null); }} onOpenChat={(uid, name, avatar) => setDmChat({ uid, name, avatar })} />
        )}
      </Modal>

      {/* 크루에서 연 멤버 DM — 화면 위 Modal(홈 모달 시절의 '모달 안 중첩'과 달리 여긴 일반 화면이라 안전) */}
      <Modal visible={!!crewDm} transparent animationType="slide"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setCrewDm(null)}>
        <View style={{ flex: 1, backgroundColor: '#211E1B' }}>
          {crewDm && (
            <DMChatScreen friendUid={crewDm.uid} friendName={crewDm.name} friendAvatarUri={crewDm.avatar || null}
              onClose={() => setCrewDm(null)}
              onOpenRoundup={(postId, hostUid, scope) => {
                setCrewDm(null);
                if (scope === 'select') navigation.navigate(ROUTES.MEET, { openView: 'mine' });
                else navigation.navigate(ROUTES.MEET, { openPostId: postId, openPostHost: hostUid });
              }} />
          )}
        </View>
      </Modal>
    </View>
  );
}
