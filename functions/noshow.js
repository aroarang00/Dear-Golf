// =============================================================
// §B 노쇼 SLA 타이머 ([[noshow-report-system]])
//
// 흐름: 신고 (pending_grace_period)
//   →  +7일 자동 (explanation_required, 피신고자 48h 소명)
//   →  +48h 소명 (explained, 디어골프 48h 검토) | 미제출 → confirmed_noshow 자동
//   →  +48h 검토 (디어골프 콘솔에서 finalDecision 수동 설정)
//      | 무판정 → inconclusive (양쪽 패널티 X, 운영자 미처리로 인한 불이익 방지)
//
// 최종 상태별 적용:
//   - confirmed_noshow      → 피신고자 매너 -20 + 60일 정지 + noshowCount +1
//   - confirmed_false_report → 신고자 매너 -20 + 90일 정지 + falseReportCount +1
//   - inconclusive          → 양쪽 패널티 X (카운트 변화 없음)
// =============================================================

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GRACE_DAYS = 7;
const EXPLANATION_HOURS = 48;
const REVIEW_HOURS = 48;

// 시스템 알림 작성 — Cloud Functions 권한으로 roundupNotifications 직접 write
async function createSystemNotification({ recipientUid, type, postId, postTitle, actorName = '', priority = 'normal' }) {
  if (!recipientUid) return;
  try {
    await db.collection('roundupNotifications').add({
      type,
      actorUid: 'system',
      actorName,
      recipientUid,
      postId: postId || null,
      postTitle: postTitle || '',
      priority,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn('[noshow] createSystemNotification fail', e?.message);
  }
}

// 멱등 가드 — onUpdate는 at-least-once 전달이라 같은 status 전환이 재시도될 수 있다.
// 패널티 적용 전 report 문서에 once 플래그를 트랜잭션으로 선점. 이미 처리됐으면 false 반환 → skip.
// (중복 감점·중복 정지가 미적용보다 법적으로 위험하므로 "한 번만" 보장을 우선한다.)
async function claimOnce(ref, field) {
  try {
    return await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return false;
      if (s.data()[field]) return false;
      tx.update(ref, { [field]: true });
      return true;
    });
  } catch (e) {
    logger.warn('[noshow] claimOnce fail', e?.message);
    return false;
  }
}

// onCreate: 신고 접수 즉시 피신고자에게 중대 알림 + graceEndsAt/explanationDeadline/reviewDeadline 기록
exports.onNoshowReportCreated = onDocumentCreated('noshowReports/{reportId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const reportedUid = data.reportedUid;
  const reporterUid = data.reporterUid;
  const roundupId = data.roundupId;
  const roundupCourse = data.roundupCourse || '';
  const createdAt = data.createdAt?.toDate?.() || new Date();

  const graceEndsAt = new Date(createdAt.getTime() + GRACE_DAYS * DAY_MS);
  const explanationDeadline = new Date(graceEndsAt.getTime() + EXPLANATION_HOURS * HOUR_MS);
  const reviewDeadline = new Date(explanationDeadline.getTime() + REVIEW_HOURS * HOUR_MS);

  try {
    await snap.ref.update({
      graceEndsAt: Timestamp.fromDate(graceEndsAt),
      explanationDeadline: Timestamp.fromDate(explanationDeadline),
      reviewDeadline: Timestamp.fromDate(reviewDeadline),
    });
  } catch (e) {
    logger.warn('[noshow] write deadlines fail', e?.message);
  }

  // 피신고자 중대 알림 ([[notification-policy]] §1)
  await createSystemNotification({
    recipientUid: reportedUid,
    type: 'noshowReported',
    postId: roundupId,
    postTitle: roundupCourse,
    priority: 'important',
  });
  // 신고자에게 접수 완료 알림 (일반)
  await createSystemNotification({
    recipientUid: reporterUid,
    type: 'noshowReportSubmitted',
    postId: roundupId,
    postTitle: roundupCourse,
  });
});

