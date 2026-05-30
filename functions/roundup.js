// =============================================================
// §A 라운지 자동 처리 ([[roundup-waitlist-policy]] / [[manner-evaluation-policy]] §1-A)
//
// 트리거:
//   onRoundupUpdated  — 정원 만석 자동 closed, 자리 열림 시 대기자 1번 호출,
//                       주최자 D-7 이내 취소 시 주최자 대상 매너 평가 윈도우 발동
//   waitlistCallCutoffTick — 매시간. 호출 후 12h 응답 없으면 다음 대기자에게 인계
//                            (24h 이후 재노출 — 클라이언트가 알림 표시 회피)
// =============================================================

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const POST_ROUND_HOURS = 5;
const WINDOW_HOURS = 48;
const D7_HOURS = 7 * 24;
const WAITLIST_CUTOFF_HOURS = 12;
const KST_OFFSET_HOURS = 9;

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
    logger.warn('[roundup] noti fail', e?.message);
  }
}

// 정원 만석 판정
function isFull(p) {
  if (p.teams > 1 && Array.isArray(p.teamJoined)) {
    return p.teamJoined.every(c => c >= 4);
  }
  return (p.joined || 0) >= (p.capacity || 4);
}

// 자리 차감 (참여자 또는 대기자 줄어듦)
function totalCount(p) {
  if (p.teams > 1 && Array.isArray(p.teamJoined)) {
    return p.teamJoined.reduce((s, c) => s + c, 0);
  }
  return p.joined || 0;
}

// 티오프 시각 (KST → UTC)
function parseTeeOffKst(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('.').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (timeStr || '07:00').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const utcMs = Date.UTC(y, m - 1, d, hh - KST_OFFSET_HOURS, mm || 0);
  if (Number.isNaN(utcMs)) return null;
  return new Date(utcMs);
}

// onUpdate roundups — 모든 라운지 자동 처리 통합 트리거
exports.onRoundupUpdated = onDocumentUpdated('roundups/{postId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  const ref = event.data.after.ref;
  const postId = event.params.postId;

  // (A) 정원 만석 자동 closed
  if (!before.closed && !after.closed && isFull(after)) {
    try {
      await ref.update({ closed: true, closedAt: FieldValue.serverTimestamp() });
    } catch (e) {
      logger.warn('[roundup] auto close fail', e?.message);
    }
  }

  // (B) 자리 열림 — 참여자 줄어들고 대기자 있으면 1번에게 호출
  const totalBefore = totalCount(before);
  const totalAfter = totalCount(after);
  const seatOpened = totalAfter < totalBefore;
  const waitlist = Array.isArray(after.waitlistUids) ? after.waitlistUids : [];
  // 호출 중이 아닐 때만 (calledWaitlistUid 비어있음)
  if (seatOpened && waitlist.length > 0 && !after.calledWaitlistUid) {
    const callTarget = waitlist[0];
    try {
      await ref.update({
        calledWaitlistUid: callTarget,
        calledAt: FieldValue.serverTimestamp(),
      });
      await createSystemNotification({
        recipientUid: callTarget,
        type: 'slotOpen',
        postId,
        postTitle: after.course || '',
        priority: 'important',
      });
    } catch (e) {
      logger.warn('[roundup] slotOpen call fail', e?.message);
    }
  }

  // (C) 주최자 D-7 이내 모집 삭제·취소 시 → 주최자 대상 매너 평가 윈도우 발동
  // ([[manner-evaluation-policy]] §1-A)
  // closed 또는 deleted 전환은 별도. 여기선 closed=true + scope='all' + D-7 이내 만 처리.
  if (!before.closed && after.closed && after.scope === 'all' && after.authorUid) {
    const teeOff = parseTeeOffKst(after.date, after.time);
    if (teeOff) {
      const hoursUntil = (teeOff.getTime() - Date.now()) / HOUR_MS;
      if (hoursUntil >= 0 && hoursUntil <= D7_HOURS && !after.mannerEvalForHostStartedAt) {
        const windowStart = new Date(teeOff.getTime() + POST_ROUND_HOURS * HOUR_MS);
        const windowEnd = new Date(windowStart.getTime() + WINDOW_HOURS * HOUR_MS);
        try {
          await ref.update({
            mannerEvalForHost: true,        // 주최자 대상만 평가
            mannerEvalWindowStart: Timestamp.fromDate(windowStart),
            mannerEvalDeadline: Timestamp.fromDate(windowEnd),
            mannerAggregated: false,
            mannerEvalForHostStartedAt: FieldValue.serverTimestamp(),
          });
          // 참여자에게 안내 알림 (D-7 취소 동반자 통보)
          const parts = Array.isArray(after.participantUids) ? after.participantUids : [];
          for (const uid of parts) {
            if (uid === after.authorUid) continue;
            await createSystemNotification({
              recipientUid: uid,
              type: 'hostCancelledD7',
              postId,
              postTitle: after.course || '',
              priority: 'important',
            });
          }
        } catch (e) {
          logger.warn('[roundup] D-7 cancel manner window fail', e?.message);
        }
      }
    }
  }
});

// 매시간 — 대기자 호출 후 12h 응답 없으면 다음 대기자에게 인계.
// 응답: 참여 확정(participantUids에 calledWaitlistUid 추가됨) → 트리거 (A)에서 close됨
//      거절(클라이언트가 calledWaitlistUid 비움 + 본인을 waitlistUids에서 제외) → 별도 처리
exports.waitlistCallCutoffTick = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Asia/Seoul' }, async () => {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - WAITLIST_CUTOFF_HOURS * HOUR_MS));
  try {
    const snap = await db.collection('roundups')
      .where('calledAt', '<=', cutoff)
      .limit(200)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (!d.calledWaitlistUid) continue;
      const stuckUid = d.calledWaitlistUid;
      // stuck 사용자를 대기자에서 제외하고 다음 사람 호출
      const rest = (Array.isArray(d.waitlistUids) ? d.waitlistUids : []).filter(u => u !== stuckUid);
      const next = rest[0] || null;
      const update = {
        waitlistUids: rest,
        calledWaitlistUid: next,
        calledAt: next ? FieldValue.serverTimestamp() : FieldValue.delete(),
        lastCutoffStuckUid: stuckUid,
        lastCutoffAt: FieldValue.serverTimestamp(),
      };
      try {
        await doc.ref.update(update);
        if (next) {
          await createSystemNotification({
            recipientUid: next,
            type: 'slotOpen',
            postId: doc.id,
            postTitle: d.course || '',
            priority: 'important',
          });
        }
      } catch (e) {
        logger.warn('[roundup] cutoff handover fail', doc.id, e?.message);
      }
    }
  } catch (e) {
    logger.warn('[roundup] cutoff query fail', e?.message);
  }
});
