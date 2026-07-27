import React, { useContext, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { UserContext } from '../contexts/UserContext';
import { getMannerGrade } from '../constants/mannerGrade';
import { getTrustGrade } from '../constants/trustGrade';
import { MannerBadge, MannerGradeModal } from './common/MannerBadge';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';

// "내 라운지 활동" 화면 ([[my-roundup-activity]]).
// 매너 등급·신뢰등급·패널티 이력·진행 중 신고 통합 진입점.
// 매너점수 숫자 노출 X — 라벨+이모지만 (golfer-score-psychology).

const section = { fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginTop: 26, marginBottom: 10 };

export function MyRoundupActivityScreen({ visible, onClose, onOpenMannerEval }) {
  const { userProfile } = useContext(UserContext);
  const [trustModal, setTrustModal] = useState(false);
  const [mannerModal, setMannerModal] = useState(false);

  // 안드 뒤로가기 — 이 화면은 RN Modal(아래 onRequestClose)이라 그게 유일하게 신뢰되는 back 핸들러.
  //   useOverlayBackHandler를 추가로 걸면 등급·매너 내부 Modal을 닫을 때 부모 핸들러까지 같이 발화해
  //   화면이 통째로 닫혔음 → 훅 제거(RoundupDetail과 동일 패턴, [[ios-modal-stacking]]).
  if (!userProfile) return null;

  const mannerGrade = getMannerGrade(userProfile.mannerScore);
  const trustGrade = getTrustGrade(userProfile.hostedCount, userProfile.mannerScore);
  const isRestricted = !!userProfile.isRestricted;
  const evalPending = !!userProfile.mannerEvaluationPending;
  // 패널티 이력 — 현재는 카운트만, Phase 2엔 Firestore 이력 기반
  const noshowCount = userProfile.noshowCount || 0;
  const falseReportCount = userProfile.falseReportCount || 0;
  const hasPenalty = noshowCount > 0 || falseReportCount > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center',
            gap: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>내 라운지 활동</Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>

            {/* 1) 현재 상태 카드 */}
            <Text style={section}>현재 상태</Text>
            <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, padding: 16,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, letterSpacing: 1, marginBottom: 6 }}>
                    매너 등급
                  </Text>
                  <TouchableOpacity onPress={() => setMannerModal(true)} activeOpacity={0.7}>
                    <MannerBadge score={userProfile.mannerScore} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, letterSpacing: 1, marginBottom: 6 }}>
                    신뢰 등급
                  </Text>
                  <TouchableOpacity onPress={() => setTrustModal(true)} activeOpacity={0.7}>
                    <TrustBadge grade={trustGrade} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ paddingTop: 12, borderTopWidth: 0.5, borderTopColor: C.hairline,
                flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>이용 상태</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13),
                  color: isRestricted ? '#8B2A2A' : '#3C7D4F', marginLeft: 'auto' }}>
                  {isRestricted ? '🚫 모집 정지 중' : '✓ 정상'}
                </Text>
              </View>
            </View>

            {/* 매너 평가 권유 카드 — mannerEvaluationPending */}
            {evalPending && onOpenMannerEval && (
              <TouchableOpacity onPress={onOpenMannerEval} activeOpacity={0.85}
                style={{ marginTop: 12, backgroundColor: '#F5E6A8', borderRadius: 14, padding: 16,
                  flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: fs(22) }}>😊</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#5A4500' }}>
                    동반자 평가가 남아 있어요
                  </Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#5A4500', marginTop: 3, lineHeight: 16 }}>
                    평가를 마쳐야 다음 모집에 신청할 수 있어요
                  </Text>
                </View>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#5A4500' }}>→</Text>
              </TouchableOpacity>
            )}

            {/* 2) 패널티 이력 */}
            <Text style={section}>패널티 이력</Text>
            <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, padding: 16,
              }}>
              {!hasPenalty ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 8 }}>
                  최근 12개월 동안 패널티 이력이 없어요 ✨
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {noshowCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: '#8B2A2A' }}>노쇼 {noshowCount}회</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginLeft: 'auto' }}>
                        최근 12개월
                      </Text>
                    </View>
                  )}
                  {falseReportCount > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: '#8B2A2A' }}>허위신고 {falseReportCount}회</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginLeft: 'auto' }}>
                        최근 12개월
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight, marginTop: 6, lineHeight: 14 }}>
                    각 항목은 12개월 시점에 자동으로 -1됩니다
                  </Text>
                </View>
              )}
            </View>

            {/* 3) 진행 중 신고 — Phase 2 (Firestore reports 컬렉션 의존) */}
            <Text style={section}>진행 중 신고</Text>
            <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, padding: 16,
              }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 8, lineHeight: 17 }}>
                진행 중 신고가 없어요{'\n'}
                <Text style={{ fontSize: fs(10), color: C.warmGrayLight }}>
                  발신·수신 신고 내역은 곧 여기서 확인할 수 있어요
                </Text>
              </Text>
            </View>

            <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight,
              textAlign: 'center', marginTop: 24, lineHeight: 16 }}>
              매너 등급·신뢰 등급은 동반자 평가와 라운딩 완료로{'\n'}자연스럽게 쌓여요
            </Text>

          </ScrollView>

          <TrustGradeModal visible={trustModal} highlightKey={trustGrade.key} onClose={() => setTrustModal(false)} />
          <MannerGradeModal visible={mannerModal} highlightKey={mannerGrade.key} onClose={() => setMannerModal(false)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
