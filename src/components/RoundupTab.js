import React, { useState, useEffect, useContext, useRef } from 'react';
import { Modal, View, ScrollView, Text, TouchableOpacity, Platform } from 'react-native';

// Android는 같은 px 패딩에도 카드 박스가 시각적으로 더 커 보임(폰트 metrics 차이 누적).
// 라운지 카드 한정 안드 컴팩트 보정 — 다른 화면은 검증 후 단계 확장.
const _and = Platform.OS === 'android';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { RoundupCreateModal } from './RoundupCreateModal';
import { MannerEvaluationModal } from './MannerEvaluationModal';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { OverlayAlert } from './common/OverlayAlert';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { RoundupDetail } from './RoundupDetail';
import { RoundupNotifications } from './RoundupNotifications';
import { SCOPE_BADGE, REGION_OPTIONS, waitlistRespondHours, matchesRoundup, hasRoundupMatch, pickNames, isRoundupConfirmed } from '../constants/roundup';
import { RoundupMatchModal } from './RoundupMatchModal';
import { RoundupGuideModal } from './RoundupGuideModal';
import { RoundupIntroModal } from './RoundupIntroModal';
import { isPostVisible, blockUser, unblockUser, remainingBlocksToday } from '../utils/block';
import { blockUid as fsBlockUid, loadMyFriends } from '../utils/friends';
import { loadMyNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, createNotification } from '../utils/roundupNotifications';
import { db } from '../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { isKickLimitReached, incrementKickCount, getKickRemainingThisMonth, KICK_MONTH_LIMIT } from '../utils/kickLimit';
import {
  isFriendRequestLimitReached, incrementFriendRequestCount, FRIEND_REQUEST_DAILY_LIMIT,
} from '../utils/friendRequestLimit';
import { getSentFriendRequests, addSentFriendRequest, removeSentFriendRequest } from '../utils/friendsRegistry';
import { getCancelWarningByHours, isD7Inside } from '../constants/mannerGrade';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';
import { applyDefaultAlarms } from '../utils/notifications';
import { loadAllRoundups, loadMyRoundups, loadFriendRoundups, createRoundup, updateRoundupAsAuthor, deleteRoundup, applyToRoundup, cancelApplication, joinRoundup, leaveRoundup, loadMyApplications, joinWaitlist, leaveWaitlist, kickParticipant } from '../utils/roundup';
import { getUid } from '../utils/firebase';

// posts/comments/notifications — Phase 3-A에서 Firestore 직결로 전환.
// joined/applied/waitlist는 Phase 3-C/D에서 loadMyApplications 등으로 복원 예정.

