// =============================================================
// Dear Golf — Cloud Functions (2nd gen)
//
// 트리거 영역:
//   §A 라운지 자동 처리   — 정원 트랜잭션, closeRoundup, slotOpen 알림
//   §B 노쇼 SLA          — 7일 grace, 48h 소명, 48h 검토
//   §C 매너 평가         — 48h 윈도우 후 익명 일괄 집계
//   §D 콘텐츠 신고 SLA   — 3일 자동 거부, 골퍼코멘트 3건 누적 자동 가림
//   §E 푸시 발송         — Expo Push API 통해 알림 발송
//   §F 스케줄            — banned_users 만료, 12개월 카운트 -1
//
// 각 영역은 별도 파일로 분리 권장 (현재는 스켈레톤만).
// =============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

initializeApp();
const db = getFirestore();

// =============================================================
// §E 푸시 발송 — Expo Push API
// 알림 문서 생성 시 자동 발송. 사용자 settings.roundupNotifyPrefs로 일반 알림 토글 가능.
// 중요 알림(priority='important')은 토글 무시하고 항상 발송.
// =============================================================

async function sendExpoPush(token, title, body, data = {}) {
  if (!token) return;
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
      }),
    });
    if (!res.ok) {
      logger.warn('[push] expo api non-ok', res.status);
    }
  } catch (e) {
    logger.warn('[push] send fail', e?.message);
  }
}

// roundupNotifications 생성 시 푸시 발송 (인앱은 클라이언트가 직접 읽음)
exports.onNotificationCreated = onDocumentCreated('roundupNotifications/{notiId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const { recipientUid, type, postTitle, actorName, priority, scheduleDate, scheduleTime } = data;
  if (!recipientUid) return;

  // slotPassed(대기 넘어감)는 긴급하지 않아 인앱 알림함·배지로만 — 푸시는 보내지 않음(알림 과다 방지).
  //   인앱 문서는 이미 생성돼 있으므로 여기서 return해도 알림함엔 그대로 남는다(유저 문서 read도 절약).
  if (type === 'slotPassed') return;

  // 수신자 settings 조회 — 일반 알림이면 토글 체크, 중요 알림은 무시
  const userSnap = await db.doc(`users/${recipientUid}`).get();
  if (!userSnap.exists) return;
  const user = userSnap.data();
  // 라운지 알림(roundupNotifyPrefs) + 마이페이지 알림(notifyPrefs: friendRequest 등) 양쪽 토글 병합
  const prefs = { ...(user.settings?.roundupNotifyPrefs || {}), ...(user.settings?.notifyPrefs || {}) };
  const isImportant = priority === 'important';
  // 일반 알림은 type별 토글 체크
  if (!isImportant && prefs[type] === false) return;

  const token = user.pushToken;
  if (!token) return;

  const title = titleFor(type);
  const body = bodyFor(type, { postTitle, actorName, scheduleDate, scheduleTime });
  await sendExpoPush(token, title, body, { type, postId: data.postId, notiId: event.params.notiId });
});

// DM 메시지 생성 시 상대에게 푸시 — 마이페이지 'DM 알림' 토글(settings.notifyPrefs.dm) 기본 ON, false면 차단.
//   친구 1:1이라 수신자=상대 1명. 인앱 알림함(roundupNotifications)은 안 거치고 푸시만 보냄(알림함 오염 방지).
//   안 읽음·대화방별 음소거는 출시 후([[dm-design]]). 수신자가 방을 열어둔 경우의 중복은 감수(presence 미구현).
exports.onDmMessageCreated = onDocumentCreated('conversations/{pairId}/messages/{msgId}', async (event) => {
  const msg = event.data?.data();
  if (!msg || !msg.senderUid || !msg.body) return;
  const senderUid = msg.senderUid;
  try {
    const convSnap = await db.doc(`conversations/${event.params.pairId}`).get();
    const participants = convSnap.exists ? (convSnap.data().participantUids || []) : [];
    const recipientUid = participants.find(u => u && u !== senderUid);
    if (!recipientUid) return;
    // 안읽음 카운트 +1 (수신자) — DM 목록 뱃지용. 수신자가 방을 열어 읽으면 markConversationRead가 본인 unread를 0으로 리셋.
    db.doc(`conversations/${event.params.pairId}`).update({ [`unread.${recipientUid}`]: FieldValue.increment(1) }).catch(() => {});
    const [rSnap, sSnap] = await Promise.all([
      db.doc(`users/${recipientUid}`).get(),
      db.doc(`users/${senderUid}`).get(),
    ]);
    if (!rSnap.exists) return;
    const r = rSnap.data();
    if (r.settings?.notifyPrefs?.dm === false) return;   // 마이페이지에서 DM 알림 OFF
    // 수신자가 발신자를 차단 — 푸시 차단(규칙이 전송을 막지만, 규칙 배포 전 잔존 메시지·우회 방어)
    if (Array.isArray(r.blockedUids) && r.blockedUids.includes(senderUid)) return;
    const token = r.pushToken;
    if (!token) return;
    const senderName = (sSnap.exists && sSnap.data().nickname) ? sSnap.data().nickname : '친구';
    const preview = msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;
    await sendExpoPush(token, senderName, preview, { type: 'dm', pairId: event.params.pairId, senderUid });
  } catch (e) {
    logger.warn('[dm] push fail', e?.message);
  }
});

