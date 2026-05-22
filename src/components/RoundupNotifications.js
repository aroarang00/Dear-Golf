import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge } from './common/TrustBadge';
import { MannerBadge } from './common/MannerBadge';

const NOTI_ICON = { apply: '🙋', cancel: '❌', slotOpen: '🎉', confirmed: '✅', waitlist: '⏳' };
// 주최자(내 모집글)에 오는 알림 / 그 외는 내가 참여·대기한 모집의 알림
const HOST_TYPES = ['apply', 'cancel', 'waitlist'];
// 신청자 신뢰도가 표시되는 알림 타입 — 주최자가 승인·확인 판단 시 참고
const ACTOR_GRADE_TYPES = ['apply', 'cancel', 'waitlist'];

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
export function RoundupNotifications({ visible, notifications = [], onClose, onOpenPost, onReadAll, onAccept, onReject, onGradePress, onDelete, onClearAll }) {
  const hasUnread = notifications.some(n => !n.read);
  const hasAny = notifications.length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>알림</Text>
            <View style={{ flex: 1 }} />
            {hasUnread && (
              <TouchableOpacity onPress={onReadAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy }}>모두 읽음</Text>
              </TouchableOpacity>
            )}
            {hasAny && onClearAll && (
              <TouchableOpacity onPress={onClearAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>전체삭제</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
            {notifications.length === 0 ? (
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 48 }}>
                새 알림이 없어요
              </Text>
            ) : (
              notifications.map(n => {
                const isHost = HOST_TYPES.includes(n.type);
                const pending = n.type === 'apply' && n.status === 'pending';
                const showActorGrade = ACTOR_GRADE_TYPES.includes(n.type) && n.actor && n.actorMannerScore != null;
                const actorGrade = showActorGrade ? getTrustGrade(n.actorHostedCount || 0, n.actorMannerScore) : null;
                return (
                  <TouchableOpacity key={n.id} activeOpacity={0.8} onPress={() => onOpenPost(n)}
                    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, marginBottom: 8,
                      backgroundColor: n.read ? C.bgSecondary : '#F0E8D8',
                      borderWidth: 0.5, borderColor: n.read ? C.hairline : '#E2D2A8' }}>
                    <Text style={{ fontSize: fs(18), marginTop: 1 }}>{NOTI_ICON[n.type] || '🔔'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(10), marginBottom: 2,
                        color: isHost ? C.burgundy : '#3C7D4F' }}>
                        {isHost ? '내 모집글' : '내 참여·대기'}
                      </Text>
                      <Text style={{ fontFamily: n.read ? F.sys : F.sysSb, fontSize: fs(13), color: C.charcoal, lineHeight: 18 }}>
                        {notiText(n)}
                      </Text>
                      {/* 신청자 신뢰도 — 주최자가 승인 판단 시 참고 */}
                      {showActorGrade && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
                          paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.bgPrimary,
                          borderWidth: 0.5, borderColor: C.hairline, alignSelf: 'flex-start' }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.charcoal }}>{n.actor}</Text>
                          <TrustBadge grade={actorGrade} onPress={() => onGradePress?.(actorGrade.key)} />
                          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>
                            주최 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{n.actorHostedCount || 0}</Text>회 ·
                          </Text>
                          <MannerBadge score={n.actorMannerScore} size={13} />
                        </View>
                      )}
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>{n.time}</Text>
                      {/* 참여 신청 — 수락 / 거절 */}
                      {pending && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity activeOpacity={0.85} onPress={() => onAccept(n)}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: C.burgundy }}>
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>수락</Text>
                          </TouchableOpacity>
                          <TouchableOpacity activeOpacity={0.85} onPress={() => onReject(n)}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
                              backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>거절</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 8 }}>
                      {!n.read && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.burgundy, marginTop: 4 }} />
                      )}
                      {onDelete && (
                        <TouchableOpacity onPress={() => onDelete(n)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={{ paddingHorizontal: 2 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(16), color: C.warmGray, lineHeight: 18 }}>×</Text>
                        </TouchableOpacity>
                      )}
                    </View>
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
