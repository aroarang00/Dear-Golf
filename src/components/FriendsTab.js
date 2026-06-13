import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity, Platform, Modal } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 — 재방문 시 카카오 CDN 재다운로드 방지 ([[image-load-speed]])
import { Swipeable } from 'react-native-gesture-handler'; // 친구카드 좌우 스와이프(즐겨찾기·숨기기) ([[friend_card_gestures]])

const _and = Platform.OS === 'android';
import { C, F, fs } from '../constants/colors';
import { FriendProfile } from './FriendProfile';
import { LoadingState } from './common/LoadingState';
import { FriendFinder } from './FriendFinder';
import { FriendGroupManageModal } from './FriendGroupManageModal';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { topMilestone, milestoneBadge } from './MilestoneCard';
import { showAppAlert } from './AppAlert';
import { UserContext } from '../contexts/UserContext';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import {
  isFriendRequestLimitReached, incrementFriendRequestCount,
  getFriendRequestRemainingToday, FRIEND_REQUEST_DAILY_LIMIT,
} from '../utils/friendRequestLimit';
import { loadMyFriends, loadReceivedRequests, loadSentRequests, sendFriendRequest, cancelSentRequest, acceptFriendRequest, rejectFriendRequest, unfriend, blockUid as fsBlockUid } from '../utils/friends';
import { loadFriendData, setFriendMeta, DEFAULT_FRIEND_GROUPS, groupColor } from '../utils/friendGroups';
import { blockUser, remainingBlocksToday } from '../utils/block';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { loadFriendRounds, recomputeMyGroupAudiences } from '../utils/round';
import { db, getUid } from '../utils/firebase';
import { doc, getDoc, setDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';

// 친구 찾기에서 받은 후보(간단 필드) → 친구 목록 객체로 변환
const personToFriend = (p) => ({
  id: p.id, name: p.name, style: '', roundsTogether: 0,
  hostedCount: p.hostedCount || 0, attendedCount: p.attendedCount || 0,
  mannerScore: p.mannerScore || 70,
  statusMessage: p.statusMessage || '',
  recent: null,
  stats: { rounds: 0, courses: 0, avg: p.avg ?? null, best: null },
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
  const r = friend.recent;
  const diff = r ? r.score - r.par : 0;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  // 명함과 동일 — 마일스톤 배지·라베·멘트 ([[roundup-friend-redesign]])
  const fMs = milestoneBadge(topMilestone({ rounds: friend.stats?.rounds ?? 0, courses: friend.stats?.courses ?? 0 }));
  const fStatus = (friend.statusMessage || '').trim();
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress} delayLongPress={280}
      style={[{ backgroundColor: isNew ? '#FBF4D6' : C.bgSecondary, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: _and ? 11 : 14, marginBottom: flush ? 0 : (_and ? 9 : 12),
        // 라운지 모집카드와 동일 입체감 — 크림 배경 위 흰 카드 분리감 (iOS·Android)
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
        // 즐겨찾기 = 왼쪽 보더 강조. ★ borderLeftWidth/Color를 '항상 명시'하고 값만 토글(1↔3)해야 함.
        //   조건부로 속성을 추가/제거하면 안드에서 부분 보더 재계산이 깨져 해제 후에도 굵은 선이 잔존(iOS는 정상).
        borderLeftWidth: favorite ? 3 : 1, borderLeftColor: favorite ? C.burgundy : 'rgba(0,0,0,0.07)' }]}>
      {/* NEW 표시 — 새 글 있으면 카드 전체에 연한 버터 워시(점은 잘 안 보여 폐기, 2026-06-13). 즐겨찾기(좌측 버건디 보더)와 조합 가능 ([[friend_groups]] ⑤) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: _and ? 40 : 46, height: _and ? 40 : 46, borderRadius: _and ? 20 : 23, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {friend.avatarUri && /^https?:\/\//.test(friend.avatarUri) ? (
            <Image source={{ uri: friend.avatarUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={100} />
          ) : (
            <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 17 : 19), color: palette.fg }}>{(friend.name || '?').charAt(0)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(_and ? 14 : 15), color: C.charcoal }}>{friend.name || '친구'}</Text>
            {fMs && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: '#2A2D3A', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: fs(10) }}>{fMs.icon}</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(9), color: '#E6C677' }}>{fMs.label}</Text>
              </View>
            )}
            {muted && <Text style={{ fontSize: fs(11) }}>🔕</Text>}
          </View>
          {fStatus ? (
            <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 2 }}>{fStatus}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={{ backgroundColor: C.butter, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.charcoal }}>라베 {friend.stats?.best ?? '—'}</Text>
          </View>
          {/* 핸디 = paleSky(하늘빛), 라베와 색 구분. 동기화된 친구만(users.handicap) ([[friend_groups]] 핸디표시) */}
          {friend.stats?.handicap != null && (
            <View style={{ backgroundColor: C.paleSky, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.charcoal }}>핸디 {friend.stats.handicap}</Text>
            </View>
          )}
          {/* "함께 N회" — Phase 3 친구·다이어리 마이그레이션 후 표시 ([[diary-companion-matching]]) */}
        </View>
      </View>

      {/* 최근 라운딩 미리보기 */}
      {r && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: _and ? 7 : 10, backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: _and ? 7 : 9 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1 }}>최근</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, flex: 1 }} numberOfLines={1}>
            {r.course} · {r.date}
          </Text>
          <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.charcoal }}>{r.score}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{diffLabel}</Text>
        </View>
      )}
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
      containerStyle={{ marginBottom: _and ? 9 : 12 }}>
      <FriendCard friend={friend} favorite={favorite} flush {...cardProps} />
    </Swipeable>
  );
}