// 일정 전파 초대 생성 시 audience(초대받은 친구)에게 푸시 — 홈 배너가 인앱 담당, 푸시만(알림함 미오염, DM과 동일 패턴).
//   audienceUids 다수라 병렬 발송. 본인·토큰없음·토글 OFF는 건너뜀. ([[schedule-propagation-spec]])
exports.onScheduleGroupCreated = onDocumentCreated('scheduleGroups/{groupId}', async (event) => {
  const g = event.data?.data();
  if (!g || !g.initiatorUid || !Array.isArray(g.audienceUids)) return;
  const targets = g.audienceUids.filter(u => u && u !== g.initiatorUid);
  if (!targets.length) return;
  const courseT = g.course ? `'${g.course}'` : '라운딩';
  const body = `${g.initiatorName ? g.initiatorName + '님이 ' : ''}${courseT} 일정에 초대했어요${g.date ? ` — ${g.date}` : ''}`;
  await Promise.all(targets.map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.scheduleInvite === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '일정 초대', body, { type: 'scheduleInvite', groupId: event.params.groupId });
    } catch (e) { logger.warn('[scheduleInvite] push fail', e?.message); }
  }));
});

// 스코어 공유 생성 시 audience(동반자)에게 푸시 — MY 배너가 인앱 담당, 푸시로 발견성 보강(사용자 요청 2026-06-17).
exports.onScoreShareCreated = onDocumentCreated('roundScoreShares/{shareId}', async (event) => {
  const s = event.data?.data();
  if (!s || !s.authorUid || !Array.isArray(s.audienceUids)) return;
  const targets = s.audienceUids.filter(u => u && u !== s.authorUid);
  if (!targets.length) return;
  const courseT = s.course ? `'${s.course}'` : '라운딩';
  const body = `${s.authorName ? s.authorName + '님이 ' : ''}${courseT} 스코어를 공유했어요 — 내 점수를 추가해보세요`;
  await Promise.all(targets.map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.scoreShare === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '스코어 공유', body, { type: 'scoreShare', shareId: event.params.shareId });
    } catch (e) { logger.warn('[scoreShare] push fail', e?.message); }
  }));
});

// 뒤풀이 제안 생성 시 동반자(audience)에게 푸시 — 홈 카드/시트가 인앱 담당, 푸시만(라운딩 후 결정 알림). ([[afterround-meal-decision]])
//   장소 교체(re-propose)는 setDoc 덮어쓰기=update라 onCreate 미발동 → 최초 제안만 푸시(교체 재알림은 후속).
exports.onMealSuggestionCreated = onDocumentCreated('mealSuggestions/{id}', async (event) => {
  const m = event.data?.data();
  if (!m || !m.authorUid || !Array.isArray(m.audienceUids)) return;
  const targets = m.audienceUids.filter(u => u && u !== m.authorUid);
  if (!targets.length) return;
  const placeName = m.place?.name || '식당';
  const body = `${m.authorName ? m.authorName + '님이 ' : ''}뒤풀이로 '${placeName}'을 제안했어요${m.course ? ` — ${m.course}` : ''}`;
  await Promise.all(targets.map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.mealSuggestion === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '뒤풀이 제안', body, { type: 'mealSuggestion', mealId: event.params.id });
    } catch (e) { logger.warn('[meal] push fail', e?.message); }
  }));
});

