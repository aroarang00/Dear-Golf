import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../constants/colors';
import { RoundupCreateModal } from './RoundupCreateModal';

// 공개범위 뱃지
const SCOPE_BADGE = {
  all:     { label: '전체공개', bg: '#C8D9E6', fg: '#1A3D52' },
  friends: { label: '친구공개', bg: '#F5E6A8', fg: '#5A4500' },
  select:  { label: '친구지정', bg: '#6B1E2A', fg: '#F5E6A8' },
};

// 모집글 더미 데이터 — Firebase 연동 전 UI 표시용
const DUMMY_POSTS = [
  { id: 'r1', type: 'fixed', author: '오세훈', isFriend: true,  course: '제이드팰리스 GC', date: '2025.05.24', day: '토', time: '07:12', capacity: 4, joined: 2, scope: 'all',     word: '주말 모닝 라운딩 같이 하실 분 구해요!', closed: false, ts: 5 },
  { id: 'r2', type: 'open',  author: '김민준', isFriend: true,  course: null, date: null, day: null, time: null, capacity: 4, joined: 1, scope: 'friends', word: '5월 안에 한 번 치고 싶어요. 장소는 같이 정해요', closed: false, ts: 4 },
  { id: 'r3', type: 'fixed', author: '이수연', isFriend: true,  course: '블랙스톤 CC', date: '2025.05.18', day: '일', time: '12:30', capacity: 3, joined: 3, scope: 'select',  word: '인원 다 찼습니다. 감사해요 🙏', closed: true, ts: 3 },
  { id: 'r4', type: 'open',  author: '박지영', isFriend: false, course: null, date: null, day: null, time: null, capacity: 2, joined: 1, scope: 'all',     word: '평일 휴무라 평일 라운딩 동반자 구해요', closed: false, ts: 2 },
];

function PostCard({ post, joined, onJoin }) {
  const sb = SCOPE_BADGE[post.scope] || SCOPE_BADGE.all;
  const joinedCount = post.joined + (joined ? 1 : 0);
  const full = joinedCount >= post.capacity;
  const dim = post.closed;
  return (
    <View style={{ opacity: dim ? 0.5 : 1, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 14, marginBottom: 12 }}>
      {/* 뱃지 줄 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <View style={{ backgroundColor: post.type === 'fixed' ? C.charcoal : '#6B8B5E', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#fff', fontWeight: '700' }}>
            {post.type === 'fixed' ? '확정형' : '오픈형'}
          </Text>
        </View>
        <View style={{ backgroundColor: sb.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: sb.fg, fontWeight: '600' }}>{sb.label}</Text>
        </View>
        {post.closed && (
          <View style={{ backgroundColor: '#E6C8C8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#5C1E1E', fontWeight: '700' }}>마감</Text>
          </View>
        )}
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginLeft: 'auto' }}>{post.author}</Text>
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

      {/* 인원 + 참여하기 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>
          모집 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{joinedCount}</Text> / {post.capacity}명
        </Text>
        <TouchableOpacity
          activeOpacity={dim ? 1 : 0.8}
          disabled={dim || joined}
          onPress={onJoin}
          style={{
            marginLeft: 'auto', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8,
            backgroundColor: dim ? C.hairline : joined ? C.bgPrimary : C.burgundy,
            borderWidth: joined ? 1 : 0, borderColor: C.burgundy,
          }}>
          <Text style={{
            fontFamily: F.sys, fontSize: 13, fontWeight: '600',
            color: dim ? C.warmGrayLight : joined ? C.burgundy : C.butter,
          }}>
            {post.closed ? '마감됨' : joined ? '참여 완료' : full ? '대기 참여' : '참여하기'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function RoundupTab() {
  const [sort, setSort] = useState('recent');   // recent | friend
  const [posts, setPosts] = useState(DUMMY_POSTS);
  const [joined, setJoined] = useState({});
  const [showCreate, setShowCreate] = useState(false);

  const sorted = [...posts].sort((a, b) => {
    if (sort === 'friend' && !!a.isFriend !== !!b.isFriend) return a.isFriend ? -1 : 1;
    return b.ts - a.ts;
  });

  const handleCreate = (post) => {
    setPosts(prev => [{
      ...post, id: 'r' + Date.now(), author: '나', isFriend: false,
      joined: 1, closed: false, ts: Date.now(),
    }, ...prev]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
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
          <PostCard key={p.id} post={p} joined={!!joined[p.id]}
            onJoin={() => setJoined(prev => ({ ...prev, [p.id]: true }))} />
        ))}
        <View style={{ marginTop: 4, backgroundColor: C.paleSky + '33', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, textAlign: 'center', lineHeight: 17 }}>
            🔒 라운딩 모집은 Firebase 연동 후 정식 오픈 예정이에요
          </Text>
        </View>
      </ScrollView>

      <RoundupCreateModal visible={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />
    </View>
  );
}
