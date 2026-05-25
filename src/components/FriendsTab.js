import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { FriendProfile } from './FriendProfile';
import { FriendFinder } from './FriendFinder';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { showAppAlert } from './AppAlert';
import { UserContext } from '../contexts/UserContext';

// 친구 찾기에서 받은 후보(간단 필드) → 친구 목록 객체로 변환
const personToFriend = (p) => ({
  id: p.id, name: p.name, style: '', roundsTogether: 0,
  hostedCount: p.hostedCount || 0, attendedCount: p.attendedCount || 0,
  mannerScore: p.mannerScore || 70,
  recent: null,
  stats: { rounds: 0, avg: p.avg ?? null, best: null },
  feed: [],
});

const AVATARS = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B1E2A', fg: '#F5E6A8' },
  { bg: '#6B8B5E', fg: '#fff' },
];

// 친구 더미 데이터 — Firebase 연동 전 UI 표시용
const DUMMY_FRIENDS = [
  {
    id: 'f1', name: '김민준', style: '장타형 드라이버', handicap: 12, roundsTogether: 8,
    hostedCount: 7, attendedCount: 14, mannerScore: 82,   // 활동: 브론즈 / 매너: 좋음
    recent: { course: '남촌 골프클럽', date: '5.01', score: 84, par: 72 },
    stats: { rounds: 28, avg: 89, best: 82 },
    feed: [
      { id: 'm1', course: '남촌 골프클럽', date: '2025.05.01', score: 84, par: 72, rating: 4, memo: '드라이버가 잘 맞은 날', special: 'EAGLE', likedBy: ['이수연', '오세훈', '박지영'] },
      { id: 'm2', course: '제이드팰리스 GC', date: '2025.04.18', score: 88, par: 72, rating: 3, memo: '' },
      { id: 'm3', course: '베어크리크 GC', date: '2025.03.30', score: 91, par: 72, rating: 3, memo: '바람이 강해 고전했다', likedBy: ['김도윤'] },
    ],
  },
  {
    id: 'f2', name: '이수연', style: '정교한 아이언샷', handicap: 18, roundsTogether: 3,
    hostedCount: 22, attendedCount: 18, mannerScore: 95,   // 활동: 실버 / 매너: 매너왕
    recent: { course: '블랙스톤 CC', date: '4.28', score: 92, par: 72 },
    stats: { rounds: 15, avg: 95, best: 91 },
    feed: [
      { id: 's1', course: '블랙스톤 CC', date: '2025.04.28', score: 92, par: 72, rating: 4, memo: '퍼팅 감이 좋았어요', likedBy: ['오세훈', '문하린'] },
      { id: 's2', course: '레이크사이드 CC', date: '2025.04.05', score: 97, par: 72, rating: 3, memo: '' },
    ],
  },
  {
    id: 'f3', name: '오세훈', style: '안정적인 코스매니지먼트', handicap: 6, roundsTogether: 15,
    hostedCount: 220, attendedCount: 88, mannerScore: 96,   // 활동: 레전드 / 매너: 매너왕
    recent: { course: '제이드팰리스 GC', date: '4.20', score: 78, par: 72 },
    stats: { rounds: 42, avg: 81, best: 75 },
    feed: [
      { id: 'o1', course: '제이드팰리스 GC', date: '2025.04.20', score: 78, par: 72, rating: 5, memo: '인생 라운딩 ⛳', special: 'HOLE IN ONE', likedBy: ['김민준', '이수연', '한도현', '서주아'] },
      { id: 'o2', course: '사우스스프링스 CC', date: '2025.04.02', score: 80, par: 72, rating: 4, memo: '' },
      { id: 'o3', course: '남촌 골프클럽', date: '2025.03.15', score: 79, par: 72, rating: 4, memo: '아이언이 핀에 잘 붙었다' },
    ],
  },
];

