// 차단 관리 — 차단한 사용자 목록 + 차단 해제. MY탭 → 설정 → 차단 관리로 이동.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { UserContext } from '../contexts/UserContext';
import { unblockUser, remainingBlocksToday, DAILY_BLOCK_LIMIT } from '../utils/block';
import { unblockUid as fsUnblockUid } from '../utils/friends';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { OverlayAlert } from './common/OverlayAlert';

export function BlockManageScreen({ visible, onClose }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const [alert, setAlert] = React.useState(null);
  // 안드로이드 뒤로가기 — 확인창이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    onClose();
  };
  const blocked = userProfile?.blockedUsers || [];
  const remaining = remainingBlocksToday(userProfile);

  const handleUnblock = (id) => {
    setAlert({
      title: `${id}님 차단을 해제할까요?`,
      message: '차단을 풀면 서로의 모집글이 다시 보여요.\n다만 이미 끊긴 친구 관계는 복원되지 않으며, 다시 친구가 되려면 친구 신청을 해야 해요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '해제', onPress: () => {
            const result = unblockUser(userProfile, id);
            setUserProfile(result.profile);
            storage.save(STORAGE_KEYS.profile, result.profile);
            // Firestore write-through — users/{myUid}.blockedUids 동기화
            fsUnblockUid(id).catch(e => __DEV__ && console.warn('[BlockManage] fsUnblockUid failed', e?.message));
          },
        },
      ],
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>차단 관리</Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            {/* 안내 */}
            <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginBottom: 6 }}>
                차단한 사용자: {blocked.length}명
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18 }}>
                차단하면 서로의 모집글이 보이지 않아요. 차단 사실은 상대에게 알리지 않아요.{'\n'}
                오늘 남은 차단 가능 횟수: <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>{remaining}</Text>/{DAILY_BLOCK_LIMIT}회
              </Text>
            </View>

            {/* 목록 */}
            {blocked.length === 0 ? (
              <View style={{ paddingTop: 56, alignItems: 'center' }}>
                <Text style={{ fontSize: fs(36) }}>🤝</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 12 }}>
                  차단한 사용자가 없어요
                </Text>
              </View>
            ) : (
              blocked.map(id => (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center',
                  paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.bgSecondary,
                  borderRadius: 10, marginBottom: 8 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.hairline,
                    alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.warmGray }}>
                      {String(id).charAt(0)}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{id}</Text>
                  <TouchableOpacity onPress={() => handleUnblock(id)} activeOpacity={0.8}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                      backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.burgundy }}>해제</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
