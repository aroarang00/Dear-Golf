// 모집글 주최자/참여자 프로필 클릭 시 뜨는 액션 시트 — 신고/차단 버튼.
// 차단 사실은 상대에게 알리지 않음(UI에 그런 노출 없음).
import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../../constants/colors';

export function ProfileActionSheet({ visible, target, onClose, onReport, onBlock, isMe }) {
  const insets = useSafeAreaInsets();
  if (!target) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={onClose}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 18, borderTopRightRadius: 18,
              paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 + insets.bottom }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
              backgroundColor: C.hairline, marginBottom: 14 }} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray,
              textAlign: 'center', marginBottom: 10 }}>
              {target.name}
            </Text>
            {isMe ? (
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray,
                textAlign: 'center', paddingVertical: 18 }}>
                본인에 대한 액션은 사용할 수 없어요
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { onClose(); onReport?.(target); }} activeOpacity={0.85}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                    backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>🚨 신고</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { onClose(); onBlock?.(target); }} activeOpacity={0.85}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                    backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B2A2A' }}>🚫 차단</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}
              style={{ marginTop: 10, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>닫기</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
