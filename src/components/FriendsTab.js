import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, ScrollView, Text, TouchableOpacity, Platform, Modal } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { Image } from 'expo-image'; // 아바타 디스크캐시 — 재방문 시 카카오 CDN 재다운로드 방지 ([[image-load-speed]])
import { Swipeable } from 'react-native-gesture-handler'; // 친구카드 좌우 스와이프(즐겨찾기·숨기기) ([[friend_card_gestures]])

const _and = Platform.OS === 'android';
import { C, F, fs } from '../constants/colors';
import { FriendProfile } from './FriendProfile';
import { LoadingState } from './common/LoadingState';
import { AttentionMotion } from './common/AttentionMotion'; // 받은 친구신청 배너 맥동 — '내 코스 모아보기'와 동일 pulse
import { FriendFinder } from './FriendFinder';
import { Icon } from './common/Icon'; // 🔍 검색 등 커스텀 아이콘(이모지 통일)
import { FriendGroupManageModal } from './FriendGroupManageModal';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { showAppAlert } from './AppAlert';
import { UserContext } from '../contexts/UserContext';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import {
  isFriendRequestLimitReached, incrementFriendRequestCount,
  getFriendRequestRemainingToday, FRIEND_REQUEST_DAILY_LIMIT,
} from '../utils/friendRequestLimit';
import { loadMyFriends, loadReceivedRequests, loadSentRequests, sendFriendRequest, cancelSentRequest, acceptFriendRequest, rejectFriendRequest, unfriend } from '../utils/friends';
import { getPrefetch } from '../utils/prefetch'; // 앱 시작 프리페치 캐시 — 친구 탭 첫 진입 즉시 시드
import { loadFriendData, setFriendMeta, pruneFriendMeta, DEFAULT_FRIEND_GROUPS, groupColor } from '../utils/friendGroups';
import { useBlockUser } from '../hooks/useBlockUser';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { loadFriendRounds, recomputeMyGroupAudiences } from '../utils/round';
import { db, getUid, auth } from '../utils/firebase';
import { connectKakaoAccount } from '../utils/kakaoAuth';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { doc, getDoc, setDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';

// 친구 찾기에서 받은 후보(간단 필드) → 친구 목록 객체로 변환.
//   ★수락 즉시 사진·라베·핸디가 뜨도록, 받은신청 객체가 실어온 avatarUri/stats를 그대로 통과.
//   (없으면 종전대로 null — FriendFinder 카카오·검색 후보처럼 stats 없는 호출도 안전)
const personToFriend = (p) => ({
  id: p.id, name: p.name, style: '', roundsTogether: 0,
  hostedCount: p.hostedCount || 0, attendedCount: p.attendedCount || 0,
  mannerScore: p.mannerScore || 70,
  statusMessage: p.statusMessage || '',
  avatarUri: p.avatarUri || null,
  recent: null,
  stats: {
    rounds: p.stats?.rounds || 0, courses: p.stats?.courses || 0,
    avg: p.stats?.avg ?? p.avg ?? null, best: p.stats?.best ?? null, handicap: p.stats?.handicap ?? null,
  },
  feed: [],
});

// 그룹 필터 — 미지정(어떤 그룹에도 안 속한 친구) 가상 칩 id ([[friend_groups]])
const UNGROUPED = '__ungrouped__';

const AVATARS = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B1E2A', fg: '#F5E6A8' },
  { bg: '#6B8B5E', fg: '#fff' },
];

function FriendCard({ friend, palette, muted, favorite, grade, isNew, flush, onPress, onLongPress, onGradePress }) {
  const fStatus = (friend.statusMessage || '').trim();
  const AV = _and ? 40 : 44;
  // 컴팩트 한 줄 리스트 — 긴 카드는 친구 많아지면 자리만 차지(사용자 2026-06-20). 스탯(라베·핸디)·명함은 친구 상세로 이관.
  //   카톡과 구조는 같되 '브랜드 스킨'으로 차별: 컬러 원형 아바타 · 즐겨찾기 좌측 버건디 틱 · 아바타 아래는 안 긋는 인셋 헤어라인.
  //   NEW(새 글)는 이름 옆 'New' 칩으로만 — 버터 워시는 크림 페이지 위에서 대비 약해 제거(사용자 2026-06-20).
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress} delayLongPress={280}
      style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 4, backgroundColor: C.bgPrimary }}>
      {/* 즐겨찾기 = 좌측 버건디 틱(브랜드 색). 비즐겨찾기도 같은 폭 투명 슬롯 유지해 이름 정렬 고정 */}
      <View style={{ width: 3, height: Math.round(AV * 0.5), borderRadius: 2, marginRight: 9,
        backgroundColor: favorite ? C.burgundy : 'transparent' }} />
      {/* 컬러 원형 아바타 — 카톡 회색 둥근사각과 결 다름 */}
      <View style={{ width: AV, height: AV, borderRadius: AV / 2, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {friend.avatarUri && /^https?:\/\//.test(friend.avatarUri) ? (
          <Image source={{ uri: friend.avatarUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : (
          <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 16 : 18), color: palette.fg }}>{(friend.name || '?').charAt(0)}</Text>
        )}
      </View>
      {/* 텍스트 열 — 좌:이름/상태, 우:라베│핸디(구분선 스타일). 하단 헤어라인은 이 열에만(아바타 아래 안 그음, 카톡 풀폭선과 차별).
          minHeight+세로중앙 = 멘트 유무와 무관하게 행 높이 일정(다닥다닥 붙던 것 해소, 사용자 2026-06-20) */}
      <View style={{ flex: 1, marginLeft: 12, minHeight: _and ? 54 : 60, flexDirection: 'row', alignItems: 'center', paddingVertical: _and ? 8 : 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(_and ? 14 : 15), color: C.charcoal }}>{friend.name || '친구'}</Text>
            {muted && <Text style={{ fontSize: fs(10) }}>🔕</Text>}
          </View>
          {fStatus ? (
            <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 2 }}>{fStatus}</Text>
          ) : null}
        </View>
        {/* 새 글 = 'New' 칩 — 행 우측에 배치(허전한 우측 채움, 사용자 2026-06-22) */}
        {isNew && (
          <View style={{ backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1.5, marginLeft: 8 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(9), color: '#fff', letterSpacing: 0.3 }}>New</Text>
          </View>
        )}
        {/* › 내비 신호 — 스탯(라베·핸디)·뱃지는 상세 명함에서 (사용자 2026-06-20) */}
        <Text style={{ fontFamily: F.sys, fontSize: fs(17), color: C.warmGrayLight, marginLeft: 8 }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// 카카오톡식 좌우 스와이프 래퍼 — 카드 오른쪽으로 밀기=즐겨찾기(왼쪽 액션), 왼쪽으로 밀기=숨기기(오른쪽 액션).
//   배경색 없이 페이지 기본 바탕 위 이모지+텍스트만(즐겨찾기=별표·버건디 / 숨기기=🙈·차콜).
//   액션 노출 후 탭해 실행(실수 방지). 그룹 지정은 롱탭 시트 유지. ([[friend_card_gestures]])
function SwipeableFriendCard({ friend, favorite, onToggleFavorite, onHide, ...cardProps }) {
  const ref = useRef(null);
  const ACT_W = 86;
  // 즐겨찾기(왼쪽 액션) — 카드를 오른쪽으로 밀면 노출. 별표 + 버건디 텍스트, 배경 없음(페이지 바탕).
  const renderFavorite = () => (
    <TouchableOpacity activeOpacity={0.7}
      onPress={() => { onToggleFavorite(friend.id); ref.current?.close(); }}
      style={{ width: ACT_W, justifyContent: 'center', alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: fs(18), color: C.burgundy }}>{favorite ? '★' : '☆'}</Text>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.burgundy }}>{favorite ? '즐겨찾기 해제' : '즐겨찾기'}</Text>
    </TouchableOpacity>
  );
  // 숨기기(오른쪽 액션) — 카드를 왼쪽으로 밀면 노출. 🙈 + 차콜 텍스트, 배경 없음. 숨기면 '숨긴 친구'로 이동.
  const renderHide = () => (
    <TouchableOpacity activeOpacity={0.7}
      onPress={() => { ref.current?.close(); onHide(friend.id); }}
      style={{ width: ACT_W, justifyContent: 'center', alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: fs(18) }}>🙈</Text>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.charcoal }}>숨기기</Text>
    </TouchableOpacity>
  );
  return (
    <Swipeable ref={ref} friction={1.6} leftThreshold={44} rightThreshold={44}
      overshootLeft={false} overshootRight={false}
      renderLeftActions={renderFavorite} renderRightActions={renderHide}
      containerStyle={{ marginBottom: 0 }}>
      <FriendCard friend={friend} favorite={favorite} flush {...cardProps} />
    </Swipeable>
  );
}

