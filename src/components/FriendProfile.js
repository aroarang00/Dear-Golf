import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';
import { TrustGradeModal } from './common/TrustBadge';
import { MannerGradeModal } from './common/MannerBadge';
import { HandicapInfoModal } from './common/HandicapInfoModal';
import { WhoLikedModal } from './common/WhoLikedModal';
import { useAndroidBack } from '../hooks/useAndroidBack';

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
          <Text style={{ fontSize: fs(13) }}>🏆</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#8B6914', letterSpacing: 1 }}>
            {SPECIAL_LABEL[item.special] || item.special}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{item.course}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight }}>{item.date}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <Text style={{ fontFamily: F.en, fontSize: fs(24), color: C.charcoal, fontWeight: '700' }}>{item.score}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>타 · {diffLabel}</Text>
        {item.rating > 0 && (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#C9A84C', marginLeft: 4 }}>{'★'.repeat(item.rating)}</Text>
        )}
      </View>
      {item.memo ? (
        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 6, lineHeight: 18 }}>"{item.memo}"</Text>
      ) : null}
      {/* 좋아요 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10,
        borderTopWidth: 0.5, borderTopColor: isSpecial ? '#E8D9A8' : C.hairline }}>
        <TouchableOpacity onPress={() => setLiked(v => !v)} activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 12,
            backgroundColor: liked ? '#F0E0E2' : 'transparent', borderWidth: 0.5, borderColor: liked ? C.burgundy : C.hairline }}>
          <Text style={{ fontSize: fs(12) }}>👍</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: liked ? C.burgundy : C.warmGray }}>{likers.length}</Text>
        </TouchableOpacity>
        {likers.length > 0 && (
          <TouchableOpacity onPress={() => onShowLikers(likers)} activeOpacity={0.7}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>좋아요 누른 사람 보기</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// 친구 풀 프로필 — 프로필 / 라운딩 피드. 헤더 옵션에서 알림/숨기기/삭제 처리.
// 옵션 액션시트는 자체 오버레이로 표시 (Modal 위 Modal 충돌 회피)
export function FriendProfile({ friend, visible, onClose, muted, onToggleMute, onHide, onDelete }) {
  const [gradeOpen, setGradeOpen] = useState(false);
  const [mannerOpen, setMannerOpen] = useState(false);
  const [handicapInfoOpen, setHandicapInfoOpen] = useState(false);
  const [likers, setLikers] = useState(null);   // 좋아요 누른 사람 목록 팝업
  const [optionsOpen, setOptionsOpen] = useState(false);   // 헤더 ⋯ 옵션
  useAndroidBack(optionsOpen, () => setOptionsOpen(false)); // 옵션 시트 떠 있을 때 뒤로가기 → 닫기
  if (!friend) return null;

  const handleOption = (fn) => () => { setOptionsOpen(false); fn && fn(); };
  const options = [
    { text: muted ? '🔔  알림 켜기' : '🔕  알림 끄기', onPress: handleOption(onToggleMute) },
    { text: '🙈  친구 숨기기', onPress: handleOption(onHide) },
    { text: '❌  친구 삭제', danger: true, onPress: handleOption(onDelete) },
  ];
  const palette = friend.palette || { bg: '#C8D9E6', fg: '#1A3D52' };
  const stats = friend.stats || {};
  const grade = getTrustGrade(friend.hostedCount, friend.mannerScore);
  const manner = getMannerGrade(friend.mannerScore || 70);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 버터. 우측 ⋯ 옵션(알림·숨기기·삭제) */}
          <View style={{ backgroundColor: C.butter, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>친구 프로필</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => setOptionsOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal, lineHeight: 22 }}>⋯</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {/* 프로필 — 인스타그램 스타일: 아바타(좌) + 이름·핸디·등급(우) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18,
              paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, backgroundColor: C.bgPrimary }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: palette.bg,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(32), color: palette.fg }}>{friend.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                {/* 이름 + 핸디 — 같은 줄 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal }}>{friend.name}</Text>
                  <TouchableOpacity onPress={() => setHandicapInfoOpen(true)} activeOpacity={0.7}
                    style={{ backgroundColor: C.charcoal, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.butter }}>핸디 {stats.avg ?? '—'}</Text>
                  </TouchableOpacity>
                </View>
                {/* 신뢰 + 매너 — 이름 아래 줄 */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <TouchableOpacity onPress={() => setGradeOpen(true)} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                      borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: fs(12) }}>{grade.emoji}</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.charcoal }}>{grade.label}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setMannerOpen(true)} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                      borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: fs(12) }}>{manner.emoji}</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: manner.color }}>{manner.label}</Text>
                  </TouchableOpacity>
                </View>
                {/* 함께 N회 — 주최·참석은 신뢰/매너로 짐작 가능하므로 비공개 */}
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>
                  함께 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{friend.roundsTogether || 0}</Text>회
                </Text>
              </View>
            </View>

            {/* 라운딩 피드 — 평균타(핸디)는 명함의 핸디 뱃지로 노출 */}
            <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight, letterSpacing: 1.5, marginHorizontal: 16, marginTop: 12, marginBottom: 10 }}>
              라운딩 피드
            </Text>
            <View style={{ paddingHorizontal: 16 }}>
              {(friend.feed || []).length === 0 ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGrayLight, textAlign: 'center', paddingVertical: 24 }}>
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

          {/* 매너 등급 설명 팝업 */}
          <MannerGradeModal visible={mannerOpen} highlightKey={manner.key}
            onClose={() => setMannerOpen(false)} />

          {/* 핸디 계산 방식 설명 */}
          <HandicapInfoModal visible={handicapInfoOpen} onClose={() => setHandicapInfoOpen(false)} />

          {/* 헤더 ⋯ 옵션 — 자체 오버레이 (Modal 위 Modal 충돌 회피) */}
          {optionsOpen && (
            <TouchableOpacity activeOpacity={1} onPress={() => setOptionsOpen(false)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}>
              <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, textAlign: 'center', paddingTop: 16, paddingBottom: 10 }}>
                  {friend.name}
                </Text>
                {options.map((opt, i) => (
                  <TouchableOpacity key={i} activeOpacity={0.6} onPress={opt.onPress}
                    style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: opt.danger ? '#D32F2F' : C.charcoal, textAlign: 'center' }}>
                      {opt.text}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity activeOpacity={0.6} onPress={() => setOptionsOpen(false)}
                  style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgSecondary }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, textAlign: 'center' }}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          {/* 좋아요 누른 사람 */}
          <WhoLikedModal names={likers} onClose={() => setLikers(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
