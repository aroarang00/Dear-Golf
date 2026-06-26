// 모집글 주최자/참여자 프로필 클릭 시 뜨는 액션 시트 — 친구 신청 + 차단.
// 신고는 마이페이지 → [신고하기]로 일원화 (정책 [[report-block-policy]] §5-1). 라운지 직접 신고 진입 X(충동 신고 방지).
// 차단 사실은 상대에게 알리지 않음. 강퇴 폐기(친구모집 분란 소지, 2026-06-02).
// 친구 신청 — 2026-06-26 재도입: 라운지 참여자는 주최자 친구일 뿐 내 친구는 아닐 수 있어 직접 신청 제공.
//   친구·신청됨이면 버튼 숨김/비활성. 익명·본인 슬롯은 부모(RoundupDetail)가 시트 자체를 안 연다.
import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../../constants/colors';

export function ProfileActionSheet({ visible, target, onClose, onBlock, isMe, friendState = 'none', onFriendRequest }) {
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
                {/* 친구 신청 — uid 있는 참여자에게. 이미 친구면 숨김, 신청 보냈으면 '신청됨'(비활성). */}
                {target.uid && friendState === 'friend' && (
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.warmGray, textAlign: 'center', paddingVertical: 8, marginBottom: 4 }}>
                    이미 친구예요
                  </Text>
                )}
                {target.uid && friendState === 'sent' && (
                  <View style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginBottom: 8,
                    backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray }}>친구 신청됨</Text>
                  </View>
                )}
                {target.uid && friendState === 'none' && (
                  // 세이지 채움 — 크림 시트 위에서 또렷이 튀어 '주 액션'으로 읽힘(차단=빨강 테두리와 구분).
                  <TouchableOpacity onPress={() => { onClose(); onFriendRequest?.(target); }} activeOpacity={0.85}
                    style={{ paddingVertical: 13, borderRadius: 10, alignItems: 'center', marginBottom: 8, backgroundColor: '#5E7E42' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: '#fff' }}>＋ 친구 신청</Text>
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
