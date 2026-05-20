import React, { useState, useEffect, useContext } from 'react';
import { Modal, View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { RoundupCreateModal } from './RoundupCreateModal';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { OverlayAlert } from './common/OverlayAlert';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { RoundupDetail } from './RoundupDetail';
import { RoundupNotifications } from './RoundupNotifications';
import { SCOPE_BADGE, FILTER_BADGE, COMPANION_LABEL, ageLabelShort, skillLabelShort, waitlistRespondHours } from '../constants/roundup';
import { isPostVisible, blockUser, unblockUser, remainingBlocksToday } from '../utils/block';
import { applyMannerDelta, MANNER_DELTAS } from '../constants/mannerGrade';
import { STORAGE_KEYS, storage } from '../utils/storage';

// 모집글 더미 데이터 — Firebase 연동 전 UI 표시용.
// 개별 모집: teams=1 + joined/capacity / 단체 모집: teams>1 + teamJoined(팀별 인원, 한 팀 4명)
// waitlistCount: 현재 대기 인원
const DUMMY_POSTS = [
  { id: 'r1', type: 'fixed', author: '오세훈', authorId: 'oseh', isFriend: true,
    authorHostedCount: 220, authorAttendedCount: 88, authorMannerScore: 96,
    course: '제이드팰리스 GC', date: '2026.05.31', day: '일', time: '07:12',
    teams: 3, teamJoined: [4, 2, 0], waitlistCount: 0, scope: 'all',
    ageGroup: '40s', companion: 'mixed', skill: 'mid',
    word: '주말 모닝 단체 라운딩 — 팀 더 모아요!', closed: false, ts: 5 },
  { id: 'r2', type: 'open', author: '김민준', authorId: 'kmj', isFriend: true,
    authorHostedCount: 7, authorAttendedCount: 14, authorMannerScore: 82,
    course: null, date: null, day: null, time: null,
    teams: 1, joined: 1, capacity: 4, waitlistCount: 0, scope: 'friends',
    ageGroup: 'any', companion: 'any', skill: 'any',
    word: '5월 안에 한 번 치고 싶어요. 장소는 같이 정해요', closed: false, ts: 4 },
  { id: 'r3', type: 'fixed', author: '이수연', authorId: 'lsy', isFriend: true,
    authorHostedCount: 22, authorAttendedCount: 18, authorMannerScore: 95,
    course: '블랙스톤 CC', date: '2026.05.23', day: '토', time: '12:30',
    teams: 1, joined: 3, capacity: 3, waitlistCount: 2, scope: 'select',
    ageGroup: '30s', companion: 'female', skill: 'high',
    word: '인원 다 찼습니다. 대기 신청 받아요 🙏', closed: true, ts: 3 },
  { id: 'r4', type: 'open', author: '박지영', authorId: 'pjy', isFriend: false,
    authorHostedCount: 1, authorAttendedCount: 3, authorMannerScore: 75,
    course: null, date: null, day: null, time: null,
    teams: 1, joined: 1, capacity: 2, waitlistCount: 0, scope: 'all',
    ageGroup: '50s', companion: 'couple', skill: 'pro',
    word: '평일 휴무라 1명만 더 구해요 (둘이 라운딩)', closed: false, ts: 2 },
];

// 알림 더미 — 내 모집글 알림(apply/cancel) + 내 참여·대기 알림(slotOpen/confirmed)
// apply: status pending이면 수락/거절 가능. actorHostedCount/actorMannerScore — 주최자 승인 판단용 신뢰도 데이터
const DUMMY_NOTIFICATIONS = [
  { id: 'n1', type: 'apply',     actor: '이수연', actorHostedCount: 22, actorMannerScore: 95,
    postId: 'r1', postTitle: '제이드팰리스 GC', time: '10분 전', read: false, status: 'pending' },
  { id: 'n2', type: 'slotOpen',  actor: '',       postId: 'r3', postTitle: '블랙스톤 CC',     time: '40분 전', read: false },
  { id: 'n3', type: 'apply',     actor: '김민준', actorHostedCount: 7, actorMannerScore: 82,
    postId: 'r1', postTitle: '제이드팰리스 GC', time: '1시간 전', read: false, status: 'pending' },
  { id: 'n4', type: 'confirmed', actor: '',       postId: 'r1', postTitle: '제이드팰리스 GC', time: '3시간 전', read: true },
  { id: 'n5', type: 'cancel',    actor: '박지영', actorHostedCount: 1, actorMannerScore: 75,
    postId: 'r1', postTitle: '제이드팰리스 GC', time: '어제',     read: true },
];

function PostCard({ post, joined, applied, waitlistNum, isBookmarked, onApply, onWaitlist, onCancel, onGradePress, onOpenDetail, onToggleBookmark }) {
  const { userProfile } = React.useContext(UserContext);
  const sb = SCOPE_BADGE[post.scope] || SCOPE_BADGE.all;
  const authorGrade = getTrustGrade(post.authorHostedCount, post.authorMannerScore);
  const isTeam = post.teams > 1;
  // 개별 모집과 단체 모집을 동일한 행 구조로 통일
  const rows = isTeam
    ? post.teamJoined.map((c, i) => ({ label: `${i + 1}팀`, cur: c, cap: 4 }))
    : [{ label: null, cur: post.joined || 0, cap: post.capacity || 4 }];
  const total = rows.reduce((s, r) => s + r.cur, 0);
  const capTotal = rows.reduce((s, r) => s + r.cap, 0);
  const allFull = rows.every(r => r.cur >= r.cap);
  const isClosed = post.closed || allFull;
  const isMine = post.author === '나';   // 내가 올린 모집글
  const respondHours = waitlistRespondHours(post.date);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onOpenDetail}
      style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 14, marginBottom: 12 }}>
      {/* 뱃지 줄 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: post.type === 'fixed' ? C.charcoal : '#6B8B5E', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#fff', fontWeight: '700' }}>
            {post.type === 'fixed' ? '확정형' : '오픈형'}
          </Text>
        </View>
        {post.teams > 1 && (
          <View style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.butter, fontWeight: '700' }}>단체 {post.teams}팀</Text>
          </View>
        )}
        <View style={{ backgroundColor: sb.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: sb.fg, fontWeight: '600' }}>{sb.label}</Text>
        </View>
        {isClosed && (
          <View style={{ backgroundColor: '#E6C8C8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#5C1E1E', fontWeight: '700' }}>마감</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>{post.author}</Text>
          <TrustBadge grade={authorGrade} onPress={() => onGradePress(authorGrade.key)} />
          {!isMine && (
            <TouchableOpacity onPress={onToggleBookmark} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 16, color: isBookmarked ? '#E2B33D' : C.warmGrayLight }}>
                {isBookmarked ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 라운딩 정보 */}
      {post.type === 'fixed' ? (
        <>
          <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>{post.course}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, marginTop: 3 }}>
            {post.date} ({post.day}) · {post.time}
          </Text>
        </>
      ) : (
        <>
          <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>장소 · 날짜 미정</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, marginTop: 3 }}>동반자와 함께 정해요</Text>
        </>
      )}

      {/* 동반자 조건 뱃지 — 연령대·구성·실력. 'any'/null은 숨김. 최대 3개 표시 (예: [~40대] [남성만] [90타대]) */}
      {(() => {
        const ageTxt = ageLabelShort(post.ageGroup);
        const compTxt = post.companion && post.companion !== 'any' ? COMPANION_LABEL[post.companion] : null;
        const skillTxt = skillLabelShort(post.skill);
        if (!ageTxt && !compTxt && !skillTxt) return null;
        return (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {ageTxt && (
              <View style={{ backgroundColor: FILTER_BADGE.age.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: FILTER_BADGE.age.fg, fontWeight: '600' }}>{ageTxt}</Text>
              </View>
            )}
            {compTxt && (
              <View style={{ backgroundColor: FILTER_BADGE.companion.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: FILTER_BADGE.companion.fg, fontWeight: '600' }}>{compTxt}</Text>
              </View>
            )}
            {skillTxt && (
              <View style={{ backgroundColor: FILTER_BADGE.skill.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: FILTER_BADGE.skill.fg, fontWeight: '600' }}>{skillTxt}</Text>
              </View>
            )}
          </View>
        );
      })()}

      {post.word ? (
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, marginTop: 8, lineHeight: 18 }}>"{post.word}"</Text>
      ) : null}

      {/* 모집 현황 — 개별/단체 공통 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 6 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5 }}>모집 현황</Text>
        {isTeam && (
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginLeft: 'auto' }}>
            총 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{total}</Text> / {capTotal}명
          </Text>
        )}
      </View>
      <View style={{ gap: 6 }}>
        {rows.map((r, i) => {
          const rowFull = r.cur >= r.cap;
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
              {r.label && (
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.charcoal, fontWeight: '700', width: 32 }}>{r.label}</Text>
              )}
              <Text style={{ fontSize: 13 }}>{rowFull ? '✅' : '🔄'}</Text>
              <Text style={{ fontFamily: F.en, fontSize: 13, color: C.charcoal, fontWeight: '700' }}>{r.cur}/{r.cap}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 11, fontWeight: '600',
                color: rowFull ? '#3C7D4F' : C.warmGray, marginLeft: 'auto' }}>
                {rowFull ? (isTeam ? '확정' : '모집 완료') : '모집중'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* 참여 / 대기 */}
      <View style={{ marginTop: 12 }}>
        {isMine ? (
          <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.hairline }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, fontWeight: '700' }}>내가 올린 모집글</Text>
          </View>
        ) : joined ? (
          <View>
            <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
              backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.burgundy, fontWeight: '700' }}>참여 확정 ✓</Text>
            </View>
            <TouchableOpacity onPress={onCancel} activeOpacity={0.7}
              style={{ marginTop: 4, alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, textDecorationLine: 'underline' }}>
                참여 취소
              </Text>
            </TouchableOpacity>
          </View>
        ) : applied ? (
          <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#8B6914', fontWeight: '700' }}>신청 완료 · 수락 대기 중</Text>
          </View>
        ) : waitlistNum ? (
          <View>
            <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
              backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#8B6914', fontWeight: '700' }}>⏳ 대기 {waitlistNum}번</Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
              취소자 발생 시 푸시 알림을 보내드려요. {respondHours}시간 내 미응답 시 다음 대기자에게 넘어가요.
            </Text>
          </View>
        ) : userProfile?.isRestricted ? (
          <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#8B2A2A', fontWeight: '700' }}>🚫 이용 제한 중</Text>
          </View>
        ) : userProfile?.mannerEvaluationPending ? (
          <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#8B6914', fontWeight: '700' }}>지난 라운딩 평가 후 신청 가능해요</Text>
          </View>
        ) : !isClosed ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onApply}
            style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: C.burgundy }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.butter, fontWeight: '700' }}>참여 신청</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <TouchableOpacity activeOpacity={0.85} onPress={onWaitlist}
              style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
                backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.charcoal }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '700' }}>
                대기 신청{post.waitlistCount > 0 ? ` (현재 ${post.waitlistCount}명 대기)` : ''}
              </Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
              마감된 모집이에요. 대기 신청하면 취소자 발생 시 알림을 받고 {respondHours}시간 내 응답하면 합류돼요.
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function RoundupTab({ visible, onClose }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { schedules, setSchedules } = useContext(SchedulesContext);
  const [posts, setPosts] = useState(DUMMY_POSTS);
  const [joined, setJoined] = useState({ r1: true });   // 더미: r1 참여 확정
  const [applied, setApplied] = useState({});           // 참여 신청함 (주최자 수락 대기)
  const [waitlist, setWaitlist] = useState({ r3: 3 });  // 더미: r3 대기 3번
  const [bookmarks, setBookmarks] = useState({});       // 관심 모집 {postId: true}
  const [view, setView] = useState('all');              // all | friend | mine | watch
  const [showCreate, setShowCreate] = useState(false);
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업
  const [detailId, setDetailId] = useState(null);             // 상세 화면에 띄울 모집글 id
  const [alert, setAlert] = useState(null);                   // 참여 확인 팝업
  const [notifications, setNotifications] = useState(DUMMY_NOTIFICATIONS);
  const [showNoti, setShowNoti] = useState(false);            // 알림함

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
      const isMine = p.author === '나';
      const isJoined = !!joined[p.id];
      if (!isMine && !isJoined) continue;
      const allFull = p.teams > 1
        ? p.teamJoined?.every(c => c >= 4)
        : (p.joined || 0) >= (p.capacity || 4);
      const isClosed = p.closed || allFull;
      if (!isClosed) continue;
      if (schedules.some(s => s.roundupId === p.id)) continue;
      const members = p.teams > 1
        ? (p.teamJoined?.reduce((s, c) => s + c, 0) || 0)
        : (p.joined || 0);
      toAdd.push({
        id: `rg-${p.id}`,
        roundupId: p.id,
        course: p.course,
        date: p.date,
        day: p.day,
        time: p.time,
        members,
      });
    }
    if (toAdd.length === 0) return;
    setSchedules(prev => [...prev, ...toAdd]);
  }, [posts, joined, schedules, setSchedules]);

  // 차단 필터 — 내가 차단한 사람의 모집 + 나를 차단한 사람의 모집은 어디서도 안 보임
  // (단, 내가 직접 올린 모집은 mine 탭에서 항상 보임. joined/applied/waitlist도 본인 활동 보존)
  const visiblePosts = posts.filter(p => isPostVisible(p, userProfile));

  // 탭별 목록 — 전체: 전체공개 + 친구의 친구공개 / 친구: 친구 글 + 내가 친구공개로 올린 글 (친구지정 제외) / 내 참여 중 / 관심
  const allTab = visiblePosts.filter(p => p.scope === 'all' || (p.scope === 'friends' && p.isFriend));
  const friendTab = visiblePosts.filter(p => {
    if (p.scope === 'select') return false;
    if (p.author === '나') return p.scope === 'friends';
    return p.isFriend;
  });
  // mine 탭은 내가 직접 관여한 모집이므로 차단 필터 무시 (애초에 본인은 차단 못 함)
  const mineTab = posts.filter(p => p.author === '나' || joined[p.id] || applied[p.id] || waitlist[p.id]);
  const watchTab = visiblePosts.filter(p => bookmarks[p.id]);
  const tabList = view === 'friend' ? friendTab : view === 'mine' ? mineTab : view === 'watch' ? watchTab : allTab;
  const list = [...tabList].sort((a, b) => b.ts - a.ts);
  // 소도시 예외 — 전체/친구 탭에서 보이는 모집글이 3개 이하면 조건 완화 안내
  const showSparseHint = (view === 'all' || view === 'friend') && list.length > 0 && list.length <= 3;

  const handleCreate = (post) => {
    const teams = post.teams || 1;
    const base = {
      ...post, id: 'r' + Date.now(), author: '나', isFriend: false,
      authorHostedCount: 0, authorAttendedCount: 0, authorMannerScore: 70, waitlistCount: 0,
      // 동반자 조건 기본값 — post에 없으면 '상관없음'
      ageGroup: post.ageGroup || 'any',
      companion: post.companion || 'any',
      skill: post.skill || 'any',
      teams, closed: false, ts: Date.now(),
    };
    if (teams > 1) base.teamJoined = Array.from({ length: teams }, (_, i) => (i === 0 ? 1 : 0));
    else base.joined = 1;
    setPosts(prev => [base, ...prev]);
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
  const confirmApply = (id) => {
    setAlert({
      title: '이 라운딩에 참여 신청할까요?',
      message: '주최자에게 신청이 전달되고, 주최자가 수락하면 참여가 확정돼요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '참여 신청', onPress: () => setApplied(prev => ({ ...prev, [id]: true })) },
      ],
    });
  };

  // 대기 신청 — 현재 대기 인원 다음 순번 부여
  const handleWaitlist = (id) => {
    const post = posts.find(p => p.id === id);
    setWaitlist(prev => ({ ...prev, [id]: (post?.waitlistCount || 0) + 1 }));
  };

  // 참여 취소 — 취소 시점에 따라 매너 점수 자동 차감.
  // 대기자 자동 승격·주최자 푸시·노쇼 자동 신고는 Phase 2 (Cloud Functions).
  const cancelParticipation = (id) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    // 시점 계산 (오픈형은 날짜 미정이라 전날 취소로 간주)
    let daysUntil = 1;
    if (post.date) {
      const [y, m, d] = post.date.split('.').map(Number);
      const target = new Date(y, m - 1, d);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      daysUntil = Math.round((target - today) / 86400000);
    }
    const isSameDay = daysUntil <= 0;
    const deltaKind = isSameDay ? 'cancelDay' : 'cancelDayBefore';
    const deltaVal = MANNER_DELTAS[deltaKind];
    const countField = isSameDay ? 'cancelDayCount' : 'cancelDayBeforeCount';
    const label = isSameDay ? '당일 취소' : '전날(또는 그 이전) 취소';

    setAlert({
      title: '참여를 취소할까요?',
      message: `${label} — 매너 점수 ${deltaVal}점이 적용돼요.\n(주최자 알림·대기자 자동 승격은 추후 추가될 예정)`,
      buttons: [
        { text: '계속 참여', style: 'cancel' },
        {
          text: '취소하기', style: 'destructive', onPress: () => {
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
            // 3) 매너 점수 차감 + 취소 카운트 +1, 로컬 저장
            const next = {
              ...userProfile,
              mannerScore: applyMannerDelta(userProfile.mannerScore, deltaKind),
              [countField]: (userProfile[countField] || 0) + 1,
            };
            setUserProfile(next);
            storage.save(STORAGE_KEYS.profile, next);
          },
        },
      ],
    });
  };

  // 내 모집글 삭제 — 상세 화면도 닫는다
  const handleDelete = (id) => {
    setPosts(prev => prev.filter(p => p.id !== id));
    setDetailId(null);
  };

  // 주최자 — 참여 신청 수락 / 거절
  const acceptApply = (n) => {
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, status: 'accepted', read: true } : x)));
    bumpPostCount(n.postId);
  };
  const rejectApply = (n) => {
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, status: 'rejected', read: true } : x)));
  };

  // 알림 탭 — 읽음 처리 후 해당 모집글 상세 열기
  const openNotiPost = (n) => {
    setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    setShowNoti(false);
    setDetailId(n.postId);
  };
  const readAllNoti = () => setNotifications(prev => prev.map(x => ({ ...x, read: true })));
  const deleteNoti = (n) => setNotifications(prev => prev.filter(x => x.id !== n.id));

  // 사용자 차단 — 일일 한도 5명, 양방향 모집글 숨김. 차단 사실은 상대에게 알리지 않음.
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
    setAlert({
      title: `${target.name}님을 차단할까요?`,
      message: '차단하면 서로의 모집글이 보이지 않아요.\n오늘 남은 차단 횟수: ' + remaining + '회',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '차단', style: 'destructive', onPress: () => {
            const result = blockUser(userProfile, target.id);
            if (!result.ok) return;
            setUserProfile(result.profile);
            storage.save(STORAGE_KEYS.profile, result.profile);
            setDetailId(null); // 차단 후 상세 닫기 — 더 이상 보이지 않으므로
          },
        },
      ],
    });
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
  const clearAllNoti = () => setAlert({
    title: '모든 알림을 삭제할까요?',
    message: '복구할 수 없어요.',
    buttons: [
      { text: '취소', style: 'cancel' },
      { text: '전체삭제', style: 'destructive', onPress: () => setNotifications([]) },
    ],
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
      {/* 헤더 */}
      <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
        flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: 22, color: C.charcoal }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>라운딩 모집</Text>
        <View style={{ flex: 1 }} />
        {/* 알림함 */}
        <TouchableOpacity onPress={() => setShowNoti(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: 20 }}>🔔</Text>
          {unreadCount > 0 && (
            <View style={{ position: 'absolute', top: -5, right: -7, minWidth: 16, height: 16, borderRadius: 8,
              backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 9, color: '#fff', fontWeight: '700' }}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 전체 / 친구 / 내 참여 중 / 관심 세그먼트 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>
        <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 3 }}>
          {[['all', '전체'], ['friend', '친구'], ['mine', '내 참여'], ['watch', '관심']].map(([k, l]) => {
            const on = view === k;
            const count = k === 'mine' ? mineTab.length : k === 'watch' ? watchTab.length : 0;
            return (
              <TouchableOpacity key={k} onPress={() => setView(k)} activeOpacity={0.8}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
                  backgroundColor: on ? C.charcoal : 'transparent' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: on ? '700' : '500', color: on ? C.butter : C.warmGray }}>
                  {l}{count > 0 ? ` ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 모집글 작성 (내 참여·관심 외) */}
      {view !== 'mine' && view !== 'watch' && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>
            {view === 'friend' ? '친구가 올린 모집글이에요' : '전체공개·친구공개 모집글이에요'}
          </Text>
          <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.8}
            style={{ marginLeft: 'auto', backgroundColor: C.burgundy, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '600' }}>+ 모집글 작성</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}>
        {list.length === 0 ? (
          view === 'mine' ? (
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight, textAlign: 'center', paddingVertical: 48 }}>
              아직 참여 중인 모집이 없어요
            </Text>
          ) : view === 'watch' ? (
            <View style={{ alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 36 }}>⭐</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '700', marginTop: 14 }}>
                관심 모집이 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                모집글의 별을 눌러 관심 모집으로 등록하세요
              </Text>
            </View>
          ) : (
            /* 빈 화면 가이드 — 모집글 0개 */
            <View style={{ alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 42 }}>⛳</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700', marginTop: 14 }}>
                아직 모집글이 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                첫 번째 라운딩을 모집해보세요!
              </Text>
              <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.85}
                style={{ marginTop: 18, backgroundColor: C.burgundy, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.butter, fontWeight: '700' }}>+ 모집글 작성</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          list.map(p => (
            <PostCard key={p.id} post={p} joined={!!joined[p.id]} applied={!!applied[p.id]} waitlistNum={waitlist[p.id]}
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
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, textAlign: 'center', lineHeight: 17 }}>
              🔒 라운딩 모집은 Firebase 연동 후 정식 오픈 예정이에요
            </Text>
          </View>
        )}
        {/* 소도시 예외 — 표시 가능한 모집글이 3개 이하일 때 조건 완화 안내 */}
        {showSparseHint && (
          <View style={{ marginTop: 8, backgroundColor: '#F0E8D8', borderRadius: 12,
            borderWidth: 0.5, borderColor: '#E2D2A8', paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#8B6914', fontWeight: '700', textAlign: 'center' }}>
              주변 모집글이 적어요
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, textAlign: 'center',
              marginTop: 4, lineHeight: 16 }}>
              연령대·실력 등 동반자 조건을 넓혀 모집해보세요
            </Text>
          </View>
        )}
      </ScrollView>

      <RoundupCreateModal visible={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />

      {/* 신뢰 등급 설명 팝업 */}
      <TrustGradeModal visible={!!gradeModalKey} highlightKey={gradeModalKey}
        onClose={() => setGradeModalKey(null)} />

      {/* 모집 상세 화면 */}
      <RoundupDetail
        post={detailPost}
        visible={!!detailPost}
        joined={!!(detailId && joined[detailId])}
        applied={!!(detailId && applied[detailId])}
        waitlistNum={detailId ? waitlist[detailId] : undefined}
        isBookmarked={!!(detailId && bookmarks[detailId])}
        onClose={() => setDetailId(null)}
        onApply={() => detailId && setApplied(prev => ({ ...prev, [detailId]: true }))}
        onWaitlist={() => detailId && handleWaitlist(detailId)}
        onCancel={() => detailId && cancelParticipation(detailId)}
        onDelete={() => detailId && handleDelete(detailId)}
        onGradePress={(key) => setGradeModalKey(key)}
        onToggleBookmark={() => detailId && toggleBookmark(detailId)}
        onBlock={handleBlock}
        onReport={handleReport} />

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
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
