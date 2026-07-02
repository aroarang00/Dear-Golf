// =============================================================
// §D 콘텐츠 신고 SLA + 자동 가림 + 누적 제재 ([[content-report-policy]])
//
// 흐름:
//   신고 작성 (pending)
//     → 골퍼코멘트는 누적 3건 시 자동 임시 가림 (hidden_at, 작성자 본인만 보임)
//     → 3일 후 자동 거부(rejected) — 디어골프 팀 미처리
//   디어골프 팀 콘솔에서 status → confirmed/rejected 수동 설정
//     confirmed → 게시물 영구 삭제 + 작성자 contentReportConfirmedCount +1 + 누적 제재
//     rejected  → 가림 해제 + 작성자 영향 X (정책상 신고자 통보도 X)
//
// 누적 제재 (§7, 12개월 롤링):
//   5회 → 매너 -5 + 30일 모집 정지 (recruitRestrictUntil)
//   10회 → 영구 모집 박탈 (recruitRestrictUntil=null, isRecruitRestrictedPermanent=true)
// =============================================================

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();

const DAY_MS = 24 * 3600 * 1000;
const AUTO_HIDE_THRESHOLD = 3;  // 골퍼코멘트 자동 가림 임계
const SLA_DAYS = 3;
const PENALTY_30DAY_THRESHOLD = 5;
const PERMANENT_THRESHOLD = 10;

async function createSystemNotification({ recipientUid, type, postId, postTitle = '', priority = 'normal' }) {
  if (!recipientUid) return;
  try {
    await db.collection('roundupNotifications').add({
      type,
      actorUid: 'system',
      actorName: '',
      recipientUid,
      postId: postId || null,
      postTitle,
      priority,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn('[content] noti fail', e?.message);
  }
}

// onCreate: 대상 게시물의 신고 카운트 증가 + 골퍼코멘트면 임계 도달 시 자동 가림
exports.onContentReportCreated = onDocumentCreated('content_reports/{reportId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const { targetType, targetId } = data;
  if (!targetType || !targetId) return;

  const collectionByType = {
    courseComment: 'courseComments',
    roundup: 'roundups',
    roundupComment: null,  // roundup 서브컬렉션은 별도 매핑 필요 — 현재 단일 컬렉션 X
  };
  const coll = collectionByType[targetType];
  if (!coll) return;

  const targetRef = db.doc(`${coll}/${targetId}`);
  try {
    await db.runTransaction(async (tx) => {
      // 멱등 — Firestore 트리거는 at-least-once라 같은 신고 이벤트가 재전송되면 reportedCount가 중복 증가해
      //   실제 신고자 3명 미만에서 자동 가림 임계에 도달하던 문제. 신고 문서에 countedAt 표식을 달아 1회만 카운트.
      const r = await tx.get(snap.ref);
      if (!r.exists || r.data().countedAt) return;   // 이미 카운트된 신고(재전송) → 스킵
      const t = await tx.get(targetRef);
      tx.set(snap.ref, { countedAt: FieldValue.serverTimestamp() }, { merge: true }); // 이 신고를 '카운트됨'으로 표식
      if (!t.exists) return;                          // 대상 사라짐 — 표식만 남기고 종료
      const nextCount = (t.data().reportedCount || 0) + 1;
      const update = {
        reportedCount: nextCount,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // 골퍼코멘트만 자동 임시 가림 (§5)
      if (targetType === 'courseComment' && nextCount >= AUTO_HIDE_THRESHOLD && !t.data().hiddenAt) {
        update.hiddenAt = FieldValue.serverTimestamp();
        update.hiddenReason = 'auto_threshold';
      }
      tx.set(targetRef, update, { merge: true });
    });
  } catch (e) {
    logger.warn('[content] reportedCount tx fail', e?.message);
  }
});

// 3일 SLA 스케줄러 — pending 3일 경과 → rejected 자동 (게시물 영향 X)
exports.contentReportSlaTick = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Asia/Seoul' }, async () => {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - SLA_DAYS * DAY_MS));
  try {
    const snap = await db.collection('content_reports')
      .where('status', '==', 'pending')
      .where('createdAt', '<=', cutoff)
      .limit(500)
      .get();
    for (const doc of snap.docs) {
      await doc.ref.set({
        status: 'rejected',
        finalDecision: 'rejected_sla_auto',
        decidedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      // onUpdate 트리거가 가림 해제 등 후처리
    }
  } catch (e) {
    logger.warn('[content] sla tick fail', e?.message);
  }
});

// onUpdate: confirmed → 게시물 삭제 + 작성자 누적·제재 / rejected → 가림 해제
// 멱등 가드 — onUpdate 재시도 시 게시물 중복 삭제·작성자 중복 제재(누적+1, 매너-5) 차단.
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
    logger.warn('[content] claimOnce fail', e?.message);
    return false;
  }
}