export function FriendsTab({ navigation, onInvite, openFinderRef }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { setFriendReqCount } = useContext(FriendBadgeContext);
  const { block: blockUserFn, remaining: blockRemaining } = useBlockUser(); // 공용 차단 훅(친구·DM 통일)
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false); // 첫 로드 완료 전 빈 가이드 숨김(깜빡임 방지)
  // 친구 그룹·별명 (내 private 메타 — owner-only). 표시 이름·그룹 지정에 사용 ([[friend_groups]])
  const [friendData, setFriendData] = useState({ friendGroups: DEFAULT_FRIEND_GROUPS, friendMeta: {} });
  const [groupFilter, setGroupFilter] = useState('all'); // 그룹 필터칩 (전체/그룹들) ([[friend_groups]])
  const [feedSeen, setFeedSeen] = useState({}); // {uid: millis} 친구별 마지막 본 글 시각 — NEW 점 ([[friend_groups]] ⑤)
  const [feedSeenLoaded, setFeedSeenLoaded] = useState(false); // 저장된 seen 로드 완료 — baseline 레이스 가드
  useEffect(() => { storage.load(STORAGE_KEYS.friendFeedSeen, {}).then(m => setFeedSeen(m || {})).catch(() => {}).finally(() => setFeedSeenLoaded(true)); }, []);
  // 베이스라인 — 처음 보는 친구는 '본 시각'을 min(최신글, 3일 전)으로(기준선 완화 2026-06-13). 새 친구만 기록.
  //   → 최근 3일 내 글은 처음 봐도 NEW 점이 뜸(실사용자·테스트 모두 인지), 3일보다 오래된 글은 안 뜸(옛 글 도배 방지).
  //   옛 동작(=현재 최신글로 기준)은 "목록 처음 열기 전 글"을 영영 못 띄워 사실상 안 보였음.
  //   ★저장된 seen 로드 전엔 실행 금지 — 안 그러면 친구가 먼저 로드될 때 새 글까지 '본 것'으로 덮어써 NEW가 안 뜸.
  //   3일 컷오프는 Date.now 기반이나 3일 버퍼라 시계 미세오차에 견딤(읽음표시 정밀비교와 달리 안전).
  useEffect(() => {
    if (!friends.length || !feedSeenLoaded) return;
    const cutoff = Date.now() - 3 * 86400000;
    setFeedSeen(prev => {
      let changed = false; const next = { ...prev };
      friends.forEach(f => { if (next[f.id] === undefined) { next[f.id] = Math.min(f.lastPostAt || 0, cutoff); changed = true; } });
      if (changed) storage.save(STORAGE_KEYS.friendFeedSeen, next);
      return changed ? next : prev;
    });
  }, [friends, feedSeenLoaded]);
  const [muted, setMuted] = useState({});           // { [id]: true }
  const [hidden, setHidden] = useState({});          // 숨긴 친구
  const [favorites, setFavorites] = useState({});    // 즐겨찾기 — { [uid]: true }, Firestore users.favoriteUids 영속
  const [profileFriend, setProfileFriend] = useState(null);
  const [feedLoading, setFeedLoading] = useState(false);   // 친구 프로필 피드 로드 중
  const [searchOpen, setSearchOpen] = useState(false);   // 검색 입력 펼침 — 평소엔 🔍 아이콘만(자리 절약). 숨긴 친구는 ⚙ 관리 시트로 이동
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업
  const [finder, setFinder] = useState(null);   // 친구 찾기 화면 — null 또는 진입 탭
  // 익명(카카오 미연동) → 친구 기능 진입 시 카카오 연동 게이트 ([[anonymous-user-policy]]).
  //   FriendFinder는 RN Modal이라 그 안에서 전역 showAppAlert가 가려짐 → finder 여는 시점(모달 열리기 전)에 게이트.
  //   연동하면 onProceed로 바로 이어서 진행. 영구 차단 아님.
  const requireKakaoLink = (onProceed) => {
    showAppAlert('카카오 연동이 필요해요', '친구 기능은 카카오 연동 후\n이용할 수 있어요.\n연동하면 바로 이어서 진행할게요.', [
      { text: '닫기', style: 'cancel' },
      { text: '카카오 연동하기', onPress: async () => {
          const r = await connectKakaoAccount();
          if (r?.banned) { showAppAlert('이용이 제한된 계정이에요', '이 카카오 계정은\nDear Golf 이용이 제한되었어요.'); return; }
          if (!r?.ok) { showAppAlert('카카오 연동 실패', '잠시 후 다시 시도해주세요.'); return; }
          onProceed?.();
        } },
    ]);
  };
  const gateIfAnon = (onProceed) => { if (auth.currentUser?.isAnonymous) { requireKakaoLink(onProceed); return true; } return false; };
  // 친구 찾기 열기 — 익명이면 게이트 먼저(연동 후 자동으로 열림)
  const openFinder = (tab) => { if (!gateIfAnon(() => setFinder(tab))) setFinder(tab); };
  const [groupManageOpen, setGroupManageOpen] = useState(false);   // 친구 그룹 관리 모달 — 친구탭 헤더 톱니에서 직접 진입 ([[friend_groups]])
  const [quickFriend, setQuickFriend] = useState(null);   // 카드 길게누르기 빠른 액션(그룹 지정) 대상 친구. 즐겨찾기·숨기기는 스와이프 ([[friend_card_gestures]])
  const [guideDone, setGuideDone] = useState(true);   // 친구 1회 안내 카드 — 로드 전 숨김(깜빡임 방지). friendCoachDone 재사용(MyPage 리셋 연동)
  useEffect(() => { storage.load(STORAGE_KEYS.friendCoachDone, false).then(v => setGuideDone(!!v)).catch(() => {}); }, []);
  // 친구 화면 파란 헤더의 '친구 찾기' 버튼이 이 finder를 열도록 핸들 노출 (진입점을 헤더로 드러냄)
  useEffect(() => { if (openFinderRef) openFinderRef.current = openFinder; }, [openFinderRef]);
  const listScrollRef = useRef(null);
  const sendingReqRef = useRef(new Set());          // 친구 신청 처리 중인 personId — 연타 중복/한도 이중차감 방지
  const [reloadKey, setReloadKey] = useState(0);   // 탭 재진입 시 친구·신청 목록 재조회 트리거 (수락·신청 반영)

  // uid 안정화([[uid-stabilization-plan]] 2단계) — 단일 uid 소스 구독.
  //   재설치·익명↔카카오 settle로 uid가 바뀌면(시나리오 ②) 아래 로드 effect가 currentUid 의존성으로
  //   재실행되어 새 계정 친구·신청으로 자동 교체된다.
  const currentUid = useCurrentUid();
  const prevUidRef = useRef(currentUid);
  // uid가 바뀐 순간 옛 계정 데이터를 즉시 비운다 — 새 목록 로드 전까지 옛 친구가 잔존하지 않게
  //   (DiariesContext의 setHydrated(false) 정신). 마운트(prev===cur) 시엔 비우지 않음.
  useEffect(() => {
    if (prevUidRef.current === currentUid) return;
    prevUidRef.current = currentUid;
    setFriends([]);
    setReceivedRequests([]);
    setSentRequests([]);
    setFavorites({});
    setHidden({});
    setFriendsLoaded(false);
  }, [currentUid]);

  const prefetchSeededRef = useRef(false); // 프리페치 시드 1회만 — 탭 재진입(reload) 시 최신 위에 캐시 덮어쓰기 방지
  // Phase 3-F2 — 마운트 시 내 users/{uid} 문서 ensure + 친구·신청 목록 Firestore 로드.
  // users/{uid}.nickname은 다른 사용자가 내 이름을 조회하는 단일 소스. F4에서 MyPage 편집 시 동기화.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await getUid();
        if (!uid || cancelled) return;
        // 앱 시작 프리페치 캐시가 있으면 친구·받은신청·보낸신청을 즉시 시드 → 첫 진입 즉시 채움.
        //   아래 정식 로드(ensure·loaders·프로필)가 곧 정확히 덮어씀(stale-while-revalidate). 차단 필터는 사용자별이라 여기서 적용.
        const preFriends = !prefetchSeededRef.current && getPrefetch('friends:base');
        if (preFriends && !cancelled) {
          prefetchSeededRef.current = true;
          setFriendData(preFriends.fdata);
          setFriends(preFriends.friends);
          const seedBlocked = new Set(userProfile?.blockedUsers || []);
          setReceivedRequests(preFriends.received.filter(c => !seedBlocked.has(c.id)));
          setSentRequests(preFriends.sent);
          setFriendsLoaded(true);
        }
        // 1) 내 users 문서 ensure (없으면 nickname으로 생성)
        const meRef = doc(db, 'users', uid);
        const meSnap = await getDoc(meRef);
        if (!meSnap.exists()) {
          await setDoc(meRef, {
            uid,
            nickname: userProfile?.nickname || '',
            blockedUids: [],
            favoriteUids: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (userProfile?.nickname && meSnap.data().nickname !== userProfile.nickname) {
          // 닉네임 변경 시 동기화 (간단 케이스만, 30일 제한은 F4 MyPage에서)
          await setDoc(meRef, { nickname: userProfile.nickname, updatedAt: serverTimestamp() }, { merge: true });
        }
        // 즐겨찾기·숨긴친구 로드 — users.favoriteUids / hiddenFriendUids → 맵 (둘 다 Firestore 영속)
        if (!cancelled) {
          const data = meSnap.exists() ? meSnap.data() : {};
          const fm = {};
          (data.favoriteUids || []).forEach(u => { fm[u] = true; });
          setFavorites(fm);
          const hm = {};
          (data.hiddenFriendUids || []).forEach(u => { hm[u] = true; });
          setHidden(hm);
        }
        // 2) 친구·받은 신청·보낸 신청 + 친구 그룹·별명(내 private 메타) 병렬 로드
        const [friendsList, received, sent, fdata] = await Promise.all([
          loadMyFriends(), loadReceivedRequests(), loadSentRequests(), loadFriendData(),
        ]);
        if (cancelled) return;
        const friendMeta = fdata.friendMeta || {};
        setFriendData(fdata);
        // 3) 상대 uid 모음 → users 문서 한 번에 fetch (Promise.all)
        const otherUids = Array.from(new Set([
          ...friendsList.map(f => f.otherUid),
          ...received.map(r => r.requesterUid),
          ...sent.map(s => s.recipientUid),
        ].filter(Boolean)));
        const userDocs = await Promise.all(
          otherUids.map(u => getDoc(doc(db, 'users', u)).catch(() => null))
        );
        if (cancelled) return;
        const profileByUid = {};
        userDocs.forEach((snap, i) => {
          if (snap?.exists()) {
            const d = snap.data();
            profileByUid[otherUids[i]] = {
              nickname: d.nickname || '',
              realName: d.realName || '',
              statusMessage: d.statusMessage || '',
              lifeBest: d.lifeBest || 0,
              avgScore: d.avgScore || 0,
              totalRounds: d.totalRounds || 0,
              avatarUrl: d.avatarUrl || null,
              handicap: typeof d.handicap === 'number' ? d.handicap : null, // 친구 핸디 — 명함 라베 옆 뱃지 ([[friend_groups]] 핸디표시)
              lastFriendPostAt: d.lastFriendPostAt || null, // 친구 피드 최신 글 시각 — NEW 점·활동순 정렬 (안 옮기면 전원 0 → NEW·활동순 무력화)
            };
          }
        });
        // 4) UI 객체로 매핑 — 명함 공개필드(멘트·라이프베스트·평균타·총라운딩·사진) 반영 (친구 공개 뷰 2단계)
        const toMinimal = (uid) => {
          const p = profileByUid[uid] || {};
          const meta = friendMeta[uid] || {};
          const nickname = p.nickname || '친구';
          const cn = (meta.customName || '').trim();
          return {
            id: uid,
            nickname,                          // 원본 닉네임(별명 편집 시 placeholder·복원용)
            name: cn || nickname,              // 표시 이름 — 별명 우선 ([[friend_groups]])
            customName: cn,
            groupIds: Array.isArray(meta.groupIds) ? meta.groupIds : [],
            realName: p.realName || '',
            statusMessage: p.statusMessage || '',
            avatarUri: p.avatarUrl || null,
            style: '',
            hostedCount: 0, attendedCount: 0, mannerScore: 0,
            recent: null,
            stats: { rounds: p.totalRounds || 0, avg: p.avgScore || null, best: p.lifeBest || null, handicap: p.handicap ?? null },
            lastPostAt: p.lastFriendPostAt?.toMillis ? p.lastFriendPostAt.toMillis() : 0, // 친구 피드 최신 글 시각 — NEW 점·새글순 ([[friend_groups]] ⑤)
            feed: [],
            togetherCount: 0, // 자리만 — 동반자 매칭(닉네임/본명) 구현 후 채움. 0이면 명함에 미표시 ([[diary-companion-matching]])
          };
        };
        setFriends(friendsList.map(f => toMinimal(f.otherUid)));
        // 차단한 사용자의 받은 친구신청은 숨김 — 차단=재접촉 차단([[block-nickname]] 차단 강화)
        const blockedSet = new Set(userProfile?.blockedUsers || []);
        setReceivedRequests(received.filter(r => !blockedSet.has(r.requesterUid)).map(r => {
          const p = profileByUid[r.requesterUid] || {};
          return {
            id: r.requesterUid,
            name: p.nickname || '친구',
            realName: p.realName || '',
            statusMessage: p.statusMessage || '',
            avatarUri: p.avatarUrl || null,              // 수락 즉시 프로필 사진 반영
            hostedCount: 0, attendedCount: 0, mannerScore: 0, avg: p.avgScore || null,
            // 수락 즉시 라베·핸디 — 이 로드에서 이미 받아둔 값(추가 네트워크 호출 없음)
            stats: { rounds: p.totalRounds || 0, courses: 0, avg: p.avgScore || null, best: p.lifeBest || null, handicap: p.handicap ?? null },
          };
        }));
        setSentRequests(sent.map(s => s.recipientUid));
      } catch (e) {
        if (__DEV__) console.warn('[FriendsTab] initial load failed', e);
      } finally {
        if (!cancelled) setFriendsLoaded(true); // 첫 로드 완료 — 빈 가이드 깜빡임 방지 ([[home-empty-state-flash]])
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile?.nickname, reloadKey, currentUid]);

  // 친구 탭 재방문 시 — 검색·프로필·찾기 닫고 목록 맨 위로 + 친구·신청 재조회
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('tabPress', () => {
      setSearch('');
      setSearchOpen(false);
      setProfileFriend(null);
      setFinder(null);
      setGradeModalKey(null);
      setQuickFriend(null);
      setGroupManageOpen(false);
      setReloadKey(k => k + 1);   // 상대의 수락·신청이 반영되도록 재조회
      listScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return unsub;
  }, [navigation]);
  const [sentRequests, setSentRequests] = useState([]);   // 보낸 신청 — recipientUid 배열
  const [receivedRequests, setReceivedRequests] = useState([]);   // 받은 신청 — 마운트 useEffect가 채움
  // 받은 신청 수를 탭바 뱃지에 반영 — 친구 탭에서 수락/거절하면 즉시 점이 사라지도록 (추가 쿼리 없음)
  useEffect(() => { setFriendReqCount(receivedRequests.length); }, [receivedRequests.length, setFriendReqCount]);

  // 차단 시 친구 자동 일방 해지 ([[friend-relationship]] §2).
  // 정책: 일반 차단 = 친구 관계 일방 해지(영구). 차단 해제해도 친구는 복원 X — 재신청 필요.
  // 단순 필터(숨김)가 아니라 friends 배열에서 실제 제거. 블라인드 원칙으로 상대는 통보받지 않음.
  // blockedIds를 useMemo로 안정화 — 매 렌더 새 배열 reference 생성 시 useEffect 과도 trigger 방지.
  const blockedIds = React.useMemo(
    () => userProfile?.blockedUsers || [],
    [userProfile?.blockedUsers],
  );
  useEffect(() => {
    if (blockedIds.length === 0) return;
    setFriends(prev => {
      const next = prev.filter(f => !blockedIds.includes(f.id) && !blockedIds.includes(f.name));
      return next.length === prev.length ? prev : next;
    });
    // 차단 시 그 사람의 받은 친구신청도 즉시 가림 (재접촉 차단)
    setReceivedRequests(prev => {
      const next = prev.filter(r => !blockedIds.includes(r.id));
      return next.length === prev.length ? prev : next;
    });
  }, [blockedIds]);

  // 유령 메타 정리 — 상대가 나를 끊어/차단해 friendMeta에 남은 '이미 친구 아닌' 항목을 친구 화면 진입 시 1회 가지치기.
  //   카운트 부풀림(관리 모달)·group 글 공개대상 잔재 제거. friends 로드 성공(>0)일 때만(빈/실패 시 전체삭제 방지).
  const prunedGhostsRef = React.useRef(false);
  useEffect(() => {
    if (prunedGhostsRef.current || !currentUid || !friendsLoaded || friends.length === 0) return;
    prunedGhostsRef.current = true;
    (async () => {
      try {
        const updated = await pruneFriendMeta(friends.map(f => f.id));
        if (updated) { setFriendData(updated); recomputeMyGroupAudiences(updated.friendMeta); }
      } catch (e) { if (__DEV__) console.warn('[FriendsTab] prune ghost meta', e?.message); }
    })();
  }, [currentUid, friendsLoaded, friends.length]);

  const q = search.trim();
  // 미지정 = 어떤 그룹에도 안 속한 친구. 전체(catch-all)엔 항상 보임 — 1명 이상일 때만 칩 노출 ([[friend_groups]])
  const ungroupedList = friends.filter(f => !hidden[f.id] && !(friendData.friendMeta[f.id]?.groupIds || []).length);
  const hasUngrouped = ungroupedList.length > 0;
  // 선택한 필터 칩이 사라졌으면(그룹 삭제·미지정 0) 전체로 폴백 — 별도 state 리셋 없이 표시만 보정
  const groupExists = (id) => id === 'all'
    || (id === UNGROUPED ? hasUngrouped : friendData.friendGroups.some(g => g.id === id));
  const effFilter = groupExists(groupFilter) ? groupFilter : 'all';
  const matchFilter = (f) => {
    if (effFilter === 'all') return true;
    const gids = friendData.friendMeta[f.id]?.groupIds || [];
    return effFilter === UNGROUPED ? gids.length === 0 : gids.includes(effFilter);
  };
  const visible = friends
    .filter(f => !hidden[f.id] && (!q || f.name.includes(q)) && matchFilter(f))
    .sort((a, b) => {
      const fav = (favorites[b.id] ? 1 : 0) - (favorites[a.id] ? 1 : 0);
      if (fav !== 0) return fav;                            // 1) 즐겨찾기 상단
      const act = (b.lastPostAt || 0) - (a.lastPostAt || 0);
      if (act !== 0) return act;                            // 2) 활동순(최근 글, [[friend_groups]] ⑤)
      // 3) 가나다순 — 활동 없는(lastPostAt=0) 친구들이 로드순으로 무작위 나열되던 것 정리.
      //    한글 음절은 유니코드 순서가 곧 가나다라 Hermes Intl 없이도 정확(영문·숫자는 한글보다 앞).
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });
  const hiddenFriends = friends.filter(f => hidden[f.id]);
  const paletteOf = (id) => AVATARS[friends.findIndex(f => f.id === id) % AVATARS.length];

  const toggleMute = (id) => setMuted(p => ({ ...p, [id]: !p[id] }));

  // 숨기기/해제 — 로컬 즉시 반영 + Firestore users.hiddenFriendUids 영속(즐겨찾기와 동일 패턴). 실패 시 롤백.
  //   영속이라 앱 재시작·새로고침에도 유지 (스와이프로 쉬워진 만큼 '영구 숨김' 기대에 맞춤).
  const persistHidden = async (id, hide) => {
    try {
      const uid = await getUid();
      if (!uid) return;
      await setDoc(doc(db, 'users', uid), {
        uid, // 규칙 uid==uid 통과 보장 ([[project_users_doc_uid_required]])
        hiddenFriendUids: hide ? arrayUnion(id) : arrayRemove(id),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      if (__DEV__) console.warn('[FriendsTab] persistHidden failed', e?.message);
      setHidden(p => { const n = { ...p }; if (hide) delete n[id]; else n[id] = true; return n; }); // 롤백
    }
  };
  const hideFriend = (id) => { setHidden(p => ({ ...p, [id]: true })); persistHidden(id, true); };

  // 즐겨찾기 토글 — 로컬 즉시 반영 + Firestore users.favoriteUids 영속. 실패 시 롤백.
  const toggleFavorite = async (id) => {
    const next = !favorites[id];
    setFavorites(p => ({ ...p, [id]: next }));
    try {
      const uid = await getUid();
      if (!uid) return;
      await setDoc(doc(db, 'users', uid), {
        favoriteUids: next ? arrayUnion(id) : arrayRemove(id),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      if (__DEV__) console.warn('[FriendsTab] toggleFavorite failed', e?.message);
      setFavorites(p => ({ ...p, [id]: !next }));
    }
  };

  // 친구 카드 탭 → 프로필 즉시 열고(명함 먼저 보임), 친구공개 라운딩 피드는 비동기 로드해 병합.
  // 친구공개(visibility=='friends') 기록만 조회 — 나만보기는 보안 규칙·쿼리에서 제외 ([[profile-diary-split]]).
  const openFriendProfile = async (f) => {
    // 프로필 열면 그 친구 글을 본 것으로 — NEW 점 제거 ([[friend_groups]] ⑤)
    setFeedSeen(prev => {
      const next = { ...prev, [f.id]: Math.max(f.lastPostAt || 0, prev[f.id] || 0) };  // 서버시각 기준 통일 — Date.now(폰시계) 혼용은 시계 앞설 때 새 글 점 누락 버그
      storage.save(STORAGE_KEYS.friendFeedSeen, next);
      return next;
    });
    setProfileFriend(f);
    setFeedLoading(true);
    try {
      // 친구공개 라운드를 그대로 피드로 — DiaryCard(variant='friend')가 photos·likes·starRating 등 전체 필드를 읽음
      const feed = await loadFriendRounds(f.id);
      // 로드 중 다른 친구로 바뀌었으면 무시 (경쟁 상태 가드)
      setProfileFriend(prev => (prev && prev.id === f.id ? { ...prev, feed } : prev));
    } catch (e) {
      if (__DEV__) console.warn('[FriendsTab] loadFriendRounds failed', e?.message);
    } finally {
      setFeedLoading(false);
    }
  };

  // 친구 신청 — Firestore friendships pending doc 생성 + 보낸 신청 state 추가.
  // 일 10건 한도 ([[friend-add-feature]] §22). 같은 사람 재신청은 카운트 X (멱등).
  // 결과 반환: FriendFinder Modal 안에서 자체 alert 띄우도록.
  const sendRequest = async (person) => {
    if (sentRequests.includes(person.id)) return { ok: true }; // 멱등
    if (sendingReqRef.current.has(person.id)) return { ok: true }; // 연타 가드 — 한도 이중차감·중복 신청 방지
    sendingReqRef.current.add(person.id);
    try {
      const reached = await isFriendRequestLimitReached();
      if (reached) return { ok: false, reason: 'limit' };
      try {
        await sendFriendRequest(person.id, userProfile?.nickname || '');
      } catch (e) {
        if (__DEV__) console.warn('[FriendsTab] sendFriendRequest failed', e?.message);
        return { ok: false, reason: 'failed' };
      }
      setSentRequests(p => [...p, person.id]);
      await incrementFriendRequestCount();
      return { ok: true };
    } finally {
      sendingReqRef.current.delete(person.id);
    }
  };
  // 친구 신청 취소 — Firestore doc 삭제. 한도 카운트는 환불 X (스팸 우회 방지)
  const cancelRequest = async (person) => {
    try {
      await cancelSentRequest(person.id);
    } catch (e) {
      if (__DEV__) console.warn('[FriendsTab] cancelSentRequest failed', e?.message);
      return;
    }
    setSentRequests(p => p.filter(id => id !== person.id));
  };
  // 받은 신청 수락 — Firestore pending → accepted + 로컬 친구 목록 추가 + 신청 목록 제거
  const acceptRequest = async (person) => {
    try {
      await acceptFriendRequest(person.id);
    } catch (e) {
      if (__DEV__) console.warn('[FriendsTab] acceptFriendRequest failed', e?.message);
      return;
    }
    setFriends(p => (p.some(f => f.id === person.id) ? p : [...p, personToFriend(person)]));
    setReceivedRequests(p => p.filter(r => r.id !== person.id));
  };
  // 무시 — Firestore doc 삭제. 상대방에게 통보 없음 (거절 알림 X)
  const ignoreRequest = async (id) => {
    try {
      await rejectFriendRequest(id);
    } catch (e) {
      if (__DEV__) console.warn('[FriendsTab] rejectFriendRequest failed', e?.message);
      return;
    }
    setReceivedRequests(p => p.filter(r => r.id !== id));
  };
  const unhideFriend = (id) => { setHidden(p => { const n = { ...p }; delete n[id]; return n; }); persistHidden(id, false); };
  // 친구 끊기 — 일방·블라인드 ([[friend-relationship]] §1). Firestore friendships doc 삭제.
  // 차단·끊기 — 그 사람을 내 friendMeta(그룹/별명)에서 제거 + 과거 group 글 공개대상 재계산 ([[friend_groups]] ⑥)
  const cleanupRemovedFriendGroup = async (id) => {
    if (!friendData.friendMeta[id]) return;
    try {
      const updated = await setFriendMeta(id, {});  // 항목 제거(별명·그룹 비움)
      if (updated) { setFriendData(updated); recomputeMyGroupAudiences(updated.friendMeta); }
    } catch (e) { if (__DEV__) console.warn('[FriendsTab] cleanup group on remove', e?.message); }
  };
  const deleteFriend = (id) => {
    const target = friends.find(f => f.id === id);
    if (!target) return;
    showAppAlert(
      `${target.name}님과 친구를 끊을까요?`,
      `친구 목록에서 사라져요.\n다시 친구가 되려면 친구 신청을 보내야 해요.\n\n💡 상대방에게는 알림이 가지 않아요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '끊기', style: 'destructive', onPress: async () => {
          try {
            await unfriend(id);
          } catch (e) {
            if (__DEV__) console.warn('[FriendsTab] unfriend failed', e?.message);
            return;
          }
          setFriends(p => p.filter(f => f.id !== id));
          cleanupRemovedFriendGroup(id);
        } },
      ],
    );
  };
  // 친구 차단 — 일방. 친구 끊기 + blockedUsers 추가(친구목록·라운지서 가림). 5명/일 한도.
  // ([[block-nickname]]·[[friend-relationship]] 일반 차단=일방 친구 해지)
  const blockFriend = (id) => {
    const target = friends.find(f => f.id === id);
    if (!target) return;
    if (blockRemaining <= 0) {
      showAppAlert('차단 횟수 초과', '오늘 차단 가능한 횟수를 초과했어요.\n내일 다시 시도해주세요.', [{ text: '확인' }]);
      return;
    }
    showAppAlert(
      `${target.name}님을 차단할까요?`,
      `친구가 끊기고, 이 사람의 글·모집이\n더 이상 보이지 않아요.\n\n💡 상대방에게는 알림이 가지 않아요.`,
      [
        { text: '취소', style: 'cancel' },
        // 공용 차단 훅이 로컬·Firestore·끊기·그룹정리 일괄 처리. 화면 후처리(목록 제거·friendData 갱신)만 여기서.
        { text: '차단', style: 'destructive', onPress: async () => {
          const r = await blockUserFn(id);
          if (!r.ok) return;
          setFriends(p => p.filter(f => f.id !== id));
          if (r.friendData) setFriendData(r.friendData);
        } },
      ],
    );
  };

  // 친구 그룹·별명 저장 — friendData(private 메타) write-through + 목록·열린 프로필 표시 갱신 ([[friend_groups]])
  const handleSaveFriendMeta = async (friendUid, { customName, groupIds }) => {
    const cn = (customName || '').trim();
    const gids = Array.isArray(groupIds) ? groupIds : [];
    try {
      const updated = await setFriendMeta(friendUid, { customName: cn, groupIds: gids });
      if (updated) {
        setFriendData(updated);
        // 완전 동적 피드 — 그룹 멤버십 바뀌면 내 과거 group 글 공개 대상 재계산 ([[friend_groups]] ⑥)
        recomputeMyGroupAudiences(updated.friendMeta);
      }
    } catch (e) {
      if (__DEV__) console.warn('[FriendsTab] setFriendMeta failed', e?.message);
    }
    setFriends(prev => prev.map(f => f.id === friendUid
      ? { ...f, customName: cn, groupIds: gids, name: cn || f.nickname || f.name } : f));
    setProfileFriend(prev => (prev && prev.id === friendUid
      ? { ...prev, customName: cn, groupIds: gids, name: cn || prev.nickname || prev.name } : prev));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 전체 스크롤(인스타식) — 외부 네이비 헤더(친구 찾기)는 위 고정, 컴팩트 헤더·받은신청·필터칩·카드는 이 ScrollView에
          담아 함께 스크롤. sticky는 MY와 동일하게 1차 미적용 — 실기 테스트 후 결정([[project_fullscroll_profile]]). */}
      <ScrollView ref={listScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      {/* 상단 컴팩트 헤더 — 친구 N명 ··· 🔍(검색 토글) ⚙(친구 관리). 검색은 평소 아이콘만, 탭하면 입력 펼침(자리 절약, [[project_fullscroll_profile]] 디클러터) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
            친구 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{visible.length}</Text>명
          </Text>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => { if (searchOpen) { setSearchOpen(false); setSearch(''); } else setSearchOpen(true); }}
              style={{ width: 34, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: searchOpen ? C.charcoal : C.bgSecondary, borderWidth: 0.5, borderColor: searchOpen ? C.charcoal : C.hairline }}>
              <Icon name="search" size={fs(16)} color={searchOpen ? C.bgPrimary : C.charcoal} />
            </TouchableOpacity>
            {friends.length > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setGroupManageOpen(true)}
                style={{ width: 34, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                <Icon name="gear" size={fs(20)} color={C.charcoal} strokeWidth={1.8} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* 검색 입력 — 🔍 토글 시만 (사용자 "검색 쓸 일 별로 없어") */}
        {searchOpen && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: C.bgSecondary,
            borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Icon name="search" size={fs(15)} color={C.warmGray} />
            <AppTextInput
              style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, padding: 0 }}
              placeholder="내 친구 중에서 검색"
              placeholderTextColor={C.warmGrayLight}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              autoFocus
            />
            <TouchableOpacity onPress={() => { setSearchOpen(false); setSearch(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(15), color: C.warmGray }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 받은신청 배너 + 그룹 필터칩 — 전체 스크롤로 함께 흐름(옛 고정 → 스크롤아웃). 필터칩 sticky는 실기 후 결정 */}
      <View style={{ paddingHorizontal: 16 }}>
        {/* 받은 친구 신청 배너 — 있을 때만. 검색창 아래 고정(스크롤로 묻히지 않게) */}
        {receivedRequests.length > 0 && (
          <AttentionMotion type="shake" style={{ marginBottom: _and ? 9 : 12, borderRadius: 12,
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 2.5, elevation: 3 }}>
            {receivedRequests.length === 1 ? (() => {
              // 1건 — 배너에서 바로 수락/무시(모달 거치지 않게). 이름 영역 탭은 상세(프로필) 진입.
              const r = receivedRequests[0];
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: C.burgundy, borderRadius: 12, paddingHorizontal: 14, paddingVertical: _and ? 7 : 9 }}>
                  <TouchableOpacity onPress={() => openFinder('received')} activeOpacity={0.8}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: fs(15) }}>📬</Text>
                    <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13), color: '#fff' }} numberOfLines={1}>
                      <Text style={{ fontFamily: F.sysB, color: C.butter }}>{r.name}</Text>님의 친구 신청
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => ignoreRequest(r.id)} activeOpacity={0.8}
                    style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.45)' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: '#fff' }}>무시</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => acceptRequest(r)} activeOpacity={0.85}
                    style={{ paddingHorizontal: 13, paddingVertical: 6, borderRadius: 8, backgroundColor: C.butter }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.burgundy }}>수락</Text>
                  </TouchableOpacity>
                </View>
              );
            })() : (
              // 여러 건 — 목록으로(누구 수락할지 골라야 하므로). 기존 동선 유지.
              <TouchableOpacity onPress={() => openFinder('received')} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: C.burgundy, borderRadius: 12, paddingHorizontal: 14, paddingVertical: _and ? 8 : 11 }}>
                <Text style={{ fontSize: fs(15) }}>📬</Text>
                <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13), color: '#fff' }}>
                  받은 친구 신청 <Text style={{ fontFamily: F.sysB, color: C.butter }}>{receivedRequests.length}</Text>건
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.butter }}>›</Text>
              </TouchableOpacity>
            )}
          </AttentionMotion>
        )}
        {/* 그룹 필터칩 — 전체 · 미지정 · 그룹들. 그룹 지정된 친구가 한 명이라도 있을 때만 노출 ([[friend_groups]]) */}
        {friends.length > 0 && friends.some(f => (friendData.friendMeta[f.id]?.groupIds || []).length) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: _and ? 8 : 12 }}
            contentContainerStyle={{ flexDirection: 'row', gap: 6 }}>
            {[
              { id: 'all', name: '전체' },
              ...(hasUngrouped ? [{ id: UNGROUPED, name: `미지정 ${ungroupedList.length}` }] : []),
              ...friendData.friendGroups,
            ].map(g => {
              const on = effFilter === g.id;
              const isUngrouped = g.id === UNGROUPED;
              const dotColor = (g.id === 'all' || isUngrouped) ? null : groupColor(friendData.friendGroups, g.id);
              // 미지정 = 버건디 강조(off도 버건디 테두리·글자), 그 외 = 기본(off 회색 / on 차콜)
              const bg = on ? (isUngrouped ? C.burgundy : C.charcoal) : C.bgSecondary;
              const bd = on ? bg : (isUngrouped ? C.burgundy : C.hairline);
              const tx = on ? C.butter : (isUngrouped ? C.burgundy : C.charcoal);
              return (
                <TouchableOpacity key={g.id} activeOpacity={0.8} onPress={() => setGroupFilter(g.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
                    backgroundColor: bg, borderWidth: isUngrouped && !on ? 1 : 0.5, borderColor: bd }}>
                  {dotColor && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} />}
                  <Text style={{ fontFamily: isUngrouped ? F.sysB : F.sysSb, fontSize: fs(12), color: tx }}>{g.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* 카드 영역 — 좌우 16(옛 ScrollView contentContainer 패딩 대체). 위 컴팩트 헤더·컨트롤은 자체 pH16 유지 */}
      <View style={{ paddingHorizontal: 16, paddingTop: _and ? 4 : 6 }}>

        {/* 친구 첫 진입 1회 안내 — 접이식 카드(확인 시 사라짐). 친구 1명 이상일 때만(0명은 빈 화면 가이드가 설명) ([[friend_groups]]) */}
        {friendsLoaded && friends.length > 0 && !guideDone && (
          <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
            padding: 14, marginBottom: _and ? 9 : 12 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginBottom: 10 }}>👋 친구, 이렇게 써요</Text>
            {[
              '카카오 친구나 닉네임으로 친구를 추가할 수 있어요',
              '카드를 좌우로 밀면 즐겨찾기·숨기기, 길게 누르면 그룹 이동을 해요',
              '그룹은 ⚙ 그룹 관리에서 만들고 정리할 수 있어요',
              '별명은 친구 프로필에서 언제든 바꿀 수 있어요',
              '친구가 새 글을 올리면 카드 색이 살짝 밝아져요',
              '불편한 친구는 숨기거나 끊을 수 있어요',
            ].map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 7, marginBottom: 6 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.burgundy, lineHeight: 18 }}>·</Text>
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, lineHeight: 18 }}>{t}</Text>
              </View>
            ))}
            <TouchableOpacity activeOpacity={0.85}
              onPress={() => { setGuideDone(true); storage.save(STORAGE_KEYS.friendCoachDone, true); }}
              style={{ alignSelf: 'flex-end', marginTop: 6, backgroundColor: C.butter, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 7 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>확인했어요</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 숨긴 친구 목록은 ⚙ 친구 관리 시트로 이동(메인 노출 0) — "숨겼는데 계속 보이는 모순" 해소 ([[project_fullscroll_profile]]) */}
        {!friendsLoaded ? <LoadingState /> : visible.length === 0 ? (
          q ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 36, lineHeight: 19 }}>
              내 친구 중엔 없어요.{'\n'}새 친구는 헤더 <Text style={{ fontFamily: F.sysB, color: C.navy }}>🔍 친구 찾기</Text>로 추가하세요.
            </Text>
          ) : (
            /* 빈 화면 가이드 — 친구 0명 */
            <View style={{ paddingTop: _and ? 10 : 18 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: _and ? 13 : 18 }}>
                <Text style={{ fontSize: fs(_and ? 26 : 30), marginBottom: _and ? 6 : 10 }}>👥</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: _and ? 3 : 6 }}>
                  골프 친구를 추가해보세요
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: _and ? 16 : 19, marginBottom: _and ? 10 : 16 }}>
                  카카오 친구 중 Dear Golf를 쓰는 분을 찾아{'\n'}친구를 맺으면, 함께 라운딩하고{'\n'}서로의 골프 기록을 나눌 수 있어요.
                </Text>
                <View style={{ gap: _and ? 7 : 12 }}>
                  {[
                    ['📋', '라운지에서 친구와 라운딩 모집·참여하기'],
                    ['🏆', '친구의 라운딩 기록을 피드로 보기'],
                    ['👍', '특별한 순간을 공유하고 응원하기'],
                  ].map(([icon, txt]) => (
                    <View key={txt} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                      <Text style={{ fontSize: fs(14) }}>{icon}</Text>
                      <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: _and ? 16 : 18 }}>{txt}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => openFinder('kakao')}
                  style={{ marginTop: _and ? 12 : 18, backgroundColor: C.navy, borderRadius: 12, paddingVertical: _and ? 9 : 13, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.bgPrimary }}>친구 찾기</Text>
                </TouchableOpacity>
                {/* 카카오톡으로 친구 초대 — 디어골프 미설치 친구 데려오기 */}
                {onInvite && (
                  <TouchableOpacity activeOpacity={0.85} onPress={onInvite}
                    style={{ marginTop: _and ? 6 : 8, backgroundColor: '#FEE500', borderRadius: 12, paddingVertical: _and ? 9 : 13, alignItems: 'center',
                      flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Text style={{ fontSize: fs(14) }}>💬</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#3C1E1E' }}>카카오톡으로 친구 초대하기</Text>
                  </TouchableOpacity>
                )}
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: _and ? 7 : 10, textAlign: 'center', lineHeight: _and ? 15 : 16 }}>
                  아직 디어골프를 안 쓰는 친구에게는{'\n'}카카오톡으로 초대 메시지를 보낼 수 있어요
                </Text>
              </View>
            </View>
          )
        ) : (
          visible.map(f => {
            const grade = getTrustGrade(f.hostedCount, f.mannerScore);
            return (
              <SwipeableFriendCard
                key={f.id}
                friend={f}
                palette={paletteOf(f.id)}
                muted={!!muted[f.id]}
                favorite={!!favorites[f.id]}
                grade={grade}
                isNew={f.lastPostAt > 0 && feedSeen[f.id] !== undefined && f.lastPostAt > feedSeen[f.id]}
                onToggleFavorite={toggleFavorite}
                onHide={hideFriend}
                onPress={() => openFriendProfile(f)}
                onLongPress={() => setQuickFriend(f)}
                onGradePress={() => setGradeModalKey(grade.key)}
              />
            );
          })
        )}
      </View>
      </ScrollView>

      {/* 풀 프로필 — 옵션(알림·숨기기·삭제)도 프로필 상단에서 처리 */}
      <FriendProfile
        friend={profileFriend}
        visible={!!profileFriend}
        feedLoading={feedLoading}
        friendGroups={friendData.friendGroups}
        onSaveMeta={handleSaveFriendMeta}
        onClose={() => setProfileFriend(null)}
        muted={profileFriend ? !!muted[profileFriend.id] : false}
        onToggleMute={() => profileFriend && toggleMute(profileFriend.id)}
        onHide={() => {
          const id = profileFriend?.id;
          if (!id) return;
          setProfileFriend(null);
          hideFriend(id);
        }}
        onDelete={() => {
          const target = profileFriend;
          if (!target) return;
          setProfileFriend(null);
          deleteFriend(target.id);
        }}
        onBlock={() => {
          const target = profileFriend;
          if (!target) return;
          setProfileFriend(null);
          blockFriend(target.id);
        }} />

      {/* 신뢰 등급 설명 팝업 */}
      <TrustGradeModal visible={!!gradeModalKey} highlightKey={gradeModalKey}
        onClose={() => setGradeModalKey(null)} />

      {/* 친구 찾기 — 카카오/검색/받은 신청 */}
      <FriendFinder
        visible={!!finder}
        initialTab={finder || 'kakao'}
        onClose={() => setFinder(null)}
        sentIds={sentRequests}
        friendIds={friends.map(f => f.id)}
        blockedIds={blockedIds}
        received={receivedRequests}
        onSend={sendRequest}
        onCancelSend={cancelRequest}
        onAccept={acceptRequest}
        onIgnore={ignoreRequest} />

      {/* 친구 관리 — ⚙에서 진입. 그룹 관리 + 숨긴 친구 해제를 한 시트에서(메인 노출 0, [[project_fullscroll_profile]]).
          닫을 때 그룹·메타 재로드해 칩 반영 ([[friend_groups]]) */}
      <FriendGroupManageModal
        visible={groupManageOpen}
        hiddenFriends={hiddenFriends}
        onUnhide={unhideFriend}
        friendUids={friends.map(f => f.id)}
        onClose={() => {
          setGroupManageOpen(false);
          loadFriendData().then(setFriendData).catch(() => {});
        }} />

      {/* 카드 길게누르기 빠른 액션 — 그룹 지정 전용(즐겨찾기·숨기기는 스와이프로 이동). 별명은 친구상세 ⋯에서 ([[friend_card_gestures]]) */}
      <Modal visible={!!quickFriend} transparent animationType="fade" onRequestClose={() => setQuickFriend(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setQuickFriend(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ backgroundColor: C.bgPrimary, borderRadius: 16, padding: 20 }}>
            {quickFriend && (() => {
              const meta = friendData.friendMeta[quickFriend.id] || {};
              const curGroup = Array.isArray(meta.groupIds) && meta.groupIds.length ? meta.groupIds[0] : null;
              // 그룹 이동 = 기존 핸들러 재사용. 별명(customName) 반드시 보존. 현재 그룹 다시 누르면 미지정.
              const moveTo = (gid) => handleSaveFriendMeta(quickFriend.id, {
                customName: meta.customName || '',
                groupIds: curGroup === gid ? [] : [gid],
              });
              return (
                <>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, textAlign: 'center', marginBottom: 14 }}>
                    {quickFriend.name || '친구'}
                  </Text>

                  {/* 그룹 이동 — 즐겨찾기·숨기기는 카드 좌우 스와이프로 이동([[friend_card_gestures]]). 팝업은 그룹 지정 전용 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal }}>그룹 이동</Text>
                    <TouchableOpacity onPress={() => { setQuickFriend(null); setGroupManageOpen(true); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>⚙ 그룹 관리 ›</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {friendData.friendGroups.map(g => {
                      const on = curGroup === g.id;
                      return (
                        <TouchableOpacity key={g.id} activeOpacity={0.8} onPress={() => moveTo(g.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
                            backgroundColor: on ? C.charcoal : C.bgSecondary, borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline }}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: groupColor(friendData.friendGroups, g.id) }} />
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: on ? C.butter : C.charcoal }}>{g.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 7 }}>
                    {curGroup ? '현재 그룹을 다시 누르면 미지정으로 빼요' : '한 친구는 한 그룹만 — 탭해서 넣어요'}
                  </Text>

                  <TouchableOpacity activeOpacity={0.7} onPress={() => setQuickFriend(null)}
                    style={{ marginTop: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: C.bgSecondary, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>닫기</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