// 시간당 스케줄러 — pending 7일 경과 → explanation_required, explanation 48h 미제출 → confirmed_noshow,
// explained 48h 검토 무판정 → inconclusive.
exports.noshowSlaTick = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Asia/Seoul' }, async () => {
  const now = new Date();
  const nowTs = Timestamp.fromDate(now);

  // (1) pending_grace_period → explanation_required (7일 경과)
  try {
    const snap = await db.collection('noshowReports')
      .where('status', '==', 'pending_grace_period')
      .where('graceEndsAt', '<=', nowTs)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data();
      await doc.ref.update({
        status: 'explanation_required',
        updatedAt: FieldValue.serverTimestamp(),
      });
      // 피신고자 중대 알림 — 48h 소명 시작
      await createSystemNotification({
        recipientUid: d.reportedUid,
        type: 'noshowExplanationRequired',
        postId: d.roundupId,
        postTitle: d.roundupCourse || '',
        priority: 'important',
      });
    }
  } catch (e) {
    logger.warn('[noshow] grace tick fail', e?.message);
  }

  // (2) explanation_required → confirmed_noshow (48h 미제출 자동 확정)
  try {
    const snap = await db.collection('noshowReports')
      .where('status', '==', 'explanation_required')
      .where('explanationDeadline', '<=', nowTs)
      .get();
    for (const doc of snap.docs) {
      await doc.ref.update({
        status: 'confirmed_noshow',
        finalDecision: 'confirmed_noshow_auto',
        decidedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // 패널티 적용은 onUpdate 트리거가 처리 (status 전환 감지)
    }
  } catch (e) {
    logger.warn('[noshow] explanation deadline tick fail', e?.message);
  }

  // (3) explained → inconclusive (디어골프 48h 무판정, 중립 종결)
  try {
    const snap = await db.collection('noshowReports')
      .where('status', '==', 'explained')
      .where('reviewDeadline', '<=', nowTs)
      .get();
    for (const doc of snap.docs) {
      await doc.ref.update({
        status: 'inconclusive',
        finalDecision: 'inconclusive_auto',
        decidedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    logger.warn('[noshow] review deadline tick fail', e?.message);
  }
});

// onUpdate: 최종 상태 전환 시 매너점수·정지·카운트 적용 + 양쪽 통보
exports.onNoshowReportUpdated = onDocumentUpdated('noshowReports/{reportId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status === after.status) return;

  const ref = event.data.after.ref;
  const { reporterUid, reportedUid, roundupId, roundupCourse } = after;
  const postTitle = roundupCourse || '';

  if (after.status === 'confirmed_noshow') {
    // 멱등 가드 — 재시도 시 중복 패널티·중복 알림 차단
    if (!(await claimOnce(ref, 'penaltyApplied'))) return;
    // 피신고자 패널티: 매너 -20, 60일 정지, noshowCount +1
    try {
      await applyNoshowPenalty(reportedUid, 60);
    } catch (e) {
      logger.warn('[noshow] confirmed_noshow apply fail', e?.message);
    }
    await createSystemNotification({
      recipientUid: reportedUid,
      type: 'noshowConfirmed',
      postId: roundupId,
      postTitle,
      priority: 'important',
    });
    await createSystemNotification({
      recipientUid: reporterUid,
      type: 'noshowReporterConfirmed',
      postId: roundupId,
      postTitle,
    });
    return;
  }

  if (after.status === 'confirmed_false_report') {
    // 멱등 가드 — 재시도 시 중복 패널티·중복 알림 차단
    if (!(await claimOnce(ref, 'penaltyApplied'))) return;
    // 신고자 패널티: 매너 -20, 90일 정지, falseReportCount +1
    try {
      await applyFalseReportPenalty(reporterUid, 90);
    } catch (e) {
      logger.warn('[noshow] confirmed_false_report apply fail', e?.message);
    }
    await createSystemNotification({
      recipientUid: reporterUid,
      type: 'noshowFalseReport',
      postId: roundupId,
      postTitle,
      priority: 'important',
    });
    await createSystemNotification({
      recipientUid: reportedUid,
      type: 'noshowFalseReportConfirmed',
      postId: roundupId,
      postTitle,
    });
    return;
  }

  if (after.status === 'inconclusive') {
    // 양쪽 패널티 X. 양쪽 통보만.
    await createSystemNotification({
      recipientUid: reporterUid,
      type: 'noshowInconclusive',
      postId: roundupId,
      postTitle,
    });
    await createSystemNotification({
      recipientUid: reportedUid,
      type: 'noshowInconclusive',
      postId: roundupId,
      postTitle,
    });
    return;
  }

  if (after.status === 'cancelled_by_reporter' && before.status === 'pending_grace_period') {
    // 피신고자에게 취소 안내 (일반 알림). 신고자 자율 취소 — 양쪽 패널티 X.
    await createSystemNotification({
      recipientUid: reportedUid,
      type: 'noshowCancelled',
      postId: roundupId,
      postTitle,
    });
    return;
  }

  if (after.status === 'explained' && before.status === 'explanation_required') {
    // 디어골프 팀 검토 큐 진입 알림은 외부 운영 시스템 — 본 함수에선 처리 X
    // 신고자에게 "소명 제출됨" 알림은 §6 정책상 자료 비공개라 보내지 않음.
  }
});

// 매너 -20 + 60일/90일 정지 + 카운트 +1
// 2회 누적 시 영구 정지는 7일 소명 절차 (이용약관 제11조 ④ / 패널티 동의서 2)
// — 즉시 영구 적용 X. users.permanentPendingAppealUntil = now + 7일 + 알림.
// — 7일 경과 후 스케줄러가 자동 영구 적용 (소명 안 했으면).
async function applyNoshowPenalty(uid, suspensionDays) {
  if (!uid) return;
  const ref = db.doc(`users/${uid}`);
  let pendingAppeal = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data();
    const curScore = typeof data.mannerScore === 'number' ? data.mannerScore : 70;
    const noshowCount = (data.noshowCount || 0) + 1;
    const willBePermanent = noshowCount >= 2;
    const restrictUntil = new Date(Date.now() + suspensionDays * DAY_MS).toISOString();
    const update = {
      mannerScore: Math.max(0, curScore - 20),
      noshowCount,
      isRestricted: true,
      restrictUntil,
      restrictReason: willBePermanent ? 'noshow_pending_appeal' : 'noshow',
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (willBePermanent) {
      update.permanentPendingAppealUntil = new Date(Date.now() + 7 * DAY_MS).toISOString();
      update.permanentPendingReason = 'noshow';
      pendingAppeal = true;
    }
    tx.set(ref, update, { merge: true });
  });
  if (pendingAppeal) {
    await db.collection('roundupNotifications').add({
      type: 'permanentBanAppealNotice',
      actorUid: 'system', actorName: '',
      recipientUid: uid,
      postId: null, postTitle: '',
      priority: 'important',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
}

async function applyFalseReportPenalty(uid, suspensionDays) {
  if (!uid) return;
  const ref = db.doc(`users/${uid}`);
  let pendingAppeal = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data();
    const curScore = typeof data.mannerScore === 'number' ? data.mannerScore : 70;
    const falseCount = (data.falseReportCount || 0) + 1;
    const willBePermanent = falseCount >= 2;
    const restrictUntil = new Date(Date.now() + suspensionDays * DAY_MS).toISOString();
    const update = {
      mannerScore: Math.max(0, curScore - 20),
      falseReportCount: falseCount,
      isRestricted: true,
      restrictUntil,
      restrictReason: willBePermanent ? 'false_report_pending_appeal' : 'false_report',
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (willBePermanent) {
      update.permanentPendingAppealUntil = new Date(Date.now() + 7 * DAY_MS).toISOString();
      update.permanentPendingReason = 'false_report';
      pendingAppeal = true;
    }
    tx.set(ref, update, { merge: true });
  });
  if (pendingAppeal) {
    await db.collection('roundupNotifications').add({
      type: 'permanentBanAppealNotice',
      actorUid: 'system', actorName: '',
      recipientUid: uid,
      postId: null, postTitle: '',
      priority: 'important',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
}
