// 매너 등급 이모지 뱃지 — 점수(0~100)는 내부 데이터로만 유지하고
// UI에는 등급 이모지(😊/🙂/😐/⚠️/🚫)만 노출.
import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../../constants/colors';
import { getMannerGrade, MANNER_GRADES } from '../../constants/mannerGrade';

export function MannerBadge({ score, size = 14, onPress }) {
  const g = getMannerGrade(score);
  if (!g) return null;
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
        <Text style={{ fontSize: size }}>{g.emoji}</Text>
      </TouchableOpacity>
    );
  }
  return <Text style={{ fontSize: size }}>{g.emoji}</Text>;
}

// 등급 설명 팝업 — 모든 매너 등급 조건 안내. highlightKey 등급은 강조 표시.
export function MannerGradeModal({ visible, onClose, highlightKey }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}
        activeOpacity={1} onPress={onClose}>
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ backgroundColor: C.navy, paddingVertical: 16, paddingHorizontal: 18 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.bgPrimary, fontWeight: '700' }}>매너 등급 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(250,246,236,0.7)', marginTop: 4 }}>
              라운딩 평가·노쇼 여부에 따라 점수가 변해요 (신규 70점)
            </Text>
          </View>
          <View style={{ paddingVertical: 6 }}>
            {[...MANNER_GRADES].reverse().map((g) => {
              const on = g.key === highlightKey;
              return (
                <View key={g.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 11, paddingHorizontal: 18,
                    backgroundColor: on ? '#F5F0E4' : 'transparent' }}>
                  <Text style={{ fontSize: 22 }}>{g.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: g.color, fontWeight: '700' }}>{g.label}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 2 }}>{g.cond}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}
            style={{ paddingVertical: 13, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600', textAlign: 'center' }}>확인</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
