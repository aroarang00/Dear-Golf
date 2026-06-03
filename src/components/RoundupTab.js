import React, { useState, useEffect, useContext, useRef } from 'react';
import { Modal, View, ScrollView, RefreshControl, Text, TouchableOpacity, Platform } from 'react-native';

// Android는 같은 px 패딩에도 카드 박스가 시각적으로 더 커 보임(폰트 metrics 차이 누적).
// 라운지 카드 한정 안드 컴팩트 보정 — 다른 화면은 검증 후 단계 확장.
const _and = Platform.OS === 'android';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { RoundupCreateModal } from './RoundupCreateModal';
import { InvitationCard } from './InvitationCard';
import { InvitationTicket } from './InvitationTicket';
import { MannerEvaluationModal } from './MannerEvaluationModal';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { OverlayAlert } from './common/OverlayAlert';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { RoundupDetail } from './RoundupDetail';
import { RoundupNotifications } from './RoundupNotifications';
import { ScheduleReminderPopup } from './ScheduleReminderPopup';
import { SCOPE_BADGE, tagStyle, REGION_OPTIONS, ROUNDUP_PUBLIC_ENABLED, waitlistRespondHours, matchesRoundup, hasRoundupMatch, isRoundupConfirmed } from '../constants/roundup';
import { ROUTES } from '../constants/routes';
import { RoundupMatchModal } from './RoundupMatchModal';
import { RoundupGuideModal } from './RoundupGuideModal';
import { RoundupIntroModal } from './RoundupIntroModal';
import { isPostVisible, blockUser, unblockUser, remainingBlocksToday } from '../utils/block';
import { blockUid as fsBlockUid, loadMyFriends } from '../utils/friends';
import { loadMyNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, createNotification, createInviteNotifications, createScheduleNotices } from '../utils/roundupNotifications';
import { loadMyEvaluationsForRoundup } from '../utils/mannerEvaluations';
import { db } from '../utils/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getCancelWarningByHours, isD7Inside } from '../constants/mannerGrade';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';
import { applyDefaultAlarms } from '../utils/notifications';
import { loadAllRoundups, loadMyRoundups, loadFriendRoundups, loadSelectRoundupsForMe, loadRoundup, createRoundup, updateRoundupAsAuthor, deleteRoundup, cancelRoundupByHost, applyToRoundup, cancelApplication, joinRoundup, leaveRoundup, loadMyApplications, joinWaitlist, leaveWaitlist, acceptApplication, rejectApplication, closeRoundup, toggleRoundupLike } from '../utils/roundup';
import { loadComments, loadOlderComments, countComments, COMMENT_MAX_TOTAL, addCommentToFirestore, deleteCommentFromFirestore, pinCommentInFirestore } from '../utils/comments';
import { getUid } from '../utils/firebase';

// posts/comments/notifications — Phase 3-A에서 Firestore 직결로 전환.
// joined/applied/waitlist는 Phase 3-C/D에서 loadMyApplications 등으로 복원 예정.