export function FriendsTab({ navigation, onInvite, openFinderRef }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { setFriendReqCount } = useContext(FriendBadgeContext);
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
  const [groupManageOpen, setGroupManageOpen] = useState(false);   // 친구 그룹 관리 모달 — 친구탭 헤더 톱니에서 직접 진입 ([[friend_groups]])
  const [quickFriend, setQuickFriend] = useState(null);   // 카드 길게누르기 빠른 액션(그룹 지정) 대상 친구. 즐겨찾기·숨기기는 스와이프 ([[friend_card_gestures]])
  const [guideDone, setGuideDone] = useState(true);   // 친구 1회 안내 카드 — 로드 전 숨김(깜빡임 방지). friendCoachDone 재사용(MyPage 리셋 연동)
  useEffect(() => { storage.load(STORAGE_KEYS.friendCoachDone, false).then(v => setGuideDone(!!v)).catch(() => {}); }, []);
  // 친구 화면 파란 헤더의 '친구 찾기' 버튼이 이 finder를 열도록 핸들 노출 (진입점을 헤더로 드러냄)
  useEffect(() => { if (openFinderRef) openFinderRef.current = setFinder; }, [openFinderRef]);
  const listScrollRef = useRef(null);
  const [reloadKey, setReloadKey] = useState(0);   // 탭 재진입 시 친구·신청 목록 재조회 트리거 (수락·신청 반영)

  // Phase 3-F2 — 마운트 시 내 users/{uid} 문서 ensure + 친구·신청 목록 Firestore 로드.
  // users/{uid}.nickname은 다른 사용자가 내 이름을 조회하는 단일 소스. F4에서 MyPage 편집 시 동기화.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await getUid();
        if (!uid || cancelled) return;
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
        setReceivedRequests(received.filter(r => !blockedSet.has(r.requesterUid)).map(r => ({
          id: r.requesterUid,
          name: profileByUid[r.requesterUid]?.nickname || '친구',
          realName: profileByUid[r.requesterUid]?.realName || '',
          hostedCount: 0, attendedCount: 0, mannerScore: 0, avg: null,
        })));
        setSentRequests(sent.map(s => s.recipientUid));
      } catch (e) {
        if (__DEV__) console.warn('[FriendsTab] initial load failed', e);
      } finally {
        if (!cancelled) setFriendsLoaded(true); // 첫 로드 완료 — 빈 가이드 깜빡임 방지 ([[home-empty-state-flash]])
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile?.nickname, reloadKey]);

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
    if (remainingBlocksToday(userProfile) <= 0) {
      showAppAlert('차단 횟수 초과', '오늘 차단 가능한 횟수를 초과했어요.\n내일 다시 시도해주세요.', [{ text: '확인' }]);
      return;
    }
    showAppAlert(
      `${target.name}님을 차단할까요?`,
      `친구가 끊기고, 이 사람의 글·모집이\n더 이상 보이지 않아요.\n\n💡 상대방에게는 알림이 가지 않아요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '차단', style: 'destructive', onPress: async () => {
          const result = blockUser(userProfile, id);
          if (!result.ok) return;
          setUserProfile(result.profile);
          storage.save(STORAGE_KEYS.profile, result.profile);
          // Firestore write-through — users/{myUid}.blockedUids (멀티기기 일관성, RoundupTab과 동일)
          fsBlockUid(id).catch(e => __DEV__ && console.warn('[FriendsTab] fsBlockUid failed', e?.message));
          // 차단은 친구 관계도 종료(일방) — friendships doc 삭제
          try { await unfriend(id); } catch (e) { if (__DEV__) console.warn('[FriendsTab] unfriend(block) failed', e?.message); }
          setFriends(p => p.filter(f => f.id !== id));
          cleanupRemovedFriendGroup(id);
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
              <Text style={{ fontSize: fs(14) }}>🔍</Text>
            </TouchableOpacity>
            {friends.length > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setGroupManageOpen(true)}
                style={{ width: 34, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontSize: fs(15) }}>⚙</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* 검색 입력 — 🔍 토글 시만 (사용자 "검색 쓸 일 별로 없어") */}
        {searchOpen && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, backgroundColor: C.bgSecondary,
            borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: fs(13) }}>🔍</Text>
            <TextInput
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
          <TouchableOpacity onPress={() => setFinder('received')} activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: _and ? 9 : 12,
              backgroundColor: C.butter, borderRadius: 12, paddingHorizontal: 14, paddingVertical: _and ? 8 : 11 }}>
            <Text style={{ fontSize: fs(15) }}>📬</Text>
            <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>
              받은 친구 신청 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>{receivedRequests.length}</Text>건
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.burgundy }}>›</Text>
          </TouchableOpacity>
        )}
        {/* 그룹 필터칩 — 전체 · 미지정 · 그룹들. 그룹 지정된 친구가 한 명이라도 있을 때만 노출 ([[friend_groups]]) */}
        {friends.length > 0 && Object.values(friendData.friendMeta).some(m => (m.groupIds || []).length) && (
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
                  onPress={() => setFinder('kakao')}
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
