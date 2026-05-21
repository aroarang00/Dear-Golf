import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../../constants/colors';

// 핸디 계산 방식 설명 — 신뢰/매너 등급 모달과 같은 형식
export function HandicapInfoModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}
        activeOpacity={1} onPress={onClose}>
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ backgroundColor: C.navy, paddingVertical: 16, paddingHorizontal: 18 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.bgPrimary, fontWeight: '700' }}>핸디 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(250,246,236,0.7)', marginTop: 4 }}>
              잘 친 라운드 위주로 계산해요
            </Text>
          </View>
          <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '700', lineHeight: 20 }}>
              핸디 = 베스트 3개 라운드의 평균
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 8, lineHeight: 19 }}>
              전체 평균이 아니라 가장 잘 친 3개 라운드로 계산해요. 그래서 안 좋은 날을 기록해도 핸디가 잘 오르지 않아요.
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 8, lineHeight: 19 }}>
              기복이 있어도 부담 없이 모든 라운딩을 남겨보세요. 라운딩 기록이 3개 미만이면 입력한 평균타를 쓰고, 3개부터 베스트 3개 평균으로 자동 계산돼요.
            </Text>
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
