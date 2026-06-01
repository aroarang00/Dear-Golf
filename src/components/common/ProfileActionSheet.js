// 모집글 주최자/참여자 프로필 클릭 시 뜨는 액션 시트 — 차단만.
// 신고는 마이페이지 → [신고하기]로 일원화 (정책 [[report-block-policy]] §5-1).
// 라운지 메인에서 직접 신고 진입 X — 마찰을 입력 단계로 옮겨 충동 신고 방지.
// 차단 사실은 상대에게 알리지 않음(UI에 그런 노출 없음).
// 강퇴 기능은 폐기 — 친구모집에선 분란 소지라 제거(2026-06-02, [[roundup-friend-redesign]]).
// 친구 신청은 라운지에서 제거(학연·지연·사업 교차 연결 민감성) — 친구 추가는 카카오·검색 경로로만 ([[roundup-friend-redesign]]).
import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../../constants/colors';

export function ProfileActionSheet({ visible, target, onClose, onBlock, isMe }) {
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
                {/* 친구 신청은 라운지에서 제거 — 학연·지연·사업 등 교차 연결 민감성([[roundup-friend-redesign]]).
                    친구 추가는 카카오·검색 경로로만. 라운지 프로필 시트는 차단만 둠. */}
                <TouchableOpacity onPress={() => { onClose(); onBlock?.(target); }} activeOpacity={0.85}
                  style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                    backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B2A2A' }}>🚫 차단하기</Text>
                </TouchableOpacity>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray,
                  textAlign: 'center', marginTop: 10, lineHeight: 17 }}>
                  차단은 마이페이지에서 언제든 해제할 수 있어요
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