// 푸시 제목·본문 — 인앱 알림함(RoundupNotifications.js notiText)과 타입·톤 일치.
// 누락 타입은 default로 빠지므로, 새 알림 타입 추가 시 양쪽 모두 갱신할 것.
function titleFor(type) {
  switch (type) {
    // 라운지 일반
    case 'apply':       return '새 참여 신청';
    case 'confirmed':   return '참여 확정';
    case 'cancel':      return '참여 취소';
    case 'waitlist':    return '새 대기 신청';
    case 'kicked':      return '참여 취소 안내';
    case 'slotOpen':    return '대기 자리 열림';
    case 'slotPassed':  return '대기 안내';
    case 'comment':     return '새 댓글';
    case 'mannerEval':  return '매너 평가 요청';
    case 'hostCancelledD7': return '모집 취소 안내';
    case 'scheduleNotice':  return '라운딩 일정 알림';
    case 'friendRequest':   return '새 친구 신청';
    case 'invite':          return '라운딩 초대';
    case 'roundupChanged':  return '모집 내용 변경';
    case 'roundupCancelled': return '모집 취소';
    case 'roundupFull':     return '모집 인원 마감';
    case 'scheduleChanged':   return '일정 변경';
    case 'scheduleCancelled': return '일정 취소';
    // 노쇼 신고
    case 'noshowReported':            return '노쇼 신고 접수';
    case 'noshowReportSubmitted':     return '노쇼 신고 접수됨';
    case 'noshowExplanationRequired': return '소명 요청';
    case 'noshowConfirmed':           return '노쇼 확정';
    case 'noshowReporterConfirmed':   return '노쇼 신고 처리';
    case 'noshowFalseReport':         return '신고 결과 안내';
    case 'noshowFalseReportConfirmed':return '신고 결과 안내';
    case 'noshowInconclusive':        return '노쇼 신고 종결';
    case 'noshowCancelled':           return '노쇼 신고 취소';
    // 정지·등급
    case 'permanentBanAppealNotice':  return '영구 정지 예정 안내';
    case 'permanentBanFinalized':     return '영구 정지 확정';
    case 'recruitBanPermanentFinalized': return '모집 자격 박탈 확정';
    case 'restrictionLifted':         return '이용 정지 해제';
    case 'mannerScoreUp':             return '매너 등급 상승';
    case 'mannerScoreDown':           return '매너 등급 변동';
    // 콘텐츠 신고
    case 'contentReportConfirmed':    return '게시물 신고 결과';
    case 'contentRecruitBan30d':      return '모집 정지 안내';
    default:            return 'Dear Golf 알림';
  }
}

