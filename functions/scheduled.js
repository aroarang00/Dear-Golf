// =============================================================
// §F 스케줄러 — 일일·월간 정리
//
// 주요 작업:
//   restrictionExpiryTick      — 매일 04:00 KST. users.restrictUntil 만료 시 자동 해제
//   bannedExpiryTick           — 매일 04:30 KST. banned_users.unblockAt 만료 doc 삭제
//   monthlyPenaltyCountTick    — 매월 1일 00:30 KST. noshowCount·falseReportCount -1
//                                (정책 §9 — 12개월 시점 자동 -1을 매월 -1로 근사. 평균 회복 12개월)
//
// 정책: [[noshow-report-system]] §9, [[account-deletion]] §5
// =============================================================

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();
const DAY_MS = 24 * 3600 * 1000;

// (1) 정지 만료 자동 해제 — 매일 04:00 KST
exports.restrictionExpiryTick = onSchedule({ schedule: '0 4 * * *', timeZone: 'Asia/Seoul' }, async () => {
  const nowIso = new Date().toISOString();
  try {
    const snap = await db.collection('users')
      .where('isRestricted', '==', true)
      .where('restrictUntil', '<=', nowIso)
      .limit(500)
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.restrictUntil) continue;  // 영구(null)는 자동 해제 X
      await doc.ref.set({
        isRestricted: false,
        restrictUntil: null,
        restrictReason: null,
        restrictReleasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      // 본인 알림
      await db.collection('roundupNotifications').add({
        type: 'restrictionLifted',
        actorUid: 'system',
        actorName: '',
        recipientUid: doc.id,
        postId: null,
        postTitle: '',
        priority: 'important',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(e => logger.warn('[sched] restrictLifted noti fail', e?.message));
    }
  } catch (e) {
    logger.warn('[sched] restriction expiry tick fail', e?.message);
  }
});

// (2) banned_users 만료 정리 — 매일 04:30 KST
// unblockAt 만료(영구 X) 시 doc 삭제 → 재가입 차단 풀림.
// 미성년 사후 해지: unblockAt = 만19세 도달일 → 도달 시점 자동 해제 ([[account-deletion]] §5)
exports.bannedExpiryTick = onSchedule({ schedule: '30 4 * * *', timeZone: 'Asia/Seoul' }, async () => {
  const nowIso = new Date().toISOString();
  try {
    const snap = await db.collection('banned_users')
      .where('unblockAt', '<=', nowIso)
      .limit(500)
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.unblockAt) continue;  // 영구는 unblockAt=null이라 쿼리에서 제외되지만 안전망
      await doc.ref.delete().catch(e => logger.warn('[sched] banned delete fail', doc.id, e?.message));
    }
  } catch (e) {
    logger.warn('[sched] banned expiry tick fail', e?.message);
  }
});

// (2-A) 영구 정지 7일 소명 기간 경과 자동 적용 — 매일 04:15 KST
// users.permanentPendingAppealUntil 또는 recruitPermanentPendingAppealUntil <= now면 영구 적용.
// 소명을 제출하면 디어골프 콘솔에서 수동 해제(필드 삭제)하거나 검토 후 적용.
exports.permanentBanFinalizeTick = onSchedule({ schedule: '15 4 * * *', timeZone: 'Asia/Seoul' }, async () => {
  const nowIso = new Date().toISOString();
  // (A) 노쇼/허위신고 영구 정지 적용
  try {
    const snap = await db.collection('users')
      .where('permanentPendingAppealUntil', '<=', nowIso)
      .limit(500)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const reason = d.permanentPendingReason || 'noshow';
      await doc.ref.set({
        isRestricted: true,
        restrictUntil: null,                // 영구
        restrictReason: `${reason}_permanent`,
        permanentPendingAppealUntil: FieldValue.delete(),
        permanentPendingReason: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await db.collection('roundupNotifications').add({
        type: 'permanentBanFinalized',
        actorUid: 'system', actorName: '',
        recipientUid: doc.id,
        postId: null, postTitle: '',
        priority: 'important',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  } catch (e) {
    logger.warn('[sched] permanent ban (noshow/false) finalize fail', e?.message);
  }
  // (B) 콘텐츠 신고 영구 모집 박탈 적용
  try {
    const snap = await db.collection('users')
      .where('recruitPermanentPendingAppealUntil', '<=', nowIso)
      .limit(500)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const reason = d.recruitPermanentPendingReason || 'content';
      await doc.ref.set({
        isRecruitRestrictedPermanent: true,
        recruitRestrictReason: `${reason}_permanent`,
        recruitPermanentPendingAppealUntil: FieldValue.delete(),
        recruitPermanentPendingReason: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await db.collection('roundupNotifications').add({
        type: 'recruitBanPermanentFinalized',
        actorUid: 'system', actorName: '',
        recipientUid: doc.id,
        postId: null, postTitle: '',
        priority: 'important',
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  } catch (e) {
    logger.warn('[sched] permanent recruit ban finalize fail', e?.message);
  }
});

// (2-B) 위치정보 이용·제공사실 확인자료 6개월 자동 삭제 — 매일 05:00 KST.
// 위치정보법 제16조 제2항 · 변호사 권고 C-2.
exports.locationLogExpiryTick = onSchedule({ schedule: '0 5 * * *', timeZone: 'Asia/Seoul' }, async () => {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 180 * DAY_MS));
  try {
    const snap = await db.collection('locationAccessLogs')
      .where('accessedAt', '<=', cutoff)
      .limit(1000)
      .get();
    for (const doc of snap.docs) {
      await doc.ref.delete().catch(e => logger.warn('[sched] locationLog delete fail', doc.id, e?.message));
    }
  } catch (e) {
    logger.warn('[sched] locationLog expiry tick fail', e?.message);
  }
});

// (3) 노쇼·허위신고 카운트 매월 -1 — 매월 1일 00:30 KST
// 정책 §9: 12개월 시점 자동 -1 (절대 만료). 매월 -1로 근사 — 평균 회복 12개월 가까이.
// 정확한 시점별 추적은 별도 컬렉션 필요(향후 보강).
exports.monthlyPenaltyCountTick = onSchedule({ schedule: '30 0 1 * *', timeZone: 'Asia/Seoul' }, async () => {
  try {
    // noshowCount > 0 사용자 일괄 처리
    const noshowSnap = await db.collection('users')
      .where('noshowCount', '>', 0)
      .limit(500)
      .get();
    for (const doc of noshowSnap.docs) {
      await doc.ref.set({
        noshowCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  } catch (e) {
    logger.warn('[sched] noshow count -1 fail', e?.message);
  }
  try {
    const falseSnap = await db.collection('users')
      .where('falseReportCount', '>', 0)
      .limit(500)
      .get();
    for (const doc of falseSnap.docs) {
      await doc.ref.set({
        falseReportCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  } catch (e) {
    logger.warn('[sched] falseReport count -1 fail', e?.message);
  }
  // 콘텐츠 신고 확정 카운트도 동일하게 매월 -1 (정책 §7 12개월 롤링 근사, [[content-report-policy]])
  try {
    const contentSnap = await db.collection('users')
      .where('contentReportConfirmedCount', '>', 0)
      .limit(500)
      .get();
    for (const doc of contentSnap.docs) {
      await doc.ref.set({
        contentReportConfirmedCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  } catch (e) {
    logger.warn('[sched] content count -1 fail', e?.message);
  }
});
