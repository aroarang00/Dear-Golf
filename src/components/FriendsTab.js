import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity, Platform, Image } from 'react-native';

const _and = Platform.OS === 'android';
import { C, F, fs } from '../constants/colors';
import { FriendProfile } from './FriendProfile';
import { FriendFinder } from './FriendFinder';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { topMilestone, milestoneBadge } from './MilestoneCard';
import { showAppAlert } from './AppAlert';
import { UserContext } from '../contexts/UserContext';
import {
  isFriendRequestLimitReached, incrementFriendRequestCount,
  getFriendRequestRemainingToday, FRIEND_REQUEST_DAILY_LIMIT,
} from '../utils/friendRequestLimit';
import { loadMyFriends, loadReceivedRequests, loadSentRequests, sendFriendRequest, cancelSentRequest, acceptFriendRequest, rejectFriendRequest, unfriend } from '../utils/friends';
import { loadFriendRounds } from '../utils/round';
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

const AVATARS = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B1E2A', fg: '#F5E6A8' },
  { bg: '#6B8B5E', fg: '#fff' },
];

function FriendCard({ friend, palette, muted, favorite, grade, onPress, onLongPress, onGradePress }) {
  const r = friend.recent;
  const diff = r ? r.score - r.par : 0;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  // 명함과 동일 — 마일스톤 배지·라베·멘트 ([[roundup-friend-redesign]])
  const fMs = milestoneBadge(topMilestone({ rounds: friend.stats?.rounds ?? 0, courses: friend.stats?.courses ?? 0 }));
  const fStatus = (friend.statusMessage || '').trim();
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress} delayLongPress={280}
      style={[{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: _and ? 11 : 14, marginBottom: _and ? 9 : 12,
        // 라운지 모집카드와 동일 입체감 — 크림 배경 위 흰 카드 분리감 (iOS·Android)
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
        favorite && { borderLeftWidth: 3, borderLeftColor: C.burgundy }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: _and ? 40 : 46, height: _and ? 40 : 46, borderRadius: _and ? 20 : 23, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {friend.avatarUri && /^https?:\/\//.test(friend.avatarUri) ? (
            <Image source={{ uri: friend.avatarUri }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 17 : 19), color: palette.fg }}>{(friend.name || '?').charAt(0)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 14 : 15), color: C.charcoal }}>{friend.name || '친구'}</Text>
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
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: C.butter, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.charcoal }}>라베 {friend.stats?.best ?? '—'}</Text>
          </View>
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