function PostCard({ post, myUid, joined, applied, waitlistNum, isBookmarked, onApply, onWaitlist, onCancel, onGradePress, onOpenDetail, onToggleBookmark }) {
  const { userProfile } = React.useContext(UserContext);
  const sb = SCOPE_BADGE[post.scope] || SCOPE_BADGE.all;
  const authorGrade = getTrustGrade(post.authorHostedCount, post.authorMannerScore);
  const isTeam = post.teams > 1;
  // 개별 모집의 동반자(앱 미사용자)는 정원에 자리 차지. 단체 모집은 동반자 미적용.
  const companionsCount = isTeam ? 0 : (post.companions?.length || 0);
  // 개별 모집과 단체 모집을 동일한 행 구조로 통일
  const rows = isTeam
    ? post.teamJoined.map((c, i) => ({ label: `${i + 1}팀`, cur: c, cap: 4 }))
    : [{ label: null, cur: (post.joined || 0) + companionsCount, cap: post.capacity || 4 }];
  const total = rows.reduce((s, r) => s + r.cur, 0);
  const capTotal = rows.reduce((s, r) => s + r.cap, 0);
  const allFull = rows.every(r => r.cur >= r.cap);
  const isClosed = post.closed || allFull;
  const isMine = !!myUid && post.authorUid === myUid;
  const respondHours = waitlistRespondHours(post.date);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onOpenDetail}
      style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
        padding: _and ? 11 : 14, marginBottom: _and ? 9 : 12,
        // 그림자 — 크림 배경(#FAF6EC) 위에서 흰 카드 분리감 강화 (iOS·Android 양쪽)
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }}>
      {/* 뱃지 줄 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: _and ? 7 : 10, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: post.type === 'fixed' ? C.charcoal : '#6B8B5E', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#fff' }}>
            {post.type === 'fixed' ? '확정형' : '오픈형'}
          </Text>
        </View>
        {post.teams > 1 && (
          <View style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>단체 {post.teams}팀</Text>
          </View>
        )}
        <View style={{ backgroundColor: sb.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: sb.fg }}>{sb.label}</Text>
        </View>
        {isClosed && (
          <View style={{ backgroundColor: '#E6C8C8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#5C1E1E' }}>마감</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{post.authorName || post.author}</Text>
          <TrustBadge grade={authorGrade} onPress={() => onGradePress(authorGrade.key)} />
          {!isMine && (
            <TouchableOpacity onPress={onToggleBookmark} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(16), color: isBookmarked ? '#E2B33D' : C.warmGrayLight }}>
                {isBookmarked ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 라운딩 정보 — 확정형은 구장·일시가 카드의 1순위 정보라 시각 무게 강화 */}
      {post.type === 'fixed' ? (
        <>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 15 : 17), color: C.charcoal, lineHeight: fs(_and ? 20 : 23) }}>{post.course}</Text>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(_and ? 12 : 13), color: C.charcoal, lineHeight: fs(_and ? 17 : 19), marginTop: _and ? 3 : 5 }}>
            {post.date} ({post.day}) · {post.time}
          </Text>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 15 : 17), color: C.charcoal, lineHeight: fs(_and ? 20 : 23) }}>장소 · 날짜 미정</Text>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(_and ? 12 : 13), color: C.charcoal, lineHeight: fs(_and ? 17 : 19), marginTop: _and ? 3 : 5 }}>
            {post.openTime?.length === 1
              ? (post.openTime[0] === 'weekday' ? '📅 주중 선호 · 동반자와 함께 정해요' : '📅 주말 선호 · 동반자와 함께 정해요')
              : '동반자와 함께 정해요'}
          </Text>
        </>
      )}

      {/* 동반자 조건 뱃지(구성·연령대·실력·태그)는 카드 정보 밀도 절감을 위해 상세에서만 표시.
          카드는 핵심(공개범위·구장·시간·정원)에 집중. */}

      {post.word ? (
        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: _and ? 6 : 8, lineHeight: 18 }}>"{post.word}"</Text>
      ) : null}

      {/* 모집 현황 — 카드에서는 총원만 한 줄. 팀별 디테일은 상세 화면에서. 게스트(앱 미사용자)가 있으면 명시. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: _and ? 9 : 12,
        backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: _and ? 6 : 8 }}>
        <Text style={{ fontSize: fs(13) }}>{allFull ? '✅' : '🔄'}</Text>
        <Text style={{ fontFamily: F.en, fontSize: fs(13), color: C.charcoal, fontWeight: '700' }}>{total}/{capTotal}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>명</Text>
        {post.companions?.length > 0 ? (
          <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray }}>· 동반자 {post.companions.length}명 포함</Text>
        ) : null}
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11),
          color: allFull ? '#3C7D4F' : C.warmGray, marginLeft: 'auto' }}>
          {allFull ? '모집 완료' : '모집중'}
        </Text>
      </View>

      {/* 상태 표시 — 액션(참여 신청·참여하기·대기 신청·참여 취소)은 카드에서 빼고 상세로 위임.
          카드는 훑어보기 용도, 결정은 상세에서. 빠른 참여 흐름을 의도적으로 한 단계 늦춰 신중함 확보. */}
      {(isMine || joined || applied || waitlistNum || userProfile?.isRestricted || userProfile?.mannerEvaluationPending) && (
        <View style={{ marginTop: _and ? 9 : 12 }}>
          {isMine ? (
            <View style={{ borderRadius: 10, paddingVertical: _and ? 6 : 8, alignItems: 'center',
              backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.hairline }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.warmGray }}>내가 올린 모집글</Text>
            </View>
          ) : joined ? (
            <View style={{ borderRadius: 10, paddingVertical: _and ? 6 : 8, alignItems: 'center',
              backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy }}>참여 확정 ✓</Text>
            </View>
          ) : applied ? (
            <View style={{ borderRadius: 10, paddingVertical: _and ? 6 : 8, alignItems: 'center',
              backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#8B6914' }}>신청 완료 · 수락 대기 중</Text>
            </View>
          ) : waitlistNum ? (
            <View>
              <View style={{ borderRadius: 10, paddingVertical: _and ? 6 : 8, alignItems: 'center',
                backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#8B6914' }}>⏳ 대기 {waitlistNum}번</Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                취소자 발생 시 푸시 알림을 보내드려요. {respondHours}시간 내 미응답 시 다음 대기자에게 넘어가요.
              </Text>
            </View>
          ) : userProfile?.isRestricted ? (
            <View style={{ borderRadius: 10, paddingVertical: _and ? 6 : 8, alignItems: 'center',
              backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#8B2A2A' }}>🚫 이용 제한 중</Text>
            </View>
          ) : (
            <View style={{ borderRadius: 10, paddingVertical: _and ? 6 : 8, alignItems: 'center',
              backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#8B6914' }}>지난 라운딩 평가 후 신청 가능해요</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export function RoundupTab({ visible, onClose, asScreen = false, navigation }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { schedules, addSchedule, editSchedule } = useContext(SchedulesContext);
  const [myUid, setMyUid] = useState(null);
  const [friendUids, setFriendUids] = useState([]); // Phase 3-F5: 친구 uid 목록 (친구공개 모집 필터·로드)
  const [friends, setFriends] = useState([]);        // Phase 3-F6: { id, name } — 친구지정 모달 등 표시용
  const [posts, setPosts] = useState([]);
  const [joined, setJoined] = useState({});            // Phase 3-C: loadMyApplications 등에서 채움
  const [applied, setApplied] = useState({});          // Phase 3-C: 전체공개 신청 대기
  const [waitlist, setWaitlist] = useState({});        // Phase 3-D: waitlistUids에서 복원
  const [bookmarks, setBookmarks] = useState({});      // 관심 모집 {postId: true}
  // 댓글 — { [postId]: [comment...] }. Firebase 마이그레이션 시 서브컬렉션 roundups/{postId}/comments로 이관.
  const [commentsByPost, setCommentsByPost] = useState({});
  // 친구 모집만 보기 토글 — true면 '전체' 탭 숨김 + 기본 view 'friend'
  const hideStranger = !!userProfile?.hideStrangerRoundups;
  const [view, setView] = useState(hideStranger ? 'friend' : 'all');  // all | friend | mine | watch
  const [regionFilter, setRegionFilter] = useState('all'); // 전체 탭 지역 칩 (all 외엔 capital/gangwon/chungcheong/jeolla/gyeongsang/jeju)

  // 토글이 켜진 상태에서 view가 'all'이면 자동으로 'friend'로 전환
  useEffect(() => {
    if (hideStranger && view === 'all') setView('friend');
  }, [hideStranger, view]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState(null);  // 수정 모드 — 모집글 id 매칭용 원본
  const [evaluatingPostId, setEvaluatingPostId] = useState(null); // 매너 평가 모달 — postId
  // 친구 신청 진입점 ([[friend-add-feature]] Phase 2) — 라운지 프로필에서 친구 신청 보낸 사용자 id 캐시
  const [sentFriendRequestIds, setSentFriendRequestIds] = useState([]);
  useEffect(() => {
    getSentFriendRequests().then(setSentFriendRequestIds);
  }, []);

  // Phase 3-A/C/F5 — 마운트 시 내 uid + 친구 + Firestore 모집글(전체·내·친구공개) + 참여·신청 상태 로드.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await getUid();
        if (cancelled) return;
        setMyUid(uid);
        // 1차: 내 친구 + 내 신청 + 전체공개·내 모집 병렬
        const [friendsList, myApps, allPosts, minePosts] = await Promise.all([
          loadMyFriends(),
          loadMyApplications(),
          loadAllRoundups(),
          loadMyRoundups(),
        ]);
        if (cancelled) return;
        const fUids = friendsList.map(f => f.otherUid).filter(Boolean);
        setFriendUids(fUids);
        // 2차: 친구 닉네임 + 친구공개 모집 병렬 로드
        const [friendUserSnaps, friendPostsArrays] = await Promise.all([
          Promise.all(fUids.map(u => getDoc(doc(db, 'users', u)).catch(() => null))),
          Promise.all(fUids.map(u => loadFriendRoundups(u).catch(() => []))),
        ]);
        if (cancelled) return;
        setFriends(fUids.map((u, i) => ({
          id: u,
          name: friendUserSnaps[i]?.exists() ? (friendUserSnaps[i].data().nickname || '친구') : '친구',
        })));
        const friendPosts = friendPostsArrays.flat();
        // 같은 모집글이 양쪽에 중복으로 잡힐 수 있으니 id 기준 dedupe
        const map = new Map();
        for (const p of [...allPosts, ...minePosts, ...friendPosts]) map.set(p.id, p);
        const merged = Array.from(map.values());
        setPosts(merged);
        // 참여 확정 복원 — participantUids에 내 uid가 있고 내가 작성자가 아닌 모집
        const joinedMap = {};
        for (const p of merged) {
          if (p.authorUid === uid) continue;
          if (Array.isArray(p.participantUids) && p.participantUids.includes(uid)) {
            joinedMap[p.id] = true;
          }
        }
        setJoined(joinedMap);
        // 신청 대기 복원 — applications status='pending'
        const appliedMap = {};
        for (const a of myApps) {
          if (a.status === 'pending') appliedMap[a.roundupId] = true;
        }
        setApplied(appliedMap);
        // 대기 복원 — waitlistUids에서 내 자리 번호(1-based)
        const waitlistMap = {};
        for (const p of merged) {
          if (!Array.isArray(p.waitlistUids)) continue;
          const idx = p.waitlistUids.indexOf(uid);
          if (idx >= 0) waitlistMap[p.id] = idx + 1;
        }
        setWaitlist(waitlistMap);
        // 인앱 알림 로드 — Phase 3-N2
        try {
          const notis = await loadMyNotifications(50);
          if (!cancelled) setNotifications(notis);
        } catch (e) {
          if (__DEV__) console.warn('[RoundupTab] notifications load failed', e?.message);
        }
      } catch (e) {
        if (__DEV__) console.warn('[RoundupTab] initial load failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업
  const [detailId, setDetailId] = useState(null);             // 상세 화면에 띄울 모집글 id
  const [alert, setAlert] = useState(null);                   // 참여 확인 팝업
  const [notifications, setNotifications] = useState([]);
  const [showNoti, setShowNoti] = useState(false);            // 알림함
  const [showMatchModal, setShowMatchModal] = useState(false); // 맞춤 모집 조건 설정
  const [showGuide, setShowGuide] = useState(false); // 라운지 이용 안내
  const [showIntro, setShowIntro] = useState(false); // 라운지 소개 (광고성)
  // 📢 FAB 노란 알림 점 — 사용자가 직접 FAB을 누른 적 없으면 표시. 자동 열림(roundupIntroSeen)과 분리해서,
  // 첫 진입 시 자동 모달을 대충 봤더라도 "여기서 다시 볼 수 있어요" 신호를 유지.
  const [roundupIntroOpenedManually, setRoundupIntroOpenedManually] = useState(true); // 로딩 전엔 점 숨김

  // 첫 진입 시 라운지 소개 모달 자동 열림 (1회만) — 빈 라운지 상태에서 사용자에게 무엇을 할 수 있는지 안내
  useEffect(() => {
    storage.load(STORAGE_KEYS.roundupIntroSeen, false).then(seen => {
      if (!seen) {
        setShowIntro(true);
        storage.save(STORAGE_KEYS.roundupIntroSeen, true);
      }
    });
    storage.load(STORAGE_KEYS.roundupIntroOpenedManually, false).then(opened => {
      setRoundupIntroOpenedManually(opened);
    });
  }, []);

  // 사용자가 직접 라운지 소개 진입점(FAB·빈 화면의 "다시 보기" 버튼 등)을 눌렀을 때 — 모달 열고 노란 알림 점 끄기
  const handleOpenIntroManually = () => {
    setShowIntro(true);
    if (!roundupIntroOpenedManually) {
      storage.save(STORAGE_KEYS.roundupIntroOpenedManually, true);
      setRoundupIntroOpenedManually(true);
    }
  };

  const listScrollRef = useRef(null);

  // 안드로이드 뒤로가기 — 자체 오버레이 우선 닫기 (가장 최근 열린 것부터)
  useOverlayBackHandler(!!alert, () => setAlert(null));
  useOverlayBackHandler(!!gradeModalKey, () => setGradeModalKey(null));

  // 라운지 탭 재방문 시 — 상세·모달 닫고 기본 탭·목록 맨 위로 초기화
  useEffect(() => {
    if (!asScreen || !navigation?.addListener) return;
    const unsub = navigation.addListener('tabPress', () => {
      setView(hideStranger ? 'friend' : 'all');
      setRegionFilter('all');
      setDetailId(null);
      setShowCreate(false);
      setShowNoti(false);
      setShowMatchModal(false);
      listScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return unsub;
  }, [navigation, asScreen, hideStranger]);

  const detailPost = posts.find(p => p.id === detailId) || null;
  const unreadCount = notifications.filter(n => !n.read).length;

  // 관심 모집 — 마운트 시 로드, 변경 시 저장
  const [bookmarksHydrated, setBookmarksHydrated] = useState(false);
  useEffect(() => {
    storage.load(STORAGE_KEYS.roundupBookmarks, {}).then(b => {
      setBookmarks(b || {});
      setBookmarksHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (!bookmarksHydrated) return;
    storage.save(STORAGE_KEYS.roundupBookmarks, bookmarks);
  }, [bookmarks, bookmarksHydrated]);

  const toggleBookmark = (id) => {
    setBookmarks(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  };

  // 모집 마감 → 예정 라운딩 자동 등록
  // 조건: 확정형 + 정원 만석(또는 closed=true) + (내가 주최자 || 참여 확정자)
  // 중복 방지: schedules[].roundupId === post.id 로 식별
  useEffect(() => {
    const toAdd = [];
    for (const p of posts) {
      if (p.type !== 'fixed' || !p.date || !p.course) continue;
      const isMine = !!myUid && p.authorUid === myUid;
      const isJoined = !!joined[p.id];
      if (!isMine && !isJoined) continue;
      const compCount = p.teams > 1 ? 0 : (p.companions?.length || 0);
      const allFull = p.teams > 1
        ? p.teamJoined?.every(c => c >= 4)
        : (p.joined || 0) + compCount >= (p.capacity || 4);
      const isClosed = p.closed || allFull;
      if (!isClosed) continue;
      if (schedules.some(s => s.roundupId === p.id)) continue;
      const members = p.teams > 1
        ? (p.teamJoined?.reduce((s, c) => s + c, 0) || 0)
        : (p.joined || 0) + compCount;
      toAdd.push({
        roundupId: p.id,
        course: p.course,
        date: p.date,
        day: p.day,
        time: p.time,
        members,
      });
    }
    if (toAdd.length === 0) return;
    (async () => {
      for (const data of toAdd) {
        try {
          const created = await addSchedule(data);
          applyDefaultAlarms(created, userProfile?.alarmDefaults);
        } catch (e) {
          console.warn('[roundup] auto-schedule add failed:', e?.message);
        }
      }
    })();
  }, [posts, joined, schedules, addSchedule, userProfile?.alarmDefaults, myUid]);

  // 라운지 노출 윈도우 — 티오프 + 24h 이내만 노출, 이후 사용자 UI에서 감춤
  // (시스템 데이터는 [[data-retention]]에 따라 별도 보관: 일반 1년 / 분쟁 이력 모집글 3년)
  // 오픈형(date 미정)은 항상 노출. 마이페이지 "내 라운지 활동"은 별도 화면(이 필터 미적용).
  const isInVisibleWindow = (p) => {
    if (!p.date) return true; // 오픈형 — 날짜 미정이므로 노출
    const [y, m, d] = p.date.split('.').map(Number);
    const [hh, mm] = (p.time || '07:00').split(':').map(Number);
    const teeOff = new Date(y, m - 1, d, hh, mm).getTime();
    if (Number.isNaN(teeOff)) return true;
    return Date.now() <= teeOff + 24 * 3600 * 1000;
  };

  // 차단 필터 — 내가 차단한 사람의 모집 + 나를 차단한 사람의 모집은 어디서도 안 보임
  // (단, 내가 직접 올린 모집은 mine 탭에서 항상 보임. joined/applied/waitlist도 본인 활동 보존)
  const visiblePosts = posts.filter(p => isPostVisible(p, userProfile) && isInVisibleWindow(p));

  // 탭별 목록 — 전체: 전체공개만 (+ 지역 필터) / 친구: 친구공개 모집만 (친구가 올린 것 + 내가 올린 것) / 내 참여 중 / 관심
  const allTab = visiblePosts
    .filter(p => p.scope === 'all')
    .filter(p => regionFilter === 'all' || p.region === regionFilter);
  // 친구 탭은 친구공개(friends) 모집만 — 전체공개는 '전체' 탭, 친구지정은 당사자에게만 따로 노출
  const friendTab = visiblePosts.filter(p => {
    if (p.scope !== 'friends') return false;
    if (!!myUid && p.authorUid === myUid) return true;
    return friendUids.includes(p.authorUid);
  });
  // mine 탭은 내가 직접 관여한 모집이므로 차단 필터는 무시하되, 티오프+24h 윈도우는 동일 적용
  // (지난 라운딩의 본인 활동 이력은 마이페이지 "내 라운지 활동"에서 별도 조회)
  const mineTab = posts.filter(p =>
    ((!!myUid && p.authorUid === myUid) || joined[p.id] || applied[p.id] || waitlist[p.id]) && isInVisibleWindow(p)
  );
  const watchTab = visiblePosts.filter(p => bookmarks[p.id]);
  // 맞춤 모집 — 내 조건(roundupMatch)에 맞는 모집 (내가 주최한 모집은 제외)
  const matchTab = visiblePosts.filter(p => !(!!myUid && p.authorUid === myUid) && matchesRoundup(p, userProfile.roundupMatch));
  const matchCount = matchTab.length;
  const hasMatch = hasRoundupMatch(userProfile.roundupMatch);
  const tabList = view === 'friend' ? friendTab : view === 'mine' ? mineTab
    : view === 'watch' ? watchTab : view === 'match' ? matchTab : allTab;
  // Firestore createdAt(Timestamp) 우선, 더미 호환 위해 ts fallback
  const tsOf = (p) => (p.createdAt?.toMillis?.() ?? p.ts ?? 0);
  const list = [...tabList].sort((a, b) => tsOf(b) - tsOf(a));
  // 소도시 예외 — 전체/친구 탭에서 보이는 모집글이 3개 이하면 조건 완화 안내
  const showSparseHint = (view === 'all' || view === 'friend') && list.length > 0 && list.length <= 3;

  // 맞춤 모집 조건 저장
  const saveRoundupMatch = (cfg) => {
    const next = { ...userProfile, roundupMatch: cfg };
    setUserProfile(next);
    storage.save(STORAGE_KEYS.profile, next);
  };

  const handleCreate = async (post) => {
    try {
      // 수정 모드 — editingPost가 있으면 Firestore 업데이트 + 로컬 머지 + schedules 동기화
      if (editingPost) {
        const eid = editingPost.id;
        await updateRoundupAsAuthor(eid, post);
        setPosts(prev => prev.map(p => p.id === eid ? { ...p, ...post } : p));
        // schedules 동기화 — date·time·course 변경 시 본인 자동 일정도 함께 갱신
        const linked = schedules.filter(s => s.roundupId === eid);
        for (const s of linked) {
          try {
            await editSchedule(s.id, {
              course: post.course || s.course,
              date: post.date || s.date,
              day: post.day || s.day,
              time: post.time || s.time,
            });
          } catch (e) { console.warn('[roundup] linked schedule edit failed:', e?.message); }
        }
        setEditingPost(null);
        return;
      }
      const teams = post.teams || 1;
      const payload = {
        ...post,
        authorName: userProfile?.nickname || '',
        teams,
        teamJoined: teams > 1 ? Array.from({ length: teams }, (_, i) => (i === 0 ? 1 : 0)) : [1],
        // 동반자 조건 기본값 — post에 없으면 '상관없음'/빈 배열
        companion: post.companion || 'any',
        skill: post.skill || 'any',
        region: post.region || null,
        tags: post.tags || [],
      };
      const created = await createRoundup(payload);
      setPosts(prev => [created, ...prev]);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] handleCreate failed', e);
      setAlert({
        title: '모집글 저장에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
    }
  };

  // 친구 신청 ([[friend-add-feature]] Phase 2) — 라운지 프로필 진입점.
  // 일 10건 한도 + sentFriendRequests AsyncStorage 저장. 멱등 처리.
  // 결과 반환: RoundupDetail Modal 내부 OverlayAlert로 표시 (RoundupTab의 alert는 Modal 뒤로 가려짐).
  const handleFriendRequest = async (target) => {
    if (!target?.id) return { ok: true, skipped: true };
    if (sentFriendRequestIds.includes(target.id)) return { ok: true, skipped: true }; // 멱등
    const reached = await isFriendRequestLimitReached();
    if (reached) return { ok: false, reason: 'limit' };
    await addSentFriendRequest(target.id);
    await incrementFriendRequestCount();
    setSentFriendRequestIds(prev => prev.includes(target.id) ? prev : [...prev, target.id]);
    return { ok: true, sent: true, name: target.name };
  };

  // 친구 신청 취소 — 한도 카운트는 환불 X (스팸 우회 방지, block 정책과 같은 결).
  const handleCancelFriendRequest = async (target) => {
    if (!target?.id) return;
    if (!sentFriendRequestIds.includes(target.id)) return;
    await removeSentFriendRequest(target.id);
    setSentFriendRequestIds(prev => prev.filter(id => id !== target.id));
  };

  // 주최자 강퇴 ([[roundup-kick-policy]]) — 전체공개 모집의 수락된 참여자만, 월 2회 한도.
  // 강퇴된 사람: 패널티 X, 통보는 "주최자 사정으로 참여 취소" 블라인드. 대기자 호출(Phase 2)·정지 누적(Phase 2)은 Cloud Functions.
  // target.id를 uid로 가정 — Phase 3 uid 통일 의존 ([[block-participation]]).
  const handleKick = async (postId, target, reason) => {
    if (!postId || !target?.id) return;
    const reached = await isKickLimitReached();
    if (reached) {
      setAlert({
        title: '이번 달 강퇴 횟수를 초과했어요',
        message: `주최자 강퇴는 월 ${KICK_MONTH_LIMIT}회로 제한되어 있어요.\n다음 달 1일에 다시 가능해져요.`,
        buttons: [{ text: '확인' }],
      });
      return;
    }
    try {
      await kickParticipant(postId, target.id);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] kickParticipant failed', e);
      setAlert({
        title: '강퇴 처리에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
      return;
    }
    // 강퇴된 자에게 알림 — 블라인드 정책 ([[roundup-kick-policy]] §3): actorName 비공개
    const post = posts.find(p => p.id === postId);
    createNotification({
      type: 'kicked',
      recipientUid: target.id,
      actorName: '',  // 블라인드 — "주최자 사정으로 참여 취소" 표현
      postId,
      postTitle: post?.course || '',
    }).catch(e => __DEV__ && console.warn('[RoundupTab] kicked noti fail', e?.message));
    // 로컬 정원·참여자 동기화 (단체는 첫 채워진 팀에서 차감 — Firestore에선 단순 joined -1)
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const nextParts = (p.participantUids || []).filter(u => u !== target.id);
      if (p.teams > 1 && Array.isArray(p.teamJoined)) {
        const tj = [...p.teamJoined];
        for (let i = tj.length - 1; i >= 0; i--) {
          if (tj[i] > 0) { tj[i] -= 1; break; }
        }
        return { ...p, participantUids: nextParts, teamJoined: tj };
      }
      return { ...p, participantUids: nextParts, joined: Math.max(0, (p.joined || 0) - 1) };
    }));
    await incrementKickCount();
    const remaining = await getKickRemainingThisMonth();
    setAlert({
      title: '참여자가 내보내졌어요',
      message: `${target.name}님의 참여가 취소됐어요.\n이번 달 남은 강퇴 ${remaining}/${KICK_MONTH_LIMIT}회.`,
      buttons: [{ text: '확인' }],
    });
  };

  // 모집글 수정 진입 — 시점 분기 후 RoundupCreateModal을 edit mode로 띄움 ([[roundup-edit-policy]] §1).
  // 모달 중첩 패턴 — RoundupDetail 닫고 부모 모달 열기 ([[modal-navigation-pattern]]).
  const handleEditRequest = (post) => {
    if (!post) return;
    // 참여자 1+ + D-7 이내는 차단 (참여자 0이면 시점 무관 자유 수정)
    const otherCount = Math.max(0, (post.joined || 1) - 1);
    if (otherCount > 0 && post.date) {
      const [y, m, d] = post.date.split('.').map(Number);
      const [hh, mm] = (post.time || '07:00').split(':').map(Number);
      const target = new Date(y, m - 1, d, hh, mm);
      const hoursUntil = (target - new Date()) / 3600000;
      if (isD7Inside(hoursUntil)) {
        setAlert({
          title: '라운딩 7일 이내라 수정이 어려워요',
          message: '약속된 라운딩을 보호하기 위해 D-7 이내엔 모집글을 수정할 수 없어요.\n부득이한 사유라면 [취소] 후 다시 등록해주세요.',
          buttons: [{ text: '확인', style: 'cancel' }],
        });
        return;
      }
    }
    setDetailId(null);
    setEditingPost(post);
    setShowCreate(true);
  };

  // 모집글 작성 진입 — 정지 상태 차단 (패널티 동의서 §5 / 콘텐츠 정책 §7)
  const tryOpenCreate = () => {
    // 영구 모집 박탈
    if (userProfile?.isRecruitRestrictedPermanent) {
      setAlert({
        title: '모집글을 작성할 수 없어요',
        message: '누적 위반으로 영구 모집 박탈이 적용되어 있어요.\n\n이의는 마이페이지의\n"자동 결정 이의 신청"으로 문의해주세요.',
        buttons: [{ text: '확인' }],
      });
      return;
    }
    const fmtDate = (iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    };
    // 일반 정지 (노쇼/허위신고) — restrictUntil 미래
    if (userProfile?.isRestricted && userProfile?.restrictUntil
        && new Date(userProfile.restrictUntil).getTime() > Date.now()) {
      setAlert({
        title: '모집글을 작성할 수 없어요',
        message: `이용 정지가 적용 중이에요.\n해제 예정일: ${fmtDate(userProfile.restrictUntil)}`,
        buttons: [{ text: '확인' }],
      });
      return;
    }
    // 콘텐츠 신고 누적 30일 모집 정지
    if (userProfile?.recruitRestrictUntil
        && new Date(userProfile.recruitRestrictUntil).getTime() > Date.now()) {
      setAlert({
        title: '모집글을 작성할 수 없어요',
        message: `콘텐츠 신고 누적으로 모집 정지 중이에요.\n해제 예정일: ${fmtDate(userProfile.recruitRestrictUntil)}`,
        buttons: [{ text: '확인' }],
      });
      return;
    }
    setShowCreate(true);
  };

  // 모집 인원 +1 — 단체는 빈 첫 팀에, 개별은 인원 (주최자가 신청을 수락할 때 호출)
  const bumpPostCount = (id) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (p.teams > 1) {
        const tj = [...p.teamJoined];
        const idx = tj.findIndex(c => c < 4);
        if (idx >= 0) tj[idx] += 1;
        return { ...p, teamJoined: tj };
      }
      return { ...p, joined: (p.joined || 0) + 1 };
    }));
  };

  // 참여 신청 — 확인 후 신청 (주최자 수락 대기)
  // 참여 처리 — 전체공개는 applications에 pending 저장(수락 대기), 친구공개·친구지정은 joinRoundup 즉시 확정
  const performJoinOrApply = async (id) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    try {
      if (post.scope === 'all') {
        await applyToRoundup(id, post.authorUid, userProfile?.nickname || '');
        setApplied(prev => ({ ...prev, [id]: true }));
        // 주최자에게 신청 알림
        createNotification({
          type: 'apply',
          recipientUid: post.authorUid,
          actorName: userProfile?.nickname || '',
          postId: id,
          postTitle: post.course || '',
          status: 'pending',
        }).catch(e => __DEV__ && console.warn('[RoundupTab] apply noti fail', e?.message));
        return { ok: true };
      }
      // 친구공개·친구지정 — 바로 참여 확정 + 모집글 인원 +1
      await joinRoundup(id);
      setJoined(prev => ({ ...prev, [id]: true }));
      setPosts(prev => prev.map(p => {
        if (p.id !== id) return p;
        if (p.teams > 1) {
          const tj = [...p.teamJoined];
          for (let i = 0; i < tj.length; i++) {
            if (tj[i] < 4) { tj[i] += 1; break; }
          }
          return { ...p, teamJoined: tj };
        }
        return { ...p, joined: (p.joined || 0) + 1 };
      }));
      // 친구공개·친구지정 — 주최자에게 참여 확정 알림
      createNotification({
        type: 'confirmed',
        recipientUid: post.authorUid,
        actorName: userProfile?.nickname || '',
        postId: id,
        postTitle: post.course || '',
      }).catch(e => __DEV__ && console.warn('[RoundupTab] confirmed noti fail', e?.message));
      return { ok: true };
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] join/apply failed', e);
      // 카드(비모달) 경로 fallback alert. 모달(RoundupDetail) 경로는 ok:false를 받아 자체 alert 표시
      // (RoundupTab의 alert는 Detail Modal 뒤로 가려져 '상세 닫아야 보임' 문제가 있었음).
      setAlert({
        title: '참여 처리에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
      return { ok: false };
    }
  };

  const confirmApply = (id) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    const instant = post.scope !== 'all';
    setAlert({
      title: instant ? '이 라운딩에 참여할까요?' : '이 라운딩에 참여 신청할까요?',
      message: instant
        ? '친구 대상 모집이라 바로 참여가 확정돼요.'
        : '주최자에게 신청이 전달되고, 주최자가 수락하면 참여가 확정돼요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: instant ? '참여하기' : '참여 신청', onPress: () => performJoinOrApply(id) },
      ],
    });
  };

  // 대기 신청 — waitlistUids에 내 uid 추가, 번호는 새 길이 (1-based)
  const handleWaitlist = async (id) => {
    if (!myUid) return;
    try {
      await joinWaitlist(id);
      let myIdx = 1;
      setPosts(prev => prev.map(p => {
        if (p.id !== id) return p;
        const cur = Array.isArray(p.waitlistUids) ? p.waitlistUids : [];
        const next = cur.includes(myUid) ? cur : [...cur, myUid];
        myIdx = next.indexOf(myUid) + 1;
        return { ...p, waitlistUids: next };
      }));
      setWaitlist(prev => ({ ...prev, [id]: myIdx }));
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] joinWaitlist failed', e);
      setAlert({
        title: '대기 신청에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
    }
  };

  // 참여 취소 — 시스템 매너점수 차감 없음 (2026-05-25 단순화, [[roundup-penalty-policy]]).
  // 시점에 따른 골프장 위약금은 본인 부담. 노쇼만 별도 신고 시스템에서 처리 ([[noshow-report-system]]).
  // 대기자 자동 승격은 Phase 2 (Cloud Functions).

  // 참여 취소 실행 — 확인은 호출 측에서.
  // applied(전체공개 신청 대기) → cancelApplication / joined(확정 참여) → leaveRoundup + 정원 -1
  const performCancel = async (id) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    try {
      if (applied[id]) {
        await cancelApplication(id);
        setApplied(prev => { const n = { ...prev }; delete n[id]; return n; });
        // 주최자에게 신청 취소 알림
        createNotification({
          type: 'cancel',
          recipientUid: post.authorUid,
          actorName: userProfile?.nickname || '',
          postId: id,
          postTitle: post.course || '',
        }).catch(e => __DEV__ && console.warn('[RoundupTab] cancel-apply noti fail', e?.message));
        return;
      }
      await leaveRoundup(id);
      // 1) 모집글 인원 -1 (마지막 채워진 자리에서)
      setPosts(prev => prev.map(p => {
        if (p.id !== id) return p;
        if (p.teams > 1) {
          const tj = [...p.teamJoined];
          for (let i = tj.length - 1; i >= 0; i--) {
            if (tj[i] > 0) { tj[i] -= 1; break; }
          }
          return { ...p, teamJoined: tj };
        }
        return { ...p, joined: Math.max(0, (p.joined || 0) - 1) };
      }));
      // 2) 내 joined 플래그 해제
      setJoined(prev => { const n = { ...prev }; delete n[id]; return n; });
      // 주최자에게 확정 참여자 이탈 알림
      createNotification({
        type: 'cancel',
        recipientUid: post.authorUid,
        actorName: userProfile?.nickname || '',
        postId: id,
        postTitle: post.course || '',
      }).catch(e => __DEV__ && console.warn('[RoundupTab] cancel-confirmed noti fail', e?.message));
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] cancel failed', e);
      setAlert({
        title: '취소 처리에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
    }
  };

  // 참여 취소 — D-7 이내는 시스템적으로 차단 ([[roundup-penalty-policy]] §1).
  // D-7 이전엔 자유 취소, 패널티 X.
  const cancelParticipation = (id) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    let hoursUntil = 24 * 30; // 오픈형 기본: 한 달치 — D-7 이전 취급
    if (post.date) {
      const [y, m, d] = post.date.split('.').map(Number);
      const [hh, mm] = (post.time || '07:00').split(':').map(Number);
      const target = new Date(y, m - 1, d, hh, mm);
      const now = new Date();
      hoursUntil = (target - now) / 3600000;
    }
    // 친구공개·친구지정 모집은 시스템 제재 예외 — 친구끼리 직접 소통, 시스템 매개 불필요
    // ([[manner-evaluation-policy]] §1-0 매너 평가 미발동과 같은 결, 2026-05-27 정책 확장)
    // D-7 이내 + 모집 확정(만석·closed) + 전체공개 — 매너 영향 경고 + 취소 가능 (약관 일치)
    // 그 외(D-7 이전/미확정/친구공개·친구지정) — 항상 자유 취소
    if (post.scope === 'all' && isD7Inside(hoursUntil) && isRoundupConfirmed(post)) {
      setAlert({
        title: '라운딩 7일 이내 취소',
        message: '함께하는 골프,\n서로의 시간을 존중해요.\n\n동반자들의 매너 평가에 영향을 줄 수 있고\n매너점수가 깎일 수 있어요.\n\n사전 안내 없이 나타나지 않으면\n노쇼로 신고받을 수 있으니\n부득이한 사정이라면 댓글로 양해를 구해주세요.',
        buttons: [
          { text: '계속 참여', style: 'cancel' },
          { text: '취소하기', style: 'destructive', onPress: () => performCancel(id) },
        ],
      });
      return;
    }
    // D-7 이전 또는 미확정 — 자유 취소
    setAlert({
      title: '참여를 취소할까요?',
      message: '취소하면 자리는 다시 열려요.',
      buttons: [
        { text: '계속 참여', style: 'cancel' },
        { text: '취소하기', style: 'destructive', onPress: () => performCancel(id) },
      ],
    });
  };

  // 대기 취소 — 대기는 확정 참여가 아니라 매너 점수 차감 없음
  const cancelWaitlist = async (id) => {
    if (!myUid) return;
    try {
      await leaveWaitlist(id);
      setPosts(prev => prev.map(p => p.id === id
        ? { ...p, waitlistUids: (p.waitlistUids || []).filter(u => u !== myUid) }
        : p));
      setWaitlist(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] leaveWaitlist failed', e);
      setAlert({
        title: '대기 취소에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
    }
  };

  // 내 모집글 삭제 — Firestore 삭제 후 로컬 정리, 상세 화면도 닫는다
  const handleDelete = async (id) => {
    try {
      await deleteRoundup(id);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] handleDelete failed', e);
      setAlert({
        title: '삭제에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
      return;
    }
    setPosts(prev => prev.filter(p => p.id !== id));
    setCommentsByPost(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDetailId(null);
  };

  // 댓글 작성 — 비속어 필터·권한 체크는 호출 측(RoundupDetail)에서. 성공 시 comment 객체 push.
  // 알림 발송(주최자+참여 확정자에게 comment 타입)은 Phase 2 Cloud Function 이관 — 현재 단계 X.
  const handleAddComment = (postId, comment) => {
    setCommentsByPost(prev => ({
      ...prev,
      [postId]: [...(prev[postId] || []), comment],
    }));
  };

  // 댓글 삭제 — 본인 댓글만 (RoundupDetail에서 권한 체크 후 호출).
  const handleDeleteComment = (postId, commentId) => {
    setCommentsByPost(prev => ({
      ...prev,
      [postId]: (prev[postId] || []).filter(c => c.id !== commentId),
    }));
  };

  // 댓글 고정 토글 — 주최자만 (RoundupDetail에서 권한 체크 후 호출). 한 모집글당 1개 유지.
  const handlePinComment = (postId, commentId) => {
    setCommentsByPost(prev => {
      const list = prev[postId] || [];
      const target = list.find(c => c.id === commentId);
      if (!target) return prev;
      const nextList = list.map(c => {
        if (c.id === commentId) {
          return target.pinned
            ? { ...c, pinned: false, pinnedAt: null }
            : { ...c, pinned: true, pinnedAt: Date.now() };
        }
        // 새로 고정하는 경우 기존 고정 해제
        if (!target.pinned && c.pinned) return { ...c, pinned: false, pinnedAt: null };
        return c;
      });
      return { ...prev, [postId]: nextList };
    });
  };

  // 주최자 — 참여 신청 수락 / 거절
  const acceptApply = (n) => {
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, status: 'accepted', read: true } : x)));
    bumpPostCount(n.postId);
  };
  const rejectApply = (n) => {
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, status: 'rejected', read: true } : x)));
  };

  // 알림 탭 — 읽음 처리 후 진입 (mannerEval은 평가 모달, 그 외는 모집 상세)
  const openNotiPost = (n) => {
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    if (!n.read) {
      markNotificationRead(n.id).catch(e => __DEV__ && console.warn('[RoundupTab] markRead fail', e?.message));
    }
    setShowNoti(false);
    if (n.type === 'mannerEval') {
      const post = posts.find(p => p.id === n.postId);
      if (post) setEvaluatingPostId(n.postId);
      return;
    }
    setDetailId(n.postId);
  };
  const readAllNoti = () => {
    const snapshot = notifications;
    setNotifications(prev => prev.map(x => ({ ...x, read: true })));
    markAllNotificationsRead(snapshot).catch(e => __DEV__ && console.warn('[RoundupTab] markAll fail', e?.message));
  };
  const deleteNoti = (n) => {
    setNotifications(prev => prev.filter(x => x.id !== n.id));
    deleteNotification(n.id).catch(e => __DEV__ && console.warn('[RoundupTab] deleteNoti fail', e?.message));
  };

  // 사용자 차단 — 일일 한도 5명, 양방향 모집글 숨김. 차단 사실은 상대에게 알리지 않음.
  // 확인 모달은 호출자(RoundupDetail 등)에서 처리 → 여기는 즉시 차단 + 참여/신청/대기 자동 정리.
  // 정책 [[block-participation]] — 차단으로 인한 참여 취소엔 추가 패널티 없음.
  const handleBlock = (target) => {
    if (!target?.id) return;
    const remaining = remainingBlocksToday(userProfile);
    if (remaining <= 0) {
      setAlert({
        title: '차단 횟수 초과',
        message: '오늘 차단 가능한 횟수를 초과했어요.\n내일 다시 시도해주세요.',
        buttons: [{ text: '확인' }],
      });
      return;
    }
    const result = blockUser(userProfile, target.id);
    if (!result.ok) return;
    setUserProfile(result.profile);
    storage.save(STORAGE_KEYS.profile, result.profile);
    // Firestore write-through — users/{myUid}.blockedUids 동기화 (멀티기기 일관성)
    fsBlockUid(target.id).catch(e => __DEV__ && console.warn('[RoundupTab] fsBlockUid failed', e?.message));
    // 차단된 사용자가 actor·author인 알림도 모두 정리 (수락 알림 등으로 다시 진입 방지).
    const targetKey = target.id;
    setNotifications(prev => prev.filter(n => {
      if (n.actor === target.name || n.actorId === targetKey) return false;
      const p = posts.find(pp => pp.id === n.postId);
      if (p && ((p.authorUid || p.authorId || p.author) === targetKey)) return false;
      return true;
    }));
    // 차단한 사람이 author인 모집에서 내 참여/신청/대기 자동 취소.
    const isAuthored = (p) => (p.authorUid || p.authorId || p.author) === targetKey;
    const affectedIds = posts.filter(isAuthored).map(p => p.id);
    if (affectedIds.length > 0) {
      const drop = (m) => { const n = { ...m }; for (const id of affectedIds) delete n[id]; return n; };
      setJoined(drop);
      setApplied(drop);
      setWaitlist(drop);
      setPosts(prev => prev.map(p => {
        if (!isAuthored(p)) return p;
        // 내가 confirmed 참여자였다면 정원 카운트도 1 감소 (단체 모집은 단순화 — 첫 팀에서 차감)
        if (!joined[p.id]) return p;
        if (p.teams > 1 && Array.isArray(p.teamJoined)) {
          const tj = [...p.teamJoined];
          const idx = tj.findIndex(c => c > 0);
          if (idx >= 0) tj[idx] = Math.max(0, tj[idx] - 1);
          return { ...p, teamJoined: tj };
        }
        return { ...p, joined: Math.max(0, (p.joined || 0) - 1) };
      }));
    }
    setDetailId(null); // 차단 후 상세 닫기 — 더 이상 보이지 않으므로
  };
  const handleReport = (target) => {
    setAlert({
      title: '신고하기',
      message: `${target.name}님을 신고할까요?\n(신고 사유 입력 화면은 정식 운영 시 제공돼요)`,
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '신고 접수', onPress: () => {
          setAlert({ title: '신고가 접수됐어요', message: '검토 후 조치할게요.', buttons: [{ text: '확인' }] });
        }},
      ],
    });
  };
  // 전체삭제 — confirm은 RoundupNotifications 모달 안에서 자체 처리 (모달 위에 떠야 안 가려짐)
  const clearAllNoti = () => {
    const snapshot = notifications;
    setNotifications([]);
    // 일괄 삭제 — best-effort 병렬
    Promise.all(snapshot.map(n => deleteNotification(n.id).catch(e => {
      if (__DEV__) console.warn('[RoundupTab] clearAll fail', e?.message);
    })));
  };

  // 라운지 탭(asScreen)으로 띄울 땐 Modal 래퍼 없이 일반 화면처럼 동작
  const body = (
    <>
      {/* 헤더 — 정식 메뉴이므로 친구 화면과 동일한 네이비 헤더 (큰 타이틀 + 서브) */}
      <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 7,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          {!asScreen && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.butter }}>←</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(250,246,236,0.72)', letterSpacing: 2, marginBottom: _and ? 2 : 4 }}>나의 라운딩 파트너 찾기</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Text style={{ fontFamily: F.serifKR, fontSize: fs(_and ? 24 : 28), color: C.bgPrimary }}>라운지</Text>
              <TouchableOpacity onPress={() => setShowGuide(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  width: 24, height: 24, borderRadius: 12,
                  borderWidth: 1.5, borderColor: C.bgPrimary,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.bgPrimary, fontWeight: '700', lineHeight: 17 }}>!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {/* 모집글 작성 */}
          <TouchableOpacity onPress={tryOpenCreate} activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ backgroundColor: C.burgundy, borderRadius: 16, paddingHorizontal: 12, paddingVertical: _and ? 4 : 7,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter, includeFontPadding: false, textAlignVertical: 'center' }}>+</Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.butter, includeFontPadding: false, textAlignVertical: 'center' }}>모집글</Text>
          </TouchableOpacity>
          {/* 알림함 */}
          <TouchableOpacity onPress={() => setShowNoti(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(22) }}>🔔</Text>
            {unreadCount > 0 && (
              <View style={{ position: 'absolute', top: -5, right: -7, minWidth: 16, height: 16, borderRadius: 8,
                backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(9), color: '#fff' }}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 전체 / 친구 / 내 참여 중 / 관심 세그먼트 — hideStranger 토글 시 '전체' 숨김 */}
      <View style={{ paddingHorizontal: 16, paddingTop: _and ? 5 : 8, paddingBottom: 2 }}>
        <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 3 }}>
          {(hideStranger
            ? [['friend', '친구'], ['mine', '내 참여'], ['watch', '관심']]
            : [['all', '전체'], ['friend', '친구'], ['mine', '내 참여'], ['watch', '관심']]
          ).map(([k, l]) => {
            const on = view === k;
            const count = k === 'mine' ? mineTab.length : k === 'watch' ? watchTab.length : 0;
            return (
              <TouchableOpacity key={k} onPress={() => setView(k)} activeOpacity={0.8}
                style={{ flex: 1, alignItems: 'center', paddingVertical: _and ? 6 : 8, borderRadius: 8,
                  backgroundColor: on ? C.charcoal : 'transparent' }}>
                <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(12), color: on ? C.butter : C.warmGray }}>
                  {l}{count > 0 ? ` ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 전체 탭 — 지역 칩 필터 (수도권/강원/충청/전라/경상/제주) */}
      {view === 'all' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: _and ? 5 : 7, paddingBottom: 2, gap: 6, alignItems: 'center' }}>
          {REGION_OPTIONS.map(([k, l]) => {
            const on = regionFilter === k;
            return (
              <TouchableOpacity key={k} onPress={() => setRegionFilter(k)} activeOpacity={0.8}
                style={{ paddingHorizontal: 12, paddingVertical: _and ? 4 : 6, borderRadius: 14,
                  backgroundColor: on ? C.navy : C.bgSecondary,
                  borderWidth: 0.5, borderColor: on ? C.navy : C.hairline }}>
                <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(12),
                  color: on ? C.butter : C.warmGray }}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 맞춤 모집 배너 — 내 조건에 맞는 모집 모아보기 */}
      {view !== 'mine' && view !== 'watch' && (
        hasMatch ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: _and ? 5 : 7,
            backgroundColor: view === 'match' ? C.burgundy : C.bgSecondary, borderRadius: 12,
            borderWidth: 0.5, borderColor: view === 'match' ? C.burgundy : C.hairline,
            paddingHorizontal: 14, paddingVertical: _and ? 7 : 9 }}>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              activeOpacity={0.7}
              onPress={() => setView(view === 'match' ? (hideStranger ? 'friend' : 'all') : 'match')}>
              <Text style={{ fontSize: fs(14) }}>🎯</Text>
              <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13),
                color: view === 'match' ? C.butter : C.charcoal }}>
                내 조건에 맞는 모집 {matchCount}건{view === 'match' ? ' · 보는 중' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMatchModal(true)} activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(15) }}>⚙️</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setShowMatchModal(true)} activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: _and ? 5 : 7,
              backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline,
              paddingHorizontal: 14, paddingVertical: _and ? 7 : 9 }}>
            <Text style={{ fontSize: fs(14) }}>🎯</Text>
            <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>
              맞춤 모집 알림 설정하기
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>›</Text>
          </TouchableOpacity>
        )
      )}

      {/* 안내 텍스트 — 모집글 작성 버튼은 헤더로 이동 */}
      {view !== 'mine' && view !== 'watch' && (
        <View style={{ paddingHorizontal: 16, paddingTop: _and ? 4 : 6, paddingBottom: 2 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray }}>
            {view === 'match' ? '내 조건에 맞는 모집이에요'
              : view === 'friend' ? '친구가 올린 모집글이에요' : '전체공개 모집글이에요'}
          </Text>
        </View>
      )}

      <ScrollView ref={listScrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: _and ? 3 : 5, paddingBottom: 32 }}>
        {list.length === 0 ? (
          view === 'mine' ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 48 }}>
              아직 참여 중인 모집이 없어요
            </Text>
          ) : view === 'watch' ? (
            <View style={{ alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: fs(36) }}>⭐</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginTop: 14 }}>
                관심 모집이 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                모집글의 별을 눌러 관심 모집으로 등록하세요
              </Text>
            </View>
          ) : view === 'match' ? (
            <View style={{ alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: fs(36) }}>🎯</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginTop: 14 }}>
                조건에 맞는 모집이 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                지금은 없지만 새 모집이 올라오면{'\n'}여기에 모여요
              </Text>
            </View>
          ) : (
            /* 빈 화면 가이드 — 친구·전체공개 탭에 실제 모집글처럼 보이는 예시 카드 + 말풍선
               실제 모집글이 들어오면 자동으로 사라짐 (list.length === 0 조건) */
            <View style={{ paddingTop: 12 }}>
              {/* 말풍선 안내 */}
              <View style={{ marginHorizontal: 4, marginBottom: 14, backgroundColor: '#F0E8D8',
                borderWidth: 1, borderColor: '#E2D2A8', borderRadius: 12, padding: 14 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#6B5A2E', lineHeight: 19 }}>
                  {view === 'friend'
                    ? '💬 친구들이 올리는 모집은 여기에 모여요'
                    : '🌐 모르는 사람들의 라운딩 모집이 여기에 모여요'}
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#6B5A2E', marginTop: 6, lineHeight: 17 }}>
                  {view === 'friend'
                    ? '내가 친구로 등록한 분들이 모집을 올리거나, 내가 친구공개로 올리면 여기서 보여요. 카카오톡으로 친구 초대하기부터 시작해보세요.'
                    : '모르는 분과의 매칭이 부담스러우면 친구 탭만 쓰셔도 돼요. 마이페이지에서 [친구 모집만 보기] 켜두면 전체 탭이 숨겨져요.'}
                </Text>
              </View>

              {/* 예시 모집글 카드 — 실제 PostCard와 유사한 디자인 */}
              <View style={{ position: 'relative' }}>
                {/* 워터마크 "예시" 라벨 */}
                <View style={{ position: 'absolute', top: -8, right: 10, zIndex: 1,
                  backgroundColor: C.charcoal, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter, letterSpacing: 1 }}>예시</Text>
                </View>
                <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
                  padding: 14, marginBottom: 10, opacity: 0.85 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                    <View style={{ backgroundColor: C.charcoal, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#fff' }}>확정형</Text>
                    </View>
                    <View style={{ backgroundColor: '#A8C5D6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: '#1A3D52' }}>
                        {view === 'friend' ? '친구공개' : '전체공개'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
                        {view === 'friend' ? '민지' : '주최자'}
                      </Text>
                      <Text style={{ fontSize: fs(13) }}>🥈</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>블루오션CC</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 3 }}>
                    2026.06.15 (토) · 07:00
                  </Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 8, lineHeight: 18 }}>
                    "{view === 'friend' ? '오랜만에 같이 라운딩 어때요?' : '편안한 분위기로 즐겁게 한 라운드 하실 분!'}"
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
                    backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: fs(13) }}>🔄</Text>
                    <Text style={{ fontFamily: F.en, fontSize: fs(13), color: C.charcoal }}>1/4</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>명</Text>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, marginLeft: 'auto' }}>모집중</Text>
                  </View>
                </View>
              </View>

              {/* CTA */}
              <View style={{ marginTop: 6, paddingHorizontal: 4 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', lineHeight: 17 }}>
                  ⬆ 실제 모집글이 올라오면 이렇게 보여요
                </Text>
                <TouchableOpacity onPress={tryOpenCreate} activeOpacity={0.85}
                  style={{ marginTop: 14, backgroundColor: C.burgundy, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>+ 첫 모집글 작성하기</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleOpenIntroManually} activeOpacity={0.85}
                  style={{ marginTop: 8, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal }}>📢 라운지 소개 다시 보기</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        ) : (
          list.map(p => (
            <PostCard key={p.id} post={p} myUid={myUid} joined={!!joined[p.id]} applied={!!applied[p.id]} waitlistNum={waitlist[p.id]}
              isBookmarked={!!bookmarks[p.id]}
              onApply={() => confirmApply(p.id)}
              onWaitlist={() => handleWaitlist(p.id)}
              onCancel={() => cancelParticipation(p.id)}
              onGradePress={(key) => setGradeModalKey(key)}
              onOpenDetail={() => setDetailId(p.id)}
              onToggleBookmark={() => toggleBookmark(p.id)} />
          ))
        )}
        {view === 'all' && list.length > 0 && (
          <View style={{ marginTop: 4, backgroundColor: C.paleSky + '33', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', lineHeight: 17 }}>
              🔒 라운딩 모집은 Firebase 연동 후 정식 오픈 예정이에요
            </Text>
          </View>
        )}
        {/* 모집글이 3개 이하일 때 안내 — 탭별 톤 분기.
            전체 탭: 동반자 조건 넓히기 (낯선 사람 풀 확장)
            친구 탭: 친구 늘리기 (친구공개 모집 풀 자체가 친구 수에 비례) */}
        {showSparseHint && (
          <View style={{ marginTop: 8, backgroundColor: '#F0E8D8', borderRadius: 12,
            borderWidth: 0.5, borderColor: '#E2D2A8', paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#8B6914', textAlign: 'center' }}>
              {view === 'friend' ? '친구 모집이 적어요' : '주변 모집글이 적어요'}
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center',
              marginTop: 4, lineHeight: 16 }}>
              {view === 'friend'
                ? '친구를 더 추가하면 친구공개 모집이 더 많이 모여요'
                : '연령대·실력 등 동반자 조건을 넓혀 모집해보세요'}
            </Text>
          </View>
        )}
      </ScrollView>

      <RoundupCreateModal visible={showCreate}
        onClose={() => { setShowCreate(false); setEditingPost(null); }}
        onCreate={handleCreate}
        initialPost={editingPost}
        friends={friends} />

      {/* 맞춤 모집 조건 설정 */}
      <RoundupMatchModal
        visible={showMatchModal}
        initial={userProfile.roundupMatch}
        onClose={() => setShowMatchModal(false)}
        onSave={saveRoundupMatch} />

      {/* 라운지 이용 안내 */}
      <RoundupGuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
      <RoundupIntroModal
        visible={showIntro}
        onClose={() => setShowIntro(false)}
        onCreatePress={tryOpenCreate} />

      {/* 신뢰 등급 설명 팝업 */}
      <TrustGradeModal visible={!!gradeModalKey} highlightKey={gradeModalKey}
        onClose={() => setGradeModalKey(null)} />

      {/* 모집 상세 화면 */}
      <RoundupDetail
        post={detailPost}
        myUid={myUid}
        friendUids={friendUids}
        visible={!!detailPost}
        joined={!!(detailId && joined[detailId])}
        applied={!!(detailId && applied[detailId])}
        waitlistNum={detailId ? waitlist[detailId] : undefined}
        isBookmarked={!!(detailId && bookmarks[detailId])}
        comments={detailId ? (commentsByPost[detailId] || []) : []}
        onClose={() => setDetailId(null)}
        onApply={() => detailId ? performJoinOrApply(detailId) : undefined}
        onWaitlist={() => detailId && handleWaitlist(detailId)}
        onCancel={() => detailId && performCancel(detailId)}
        onCancelWait={() => detailId && cancelWaitlist(detailId)}
        onDelete={() => detailId && handleDelete(detailId)}
        onGradePress={(key) => setGradeModalKey(key)}
        onToggleBookmark={() => detailId && toggleBookmark(detailId)}
        onBlock={handleBlock}
        onReport={handleReport}
        onKick={(target, reason) => detailId && handleKick(detailId, target, reason)}
        onRequestFriend={handleFriendRequest}
        onCancelFriendRequest={handleCancelFriendRequest}
        sentFriendRequestIds={sentFriendRequestIds}
        onEdit={() => detailPost && handleEditRequest(detailPost)}
        onAddComment={(c) => detailId && handleAddComment(detailId, c)}
        onDeleteComment={(commentId) => detailId && handleDeleteComment(detailId, commentId)}
        onPinComment={(commentId) => detailId && handlePinComment(detailId, commentId)} />

          {/* 매너 평가 모달 — 라운지 알림에서 진입 ([[manner-evaluation-policy]]) */}
          {(() => {
            const evalPost = posts.find(p => p.id === evaluatingPostId);
            if (!evalPost) return null;
            // 평가 대상 — 본인 제외 참여자 3명(4인 라운드 기준 더미). Phase 2엔 실제 participantUids에서 본인 제외.
            const names = pickNames(evalPost.id + ':eval', 3);
            const participants = names.map((n, i) => ({ id: `${evalPost.id}:e${i}`, name: n }));
            return (
              <MannerEvaluationModal
                visible={!!evaluatingPostId}
                post={evalPost}
                participants={participants}
                onClose={() => setEvaluatingPostId(null)}
                onSubmit={() => {
                  // 평가 제출 — 실제 집계는 Phase 2 Cloud Functions. 여기선 mannerEvaluationPending만 해제.
                  if (userProfile?.mannerEvaluationPending) {
                    const next = { ...userProfile, mannerEvaluationPending: false };
                    setUserProfile(next);
                    storage.save(STORAGE_KEYS.profile, next);
                  }
                }} />
            );
          })()}

          {/* 알림함 */}
          <RoundupNotifications
            visible={showNoti}
            notifications={notifications}
            onClose={() => setShowNoti(false)}
            onOpenPost={openNotiPost}
            onReadAll={readAllNoti}
            onAccept={acceptApply}
            onReject={rejectApply}
            onGradePress={(key) => setGradeModalKey(key)}
            onDelete={deleteNoti}
            onClearAll={clearAllNoti} />

          {/* 참여 확인 팝업 */}
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />

          {/* 라운지 소개 FAB — MY 탭의 라운딩 기록 추가 버튼과 동일 위치·스타일.
              노란 점은 사용자가 아직 FAB을 직접 눌러본 적 없을 때 노출 — 버건디 배경과 대비. */}
          <TouchableOpacity onPress={handleOpenIntroManually} activeOpacity={0.85}
            style={{ position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
              backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: fs(30) }}>📢</Text>
            {!roundupIntroOpenedManually && (
              <View style={{ position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 4.5,
                backgroundColor: '#FFD700', borderWidth: 1.5, borderColor: '#fff', zIndex: 10, elevation: 10 }} />
            )}
          </TouchableOpacity>
    </>
  );

  if (asScreen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
        {body}
      </SafeAreaView>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {body}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
