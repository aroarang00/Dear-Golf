import React, { useState } from 'react';
import { Modal, View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { RoundupCreateModal } from './RoundupCreateModal';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { OverlayAlert } from './common/OverlayAlert';
import { RoundupDetail } from './RoundupDetail';
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

function PostCard({ post, joined, waitlistNum, onJoin, onWaitlist, onGradePress, onOpenDetail }) {
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
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.burgundy, fontWeight: '700' }}>참여 완료 ✓</Text>
          </View>
        ) : !isClosed ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onJoin}
            style={{ borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: C.burgundy }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.butter, fontWeight: '700' }}>참여하기</Text>
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
  const [sort, setSort] = useState('recent');   // recent | friend
  const [posts, setPosts] = useState(DUMMY_POSTS);
  const [joined, setJoined] = useState({});
  const [waitlist, setWaitlist] = useState({});       // { [id]: 내 대기 순번 }
  const [showCreate, setShowCreate] = useState(false);
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업
  const [detailId, setDetailId] = useState(null);             // 상세 화면에 띄울 모집글 id
  const [alert, setAlert] = useState(null);                   // 참여 확인 팝업

  const detailPost = posts.find(p => p.id === detailId) || null;

  const sorted = [...posts].sort((a, b) => {
    if (sort === 'friend' && !!a.isFriend !== !!b.isFriend) return a.isFriend ? -1 : 1;
    return b.ts - a.ts;
  });

  const handleCreate = (post) => {
    const teams = post.teams || 1;
    const base = {
      ...post, id: 'r' + Date.now(), author: '나', isFriend: false,
      authorCompleted: 0, authorNoShow: 0, waitlistCount: 0,
      teams, closed: false, ts: Date.now(),
    };
    if (teams > 1) {
      // 단체 — 첫 팀에 작성자 1명
      base.teamJoined = Array.from({ length: teams }, (_, i) => (i === 0 ? 1 : 0));
    } else {
      // 개별 — 작성자 1명
      base.joined = 1;
    }
    setPosts(prev => [base, ...prev]);
  };

  // 참여 확정 — 단체는 빈 첫 팀에, 개별은 인원 +1
  const handleJoin = (id) => {
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
    setJoined(prev => ({ ...prev, [id]: true }));
  };

  // 참여하기 버튼 — 확인 후 참여 (실수·남발 방지)
  const confirmJoin = (id) => {
    setAlert({
      title: '이 라운딩에 참여할까요?',
      message: '참여하면 모집자와 다른 동반자에게 바로 표시돼요. 신중하게 선택해주세요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '참여하기', onPress: () => handleJoin(id) },
      ],
    });
  };

  // 대기 신청 — 현재 대기 인원 다음 순번 부여
  const handleWaitlist = (id) => {
    const post = posts.find(p => p.id === id);
    setWaitlist(prev => ({ ...prev, [id]: (post?.waitlistCount || 0) + 1 }));
  };

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
      </View>

      {/* 정렬 필터 + 모집글 작성 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8 }}>
        {[['recent', '최근순'], ['friend', '친구최근순']].map(([k, l]) => {
          const on = sort === k;
          return (
            <TouchableOpacity key={k} onPress={() => setSort(k)} activeOpacity={0.8}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
                backgroundColor: on ? C.charcoal : C.bgSecondary,
                borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline,
              }}>
              <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: on ? '700' : '500', color: on ? C.butter : C.warmGray }}>{l}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity onPress={() => setShowCreate(true)} activeOpacity={0.8}
          style={{ marginLeft: 'auto', backgroundColor: C.burgundy, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '600' }}>+ 모집글 작성</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}>
        {sorted.map(p => (
          <PostCard key={p.id} post={p} joined={!!joined[p.id]} waitlistNum={waitlist[p.id]}
            onJoin={() => confirmJoin(p.id)}
            onWaitlist={() => handleWaitlist(p.id)}
            onGradePress={(key) => setGradeModalKey(key)}
            onOpenDetail={() => setDetailId(p.id)} />
        ))}
        <View style={{ marginTop: 4, backgroundColor: C.paleSky + '33', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, textAlign: 'center', lineHeight: 17 }}>
            🔒 라운딩 모집은 Firebase 연동 후 정식 오픈 예정이에요
          </Text>
        </View>
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
        waitlistNum={detailId ? waitlist[detailId] : undefined}
        onClose={() => setDetailId(null)}
        onJoin={() => detailId && handleJoin(detailId)}
        onWaitlist={() => detailId && handleWaitlist(detailId)} />

          {/* 참여 확인 팝업 */}
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
