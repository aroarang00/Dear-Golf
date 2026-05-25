import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../../constants/colors';
import { TRUST_GRADES } from '../../constants/trustGrade';

// 신뢰 등급 뱃지 — 이름 옆 트로피 이모지. 탭하면 onPress로 등급 설명 팝업을 연다.
export function TrustBadge({ grade, onPress }) {
  if (!grade) return null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}>
      <Text style={{ fontSize: fs(13) }}>{grade.emoji}</Text>
    </TouchableOpacity>
  );
}

// 등급 설명 팝업 — 모든 등급의 조건을 안내. highlightKey 등급은 강조 표시.
export function TrustGradeModal({ visible, onClose, highlightKey }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}
        activeOpacity={1} onPress={onClose}>
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ backgroundColor: C.navy, paddingVertical: 16, paddingHorizontal: 18 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.bgPrimary }}>신뢰 등급 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(250,246,236,0.7)', marginTop: 4 }}>
              라운딩을 정상 완료할수록 등급이 올라가요
            </Text>
          </View>
          <View style={{ paddingVertical: 6 }}>
            {[...TRUST_GRADES].reverse().map((g) => {
              const on = g.key === highlightKey;
              return (
                <View key={g.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 11, paddingHorizontal: 18,
                    backgroundColor: on ? '#F5F0E4' : 'transparent' }}>
                  <Text style={{ fontSize: fs(22) }}>{g.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>{g.label}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{g.cond}</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}
            style={{ paddingVertical: 13, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, textAlign: 'center' }}>확인</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