function FriendCard({ friend, palette, muted, grade, onPress, onLongPress, onGradePress }) {
  const r = friend.recent;
  const diff = r ? r.score - r.par : 0;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} onLongPress={onLongPress} delayLongPress={280}
      style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(19), color: palette.fg }}>{friend.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>{friend.name}</Text>
            <TrustBadge grade={grade} onPress={onGradePress} />
            {muted && <Text style={{ fontSize: fs(11) }}>🔕</Text>}
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>{friend.style}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: C.charcoal, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.butter }}>핸디 {friend.stats?.avg ?? '—'}</Text>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 4 }}>함께 {friend.roundsTogether}회</Text>
        </View>
      </View>

      {/* 최근 라운딩 미리보기 */}
      {r && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1 }}>최근</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, flex: 1 }} numberOfLines={1}>
            {r.course} · {r.date}
          </Text>
          <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.charcoal, fontWeight: '700' }}>{r.score}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{diffLabel}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function FriendsTab({ navigation, onInvite }) {
  const { userProfile } = React.useContext(UserContext);
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState(DUMMY_FRIENDS);
  const [muted, setMuted] = useState({});           // { [id]: true }
  const [hidden, setHidden] = useState({});          // 숨긴 친구
  const [profileFriend, setProfileFriend] = useState(null);
  const [showHidden, setShowHidden] = useState(false);   // 숨긴 친구 섹션 펼침 여부
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업
  const [finder, setFinder] = useState(null);   // 친구 찾기 화면 — null 또는 진입 탭
  const listScrollRef = useRef(null);

  // 친구 탭 재방문 시 — 검색·프로필·찾기 닫고 목록 맨 위로 초기화
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('tabPress', () => {
      setSearch('');
      setProfileFriend(null);
      setFinder(null);
      setShowHidden(false);
      setGradeModalKey(null);
      listScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return unsub;
  }, [navigation]);
  const [sentRequests, setSentRequests] = useState([]);   // 보낸 신청 — 후보 id 배열
  const [receivedRequests, setReceivedRequests] = useState([   // 받은 신청 (더미)
    { id: 'r1', name: '문하린', hostedCount: 9, attendedCount: 12, mannerScore: 87, avg: 94 },
    { id: 'r2', name: '배수지', hostedCount: 3, attendedCount: 7, mannerScore: 79, avg: 99 },
  ]);

  // 차단된 사용자는 친구 탭에서 자동 숨김 — 친구 숨김(hidden)과 차단(blockedUsers) 통합 필터
  const blockedIds = userProfile?.blockedUsers || [];
  const isBlocked = (f) => blockedIds.includes(f.id) || blockedIds.includes(f.name);

  const q = search.trim();
  const visible = friends.filter(f => !hidden[f.id] && !isBlocked(f) && (!q || f.name.includes(q)));
  const hiddenFriends = friends.filter(f => hidden[f.id] && !isBlocked(f));
  const paletteOf = (id) => AVATARS[friends.findIndex(f => f.id === id) % AVATARS.length];

  const toggleMute = (id) => setMuted(p => ({ ...p, [id]: !p[id] }));
  const hideFriend = (id) => setHidden(p => ({ ...p, [id]: true }));

  // 친구 신청 — 보낸 신청 목록에 추가 (양쪽 수락 흐름: 상대 수락 전까지 '신청함')
  const sendRequest = (person) => {
    setSentRequests(p => (p.includes(person.id) ? p : [...p, person.id]));
  };
  // 받은 신청 수락 — 친구 목록에 추가하고 신청 목록에서 제거
  const acceptRequest = (person) => {
    setFriends(p => (p.some(f => f.id === person.id) ? p : [...p, personToFriend(person)]));
    setReceivedRequests(p => p.filter(r => r.id !== person.id));
  };
  // 무시 — 신청 목록에서만 제거. 상대방에게 통보 없음 (거절 알림 X)
  const ignoreRequest = (id) => setReceivedRequests(p => p.filter(r => r.id !== id));
  const unhideFriend = (id) => setHidden(p => { const n = { ...p }; delete n[id]; return n; });
  const deleteFriend = (id) => {
    const target = friends.find(f => f.id === id);
    if (!target) return;
    showAppAlert(
      `${target.name}님을 친구에서 삭제할까요?`,
      `함께 라운딩한 기록(${target.roundsTogether || 0}회)은 남지만, 친구 목록에서 사라져요. 다시 추가하려면 친구 신청이 필요해요.\n\n💡 상대방에게는 알림이 가지 않아요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => setFriends(p => p.filter(f => f.id !== id)) },
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled">
        {/* 받은 친구 신청 배너 — 있을 때만 */}
        {receivedRequests.length > 0 && (
          <TouchableOpacity onPress={() => setFinder('received')} activeOpacity={0.8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
              backgroundColor: C.butter, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}>
            <Text style={{ fontSize: fs(15) }}>📬</Text>
            <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>
              받은 친구 신청 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>{receivedRequests.length}</Text>건
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.burgundy }}>›</Text>
          </TouchableOpacity>
        )}

        {/* 친구 수 + 숨긴 친구 관리 (목록 위에 배치 — 스크롤 없이 접근) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
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
            <View style={{ paddingTop: 18 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 18 }}>
                <Text style={{ fontSize: fs(30), marginBottom: 10 }}>👥</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 6 }}>
                  골프 친구를 추가해보세요
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 19, marginBottom: 16 }}>
                  카카오 친구 중 Dear Golf를 쓰는 사람을 찾아 친구를 맺으면 — 함께 라운딩하고 서로의 골프 기록을 나눌 수 있어요.
                </Text>
                <View style={{ gap: 12 }}>
                  {[
                    ['📋', '라운지에서 친구와 라운딩 모집·참여하기'],
                    ['🏆', '친구의 라운딩 기록을 피드로 보기'],
                    ['👍', '특별한 순간을 공유하고 응원하기'],
                  ].map(([icon, txt]) => (
                    <View key={txt} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                      <Text style={{ fontSize: fs(14) }}>{icon}</Text>
                      <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18 }}>{txt}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => setFinder('kakao')}
                  style={{ marginTop: 18, backgroundColor: C.navy, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.bgPrimary }}>친구 찾기</Text>
                </TouchableOpacity>
                {/* 카카오톡으로 친구 초대 — 디어골프 미설치 친구 데려오기 */}
                {onInvite && (
                  <TouchableOpacity activeOpacity={0.85} onPress={onInvite}
                    style={{ marginTop: 8, backgroundColor: '#FEE500', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
                      flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                    <Text style={{ fontSize: fs(14) }}>💬</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#3C1E1E' }}>카카오톡으로 친구 초대하기</Text>
                  </TouchableOpacity>
                )}
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 10, textAlign: 'center', lineHeight: 16 }}>
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
                grade={grade}
                onPress={() => setProfileFriend(f)}
                onGradePress={() => setGradeModalKey(grade.key)}
              />
            );
          })
        )}

        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginTop: 6 }}>
          친구 카드를 탭하면 프로필이 열려요
        </Text>
      </ScrollView>

      {/* 풀 프로필 — 옵션(알림·숨기기·삭제)도 프로필 상단에서 처리 */}
      <FriendProfile
        friend={profileFriend}
        visible={!!profileFriend}
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
        onAccept={acceptRequest}
        onIgnore={ignoreRequest} />
    </View>
  );
}
