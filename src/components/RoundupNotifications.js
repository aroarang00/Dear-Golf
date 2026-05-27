import React, { useContext, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge } from './common/TrustBadge';
import { MannerBadge } from './common/MannerBadge';
import { UserContext } from '../contexts/UserContext';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';

// 라운지 알림 6종 — 토글로 ON/OFF. Phase 2 백엔드(FCM) 연동 시 실제 푸시 발송 제어.
const ROUNDUP_NOTI_TYPES = [
  { key: 'apply',     icon: '🙋', label: '참여 신청 도착',  sub: '내 모집글에 신청이 들어오면' },
  { key: 'confirmed', icon: '✅', label: '참여 확정',      sub: '내 신청이 수락되면' },
  { key: 'cancel',    icon: '❌', label: '참여 취소',      sub: '동반자가 취소하면' },
  { key: 'waitlist',  icon: '⏳', label: '대기 신청',      sub: '내 모집글에 대기 신청이 들어오면' },
  { key: 'slotOpen',  icon: '🎉', label: '대기 자리 열림', sub: '대기 중인 모집에 자리가 나면' },
  { key: 'comment',   icon: '💬', label: '댓글',          sub: '참여한 모집에 새 댓글이 달리면' },
];
const DEFAULT_ROUNDUP_PREFS = { apply: true, confirmed: true, cancel: true, waitlist: true, slotOpen: true, comment: true };

const NOTI_ICON = { apply: '🙋', cancel: '❌', slotOpen: '🎉', confirmed: '✅', waitlist: '⏳', comment: '💬', mannerEval: '😊' };
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
    case 'comment':   return `${n.actor}님이 '${n.postTitle}' 모집에 댓글을 남겼어요`;
    case 'mannerEval':return `'${n.postTitle}' 라운딩이 끝났어요 — 동반자분들 어떠셨어요?`;
    default:          return n.postTitle;
  }
}

// 알림함 — 내 모집글 알림 + 내가 참여·대기한 모집 알림. 참여 신청은 수락/거절 가능.
export function RoundupNotifications({ visible, notifications = [], onClose, onOpenPost, onReadAll, onAccept, onReject, onGradePress, onDelete, onClearAll }) {
  const { userProfile, setUserProfile } = useContext(UserContext);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false); // 전체삭제 자체 confirm (모달 안에서 띄움)
  const prefs = userProfile?.roundupNotifyPrefs || DEFAULT_ROUNDUP_PREFS;
  const togglePref = (key) => {
    const next = { ...userProfile, roundupNotifyPrefs: { ...prefs, [key]: !prefs[key] } };
    setUserProfile(next);
    storage.save(STORAGE_KEYS.profile, next);
  };
  useOverlayBackHandler(settingsOpen, () => setSettingsOpen(false));
  useOverlayBackHandler(confirmClear, () => setConfirmClear(false));

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
              <TouchableOpacity onPress={() => setConfirmClear(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>전체삭제</Text>
              </TouchableOpacity>
            )}
            {/* 알림 설정 — 라운지 알림 종류별 ON/OFF */}
            <TouchableOpacity onPress={() => setSettingsOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(18) }}>⚙️</Text>
            </TouchableOpacity>
          </View>

          {/* 전체삭제 confirm — 알림 모달 안에서 띄워야 안 가려짐 (RoundupTab의 alert은 모달 뒤에 깔림) */}
          {confirmClear && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
              <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                activeOpacity={1} onPress={() => setConfirmClear(false)} />
              <View style={{ backgroundColor: C.bgPrimary, borderRadius: 14, paddingTop: 22, paddingHorizontal: 22, paddingBottom: 14,
                width: '85%', maxWidth: 340 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, textAlign: 'center', marginBottom: 8 }}>
                  알림 전체 삭제
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 19, marginBottom: 18 }}>
                  모든 알림을 지울까요?{'\n'}되돌릴 수 없어요.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setConfirmClear(false)} activeOpacity={0.85}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                      backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setConfirmClear(false); onClearAll?.(); }} activeOpacity={0.85}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                      backgroundColor: '#8B2A2A' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>전체삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 알림 설정 시트 — 6종 토글 (Phase 2 백엔드 연동 시 실제 푸시 발송 제어) */}
          {settingsOpen && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', zIndex: 10 }}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSettingsOpen(false)} />
              <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 18, borderTopRightRadius: 18,
                paddingTop: 8, paddingBottom: 28 }}>
                <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginBottom: 10 }} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 20, marginBottom: 4 }}>알림 설정</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, paddingHorizontal: 20, marginBottom: 12 }}>
                  종류별로 알림을 받을지 끌지 정해요. 중요 알림(신고·패널티)은 끌 수 없어요.
                </Text>
                <ScrollView style={{ maxHeight: 360 }}>
                  {ROUNDUP_NOTI_TYPES.map((t, i) => {
                    const on = prefs[t.key] !== false;
                    return (
                      <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20,
                        borderTopWidth: i === 0 ? 0.5 : 0, borderBottomWidth: 0.5, borderColor: C.hairline }}>
                        <Text style={{ fontSize: fs(18), marginRight: 12 }}>{t.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysM, fontSize: fs(14), color: C.charcoal }}>{t.label}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{t.sub}</Text>
                        </View>
                        <TouchableOpacity onPress={() => togglePref(t.key)} activeOpacity={0.8}
                          style={{ width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center',
                            backgroundColor: on ? C.burgundy : C.hairline }}>
                          <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff',
                            alignSelf: on ? 'flex-end' : 'flex-start' }} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}

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