function bodyFor(type, { postTitle = '', actorName = '', scheduleDate = '', scheduleTime = '' }) {
  const t = postTitle ? `'${postTitle}'` : '라운딩';
  switch (type) {
    case 'scheduleNotice': {
      const when = [scheduleDate, scheduleTime].filter(Boolean).join(' ');
      return `${actorName ? actorName + '님이 ' : ''}${t} 일정을 알렸어요${when ? ` — ${when}` : ''}`;
    }
    case 'friendRequest': return `${actorName || '누군가'}님이 친구 신청을 보냈어요`;
    // 오픈형은 코스 미정 → postTitle 빈값이라 코스명 있을 때만 표기 (notiText와 동일)
    case 'invite':      return `${actorName || '친구'}님이 ${postTitle ? `'${postTitle}' ` : ''}라운딩에 초대했어요`;
    // 라운지 일반
    case 'apply':       return `${actorName}님이 ${t} 모집에 참여 신청했어요`;
    case 'confirmed':   return `${t} 모집 참여가 확정됐어요`;
    case 'cancel':      return `${actorName}님이 ${t} 모집 참여를 취소했어요`;
    case 'waitlist':    return `${actorName}님이 ${t} 모집에 대기 신청했어요`;
    case 'kicked':      return `${t} 모집 참여가 주최자 사정으로 취소됐어요`;
    case 'slotOpen':    return `대기 중이던 ${t} 모집에 자리가 났어요 — 시간 내에 응답해주세요`;
    case 'slotPassed':  return `대기 중이던 ${t} 모집은 이번엔 다음 분께 자리가 넘어갔어요 — 다시 대기 신청할 수 있어요`;
    case 'comment':     return `${actorName}님이 ${t} 모집에 댓글을 남겼어요`;
    case 'mannerEval':  return `${t} 라운딩이 끝났어요 — 동반자분들 어떠셨어요?`;
    case 'hostCancelledD7': return `${t} 모집이 주최자에 의해 취소됐어요 — 매너 평가를 남길 수 있어요`;
    case 'roundupChanged':  return `${t} 모집 내용이 변경됐어요 — 날짜·장소·시간을 확인해주세요`;
    case 'roundupFull':     return `${t} 모집 인원이 다 모였어요 — '모집 확정하기'를 눌러 확정해주세요`;
    case 'scheduleChanged': {
      const when = [scheduleDate, scheduleTime].filter(Boolean).join(' ');
      return `${actorName ? actorName + '님이 ' : ''}${t} 일정을 변경했어요${when ? ` — ${when}` : ' — 확인해주세요'}`;
    }
    case 'scheduleCancelled': return `${actorName ? actorName + '님이 ' : ''}${t} 일정을 취소했어요${scheduleDate ? ` (${scheduleDate})` : ''}`;
    case 'roundupCancelled': return postTitle
      ? `${actorName ? actorName + '님의 ' : ''}'${postTitle}'${scheduleDate ? ` (${scheduleDate})` : ''} 모집이 취소됐어요`
      : `${actorName ? actorName + '님이 만든 ' : ''}모집이 취소됐어요`;
    // 노쇼 신고
    case 'noshowReported':            return `${t} 라운딩 노쇼 신고가 접수됐어요 — 7일 안에 신고자와 직접 해결할 수 있어요`;
    case 'noshowReportSubmitted':     return `${t} 라운딩 노쇼 신고가 정상 접수됐어요`;
    case 'noshowExplanationRequired': return `${t} 노쇼 신고 — 48시간 안에 소명을 제출해주세요`;
    case 'noshowConfirmed':           return `${t} 노쇼가 확정되어 매너 등급과 이용 정지가 적용됐어요`;
    case 'noshowReporterConfirmed':   return `${t} 노쇼 신고가 인정됐어요`;
    case 'noshowFalseReport':         return `${t} 신고가 허위로 판정되어 매너 등급과 이용 정지가 적용됐어요`;
    case 'noshowFalseReportConfirmed':return `${t} 신고가 허위로 판정됐어요`;
    case 'noshowInconclusive':        return `${t} 노쇼 신고가 중립 종결됐어요 — 양쪽 모두 패널티 없음`;
    case 'noshowCancelled':           return `${t} 노쇼 신고가 신고자에 의해 취소됐어요`;
    // 정지·등급
    case 'permanentBanAppealNotice':  return `누적 위반으로 영구 정지가 예정됐어요 — 7일 안에 소명하지 않으면 자동 적용돼요`;
    case 'permanentBanFinalized':     return `영구 정지가 확정됐어요 — 이의는 마이페이지에서 신청할 수 있어요`;
    case 'recruitBanPermanentFinalized': return `영구 모집 자격 박탈이 확정됐어요 — 이의는 마이페이지에서 신청할 수 있어요`;
    case 'restrictionLifted':         return `이용 정지가 해제됐어요 — 다시 모집과 참여를 이용할 수 있어요`;
    case 'mannerScoreUp':             return `${t} 라운딩 평가로 매너 등급이 올랐어요`;
    case 'mannerScoreDown':           return `${t} 라운딩 평가로 매너 등급이 내려갔어요`;
    // 콘텐츠 신고
    case 'contentReportConfirmed':    return `작성하신 게시물 신고가 확정되어 매너 점수가 감소했어요`;
    case 'contentRecruitBan30d':      return `콘텐츠 신고 누적으로 30일 모집 정지가 적용됐어요`;
    default:            return postTitle || '확인해주세요';
  }
}

