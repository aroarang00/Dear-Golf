import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustGradeModal } from './common/TrustBadge';

// 친구 라운딩 피드 1건
function FeedCard({ item }) {
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  return (
    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline, padding: 14, marginBottom: 10 }}>
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
    </View>
  );
}

// 친구 풀 프로필 — 프로필 / 통계 / 라운딩 피드
export function FriendProfile({ friend, visible, onClose }) {
  const [gradeOpen, setGradeOpen] = useState(false);
  if (!friend) return null;
  const palette = friend.palette || { bg: '#C8D9E6', fg: '#1A3D52' };
  const stats = friend.stats || {};
  const grade = getTrustGrade(friend.roundupsCompleted);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 크림 바탕으로 통일 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
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
                  {/* 신뢰 등급 — 탭하면 등급 설명 */}
                  <TouchableOpacity onPress={() => setGradeOpen(true)} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                      borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13 }}>{grade.emoji}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.charcoal, fontWeight: '700' }}>{grade.label}</Text>
                  </TouchableOpacity>
                  <View style={{ backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline,
                    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>함께 {friend.roundsTogether}회</Text>
                  </View>
                </View>
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
                friend.feed.map(item => <FeedCard key={item.id} item={item} />)
              )}
            </View>
          </ScrollView>

          {/* 신뢰 등급 설명 팝업 */}
          <TrustGradeModal visible={gradeOpen} highlightKey={grade.key}
            onClose={() => setGradeOpen(false)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