function PostCard({ post, myUid, joined, applied, waitlistNum, isBookmarked, onApply, onWaitlist, onCancel, onGradePress, onOpenDetail, onToggleBookmark, onToggleLike, onHide }) {
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

  // 마감(확정·만석) 모집은 회색 처리로 시각 구분 — 숨기진 않음(대기신청 동선 유지). 마감 풀리면 자동 복귀.
  //  내 모집·내 참여/신청/대기 건은 회색 처리 제외(본인 활동은 또렷하게).
  const isMyActivity = isMine || joined || applied || waitlistNum;
  const dimmed = isClosed && !isMyActivity;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onOpenDetail}
      // 길게 눌러 가리기 — 내 화면에서만 숨김([[roundup-hide-policy]]). 내가 올린 모집은 가리기 불가.
      onLongPress={(!isMine && onHide) ? () => onHide(post.id) : undefined}
      delayLongPress={400}
      style={{ backgroundColor: dimmed ? C.bgPrimary : C.bgSecondary, borderRadius: 14, borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.07)', opacity: dimmed ? 0.65 : 1,
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
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal }}>{post.authorName || post.author}</Text>
          {/* 좋아요(응원) — 이름 옆, 모두 공개([[roundup-friend-redesign]]). 주최자 본인은 카운트만 */}
          {(() => {
            const likeCount = Array.isArray(post.likedBy) ? post.likedBy.length : 0;
            const liked = !!myUid && Array.isArray(post.likedBy) && post.likedBy.includes(myUid);
            const inner = (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: fs(13), color: liked ? '#E0506A' : C.warmGrayLight }}>{liked ? '♥' : '♡'}</Text>
                {likeCount > 0 && <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: liked ? '#E0506A' : C.warmGray }}>{likeCount}</Text>}
              </View>
            );
            return isMine ? inner : (
              <TouchableOpacity onPress={onToggleLike ? () => onToggleLike(post.id) : undefined} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                {inner}
              </TouchableOpacity>
            );
          })()}
          {/* 신뢰등급 배지 — 친구모집(전체공개 OFF)에선 검증 의미 없어 숨김. 전체공개 부활 시 복귀 */}
          {ROUNDUP_PUBLIC_ENABLED && <TrustBadge grade={authorGrade} onPress={() => onGradePress(authorGrade.key)} />}
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

      {/* 라운딩 성격 태그 — 카드에 노출해 친구모집을 풍성하게([[roundup-friend-redesign]]).
          구성·연령대·실력(데모그래픽) 뱃지는 정보 밀도 절감 위해 상세에서만. */}
      {Array.isArray(post.tags) && post.tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: _and ? 6 : 8 }}>
          {post.tags.slice(0, 4).map(t => {
            const ts = tagStyle(t);
            return (
              <View key={t} style={{ backgroundColor: ts.soft, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: ts.deep }}>#{t}</Text>
              </View>
            );
          })}
          {post.tags.length > 4 && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, alignSelf: 'center' }}>+{post.tags.length - 4}</Text>
          )}
        </View>
      )}

      {post.word ? (
        <Text numberOfLines={2} style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: _and ? 6 : 8, lineHeight: 18 }}>"{post.word}"</Text>
      ) : null}

      {/* 모집 현황 — 카드에서는 총원만 한 줄. 팀별 디테일은 상세 화면에서. 게스트(앱 미사용자)가 있으면 명시. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: _and ? 9 : 12,
        backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: _and ? 6 : 8 }}>
        <Text style={{ fontSize: fs(13) }}>{allFull ? '✅' : '🔄'}</Text>
        <Text style={{ fontFamily: F.en, fontSize: fs(13), color: C.charcoal }}>{total}/{capTotal}</Text>
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
  const { schedules, addSchedule, editSchedule, removeSchedule } = useContext(SchedulesContext);
  const [myUid, setMyUid] = useState(null);
  const [friendUids, setFriendUids] = useState([]); // Phase 3-F5: 친구 uid 목록 (친구공개 모집 필터·로드)
  const [friends, setFriends] = useState([]);        // Phase 3-F6: { id, name } — 친구지정 모달 등 표시용
  const [posts, setPosts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);   // 당겨서 새로고침 ([[roundup-refresh]])
  const [refreshTick, setRefreshTick] = useState(0);     // 증가 시 아래 로드 effect 재실행
  const [joined, setJoined] = useState({});            // Phase 3-C: loadMyApplications 등에서 채움
  const [applied, setApplied] = useState({});          // Phase 3-C: 전체공개 신청 대기
  const [waitlist, setWaitlist] = useState({});        // Phase 3-D: waitlistUids에서 복원
  const [participantNames, setParticipantNames] = useState({}); // {uid: nickname} — 참여자 현황 실제 이름
  const [bookmarks, setBookmarks] = useState({});      // 관심 모집 {postId: true}
  const [hidden, setHidden] = useState({});            // 가리기 — 길게 눌러 숨긴 모집 {postId: true}
  // 댓글 — { [postId]: [comment...] }. Firebase 마이그레이션 시 서브컬렉션 roundups/{postId}/comments로 이관.
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentsTotal, setCommentsTotal] = useState({});   // {postId: 총 댓글 수} — 작성 한도·이전댓글 보기 판단
  // 친구 모집만 보기 토글 — true면 '전체' 탭 숨김 + 기본 view 'friend'
  // ROUNDUP_PUBLIC_ENABLED=false면 앱 전역으로 전체공개 비활성화 ([[roundup-public-disabled]])
  const hideStranger = !ROUNDUP_PUBLIC_ENABLED || !!userProfile?.hideStrangerRoundups;
  const [view, setView] = useState(hideStranger ? 'friend' : 'all');  // all | friend | mine | watch
  const [regionFilter, setRegionFilter] = useState('all'); // 전체 탭 지역 칩 (all 외엔 capital/gangwon/chungcheong/jeolla/gyeongsang/jeju)

  // 토글이 켜진 상태에서 view가 'all'이면 자동으로 'friend'로 전환
  useEffect(() => {
    if (hideStranger && view === 'all') setView('friend');
  }, [hideStranger, view]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPost, setEditingPost] = useState(null);  // 수정 모드 — 모집글 id 매칭용 원본
  const [evaluatingPostId, setEvaluatingPostId] = useState(null); // 매너 평가 모달 — postId
  const [evalPostData, setEvalPostData] = useState(null); // 평가 대상 모집 — 취소·만료로 posts에 없을 때 개별 로드분
  const [evalVersion, setEvalVersion] = useState(0); // 평가 제출 시 pending 동적 재계산 트리거

  // Phase 3-A/C/F5 — 마운트 시 내 uid + 친구 + Firestore 모집글(전체·내·친구공개) + 참여·신청 상태 로드.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const uid = await getUid();
        if (cancelled) return;
        setMyUid(uid);
        // 1차: 내 친구 + 내 신청 + 전체공개·내 모집 + 나에게 보이는 친구지정 모집 병렬
        const [friendsList, myApps, allPosts, minePosts, selectForMe] = await Promise.all([
          loadMyFriends(),
          loadMyApplications(),
          loadAllRoundups(),
          loadMyRoundups(),
          // 인덱스 미배포·오류 시에도 라운지 전체 로드는 살아있게 개별 catch (친구지정 부분만 빈 배열)
          loadSelectRoundupsForMe(uid).catch(() => []),
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
        const realFriends = fUids.map((u, i) => ({
          id: u,
          name: friendUserSnaps[i]?.exists() ? (friendUserSnaps[i].data().nickname || '친구') : '친구',
        }));
        // TEMP_DEV_INVITE — 친구 없어도 친구지정/초대장 흐름 혼자 테스트용 더미 친구 주입 ([[roundup-invitation]]). 출시 전 제거.
        setFriends(__DEV__ ? [...realFriends, { id: 'dev_friend_1', name: '테스트친구A' }, { id: 'dev_friend_2', name: '테스트친구B' }] : realFriends);
        const friendPosts = friendPostsArrays.flat();
        // 같은 모집글이 양쪽에 중복으로 잡힐 수 있으니 id 기준 dedupe
        const map = new Map();
        for (const p of [...allPosts, ...minePosts, ...friendPosts, ...selectForMe]) map.set(p.id, p);
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
        // 참여자 이름 — 모든 모집의 participantUids 닉네임 로드 (참여자 현황에 실제 이름 표시, 더미 이름 제거)
        const partUidSet = new Set();
        for (const p of merged) {
          if (Array.isArray(p.participantUids)) {
            p.participantUids.forEach(u => { if (u && u !== uid) partUidSet.add(u); });
          }
        }
        const partUids = Array.from(partUidSet);
        if (partUids.length > 0) {
          const partSnaps = await Promise.all(
            partUids.map(u => getDoc(doc(db, 'users', u)).catch(() => null)));
          if (cancelled) return;
          const nameMap = {};
          partSnaps.forEach((s, i) => { if (s?.exists()) nameMap[partUids[i]] = s.data().nickname || '동반자'; });
          setParticipantNames(nameMap);
        }
        // 인앱 알림 로드 — Phase 3-N2
        try {
          const notis = await loadMyNotifications(50);
          if (!cancelled) setNotifications(notis);
        } catch (e) {
          if (__DEV__) console.warn('[RoundupTab] notifications load failed', e?.message);
        }
      } catch (e) {
        if (__DEV__) console.warn('[RoundupTab] initial load failed', e);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTick]);
  // 당겨서 새로고침 — refreshTick 증가로 위 로드 effect 재실행 ([[roundup-refresh]])
  const onRefresh = () => { setRefreshing(true); setRefreshTick(t => t + 1); };

  // 좋아요(응원) 토글 — 낙관적 갱신 후 Firestore, 실패 시 롤백. 주최자 본인 글은 무시.
  const toggleLike = async (postId) => {
    if (!myUid) return;
    const post = posts.find(p => p.id === postId);
    if (!post || post.authorUid === myUid) return;
    const liked = Array.isArray(post.likedBy) && post.likedBy.includes(myUid);
    const setLiked = (add) => setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const cur = Array.isArray(p.likedBy) ? p.likedBy.filter(u => u !== myUid) : [];
      return { ...p, likedBy: add ? [...cur, myUid] : cur };
    }));
    setLiked(!liked);
    try {
      await toggleRoundupLike(postId, liked);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] like toggle failed', e?.message);
      setLiked(liked); // 롤백
    }
  };
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

  // 매너평가 pending 동적 계산 — 미평가 매너 알림(mannerEval/hostCancelledD7)이 있으면 true.
  // 평가를 제출하면 loadMyEvaluationsForRoundup에 기록이 생겨 자동 해제(다건 추적, 단일 boolean 한계 없음).
  // data.js: pending=true면 신규 모집 신청 제한. functions·동기화 불필요(알림 기반 클라 계산).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 친구모집 전용(전체공개 OFF) 동안은 매너평가 비활성 — 친구끼린 서로 평가하지 않음(A안, [[roundup-friend-redesign]])
      if (!ROUNDUP_PUBLIC_ENABLED) {
        if (!cancelled) setUserProfile(prev => (prev.mannerEvaluationPending ? { ...prev, mannerEvaluationPending: false } : prev));
        return;
      }
      const postIds = [...new Set(
        notifications.filter(n => n.type === 'mannerEval' || n.type === 'hostCancelledD7')
          .map(n => n.postId).filter(Boolean)
      )];
      let pending = false;
      for (const pid of postIds) {
        try {
          const mine = await loadMyEvaluationsForRoundup(pid);
          if (!mine || mine.length === 0) { pending = true; break; }  // 한 건도 평가 안 한 라운딩 있음
        } catch { /* 조회 실패는 pending 판정에서 무시 */ }
      }
      if (cancelled) return;
      setUserProfile(prev => (prev.mannerEvaluationPending === pending ? prev : { ...prev, mannerEvaluationPending: pending }));
    })();
    return () => { cancelled = true; };
  }, [notifications, evalVersion]);

  // 상세 진입 시 댓글 로드 — Firestore 서브컬렉션 (roundups/{id}/comments). 닫히면 정리 X(캐시 유지).
  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    loadComments(detailId)
      .then(list => { if (!cancelled) setCommentsByPost(prev => ({ ...prev, [detailId]: list })); })
      .catch(e => __DEV__ && console.warn('[RoundupTab] loadComments failed', e?.message));
    countComments(detailId)
      .then(n => { if (!cancelled) setCommentsTotal(prev => ({ ...prev, [detailId]: n })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [detailId]);

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

  // 가리기 — 마운트 시 로드, 변경 시 저장 (북마크와 같은 패턴)
  const [hiddenHydrated, setHiddenHydrated] = useState(false);
  useEffect(() => {
    storage.load(STORAGE_KEYS.roundupHidden, {}).then(h => {
      setHidden(h || {});
      setHiddenHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (!hiddenHydrated) return;
    storage.save(STORAGE_KEYS.roundupHidden, hidden);
  }, [hidden, hiddenHydrated]);

  // 모집 가리기 — 길게 눌러 내 화면에서만 숨김. 확인창 후 처리(실수 방지), 해제 UI 없음([[roundup-hide-policy]]).
  const hideRoundup = (id) => {
    setAlert({
      title: '이 모집을 가릴까요?',
      message: '내 라운지 목록에서만 안 보이게 돼요.\n상대방은 알 수 없어요.\n한 번 가리면 되살릴 수 없어요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '가리기', onPress: () => {
          setHidden(prev => ({ ...prev, [id]: true }));
          if (detailId === id) setDetailId(null);
        } },
      ],
    });
  };

  // 모집 확정 → 예정 라운딩 자동 등록
  // 조건: 확정형 + 주최자가 '확정'(closed=true) + (내가 주최자 || 참여 확정자)
  // ★확정이 유일한 등록 분기점 — 만석만으론 등록 X(주최자가 확정 눌러야). [[roundup-friend-redesign]]
  // 중복 방지: schedules[].roundupId === post.id 로 식별
  useEffect(() => {
    const toAdd = [];
    for (const p of posts) {
      if (p.type !== 'fixed' || !p.date || !p.course) continue;
      const isMine = !!myUid && p.authorUid === myUid;
      const isJoined = !!joined[p.id];
      if (!isMine && !isJoined) continue;
      if (!p.closed) continue; // 확정 전까지는 등록 안 함
      const compCount = p.teams > 1 ? 0 : (p.companions?.length || 0);
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

  // 모집 취소 정리 — roundupCancelled 알림이 온 모집으로 만들어졌던 본인 일정 자동 제거 (주최자 삭제 대응).
  //  주석 [[roundup-friend-redesign]]: 주최자 취소 시 참여자도 일정에서 빠져야 함. removeSchedule은 멱등(없으면 no-op).
  useEffect(() => {
    const cancelledIds = new Set(
      notifications.filter(n => n.type === 'roundupCancelled' && n.postId).map(n => n.postId)
    );
    if (cancelledIds.size === 0) return;
    for (const s of schedules) {
      if (s.roundupId && cancelledIds.has(s.roundupId)) {
        removeSchedule(s.id).catch(e => __DEV__ && console.warn('[RoundupTab] cancelled-roundup schedule cleanup fail', e?.message));
      }
    }
  }, [notifications, schedules, removeSchedule]);

  // 라운지 노출 윈도우 — 티오프 + 5h(라운딩 끝날 무렵) 이내만 노출, 이후 사용자 UI에서 감춤
  //   끝난 라운딩이 계속 떠 있지 않게. 댓글 닫힘(COMMENT_OPEN_HOURS=5)과 동일 시점 (2026-06-02 24h→5h).
  // (시스템 데이터는 [[data-retention]]에 따라 별도 보관: 일반 1년 / 분쟁 이력 모집글 3년)
  // 오픈형(date 미정)은 항상 노출. 마이페이지 "내 라운지 활동"은 별도 화면(이 필터 미적용).
  const isInVisibleWindow = (p) => {
    if (!p.date) return true; // 오픈형 — 날짜 미정이므로 노출
    const [y, m, d] = p.date.split('.').map(Number);
    const [hh, mm] = (p.time || '07:00').split(':').map(Number);
    const teeOff = new Date(y, m - 1, d, hh, mm).getTime();
    if (Number.isNaN(teeOff)) return true;
    return Date.now() <= teeOff + 5 * 3600 * 1000;
  };

  // 차단 필터 — 내가 차단한 사람의 모집 + 나를 차단한 사람의 모집은 어디서도 안 보임
  // (단, 내가 직접 올린 모집은 mine 탭에서 항상 보임. joined/applied/waitlist도 본인 활동 보존)
  //  가리기(hidden) 필터 — 내가 길게 눌러 숨긴 모집은 탐색 탭에서 제외.
  //   내가 올린 모집·참여/신청/대기 중인 모집은 숨겨도 mine 탭엔 보존(본인 활동 우선) — mineTab은 이 필터 미적용.
  const visiblePosts = posts.filter(p => isPostVisible(p, userProfile) && isInVisibleWindow(p) && !hidden[p.id]);

  // 탭별 목록 — 전체: 전체공개만 (+ 지역 필터) / 친구: 친구공개 모집만 (친구가 올린 것 + 내가 올린 것) / 내 참여 중 / 관심
  const allTab = visiblePosts
    .filter(p => p.scope === 'all')
    .filter(p => regionFilter === 'all' || p.region === regionFilter);
  // 친구 탭 — 친구공개(friends) + 나에게 보이는 친구지정(select)을 함께 노출 (친구 대상 모집의 단일 진입)
  //   친구지정 수신자 노출은 audienceUids 기준(loadSelectRoundupsForMe가 이미 필터, 여기선 방어적 재확인)
  const friendTab = visiblePosts.filter(p => {
    if (p.scope === 'friends') {
      if (!!myUid && p.authorUid === myUid) return true;
      return friendUids.includes(p.authorUid);
    }
    // 친구지정(select)은 사적 초대 → 친구 브라우즈에 노출 X. 내 참여 탭(mineTab)에만 (2026-06-03)
    return false;
  });
  // mine 탭은 내가 직접 관여한 모집이므로 차단 필터는 무시하되, 티오프+5h 윈도우는 동일 적용
  // (지난 라운딩의 본인 활동 이력은 마이페이지 "내 라운지 활동"에서 별도 조회)
  const mineTab = posts.filter(p => {
    // 친구지정(select) 수신자 — 아직 미참여여도 내 참여 탭에 초대로 노출 (친구 탭엔 안 보이므로 여기서 받음)
    const amSelectRecipient = p.scope === 'select' && Array.isArray(p.audienceUids) && !!myUid && p.audienceUids.includes(myUid);
    return ((!!myUid && p.authorUid === myUid) || joined[p.id] || applied[p.id] || waitlist[p.id] || amSelectRecipient) && isInVisibleWindow(p);
  });
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
        // 팀 수 변경 반영 — buildPayload엔 teamJoined가 없어, 새 팀 수에 맞춰 재구성한다.
        //   (기존 팀 인원 보존 + 새로 생긴 팀은 0, 단체→개별 전환 시 [1]).
        //   이게 빠져서 2→4 팀 수정이 화면·정원에 안 먹던 버그.
        const prevTJ = Array.isArray(editingPost.teamJoined) ? editingPost.teamJoined : [];
        const nextPost = {
          ...post,
          teamJoined: (post.teams || 1) > 1
            ? Array.from({ length: post.teams }, (_, i) => prevTJ[i] ?? 0)
            : [1],
        };
        await updateRoundupAsAuthor(eid, nextPost);
        setPosts(prev => prev.map(p => p.id === eid ? { ...p, ...nextPost } : p));
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
      // serverTimestamp는 클라에서 즉시 안 풀려 정렬 0이 됨 → 방금 만든 글이 맨 위에 오도록 ts 부여
      setPosts(prev => [{ ...created, ts: Date.now() }, ...prev]);
      // 친구지정·포함 = 개인 초대장 → 선택 친구에게 초대 알림 1회(멱등) ([[roundup-invitation]])
      if (created.scope === 'select' && created.selectMode === 'include' && Array.isArray(created.selectedUids) && created.selectedUids.length) {
        createInviteNotifications(created.id, created.course || '', created.selectedUids, userProfile?.nickname || '')
          .catch(e => __DEV__ && console.warn('[RoundupTab] invite noti failed', e?.message));
      }
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] handleCreate failed', e);
      setAlert({
        title: '모집글 저장에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
    }
  };

  // 모집글 수정 진입 — 시점 분기 후 RoundupCreateModal을 edit mode로 띄움 ([[roundup-edit-policy]] §1).
  // 모달 중첩 패턴 — RoundupDetail 닫고 부모 모달 열기 ([[modal-navigation-pattern]]).
  const handleEditRequest = (post) => {
    if (!post) return;
    // 수정 차단 기준을 "확정(closed)"으로 통일 (2026-05-30, [[roundup-edit-policy]] §1 개정).
    //   확정 모집만 D-7 이내 수정 차단(약속 보호). 결원으로 확정 해제(closed:false)되면 수정 자유 + 재모집.
    //   매너 -5·모집확정 표시와 동일하게 closed 기준 — 모든 분기 일관.
    if (post.closed && post.date) {
      const [y, m, d] = post.date.split('.').map(Number);
      const [hh, mm] = (post.time || '07:00').split(':').map(Number);
      const target = new Date(y, m - 1, d, hh, mm);
      const hoursUntil = (target - new Date()) / 3600000;
      if (isD7Inside(hoursUntil)) {
        setAlert({
          title: '확정된 라운딩이라 수정이 어려워요',
          message: '확정된 라운딩을 보호하기 위해 모집글을 수정할 수 없어요.\n부득이한 사유라면 [모집 취소] 후 다시 등록해주세요.',
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
      // 실패 알림은 호출 측에서 표시 — 모달(RoundupDetail)·카드(confirmApply) 양쪽 모두
      // ok:false 반환을 받아 자체 OverlayAlert를 띄운다. 여기서 setAlert하면 모달 경로에서
      // 부모(모달 뒤 가려짐)·자식 alert가 이중으로 떠서 제거함.
      return { ok: false, message: e?.message };
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
        { text: instant ? '참여하기' : '참여 신청', onPress: async () => {
          // 카드(비모달) 경로 — 실패 시 여기서 직접 alert (모달 경로는 RoundupDetail이 자체 표시)
          const r = await performJoinOrApply(id);
          if (r && r.ok === false) {
            setAlert({
              title: '참여 처리에 실패했어요',
              message: __DEV__ && r.message ? r.message : '잠시 후 다시 시도해 주세요.',
              buttons: [{ text: '확인' }],
            });
          }
        } },
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
      // leaveRoundup이 closed:false도 함께 처리 → 확정 해제 + 자리 다시 열기 ([[roundup-penalty-policy]] §4, 2026-05-30)
      //  ※ 취소자 매너 -5는 별개 분기(취소 시점 상태로 이미 판정) — 확정 해제와 양립.
      await leaveRoundup(id);
      // 1) 모집글 인원 -1 (마지막 채워진 자리에서) + 확정 해제
      setPosts(prev => prev.map(p => {
        if (p.id !== id) return p;
        if (p.teams > 1) {
          const tj = [...p.teamJoined];
          for (let i = tj.length - 1; i >= 0; i--) {
            if (tj[i] > 0) { tj[i] -= 1; break; }
          }
          return { ...p, teamJoined: tj, closed: false };
        }
        return { ...p, joined: Math.max(0, (p.joined || 0) - 1), closed: false };
      }));
      // 2) 내 joined 플래그 해제
      setJoined(prev => { const n = { ...prev }; delete n[id]; return n; });
      // 3) 확정 때 생성됐던 본인 일정 제거 (취소했으니 일정에서도 빠짐). 오픈형 등 일정 없으면 no-op.
      const linkedSched = schedules.find(s => s.roundupId === id);
      if (linkedSched) {
        removeSchedule(linkedSched.id).catch(e => __DEV__ && console.warn('[RoundupTab] cancel schedule remove fail', e?.message));
      }
      // 4) 친구지정 초대를 수락→취소한 수신자는 초대 카드가 다시 뜨지 않게 가림 (사적 초대 — 재초대는 주최자가)
      if (post.scope === 'select' && post.authorUid !== myUid) hideRoundup(id);
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
    // 안내 3분기 (2026-05-30) — RoundupDetail.confirmCancel과 동일 문구.
    // 매너 차감은 전체공개+D-7이내+확정만 (친구모집은 시스템 제재 예외).
    const insideD7 = isD7Inside(hoursUntil);
    // (1) 전체공개 + D-7 이내 + 모집확정 — 매너 점수 차감 분기
    if (post.scope === 'all' && insideD7 && isRoundupConfirmed(post)) {
      setAlert({
        title: '확정된 라운딩 취소',
        message: '확정된 라운딩이라 지금 취소하면\n매너 점수가 차감될 수 있어요.\n\n사전 안내 없이 나타나지 않으면\n노쇼로 신고받을 수 있으니\n부득이한 사정이라면 댓글로 양해를 구해주세요.',
        buttons: [
          { text: '계속 참여', style: 'cancel' },
          { text: '취소하기', style: 'destructive', onPress: () => performCancel(id) },
        ],
      });
      return;
    }
    // (2) D-7 이내 + 미확정(또는 친구모집) — 패널티 없음, 임박 안내만
    if (insideD7) {
      setAlert({
        title: '라운딩이 며칠 안 남았어요',
        message: '라운딩 날짜가 가까워요.\n정말 취소하시겠어요?\n취소하면 자리는 다시 열려요.',
        buttons: [
          { text: '계속 참여', style: 'cancel' },
          { text: '취소하기', style: 'destructive', onPress: () => performCancel(id) },
        ],
      });
      return;
    }
    // (3) D-7 이전 — 자유 취소, 약속 존중 톤
    setAlert({
      title: '참여를 취소할까요?',
      message: '참여 확정된 라운딩이에요.\n신중하게 생각하고 취소해 주세요.\n취소하면 자리는 다시 열려요.',
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

  // 주최자 모집 확정 — 만석 상태에서만 호출(UI에서 보장). closed:true → 매너 -5 분기 활성 ([[roundup-penalty-policy]] §1)
  const handleConfirmRoundup = async (id) => {
    try {
      await closeRoundup(id);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] closeRoundup failed', e);
      setAlert({ title: '모집 확정에 실패했어요', message: '잠시 후 다시 시도해 주세요.', buttons: [{ text: '확인' }] });
      return;
    }
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, closed: true } : p)));
  };

  // 내 모집글 삭제/취소 — 로컬 정리 후 상세 닫기.
  // softCancel=true(D-7 이내+전체공개+확정자): 하드 삭제 대신 소프트 취소(문서 보존)로 보상 매너평가 윈도우 발동.
  const handleDelete = async (id, softCancel = false) => {
    const cancelledPost = posts.find(p => p.id === id);
    try {
      if (softCancel) await cancelRoundupByHost(id);
      else await deleteRoundup(id);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] handleDelete failed', e);
      setAlert({
        title: '삭제에 실패했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
      return;
    }
    // 주최자 모집 취소 → 참여자 전원에게 알림(주최자 제외). 일정에서 빠지는 거라 필수 ([[roundup-friend-redesign]])
    const cancelledFor = (cancelledPost?.participantUids || []).filter(u => u && u !== myUid);
    for (const uid of cancelledFor) {
      createNotification({
        type: 'roundupCancelled',
        recipientUid: uid,
        actorName: userProfile?.nickname || '',
        postId: id,
        postTitle: cancelledPost?.course || '',
      }).catch(e => __DEV__ && console.warn('[RoundupTab] roundupCancelled noti fail', e?.message));
    }
    // 주최자 본인 일정에서도 제거 (확정 때 생성됐던 것). 참여자 일정은 roundupCancelled 알림 수신 시 각 클라가 정리.
    const myLinkedSched = schedules.find(s => s.roundupId === id);
    if (myLinkedSched) {
      removeSchedule(myLinkedSched.id).catch(e => __DEV__ && console.warn('[RoundupTab] host-delete schedule remove fail', e?.message));
    }
    setPosts(prev => prev.filter(p => p.id !== id));
    setCommentsByPost(prev => { const n = { ...prev }; delete n[id]; return n; });
    setDetailId(null);
  };

  // 댓글 — Firestore 서브컬렉션(roundups/{postId}/comments) 연동 (2026-05-30, [[roundup-comments-policy]]).
  //  비속어/권한 사전검증은 RoundupComments·utils, 최종 저장은 Firestore. 쓰기 후 재로드로 정합성 보장.
  //  알림(comment 타입 주최자+참여자 발송)은 Phase 2 Cloud Function — 현재 단계 X.
  const handleAddComment = async (postId, comment) => {
    // 총 300개 작성 한도 — 도달 시 작성 차단 (클라 측, 친구 범위라 충분)
    if ((commentsTotal[postId] || 0) >= COMMENT_MAX_TOTAL) {
      setAlert({ title: '댓글이 가득 찼어요', message: `댓글은 최대 ${COMMENT_MAX_TOTAL}개까지 작성할 수 있어요.`, buttons: [{ text: '확인' }] });
      return;
    }
    try {
      const r = await addCommentToFirestore(postId, userProfile?.nickname || '', comment?.body || '');
      if (!r.ok) return; // 비속어·빈값은 RoundupComments가 이미 인라인 차단 (이중 안전망)
      const list = await loadComments(postId);
      setCommentsByPost(prev => ({ ...prev, [postId]: list }));
      setCommentsTotal(prev => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] addComment failed', e);
      setAlert({ title: '댓글 작성에 실패했어요', message: '잠시 후 다시 시도해 주세요.', buttons: [{ text: '확인' }] });
    }
  };

  // 이전 댓글 보기 — 현재 로드된 것 중 가장 오래된 것보다 더 이전 100개를 추가 로드·병합 (중복 제거)
  const handleLoadOlderComments = async (postId) => {
    const cur = commentsByPost[postId] || [];
    if (cur.length === 0) return;
    // 커서는 '연속 페이지'의 가장 오래된 댓글 기준 — 별도 병합된 고정 댓글(범위 밖 outlier) 제외
    const nonPinned = cur.filter(c => !c.pinned);
    const base = nonPinned.length ? nonPinned : cur;
    const oldestMs = Math.min(...base.map(c => c.createdAt || Infinity));
    try {
      const older = await loadOlderComments(postId, oldestMs);
      if (older.length === 0) return;
      setCommentsByPost(prev => {
        const byId = new Map((prev[postId] || []).map(c => [c.id, c]));
        older.forEach(c => { if (!byId.has(c.id)) byId.set(c.id, c); });
        return { ...prev, [postId]: Array.from(byId.values()) };
      });
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] loadOlderComments failed', e?.message);
    }
  };

  // 동반자에게 일정 알리기 — 주최자가 확정 동반자 전원에게 리마인드 발송 ([[project_roundup_kakao_chat]]).
  //  RoundupDetail이 즉시 안내 alert을 띄우고, 실제 fan-out은 여기서. 횟수 제한 없음.
  const handleNotifySchedule = async (post) => {
    const recipients = (post?.participantUids || []).filter(u => u && u !== myUid);
    if (recipients.length === 0) return 0;
    try {
      return await createScheduleNotices(post, recipients, userProfile?.nickname || '');
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] notifySchedule failed', e?.message);
      return 0;
    }
  };

  // 일정 리마인드 팝업 확인 — 같은 모집(postId)의 알림만 읽음 처리.
  //  여러 확정 모집의 알림이 쌓이면 모집 단위 큐로 하나씩 표시(다른 모집은 다음 팝업으로 이어짐).
  //  같은 모집 중복 발송(주최자 여러 번 누름)은 함께 정리.
  const handleConfirmReminder = (postId) => {
    const ids = notifications.filter(n => n.type === 'scheduleNotice' && !n.read && n.postId === postId).map(n => n.id);
    if (ids.length === 0) return;
    setNotifications(prev => prev.map(n => (ids.includes(n.id) ? { ...n, read: true } : n)));
    ids.forEach(id => markNotificationRead(id).catch(() => {}));
  };

  // 댓글 삭제 — 본인 댓글만 (규칙 authorUid==me 강제 + RoundupComments 사전 차단). 낙관적 제거.
  const handleDeleteComment = async (postId, commentId) => {
    setCommentsByPost(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(c => c.id !== commentId) }));
    setCommentsTotal(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 1) - 1) }));
    try {
      await deleteCommentFromFirestore(postId, commentId);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] deleteComment failed', e);
      const list = await loadComments(postId).catch(() => null);
      if (list) setCommentsByPost(prev => ({ ...prev, [postId]: list })); // 실패 시 서버 상태로 롤백
      countComments(postId).then(n => setCommentsTotal(prev => ({ ...prev, [postId]: n }))).catch(() => {});
    }
  };

  // 댓글 고정 토글 — 주최자만(RoundupDetail에서 권한 체크). 한 모집글당 1개 유지(기존 고정 자동 해제).
  const handlePinComment = async (postId, commentId) => {
    try {
      await pinCommentInFirestore(postId, commentId, commentsByPost[postId] || []);
      const list = await loadComments(postId);
      setCommentsByPost(prev => ({ ...prev, [postId]: list }));
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] pinComment failed', e);
      setAlert({ title: '고정 처리에 실패했어요', message: '잠시 후 다시 시도해 주세요.', buttons: [{ text: '확인' }] });
    }
  };

  // 주최자 — 참여 신청 수락. Firestore: applications accepted + roundup participantUids/joined +1.
  //  ※ 알림 status는 보안규칙상 read만 수정 가능 → 로컬만 갱신. 리로드 시 pending으로 복귀하나,
  //    participantUids 포함 여부로 중복 수락(정원 중복 +1)을 막는다. 정확한 트랜잭션은 Phase 2 Cloud Function.
  const acceptApply = async (n) => {
    const applicantUid = n.actorUid;
    if (!n.postId || !applicantUid) return;
    // 이미 수락된 신청 — 중복 처리 방지 (로컬 알림만 정리)
    const post = posts.find(p => p.id === n.postId);
    if (post && Array.isArray(post.participantUids) && post.participantUids.includes(applicantUid)) {
      setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, status: 'accepted', read: true } : x)));
      return;
    }
    try {
      await acceptApplication(n.postId, applicantUid);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] acceptApplication failed', e);
      setAlert({ title: '수락 처리에 실패했어요', message: '잠시 후 다시 시도해 주세요.', buttons: [{ text: '확인' }] });
      return;
    }
    // 신청자에게 확정 알림
    createNotification({
      type: 'confirmed',
      recipientUid: applicantUid,
      actorName: userProfile?.nickname || '',
      postId: n.postId,
      postTitle: n.postTitle || '',
    }).catch(e => __DEV__ && console.warn('[RoundupTab] confirmed noti fail', e?.message));
    // 알림 읽음 영속 + 로컬 상태 갱신 (정원·참여자·이름)
    markNotificationRead(n.id).catch(e => __DEV__ && console.warn('[RoundupTab] markRead fail', e?.message));
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, status: 'accepted', read: true } : x)));
    setPosts(prev => prev.map(p => {
      if (p.id !== n.postId) return p;
      const parts = Array.isArray(p.participantUids) ? p.participantUids : [];
      const nextParts = parts.includes(applicantUid) ? parts : [...parts, applicantUid];
      return { ...p, participantUids: nextParts, joined: (p.joined || 0) + 1 };
    }));
    if (n.actorName) setParticipantNames(prev => ({ ...prev, [applicantUid]: n.actorName }));
  };
  // 주최자 — 참여 신청 거절. Firestore: applications rejected. 신청자는 리로드 시 신청 목록에서 빠짐.
  const rejectApply = async (n) => {
    const applicantUid = n.actorUid;
    if (!n.postId || !applicantUid) return;
    try {
      await rejectApplication(n.postId, applicantUid);
    } catch (e) {
      if (__DEV__) console.warn('[RoundupTab] rejectApplication failed', e);
      setAlert({ title: '거절 처리에 실패했어요', message: '잠시 후 다시 시도해 주세요.', buttons: [{ text: '확인' }] });
      return;
    }
    markNotificationRead(n.id).catch(e => __DEV__ && console.warn('[RoundupTab] markRead fail', e?.message));
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, status: 'rejected', read: true } : x)));
  };

  // 알림 탭 — 읽음 처리 후 진입 (mannerEval은 평가 모달, 그 외는 모집 상세)
  const openNotiPost = async (n) => {
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    if (!n.read) {
      markNotificationRead(n.id).catch(e => __DEV__ && console.warn('[RoundupTab] markRead fail', e?.message));
    }
    setShowNoti(false);
    // 친구 신청 알림 — 모집글이 아니라 친구 탭으로 이동
    if (n.type === 'friendRequest') {
      navigation?.navigate?.(ROUTES.FRIENDS);
      return;
    }
    // 매너 평가 진입 — 정상 종료(mannerEval) + 주최자 취소 보상(hostCancelledD7) 둘 다 평가 모달로.
    if (ROUNDUP_PUBLIC_ENABLED && (n.type === 'mannerEval' || n.type === 'hostCancelledD7')) {
      let post = posts.find(p => p.id === n.postId);
      // 취소·만료로 라운지 목록에서 빠진 모집은 개별 로드
      if (!post) { try { post = await loadRoundup(n.postId); } catch { post = null; } }
      if (post) { setEvalPostData(post); setEvaluatingPostId(n.postId); }
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
      if (n.actorUid === targetKey) return false;
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
                <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.bgPrimary, lineHeight: 17 }}>!</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.burgundy} colors={[C.burgundy]} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: _and ? 3 : 5, paddingBottom: 32 }}>
        {/* 초대장(친구지정·포함)은 아래 list.map에서 실제 카드로 렌더 — dev에선 내가 만든 글도 자기 미리보기로 보임 ([[roundup-invitation]]) */}
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
          list.map(p => {
            // 친구지정·포함 초대장 — 수신자(또는 dev에서 작성 본인)에겐 일반 카드 대신 초대장 카드 ([[roundup-invitation]])
            const mine = !!myUid && p.authorUid === myUid;
            const amRecipient = !mine && !!myUid && Array.isArray(p.audienceUids) && p.audienceUids.includes(myUid);
            const showInvite = view === 'mine' && p.scope === 'select' && p.selectMode === 'include'
              && !joined[p.id] && !applied[p.id]
              && (amRecipient || (__DEV__ && !mine)); // TEMP_DEV_INVITE — dev 미리보기는 비수신자만(주최자 본인 글 제외). 출시 전 amRecipient만
            if (showInvite) {
              const inviteProps = {
                type: p.type === 'open' ? 'open' : 'fixed',
                hostName: p.authorName || '친구',
                course: p.course || '',
                date: p.date || '',
                time: p.time || '',
                message: p.word || '',
                onAccept: amRecipient ? () => confirmApply(p.id) : () => setDetailId(p.id),
                onDecline: () => hideRoundup(p.id),
              };
              return p.inviteStyle === 'formal'
                ? <InvitationCard key={p.id} variant="formal" {...inviteProps} />
                : <InvitationTicket key={p.id} accent="tab" tags={p.tags} {...inviteProps} />;
            }
            return (
              <PostCard key={p.id} post={p} myUid={myUid} joined={!!joined[p.id]} applied={!!applied[p.id]} waitlistNum={waitlist[p.id]}
                isBookmarked={!!bookmarks[p.id]}
                onApply={() => confirmApply(p.id)}
                onWaitlist={() => handleWaitlist(p.id)}
                onCancel={() => cancelParticipation(p.id)}
                onGradePress={(key) => setGradeModalKey(key)}
                onOpenDetail={() => setDetailId(p.id)}
                onToggleBookmark={() => toggleBookmark(p.id)}
                onToggleLike={toggleLike}
                onHide={hideRoundup} />
            );
          })
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
        participantNames={participantNames}
        visible={!!detailPost}
        joined={!!(detailId && joined[detailId])}
        applied={!!(detailId && applied[detailId])}
        waitlistNum={detailId ? waitlist[detailId] : undefined}
        isBookmarked={!!(detailId && bookmarks[detailId])}
        comments={detailId ? (commentsByPost[detailId] || []) : []}
        commentTotal={detailId ? (commentsTotal[detailId] || 0) : 0}
        onLoadOlderComments={() => detailId && handleLoadOlderComments(detailId)}
        onClose={() => setDetailId(null)}
        onApply={() => detailId ? performJoinOrApply(detailId) : undefined}
        onWaitlist={() => detailId && handleWaitlist(detailId)}
        onCancel={() => detailId && performCancel(detailId)}
        onCancelWait={() => detailId && cancelWaitlist(detailId)}
        onDelete={(soft) => detailId && handleDelete(detailId, soft)}
        onConfirm={() => detailId && handleConfirmRoundup(detailId)}
        onGradePress={(key) => setGradeModalKey(key)}
        onToggleBookmark={() => detailId && toggleBookmark(detailId)}
        onToggleLike={toggleLike}
        onBlock={handleBlock}
        onReport={handleReport}
        onEdit={() => detailPost && handleEditRequest(detailPost)}
        onAddComment={(c) => detailId && handleAddComment(detailId, c)}
        onDeleteComment={(commentId) => detailId && handleDeleteComment(detailId, commentId)}
        onPinComment={(commentId) => detailId && handlePinComment(detailId, commentId)}
        onNotifySchedule={handleNotifySchedule} />

          {/* 매너 평가 모달 — 라운지 알림에서 진입 ([[manner-evaluation-policy]]) */}
          {(() => {
            const evalPost = evalPostData || posts.find(p => p.id === evaluatingPostId);
            if (!evalPost) return null;
            // 평가 대상 — 실제 참여 확정자(participantUids)에서 본인 제외. 이름은 participantNames(닉네임 로드).
            // 주최자 취소 보상 윈도우(mannerEvalForHost)면 주최자 1명만 평가 대상 (정상은 동반자 전원).
            const targetUids = evalPost.mannerEvalForHost
              ? [evalPost.authorUid].filter(u => u && u !== myUid)
              : (evalPost.participantUids || []).filter(u => u && u !== myUid);
            const participants = targetUids.map(uid => ({ id: uid, name: participantNames[uid] || '동반자' }));
            return (
              <MannerEvaluationModal
                visible={!!evaluatingPostId}
                post={evalPost}
                participants={participants}
                onClose={() => { setEvaluatingPostId(null); setEvalPostData(null); }}
                onSubmit={() => {
                  // 실제 평가 작성은 모달 내부 submitEvaluation이 Firestore(mannerEvaluations)에 기록.
                  // 집계는 functions/manner.js. 여기선 pending 동적 재계산만 트리거 —
                  // 다른 미평가 라운딩이 남아 있으면 pending 유지(무조건 false로 끄지 않음).
                  setEvalVersion(v => v + 1);
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

          {/* 라운딩 일정 리마인드 — 주최자가 보낸 일정 알림을 수신자가 앱에서 확인 (안 읽은 게 있으면 표시) */}
          {(() => {
            const unread = notifications.filter(n => n.type === 'scheduleNotice' && !n.read);
            if (unread.length === 0) return null;
            const current = unread[0];  // 최신순 — 모집 하나씩 큐로 표시
            // 남은 '다른 모집' 건수만 카운트 (같은 모집 중복은 제외)
            const otherPostIds = new Set(unread.filter(n => n.postId !== current.postId).map(n => n.postId));
            return (
              <ScheduleReminderPopup
                visible
                notice={current}
                extraCount={otherPostIds.size}
                onConfirm={() => handleConfirmReminder(current.postId)} />
            );
          })()}

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
