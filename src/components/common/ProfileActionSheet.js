// 모집글 주최자/참여자 프로필 클릭 시 뜨는 액션 시트 — 차단 / (조건부)강퇴.
// 신고는 마이페이지 → [신고하기]로 일원화 (정책 [[report-block-policy]] §5-1).
// 라운지 메인에서 직접 신고 진입 X — 마찰을 입력 단계로 옮겨 충동 신고 방지.
// 차단 사실은 상대에게 알리지 않음(UI에 그런 노출 없음).
// 강퇴는 전체공개 모집의 주최자에게만 노출 ([[roundup-kick-policy]]).
import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../../constants/colors';

export function ProfileActionSheet({ visible, target, onClose, onBlock, onKick, canKick = false, isMe }) {
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
              <>
                {canKick && onKick && (
                  <TouchableOpacity onPress={() => { onClose(); onKick?.(target); }} activeOpacity={0.85}
                    style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                      backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A', marginBottom: 8 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B2A2A' }}>참여자 내보내기</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { onClose(); onBlock?.(target); }} activeOpacity={0.85}
                  style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                    backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B2A2A' }}>🚫 차단하기</Text>
                </TouchableOpacity>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight,
                  textAlign: 'center', marginTop: 10, lineHeight: 16 }}>
                  심각한 문제는 마이페이지 → 신고하기에서{'\n'}디어골프 팀에 신고해주세요
                </Text>
              </>
            )}
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}
              style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>닫기</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
