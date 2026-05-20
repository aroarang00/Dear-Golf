import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';
import { TrustGradeModal } from './common/TrustBadge';
import { WhoLikedModal } from './common/WhoLikedModal';

// 특별한 순간 타입 → 한글 라벨
const SPECIAL_LABEL = { 'HOLE IN ONE': '홀인원', 'EAGLE': '이글', 'ALBATROSS': '알바트로스' };

// 친구 라운딩 피드 1건 — 특별한 순간이면 강조 카드 + 좋아요
function FeedCard({ item, onShowLikers }) {
  const [liked, setLiked] = useState(false);
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const isSpecial = !!item.special;
  const likers = liked ? [...(item.likedBy || []), '나'] : (item.likedBy || []);

  return (
    <View style={{
      backgroundColor: isSpecial ? '#FBF6E8' : C.bgSecondary, borderRadius: 12,
      borderWidth: isSpecial ? 1 : 0.5, borderColor: isSpecial ? '#C9A84C' : C.hairline,
      padding: 14, marginBottom: 10,
    }}>
      {isSpecial && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 }}>
          <Text style={{ fontSize: 13 }}>🏆</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#8B6914', fontWeight: '700', letterSpacing: 1 }}>
            {SPECIAL_LABEL[item.special] || item.special}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{item.course}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>{item.date}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <Text style={{ fontFamily: F.en, fontSize: 24, color: C.charcoal, fontWeight: '700' }}>{item.score}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>타 · {diffLabel}</Text>
        {item.rating > 0 && (
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C9A84C', marginLeft: 4 }}>{'★'.repeat(item.rating)}</Text>
        )}
      </View>
      {item.memo ? (
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, marginTop: 6, lineHeight: 18 }}>"{item.memo}"</Text>
      ) : null}
      {/* 좋아요 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10,
        borderTopWidth: 0.5, borderTopColor: isSpecial ? '#E8D9A8' : C.hairline }}>
        <TouchableOpacity onPress={() => setLiked(v => !v)} activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 12,
            backgroundColor: liked ? '#F0E0E2' : 'transparent', borderWidth: 0.5, borderColor: liked ? C.burgundy : C.hairline }}>
          <Text style={{ fontSize: 12 }}>👍</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: '700', color: liked ? C.burgundy : C.warmGray }}>{likers.length}</Text>
        </TouchableOpacity>
        {likers.length > 0 && (
          <TouchableOpacity onPress={() => onShowLikers(likers)} activeOpacity={0.7}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray }}>좋아요 누른 사람 보기</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// 친구 풀 프로필 — 프로필 / 통계 / 라운딩 피드
export function FriendProfile({ friend, visible, onClose }) {
  const [gradeOpen, setGradeOpen] = useState(false);
  const [likers, setLikers] = useState(null);   // 좋아요 누른 사람 목록 팝업
  if (!friend) return null;
  const palette = friend.palette || { bg: '#C8D9E6', fg: '#1A3D52' };
  const stats = friend.stats || {};
  const grade = getTrustGrade(friend.hostedCount, friend.mannerScore);
  const manner = getMannerGrade(friend.mannerScore || 70);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 버터 */}
          <View style={{ backgroundColor: C.butter, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 22, color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>친구 프로필</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {/* 프로필 — 인스타그램 스타일: 아바타(좌) + 이름·핸디·등급(우) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18,
              paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, backgroundColor: C.bgPrimary }}>
              <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: palette.bg,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 42, color: palette.fg, fontWeight: '700' }}>{friend.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 20, color: C.charcoal, fontWeight: '700' }}>{friend.name}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: C.charcoal, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '700' }}>핸디 {stats.avg ?? '—'}</Text>
                  </View>
                  {/* 활동 등급 — 탭하면 등급 설명 */}
                  <TouchableOpacity onPress={() => setGradeOpen(true)} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                      borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>{grade.emoji}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.charcoal, fontWeight: '700' }}>{grade.label}</Text>
                  </TouchableOpacity>
                  {/* 매너 등급 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                    borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>{manner.emoji}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: manner.color, fontWeight: '700' }}>{manner.label}</Text>
                  </View>
                  <View style={{ backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline,
                    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>함께 {friend.roundsTogether}회</Text>
                  </View>
                </View>
                {/* 주최 · 참석 횟수 */}
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 8 }}>
                  주최 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{friend.hostedCount || 0}</Text>회
                  {'  ·  '}
                  참석 <Text style={{ color: C.charcoal, fontWeight: '700' }}>{friend.attendedCount || 0}</Text>회
                </Text>
              </View>
            </View>

            {/* 통계 */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 18, gap: 10 }}>
              {[
                { label: '라운딩', value: stats.rounds },
                { label: '평균타', value: stats.avg, hi: true },
                { label: '베스트', value: stats.best },
              ].map((st, i) => (
                <View key={i} style={{
                  flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12,
                  backgroundColor: st.hi ? '#F5F0E4' : C.bgSecondary,
                  borderWidth: st.hi ? 1 : 0.5, borderColor: st.hi ? C.burgundy : C.hairline,
                }}>
                  <Text style={{ fontFamily: F.en, fontSize: 22, color: st.hi ? C.burgundy : C.charcoal, fontWeight: '700' }}>
                    {st.value != null ? st.value : '—'}
                  </Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 3 }}>{st.label}</Text>
                </View>
              ))}
            </View>

            {/* 라운딩 피드 */}
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginHorizontal: 16, marginBottom: 10 }}>
              라운딩 피드
            </Text>
            <View style={{ paddingHorizontal: 16 }}>
              {(friend.feed || []).length === 0 ? (
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, textAlign: 'center', paddingVertical: 24 }}>
                  아직 공개된 라운딩 기록이 없어요
                </Text>
              ) : (
                friend.feed.map(item => <FeedCard key={item.id} item={item} onShowLikers={setLikers} />)
              )}
            </View>
          </ScrollView>

          {/* 신뢰 등급 설명 팝업 */}
          <TrustGradeModal visible={gradeOpen} highlightKey={grade.key}
            onClose={() => setGradeOpen(false)} />

          {/* 좋아요 누른 사람 */}
          <WhoLikedModal names={likers} onClose={() => setLikers(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