export function FriendsTab({ navigation, onInvite }) {
  const { userProfile } = React.useContext(UserContext);
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState([]);
  const [muted, setMuted] = useState({});           // { [id]: true }
  const [hidden, setHidden] = useState({});          // 숨긴 친구
  const [favorites, setFavorites] = useState({});    // 즐겨찾기 — { [uid]: true }, Firestore users.favoriteUids 영속
  const [profileFriend, setProfileFriend] = useState(null);
  const [feedLoading, setFeedLoading] = useState(false);   // 친구 프로필 피드 로드 중
  const [showHidden, setShowHidden] = useState(false);   // 숨긴 친구 섹션 펼침 여부
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업
  const [finder, setFinder] = useState(null);   // 친구 찾기 화면 — null 또는 진입 탭
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
        // 즐겨찾기 로드 — users.favoriteUids → 맵
        if (!cancelled) {
          const favArr = meSnap.exists() ? (meSnap.data().favoriteUids || []) : [];
          const fm = {};
          favArr.forEach(u => { fm[u] = true; });
          setFavorites(fm);
        }
        // 2) 친구·받은 신청·보낸 신청 병렬 로드
        const [friendsList, received, sent] = await Promise.all([
          loadMyFriends(), loadReceivedRequests(), loadSentRequests(),
        ]);
        if (cancelled) return;
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
            };
          }
        });
        // 4) UI 객체로 매핑 — 명함 공개필드(멘트·라이프베스트·평균타·총라운딩·사진) 반영 (친구 공개 뷰 2단계)
        const toMinimal = (uid) => {
          const p = profileByUid[uid] || {};
          return {
            id: uid,
            name: p.nickname || '친구',
            realName: p.realName || '',
            statusMessage: p.statusMessage || '',
            avatarUri: p.avatarUrl || null,
            style: '',
            hostedCount: 0, attendedCount: 0, mannerScore: 0,
            recent: null,
            stats: { rounds: p.totalRounds || 0, avg: p.avgScore || null, best: p.lifeBest || null },
            feed: [],
            togetherCount: 0, // 자리만 — 동반자 매칭(닉네임/본명) 구현 후 채움. 0이면 명함에 미표시 ([[diary-companion-matching]])
          };
        };
        setFriends(friendsList.map(f => toMinimal(f.otherUid)));
        setReceivedRequests(received.map(r => ({
          id: r.requesterUid,
          name: profileByUid[r.requesterUid]?.nickname || '친구',
          realName: profileByUid[r.requesterUid]?.realName || '',
          hostedCount: 0, attendedCount: 0, mannerScore: 0, avg: null,
        })));
        setSentRequests(sent.map(s => s.recipientUid));
      } catch (e) {
        if (__DEV__) console.warn('[FriendsTab] initial load failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile?.nickname, reloadKey]);

  // 친구 탭 재방문 시 — 검색·프로필·찾기 닫고 목록 맨 위로 + 친구·신청 재조회
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('tabPress', () => {
      setSearch('');
      setProfileFriend(null);
      setFinder(null);
      setShowHidden(false);
      setGradeModalKey(null);
      setReloadKey(k => k + 1);   // 상대의 수락·신청이 반영되도록 재조회
      listScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return unsub;
  }, [navigation]);
  const [sentRequests, setSentRequests] = useState([]);   // 보낸 신청 — recipientUid 배열
  const [receivedRequests, setReceivedRequests] = useState([]);   // 받은 신청 — 마운트 useEffect가 채움

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
  }, [blockedIds]);

  const q = search.trim();
  const visible = friends
    .filter(f => !hidden[f.id] && (!q || f.name.includes(q)))
    .sort((a, b) => (favorites[b.id] ? 1 : 0) - (favorites[a.id] ? 1 : 0)); // 즐겨찾기 상단 (안정 정렬)
  const hiddenFriends = friends.filter(f => hidden[f.id]);
  const paletteOf = (id) => AVATARS[friends.findIndex(f => f.id === id) % AVATARS.length];

  const toggleMute = (id) => setMuted(p => ({ ...p, [id]: !p[id] }));
  const hideFriend = (id) => setHidden(p => ({ ...p, [id]: true }));

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
  const unhideFriend = (id) => setHidden(p => { const n = { ...p }; delete n[id]; return n; });
  // 친구 끊기 — 일방·블라인드 ([[friend-relationship]] §1). Firestore friendships doc 삭제.
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
        } },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 친구 검색창 + 친구 추가 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ fontSize: fs(13) }}>🔍</Text>
          <TextInput
            style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, padding: 0 }}
            placeholder="이름으로 친구 검색"
            placeholderTextColor={C.warmGrayLight}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
        {/* 친구 추가 — 받은 신청 있으면 빨간 점 */}
        <TouchableOpacity onPress={() => setFinder('kakao')} activeOpacity={0.8}
          style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: C.navy,
            alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.bgPrimary, lineHeight: 22 }}>+</Text>
          {receivedRequests.length > 0 && (
            <View style={{ position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: 5,
              backgroundColor: '#E5484D', borderWidth: 1, borderColor: C.bgPrimary }} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView ref={listScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: _and ? 4 : 6, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled">
        {/* 받은 친구 신청 배너 — 있을 때만 */}
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

        {/* 친구 수 + 숨긴 친구 관리 (목록 위에 배치 — 스크롤 없이 접근) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: _and ? 8 : 12 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
            친구 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{visible.length}</Text>명
          </Text>
          {hiddenFriends.length > 0 && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowHidden(v => !v)}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray }}>
                🙈 숨긴 친구 {hiddenFriends.length}
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>{showHidden ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 숨긴 친구 목록 — 펼침 시 */}
        {showHidden && hiddenFriends.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            {hiddenFriends.map(f => (
              <View key={f.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8,
                  backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline,
                  paddingHorizontal: 12, paddingVertical: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: paletteOf(f.id).bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: paletteOf(f.id).fg }}>{f.name.charAt(0)}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{f.name}</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => unhideFriend(f.id)}
                  style={{ borderWidth: 1, borderColor: C.hairline, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.charcoal }}>숨김 해제</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {visible.length === 0 ? (
          q ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 36 }}>
              검색 결과가 없어요
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
              <FriendCard
                key={f.id}
                friend={f}
                palette={paletteOf(f.id)}
                muted={!!muted[f.id]}
                favorite={!!favorites[f.id]}
                grade={grade}
                onPress={() => openFriendProfile(f)}
                onLongPress={() => toggleFavorite(f.id)}
                onGradePress={() => setGradeModalKey(grade.key)}
              />
            );
          })
        )}

        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginTop: 6 }}>
          탭하면 프로필 · 길게 누르면 즐겨찾기 ⭐
        </Text>
      </ScrollView>

      {/* 풀 프로필 — 옵션(알림·숨기기·삭제)도 프로필 상단에서 처리 */}
      <FriendProfile
        friend={profileFriend}
        visible={!!profileFriend}
        feedLoading={feedLoading}
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
        received={receivedRequests}
        onSend={sendRequest}
        onCancelSend={cancelRequest}
        onAccept={acceptRequest}
        onIgnore={ignoreRequest} />
    </View>
  );
}
