import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';

const NOTI_ICON = { apply: '🙋', cancel: '❌', slotOpen: '🎉', confirmed: '✅', waitlist: '⏳' };
// 주최자(내 모집글)에 오는 알림 / 그 외는 내가 참여·대기한 모집의 알림
const HOST_TYPES = ['apply', 'cancel', 'waitlist'];

function notiText(n) {
  switch (n.type) {
    case 'apply':
      if (n.status === 'accepted') return `${n.actor}님의 참여 신청을 수락했어요`;
      if (n.status === 'rejected') return `${n.actor}님의 참여 신청을 거절했어요`;
      return `${n.actor}님이 '${n.postTitle}' 모집에 참여 신청했어요`;
    case 'cancel':    return `${n.actor}님이 '${n.postTitle}' 모집 참여를 취소했어요`;
    case 'slotOpen':  return `대기 중이던 '${n.postTitle}' 모집에 자리가 났어요 — 시간 내에 응답해주세요`;
    case 'confirmed': return `'${n.postTitle}' 모집 참여가 확정됐어요`;
    case 'waitlist':  return `${n.actor}님이 '${n.postTitle}' 모집에 대기 신청했어요`;
    default:          return n.postTitle;
  }
}

// 알림함 — 내 모집글 알림 + 내가 참여·대기한 모집 알림. 참여 신청은 수락/거절 가능.
export function RoundupNotifications({ visible, notifications = [], onClose, onOpenPost, onReadAll, onAccept, onReject }) {
  const hasUnread = notifications.some(n => !n.read);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 22, color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700' }}>알림</Text>
            <View style={{ flex: 1 }} />
            {hasUnread && (
              <TouchableOpacity onPress={onReadAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.burgundy, fontWeight: '700' }}>모두 읽음</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
            {notifications.length === 0 ? (
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight, textAlign: 'center', paddingVertical: 48 }}>
                새 알림이 없어요
              </Text>
            ) : (
              notifications.map(n => {
                const isHost = HOST_TYPES.includes(n.type);
                const pending = n.type === 'apply' && n.status === 'pending';
                return (
                  <TouchableOpacity key={n.id} activeOpacity={0.8} onPress={() => onOpenPost(n)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 8,
                      backgroundColor: n.read ? C.bgSecondary : '#F0E8D8',
                      borderWidth: 0.5, borderColor: n.read ? C.hairline : '#E2D2A8' }}>
                    <Text style={{ fontSize: 18 }}>{NOTI_ICON[n.type] || '🔔'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, fontWeight: '700', marginBottom: 2,
                        color: isHost ? C.burgundy : '#3C7D4F' }}>
                        {isHost ? '내 모집글' : '내 참여·대기'}
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, lineHeight: 18,
                        fontWeight: n.read ? '400' : '600' }}>
                        {notiText(n)}
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 3 }}>{n.time}</Text>
                      {/* 참여 신청 — 수락 / 거절 */}
                      {pending && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity activeOpacity={0.85} onPress={() => onAccept(n)}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: C.burgundy }}>
                            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '700' }}>수락</Text>
                          </TouchableOpacity>
                          <TouchableOpacity activeOpacity={0.85} onPress={() => onReject(n)}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
                              backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, fontWeight: '600' }}>거절</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {!n.read && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.burgundy }} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