// =============================================================
// §B 노쇼 SLA — ./noshow.js (CF3)
//   onNoshowReportCreated   — 신고 접수 시 deadline 기록 + 피신고자 중대 알림
//   noshowSlaTick           — 시간당 스케줄러 (7일/48h/48h 자동 전환)
//   onNoshowReportUpdated   — 최종 상태 적용 (매너-20·정지·카운트+1, 양쪽 통보)
// =============================================================
const noshow = require('./noshow');
exports.onNoshowReportCreated = noshow.onNoshowReportCreated;
exports.noshowSlaTick = noshow.noshowSlaTick;
exports.onNoshowReportUpdated = noshow.onNoshowReportUpdated;

// =============================================================
// §C 매너 평가 — ./manner.js (CF4)
//   onRoundupCreatedForManner  — roundup 생성 시 mannerEvalDeadline 기록(scope='all'만)
//   mannerAggregationTick      — 시간당 스케줄러 (deadline 경과 모집 일괄 집계 + delta 적용)
// =============================================================
const manner = require('./manner');
exports.onRoundupCreatedForManner = manner.onRoundupCreatedForManner;
exports.mannerAggregationTick = manner.mannerAggregationTick;
exports.mannerEvalNotifyTick = manner.mannerEvalNotifyTick;

// =============================================================
// §F 스케줄러 — ./scheduled.js (CF7)
//   restrictionExpiryTick      — 매일 04:00 KST. 정지 만료 해제 + 통보
//   bannedExpiryTick           — 매일 04:30 KST. banned_users 만료 정리
//   monthlyPenaltyCountTick    — 매월 1일 00:30 KST. noshow/false 카운트 -1
// =============================================================
const scheduled = require('./scheduled');
exports.restrictionExpiryTick = scheduled.restrictionExpiryTick;
exports.bannedExpiryTick = scheduled.bannedExpiryTick;
exports.monthlyPenaltyCountTick = scheduled.monthlyPenaltyCountTick;
exports.permanentBanFinalizeTick = scheduled.permanentBanFinalizeTick;
exports.locationLogExpiryTick = scheduled.locationLogExpiryTick;

// =============================================================
// §D 콘텐츠 신고 — ./contentReports.js (CF5)
//   onContentReportCreated     — reportedCount +1, 골퍼코멘트 3건 누적 자동 가림
//   contentReportSlaTick       — 시간당 스케줄러 (3일 SLA 자동 거부)
//   onContentReportUpdated     — confirmed 시 게시물 삭제+누적·제재, rejected 시 가림 해제
// =============================================================
const contentReports = require('./contentReports');
exports.onContentReportCreated = contentReports.onContentReportCreated;
exports.contentReportSlaTick = contentReports.contentReportSlaTick;
exports.onContentReportUpdated = contentReports.onContentReportUpdated;

// =============================================================
// 운영 이메일 — ./email.js (SendGrid 신고 접수 알림)
// ⚠️ 비활성화 (2026-06-02): SendGrid 키 미발급이라 SENDGRID_API_KEY secret이 없어
//    배포가 막힘. 운영자 알림 전용이라 앱 기능엔 무관(신고는 Firestore에 기록되고
//    SLA·제재는 noshow.js/contentReports.js가 처리). SendGrid 설정 후 아래 4줄 주석 해제로 복구.
// const email = require('./email');
// exports.onReportCreatedEmail = email.onReportCreatedEmail;
// exports.onContentReportCreatedEmail = email.onContentReportCreatedEmail;
// exports.onNoshowReportCreatedEmail = email.onNoshowReportCreatedEmail;

// =============================================================
// §A 라운지 자동 — ./roundup.js (CF2)
//   onRoundupUpdated       — 정원 만석 자동 closed / 자리 열림 시 대기자 호출 / D-7 주최자 취소 매너 평가
//   waitlistCallCutoffTick — 12h 응답 없으면 다음 대기자에게 인계
// =============================================================
const roundup = require('./roundup');
exports.onRoundupUpdated = roundup.onRoundupUpdated;
exports.waitlistCallCutoffTick = roundup.waitlistCallCutoffTick;

// =============================================================
// 스코어카드 OCR — ./ocr.js (네이버 CLOVA OCR 프록시)
//   recognizeScorecard — onCall. 앱 이미지(base64) → CLOVA → 텍스트+좌표 반환
//   Secret: CLOVA_OCR_SECRET, CLOVA_OCR_URL (functions:secrets:set 으로 등록)
// =============================================================
const ocr = require('./ocr');
exports.recognizeScorecard = ocr.recognizeScorecard;
