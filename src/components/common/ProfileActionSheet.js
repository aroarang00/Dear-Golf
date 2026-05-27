// 모집글 주최자/참여자 프로필 클릭 시 뜨는 액션 시트 — 친구 신청 / 차단 / (조건부)강퇴.
// 신고는 마이페이지 → [신고하기]로 일원화 (정책 [[report-block-policy]] §5-1).
// 라운지 메인에서 직접 신고 진입 X — 마찰을 입력 단계로 옮겨 충동 신고 방지.
// 차단 사실은 상대에게 알리지 않음(UI에 그런 노출 없음).
// 강퇴는 전체공개 모집의 주최자에게만 노출 ([[roundup-kick-policy]]).
// 친구 신청은 모집 참여자·주최자 프로필에서 진입 ([[friend-add-feature]] Phase 2 — 라운지에서 신청 경로).
import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../../constants/colors';

// friendStatus: 'friend' | 'sent' | 'none' — 친구 신청 버튼 상태 분기
// onCancelFriendRequest: 'sent' 상태에서 누르면 신청 취소 (한도 카운트는 환불 X — 스팸 우회 방지)
export function ProfileActionSheet({ visible, target, onClose, onBlock, onKick, onRequestFriend, onCancelFriendRequest, canKick = false, friendStatus = 'none', isMe }) {
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
                {/* 친구 신청 — 친구·신청 상태별 분기. onRequestFriend 미주입 시 표시 X */}
                {onRequestFriend && friendStatus === 'friend' && (
                  <View style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                    backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.hairline, marginBottom: 8 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray }}>이미 친구예요</Text>
                  </View>
                )}
                {onRequestFriend && friendStatus === 'sent' && (
                  <TouchableOpacity onPress={() => { onClose(); onCancelFriendRequest?.(target); }} activeOpacity={0.85}
                    style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                      backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.warmGrayLight, marginBottom: 8 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray }}>친구 신청함 · 누르면 취소</Text>
                  </TouchableOpacity>
                )}
                {onRequestFriend && friendStatus === 'none' && (
                  <TouchableOpacity onPress={() => { onClose(); onRequestFriend?.(target); }} activeOpacity={0.85}
                    style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center',
                      backgroundColor: C.burgundy, marginBottom: 8 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>🤝 친구 신청</Text>
                  </TouchableOpacity>
                )}
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
