import React, { useState } from 'react';
import { Modal, View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { RoundupCreateModal } from './RoundupCreateModal';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { OverlayAlert } from './common/OverlayAlert';
import { RoundupDetail } from './RoundupDetail';
import { RoundupNotifications } from './RoundupNotifications';
import { SCOPE_BADGE, waitlistRespondHours } from '../constants/roundup';

// 모집글 더미 데이터 — Firebase 연동 전 UI 표시용.
// 개별 모집: teams=1 + joined/capacity / 단체 모집: teams>1 + teamJoined(팀별 인원, 한 팀 4명)
// waitlistCount: 현재 대기 인원
const DUMMY_POSTS = [
  { id: 'r1', type: 'fixed', author: '오세훈', isFriend: true, authorCompleted: 35, authorNoShow: 0,
    course: '제이드팰리스 GC', date: '2026.05.31', day: '일', time: '07:12',
    teams: 3, teamJoined: [4, 2, 0], waitlistCount: 0, scope: 'all',
    word: '주말 모닝 단체 라운딩 — 팀 더 모아요!', closed: false, ts: 5 },
  { id: 'r2', type: 'open', author: '김민준', isFriend: true, authorCompleted: 7, authorNoShow: 0,
    course: null, date: null, day: null, time: null,
    teams: 1, joined: 1, capacity: 4, waitlistCount: 0, scope: 'friends',
    word: '5월 안에 한 번 치고 싶어요. 장소는 같이 정해요', closed: false, ts: 4 },
  { id: 'r3', type: 'fixed', author: '이수연', isFriend: true, authorCompleted: 22, authorNoShow: 0,
    course: '블랙스톤 CC', date: '2026.05.23', day: '토', time: '12:30',
    teams: 1, joined: 3, capacity: 3, waitlistCount: 2, scope: 'select',
    word: '인원 다 찼습니다. 대기 신청 받아요 🙏', closed: true, ts: 3 },
  { id: 'r4', type: 'open', author: '박지영', isFriend: false, authorCompleted: 1, authorNoShow: 0,
    course: null, date: null, day: null, time: null,
    teams: 1, joined: 1, capacity: 2, waitlistCount: 0, scope: 'all',
    word: '평일 휴무라 1명만 더 구해요 (둘이 라운딩)', closed: false, ts: 2 },
];

// 알림 더미 — 내 모집글 알림(apply/cancel) + 내 참여·대기 알림(slotOpen/confirmed)
// apply: status pending이면 수락/거절 가능
const DUMMY_NOTIFICATIONS = [
  { id: 'n1', type: 'apply',     actor: '이수연', postId: 'r1', postTitle: '제이드팰리스 GC', time: '10분 전', read: false, status: 'pending' },
  { id: 'n2', type: 'slotOpen',  actor: '',       postId: 'r3', postTitle: '블랙스톤 CC',     time: '40분 전', read: false },
  { id: 'n3', type: 'apply',     actor: '김민준', postId: 'r1', postTitle: '제이드팰리스 GC', time: '1시간 전', read: false, status: 'pending' },
  { id: 'n4', type: 'confirmed', actor: '',       postId: 'r1', postTitle: '제이드팰리스 GC', time: '3시간 전', read: true },
  { id: 'n5', type: 'cancel',    actor: '박지영', postId: 'r1', postTitle: '제이드팰리스 GC', time: '어제',     read: true },
];

function PostCard({ post, joined, applied, waitlistNum, onApply, onWaitlist, onGradePress, onOpenDetail }) {
  const sb = SCOPE_BADGE[post.scope] || SCOPE_BADGE.all;
  const authorGrade = getTrustGrade(post.authorCompleted, post.authorNoShow);
  const isTeam = post.teams > 1;
  // 개별 모집과 단체 모집을 동일한 행 구조로 통일
  const rows = isTeam
    ? post.teamJoined.map((c, i) => ({ label: `${i + 1}팀`, cur: c, cap: 4 }))
    : [{ label: null, cur: post.joined || 0, cap: post.capacity || 4 }];
  const total = rows.reduce((s, r) => s + r.cur, 0);
  const capTotal = rows.reduce((s, r) => s + r.cap, 0);
  const allFull = rows.every(r => r.cur >= r.cap);
  const isClosed = post.closed || allFull;
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
        {joined ? (
          <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.burgundy, fontWeight: '700' }}>참여 확정 ✓</Text>
          </View>
        ) : applied ? (
          <View style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center',
            backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#8B6914', fontWeight: '700' }}>신청 완료 · 수락 대기 중</Text>
          </View>
        ) : !isClosed ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onApply}
            style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: C.burgundy }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.butter, fontWeight: '700' }}>참여 신청</Text>
          </TouchableOpacity>
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
  const [posts, setPosts] = useState(DUMMY_POSTS);
  const [joined, setJoined] = useState({ r1: true });   // 더미: r1 참여 확정
  const [applied, setApplied] = useState({});           // 참여 신청함 (주최자 수락 대기)
  const [waitlist, setWaitlist] = useState({ r3: 3 });  // 더미: r3 대기 3번
  const [view, setView] = useState('all');              // all | friend | mine
  const [showCreate, setShowCreate] = useState(false);
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업
  const [detailId, setDetailId] = useState(null);             // 상세 화면에 띄울 모집글 id
  const [alert, setAlert] = useState(null);                   // 참여 확인 팝업
  const [notifications, setNotifications] = useState(DUMMY_NOTIFICATIONS);
  const [showNoti, setShowNoti] = useState(false);            // 알림함

  const detailPost = posts.find(p => p.id === detailId) || null;
  const unreadCount = notifications.filter(n => !n.read).length;

  // 탭별 목록 — 전체: 전체공개 + 친구의 친구공개 / 친구: 친구 글(친구지정 제외) / 내 참여 중
  const allTab = posts.filter(p => p.scope === 'all' || (p.scope === 'friends' && p.isFriend));
  const friendTab = posts.filter(p => p.isFriend && p.scope !== 'select');
  const mineTab = posts.filter(p => joined[p.id] || applied[p.id] || waitlist[p.id]);
  const list = [...(view === 'friend' ? friendTab : view === 'mine' ? mineTab : allTab)]
    .sort((a, b) => b.ts - a.ts);

  const handleCreate = (post) => {
    const teams = post.teams || 1;
    const base = {
      ...post, id: 'r' + Date.now(), author: '나', isFriend: false,
      authorCompleted: 0, authorNoShow: 0, waitlistCount: 0,
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

      {/* 전체 / 친구 / 내 참여 중 세그먼트 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>
        <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 3 }}>
          {[['all', '전체'], ['friend', '친구'], ['mine', '내 참여 중']].map(([k, l]) => {
            const on = view === k;
            return (
              <TouchableOpacity key={k} onPress={() => setView(k)} activeOpacity={0.8}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
                  backgroundColor: on ? C.charcoal : 'transparent' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.butter : C.warmGray }}>
                  {l}{k === 'mine' && mineTab.length > 0 ? ` ${mineTab.length}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 모집글 작성 (내 참여 중 외) */}
      {view !== 'mine' && (
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
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight, textAlign: 'center', paddingVertical: 48 }}>
            {view === 'mine' ? '아직 참여 중인 모집이 없어요' : '모집글이 없어요'}
          </Text>
        ) : (
          list.map(p => (
            <PostCard key={p.id} post={p} joined={!!joined[p.id]} applied={!!applied[p.id]} waitlistNum={waitlist[p.id]}
              onApply={() => confirmApply(p.id)}
              onWaitlist={() => handleWaitlist(p.id)}
              onGradePress={(key) => setGradeModalKey(key)}
              onOpenDetail={() => setDetailId(p.id)} />
          ))
        )}
        {view === 'all' && list.length > 0 && (
          <View style={{ marginTop: 4, backgroundColor: C.paleSky + '33', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, textAlign: 'center', lineHeight: 17 }}>
              🔒 라운딩 모집은 Firebase 연동 후 정식 오픈 예정이에요
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
        onClose={() => setDetailId(null)}
        onApply={() => detailId && setApplied(prev => ({ ...prev, [detailId]: true }))}
        onWaitlist={() => detailId && handleWaitlist(detailId)} />

          {/* 알림함 */}
          <RoundupNotifications
            visible={showNoti}
            notifications={notifications}
            onClose={() => setShowNoti(false)}
            onOpenPost={openNotiPost}
            onReadAll={readAllNoti}
            onAccept={acceptApply}
            onReject={rejectApply} />

          {/* 참여 확인 팝업 */}
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
