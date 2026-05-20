import React, { useState } from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import { C, F } from '../constants/colors';
import { FriendProfile } from './FriendProfile';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { showAppAlert } from './AppAlert';
import { UserContext } from '../contexts/UserContext';

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
          <Text style={{ fontFamily: F.sys, fontSize: 19, color: palette.fg, fontWeight: '700' }}>{friend.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>{friend.name}</Text>
            <TrustBadge grade={grade} onPress={onGradePress} />
            {muted && <Text style={{ fontSize: 11 }}>🔕</Text>}
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 2 }}>{friend.style}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: C.charcoal, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.butter, fontWeight: '600' }}>핸디 {friend.stats?.avg ?? '—'}</Text>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 4 }}>함께 {friend.roundsTogether}회</Text>
        </View>
      </View>

      {/* 최근 라운딩 미리보기 */}
      {r && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1 }}>최근</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, flex: 1 }} numberOfLines={1}>
            {r.course} · {r.date}
          </Text>
          <Text style={{ fontFamily: F.en, fontSize: 14, color: C.charcoal, fontWeight: '700' }}>{r.score}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray }}>{diffLabel}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function FriendsTab() {
  const { userProfile } = React.useContext(UserContext);
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState(DUMMY_FRIENDS);
  const [muted, setMuted] = useState({});           // { [id]: true }
  const [hidden, setHidden] = useState({});          // 숨긴 친구
  const [profileFriend, setProfileFriend] = useState(null);
  const [optionTarget, setOptionTarget] = useState(null);
  const [showHidden, setShowHidden] = useState(false);   // 숨긴 친구 섹션 펼침 여부
  const [gradeModalKey, setGradeModalKey] = useState(null);   // 신뢰 등급 설명 팝업

  // 차단된 사용자는 친구 탭에서 자동 숨김 — 친구 숨김(hidden)과 차단(blockedUsers) 통합 필터
  const blockedIds = userProfile?.blockedUsers || [];
  const isBlocked = (f) => blockedIds.includes(f.id) || blockedIds.includes(f.name);

  const q = search.trim();
  const visible = friends.filter(f => !hidden[f.id] && !isBlocked(f) && (!q || f.name.includes(q)));
  const hiddenFriends = friends.filter(f => hidden[f.id] && !isBlocked(f));
  const paletteOf = (id) => AVATARS[friends.findIndex(f => f.id === id) % AVATARS.length];

  const closeOptions = () => setOptionTarget(null);
  const toggleMute = (id) => { setMuted(p => ({ ...p, [id]: !p[id] })); closeOptions(); };
  const hideFriend = (id) => { setHidden(p => ({ ...p, [id]: true })); closeOptions(); };
  const unhideFriend = (id) => setHidden(p => { const n = { ...p }; delete n[id]; return n; });
  const deleteFriend = (id) => {
    const target = friends.find(f => f.id === id);
    if (!target) { closeOptions(); return; }
    closeOptions();
    showAppAlert(
      `${target.name}님을 친구에서 삭제할까요?`,
      `함께 라운딩한 기록(${target.roundsTogether || 0}회)은 남지만, 친구 목록에서 사라져요. 다시 추가하려면 친구 신청이 필요해요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => setFriends(p => p.filter(f => f.id !== id)) },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 친구 검색창 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text style={{ fontSize: 13 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, fontFamily: F.sys, fontSize: 13, color: C.textPrimary, padding: 0 }}
            placeholder="이름으로 친구 검색"
            placeholderTextColor={C.warmGrayLight}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled">
        {/* 친구 수 + 숨긴 친구 관리 (목록 위에 배치 — 스크롤 없이 접근) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray }}>
            친구 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{visible.length}</Text>명
          </Text>
          {hiddenFriends.length > 0 && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowHidden(v => !v)}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, fontWeight: '600' }}>
                🙈 숨긴 친구 {hiddenFriends.length}
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{showHidden ? '▲' : '▼'}</Text>
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
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: paletteOf(f.id).fg, fontWeight: '700' }}>{f.name.charAt(0)}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{f.name}</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => unhideFriend(f.id)}
                  style={{ borderWidth: 1, borderColor: C.hairline, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.charcoal, fontWeight: '600' }}>숨김 해제</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {visible.length === 0 ? (
          q ? (
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, textAlign: 'center', paddingVertical: 36 }}>
              검색 결과가 없어요
            </Text>
          ) : (
            /* 빈 화면 가이드 — 친구 0명 */
            <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 42 }}>👥</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700', marginTop: 14 }}>
                아직 친구가 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>
                카카오 친구 중 Dear Golf 유저를{'\n'}찾아보세요!
              </Text>
              <TouchableOpacity activeOpacity={0.85}
                onPress={() => showAppAlert('준비 중이에요', '카카오 친구 중 Dear Golf 유저 찾기는 곧 추가될 예정이에요.')}
                style={{ marginTop: 18, backgroundColor: C.burgundy, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.butter, fontWeight: '700' }}>친구 찾기</Text>
              </TouchableOpacity>
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
                onLongPress={() => setOptionTarget(f)}
                onGradePress={() => setGradeModalKey(grade.key)}
              />
            );
          })
        )}

        <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, textAlign: 'center', marginTop: 6 }}>
          친구 카드를 길게 누르면 옵션이 열려요
        </Text>
      </ScrollView>

      {/* 풀 프로필 */}
      <FriendProfile friend={profileFriend} visible={!!profileFriend} onClose={() => setProfileFriend(null)} />

      {/* 롱프레스 옵션 팝업 */}
      <Modal visible={!!optionTarget} transparent animationType="fade" onRequestClose={closeOptions}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 40 }}
          activeOpacity={1} onPress={closeOptions}>
          <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '700', textAlign: 'center', paddingTop: 16, paddingBottom: 10 }}>
              {optionTarget?.name}
            </Text>
            {[
              { txt: muted[optionTarget?.id] ? '🔔  알림 켜기' : '🔕  알림 끄기', onPress: () => toggleMute(optionTarget.id) },
              { txt: '🙈  숨기기', onPress: () => hideFriend(optionTarget.id) },
              { txt: '❌  친구 삭제', onPress: () => deleteFriend(optionTarget.id), danger: true },
            ].map((opt, i) => (
              <TouchableOpacity key={i} activeOpacity={0.6} onPress={opt.onPress}
                style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: opt.danger ? '#D32F2F' : C.charcoal, textAlign: 'center' }}>{opt.txt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 신뢰 등급 설명 팝업 */}
      <TrustGradeModal visible={!!gradeModalKey} highlightKey={gradeModalKey}
        onClose={() => setGradeModalKey(null)} />
    </View>
  );
}
