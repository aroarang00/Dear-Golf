import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../../constants/colors';

// 마일스톤 안내 — 명함의 흐린 메달 줄 탭 시. 핸디/등급 안내 모달과 같은 형식.
export function MilestoneInfoModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}
        activeOpacity={1} onPress={onClose}>
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ backgroundColor: C.navy, paddingVertical: 16, paddingHorizontal: 18 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.bgPrimary }}>마일스톤 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(250,246,236,0.7)', marginTop: 4 }}>
              쌓을수록 빛나는 활동 메달
            </Text>
          </View>
          <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, lineHeight: 20 }}>
              마일스톤은 누적 활동으로 받는{'\n'}명예의 메달이에요
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 8, lineHeight: 19 }}>
              라운딩 30·50·100·200회,{'\n'}방문 구장 30·50·100곳마다{'\n'}메달이 하나씩 쌓여요.
            </Text>
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