exports.onContentReportUpdated = onDocumentUpdated('content_reports/{reportId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status === after.status) return;

  const reportRef = event.data.after.ref;
  const { targetType, targetId } = after;
  const collectionByType = {
    courseComment: 'courseComments',
    roundup: 'roundups',
  };
  const coll = collectionByType[targetType];
  if (!coll || !targetId) return;
  const targetRef = db.doc(`${coll}/${targetId}`);

  if (after.status === 'confirmed') {
    // 멱등 가드 — 재시도 시 중복 삭제·중복 제재 차단
    if (!(await claimOnce(reportRef, 'penaltyApplied'))) return;
    // 작성자 uid는 대상 문서에서 직접 읽는다 — 신고자가 넣은 after.targetAuthorUid를 신뢰하면
    //   무관한 제3자(C)에게 제재가 가는 오귀속이 가능(보안 감사 2026-07-02). 삭제 전에 먼저 읽어야 함.
    let realAuthorUid = null;
    try {
      const targetSnap = await targetRef.get();
      if (targetSnap.exists) realAuthorUid = targetSnap.data().authorUid || null;
    } catch (e) {
      logger.warn('[content] target read fail', e?.message);
    }
    // 게시물 영구 삭제 (정책 §6)
    try {
      await targetRef.delete();
    } catch (e) {
      logger.warn('[content] target delete fail', e?.message);
    }
    // 작성자 누적·제재 — 대상 문서에서 파생한 실제 작성자에게만
    if (realAuthorUid) {
      try {
        await applyAuthorPenaltyOnConfirm(realAuthorUid);
      } catch (e) {
        logger.warn('[content] author penalty fail', e?.message);
      }
    }
    return;
  }

  if (after.status === 'rejected') {
    // 가림 해제 (자동 임시 가림된 골퍼코멘트만 의미). 작성자 영향 X, 신고자 통보 X (정책 §6)
    try {
      await targetRef.set({
        hiddenAt: null,
        hiddenReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      logger.warn('[content] hidden clear fail', e?.message);
    }
    return;
  }
});

async function applyAuthorPenaltyOnConfirm(uid) {
  if (!uid) return;
  const ref = db.doc(`users/${uid}`);
  // 이번 확정으로 "새로 도달한" 단계만 기록 — 재적용·중복 알림 방지.
  let stage = null;  // 'permanent' | 'ban30d' | null
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data();
    const count = (data.contentReportConfirmedCount || 0) + 1;
    const update = {
      contentReportConfirmedCount: count,
      updatedAt: FieldValue.serverTimestamp(),
    };
    // 임계는 "도달 시 1회만" 적용 (정책 §7 단계표). 6~9회째는 카운트만 증가, 제재 재적용 X.
    // 12개월 롤링 감소(monthlyPenaltyCountTick)로 카운트가 내려갔다 다시 도달하면 그때 재적용됨.
    if (count >= PERMANENT_THRESHOLD && !data.isRecruitRestrictedPermanent && !data.recruitPermanentPendingAppealUntil) {
      // 10회 — 영구 모집 박탈은 7일 소명 절차 (이용약관 제11조 ④). 즉시 박탈 X.
      update.recruitPermanentPendingAppealUntil = new Date(Date.now() + 7 * DAY_MS).toISOString();
      update.recruitPermanentPendingReason = 'content_10x';
      stage = 'permanent';
    } else if (count === PENALTY_30DAY_THRESHOLD) {
      // 정확히 5회 도달 — 매너 -5, 30일 모집 정지 (1회만)
      const cur = typeof data.mannerScore === 'number' ? data.mannerScore : 70;
      update.mannerScore = Math.max(0, cur - 5);
      update.recruitRestrictUntil = new Date(Date.now() + 30 * DAY_MS).toISOString();
      update.recruitRestrictReason = 'content_5x';
      stage = 'ban30d';
    }
    tx.set(ref, update, { merge: true });
  });
  // 이번에 새로 도달한 단계에 맞춰 알림 (단계 미도달이면 일반 확정 알림)
  if (stage === 'permanent') {
    await createSystemNotification({ recipientUid: uid, type: 'permanentBanAppealNotice', priority: 'important' });
  } else if (stage === 'ban30d') {
    await createSystemNotification({ recipientUid: uid, type: 'contentRecruitBan30d', priority: 'important' });
  } else {
    await createSystemNotification({ recipientUid: uid, type: 'contentReportConfirmed' });
  }
}
