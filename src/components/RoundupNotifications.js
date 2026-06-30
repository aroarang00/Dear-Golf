import React, { useContext, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { ROUNDUP_PUBLIC_ENABLED } from '../constants/roundup';
import { Icon } from './common/Icon'; // ⚙️ 설정 톱니바퀴 커스텀
import { TrustBadge } from './common/TrustBadge';
import { MannerBadge } from './common/MannerBadge';
import { UserContext } from '../contexts/UserContext';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';
import { OverlayAlert } from './common/OverlayAlert';
import { friendDisplayName } from '../utils/friendGroups';

// 라운지 알림 토글 — ON/OFF. comment(모집 댓글)는 주최자에게만 발송(RoundupTab.handleAddComment에서 생성).
const ROUNDUP_NOTI_TYPES = [
  { key: 'invite',           icon: '💌', label: '라운딩 초대',     sub: '친구가 나를 지정해 모집하면' },
  { key: 'confirmed',        icon: '✅', label: '동반자 참여',     sub: '내 모집에 친구가 참여하면' },
  { key: 'roundupFull',      icon: '🔔', label: '모집 인원 마감',   sub: '내 모집 인원이 다 차면(확정 안내)' },
  { key: 'cancel',           icon: '❌', label: '동반자 참여 취소', sub: '동반자가 참여를 취소하면' },
  { key: 'roundupCancelled', icon: '🚫', label: '모집 취소',       sub: '참여한 모집이 취소되면' },
  { key: 'waitlist',         icon: '⏳', label: '대기 신청',       sub: '내 모집글에 대기 신청이 들어오면' },
  { key: 'comment',          icon: '💬', label: '모집 댓글',       sub: '내 모집글에 댓글이 달리면' },
];
const DEFAULT_ROUNDUP_PREFS = { invite: true, confirmed: true, roundupFull: true, cancel: true, roundupCancelled: true, waitlist: true, comment: true };

const NOTI_ICON = {
  apply: '🙋', cancel: '❌', waitlistPromoted: '🎉', confirmed: '✅', waitlist: '⏳', comment: '💬', mannerEval: '😊',
  invite: '💌', roundupCancelled: '🚫', scheduleNotice: '📣', friendRequest: '🤝', roundupChanged: '✏️', roundupFull: '🔔',
  scheduleChanged: '🗓️', scheduleCancelled: '🚫',
  // 시스템 알림 (Cloud Functions)
  noshowReported: '⚠️', noshowReportSubmitted: '📩', noshowExplanationRequired: '⏰',
  noshowConfirmed: '🚫', noshowReporterConfirmed: '✅', noshowFalseReport: '🚫',
  noshowFalseReportConfirmed: '✅', noshowInconclusive: '⚖️', noshowCancelled: '✋',
  permanentBanAppealNotice: '⚠️', permanentBanFinalized: '🚫',
  recruitBanPermanentFinalized: '🚫',
  restrictionLifted: '🎉',
  mannerScoreUp: '💚', mannerScoreDown: '💢',
  contentReportConfirmed: '🚫', contentRecruitBan30d: '🚫',
  hostCancelledD7: '☔',
};
// 주최자(내 모집글)에 오는 알림 / 그 외는 내가 참여·대기한 모집의 알림
const HOST_TYPES = ['apply', 'cancel', 'waitlist'];
// 신청자 신뢰도가 표시되는 알림 타입 — 주최자가 승인·확인 판단 시 참고
const ACTOR_GRADE_TYPES = ['apply', 'cancel', 'waitlist'];

// 알림 시각 — Firestore createdAt(Timestamp) → 상대시간. 미해결(서버 반영 전)이면 빈 문자열.
function notiTime(n) {
  const ts = n.createdAt;
  const ms = typeof ts === 'number' ? ts : (ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : null));
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 60000) return '방금';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)}일 전`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function notiText(n, friendMeta) {
  // actor 표시 이름 — 내가 지정한 별명(customName) 우선, 없으면 닉네임(actorName, 과거 더미는 actor).
  //   별명은 owner-only 표시 resolve일 뿐, 알림 데이터(actorName)·서버 푸시는 닉네임 그대로 ([[friend_groups]])
  const who = friendDisplayName(friendMeta, n.actorUid, n.actorName || n.actor || '동반자');
  switch (n.type) {
    case 'apply':
      if (n.status === 'accepted') return `${who}님의 참여 신청을 수락했어요`;
      if (n.status === 'rejected') return `${who}님의 참여 신청을 거절했어요`;
      return `${who}님이 '${n.postTitle}' 모집에 참여 신청했어요`;
    case 'cancel':    return `${who}님이 '${n.postTitle}' 모집 참여를 취소했어요`;
    // 취소되면 모집글·연결 일정이 사라져 식별이 어려움 → 주최자 이름 + 코스명으로 최소 식별 정보 보장.
    //   오픈형은 코스 미정(postTitle 빈값)이라 주최자 이름으로 표시. "일정에서 확인"은 일정도 자동 삭제돼 제거.
    case 'roundupCancelled': return n.postTitle
      ? `${who}님의 '${n.postTitle}'${n.scheduleDate ? ` (${n.scheduleDate})` : ''} 모집이 취소됐어요`
      : `${who}님이 만든 모집이 취소됐어요`;
    // 자동 승격 — 자리가 나서 대기 순번대로 참여가 즉시 확정됨(호출·수락 단계 없음, [[roundup-waitlist-autopromote]])
    case 'waitlistPromoted': return `대기 중이던 '${n.postTitle}' 모집에 자리가 나서 즉시 참석이 확정됐어요 — 일정에서 확인하세요`;
    case 'confirmed': return `${who}님이 '${n.postTitle}' 모집에 참여했어요`;
    case 'invite': {
      // 오픈형은 코스 미정이라 postTitle 비거나 '라운딩 초대' 폴백 → 코스명 있을 때만 표기
      const inviter = friendDisplayName(friendMeta, n.actorUid, n.actorName || n.actor || '친구');
      const place = n.postTitle && n.postTitle !== '라운딩 초대' ? `'${n.postTitle}' ` : '';
      return `${inviter}님이 ${place}라운딩에 초대했어요`;
    }
    case 'waitlist':  return `${who}님이 '${n.postTitle}' 모집에 대기 신청했어요`;
    case 'comment':   return `${who}님이 '${n.postTitle}' 모집에 댓글을 남겼어요`;
    case 'scheduleNotice': {
      const when = [n.scheduleDate, n.scheduleTime].filter(Boolean).join(' ');
      return `${who}님이 '${n.postTitle}' 일정을 알렸어요${when ? ` · ${when}` : ''}`;
    }
    case 'friendRequest': return `${who}님이 친구 신청을 보냈어요`;
    case 'mannerEval':return `'${n.postTitle}' 라운딩이 끝났어요 — 동반자분들 어떠셨어요?`;

    // 노쇼 신고 (시스템)
    case 'noshowReported':
      return `'${n.postTitle}' 라운딩 노쇼 신고가 접수됐어요 — 7일 안에 신고자와 직접 해결할 수 있어요`;
    case 'noshowReportSubmitted':
      return `'${n.postTitle}' 라운딩 노쇼 신고가 정상 접수됐어요 — 7일 후 자동 확정`;
    case 'noshowExplanationRequired':
      return `'${n.postTitle}' 노쇼 신고 — 48시간 안에 소명을 제출해주세요`;
    case 'noshowConfirmed':
      return `'${n.postTitle}' 노쇼가 확정되어 매너 등급과 이용 정지가 적용됐어요`;
    case 'noshowReporterConfirmed':
      return `'${n.postTitle}' 노쇼 신고가 인정됐어요`;
    case 'noshowFalseReport':
      return `'${n.postTitle}' 신고가 허위로 판정되어 매너 등급과 이용 정지가 적용됐어요`;
    case 'noshowFalseReportConfirmed':
      return `'${n.postTitle}' 신고가 허위로 판정됐어요`;
    case 'noshowInconclusive':
      return `'${n.postTitle}' 노쇼 신고가 중립 종결됐어요 — 양쪽 모두 패널티 없음`;
    case 'noshowCancelled':
      return `'${n.postTitle}' 노쇼 신고가 신고자에 의해 취소됐어요`;

    // 영구 정지 7일 소명
    case 'permanentBanAppealNotice':
      return `누적 위반으로 영구 정지가 예정됐어요 — 7일 안에 소명을 제출하지 않으면 자동 적용돼요`;
    case 'permanentBanFinalized':
      return `영구 정지가 확정됐어요 — 이의는 마이페이지의 '자동 결정 이의 신청'으로 문의해주세요`;
    case 'recruitBanPermanentFinalized':
      return `영구 모집 박탈이 확정됐어요 — 이의는 마이페이지의 '자동 결정 이의 신청'으로 문의해주세요`;

    // 정지 해제 / 매너점수 변동
    case 'restrictionLifted':
      return `이용 정지가 해제됐어요 — 다시 모집과 참여를 이용할 수 있어요`;
    case 'mannerScoreUp':
      return `'${n.postTitle}' 라운딩 평가로 매너 등급이 올랐어요`;
    case 'mannerScoreDown':
      return `'${n.postTitle}' 라운딩 평가로 매너 등급이 내려갔어요`;

    // 콘텐츠 신고 결과
    case 'contentReportConfirmed':
      return `작성하신 게시물에 대한 신고가 확정되어 매너 점수가 감소했어요`;
    case 'contentRecruitBan30d':
      return `콘텐츠 신고 누적으로 30일 모집 정지가 적용됐어요`;

    case 'hostCancelledD7':
      return `'${n.postTitle}' 모집이 주최자에 의해 취소됐어요 — 주최자에 대한 매너 평가를 남길 수 있어요`;
    case 'roundupChanged':
      return `'${n.postTitle}' 모집 내용이 변경됐어요 — 날짜·장소·시간을 확인해주세요`;
    case 'roundupFull':
      return `'${n.postTitle}' 모집 인원이 다 모였어요 — '모집 확정하기'를 눌러 확정해주세요`;
    case 'scheduleChanged': {
      const when = [n.scheduleDate, n.scheduleTime].filter(Boolean).join(' ');
      return `${who}님이 '${n.postTitle}' 일정을 변경했어요${when ? ` — ${when}` : ' — 확인해주세요'}`;
    }
    case 'scheduleCancelled':
      return `${who}님이 '${n.postTitle}' 일정을 취소했어요${n.scheduleDate ? ` (${n.scheduleDate})` : ''}`;

    default:          return n.postTitle;
  }
}

// 알림함 — 내 모집글 알림 + 내가 참여·대기한 모집 알림. 참여 신청은 수락/거절 가능.
export function RoundupNotifications({ visible, notifications = [], friendMeta = {}, onClose, onOpenPost, onReadAll, onAccept, onReject, onGradePress, onDelete, onClearAll }) {
  const { userProfile, setUserProfile } = useContext(UserContext);
  const insets = useSafeAreaInsets();   // 안드 내비바 인셋 — 알림 설정 시트 하단 잘림 방지
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false); // 전체삭제 자체 confirm (모달 안에서 띄움)
  const [alert, setAlert] = useState(null);   // 모달 내부 OverlayAlert — 수락 확인창 등

  // 수락 확인 — 참여 확정 단순 안내. 수락 후엔 약속이 시작되니 신중히.
  // 전체공개 모집에만 발동(친구공개·친구지정은 즉시 확정, 신청 단계 X).
  const handleAcceptClick = (n) => {
    setAlert({
      title: '라운딩 모집이 확정되었어요',
      message: `${n.actorName || n.actor || '신청자'}님의 참여가 확정되고\n정원이 1명 늘어요.\n\n확정 후엔 동반자 약속이 시작돼요.`,
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '수락하기', onPress: () => onAccept && onAccept(n) },
      ],
    });
  };
  const prefs = userProfile?.roundupNotifyPrefs || DEFAULT_ROUNDUP_PREFS;
  // 토글 변경 → userProfile.roundupNotifyPrefs 갱신. Firestore 동기화는 App.js settings
  // write-through(userProfile.roundupNotifyPrefs 의존)가 자동 처리 → 서버가 발송 분기에서 읽음.
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
              <Icon name="gear" size={fs(20)} color={C.charcoal} strokeWidth={1.8} />
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
                paddingTop: 8, paddingBottom: 20 + insets.bottom }}>
                <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginBottom: 10 }} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 20, marginBottom: 4 }}>알림 설정</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, paddingHorizontal: 20, marginBottom: 12 }}>
                  종류별로 알림을 받을지 끌지 정해요.{'\n'}중요 알림(신고·패널티)은 끌 수 없어요.
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
                const showActorGrade = ACTOR_GRADE_TYPES.includes(n.type) && n.actorName && n.actorMannerScore != null;
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
                        {n.type === 'friendRequest' ? '친구' : (isHost ? '내 모집글' : '내 참여·대기')}
                      </Text>
                      <Text style={{ fontFamily: n.read ? F.sys : F.sysSb, fontSize: fs(13), color: C.charcoal, lineHeight: 18 }}>
                        {notiText(n, friendMeta)}
                      </Text>
                      {/* 신청자 신뢰도 — 주최자 승인 판단 참고용. 친구모집(전체공개 OFF)에선 무의미해 숨김 */}
                      {ROUNDUP_PUBLIC_ENABLED && showActorGrade && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
                          paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.bgPrimary,
                          borderWidth: 0.5, borderColor: C.hairline, alignSelf: 'flex-start' }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.charcoal }}>{friendDisplayName(friendMeta, n.actorUid, n.actorName)}</Text>
                          <TrustBadge grade={actorGrade} onPress={() => onGradePress?.(actorGrade.key)} />
                          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>
                            주최 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{n.actorHostedCount || 0}</Text>회 ·
                          </Text>
                          <MannerBadge score={n.actorMannerScore} size={13} />
                        </View>
                      )}
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>{notiTime(n)}</Text>
                      {/* 참여 신청 — 수락 / 거절 */}
                      {pending && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TouchableOpacity activeOpacity={0.85} onPress={() => handleAcceptClick(n)}
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
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
