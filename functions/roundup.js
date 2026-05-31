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

  // (C) 주최자 D-7 이내 모집 "취소" 시 → 참여자 통보 + 주최자 대상 매너 평가 윈도우 발동
  // ([[manner-evaluation-policy]] §1-A)
  //
  // ⚠️ 반드시 cancelledByHost 표식으로만 게이트할 것. 과거엔 `!before.closed && after.closed`로
  //    판정했는데, 이러면 정상 "모집 확정"(closeRoundup)·"자동 만석"도 closed=true라 오발동 →
  //    멀쩡한 모집 참여자에게 "주최자가 취소했어요" 푸시가 잘못 나갔다.
  // ⚠️ 현재 클라는 주최자 취소를 문서 삭제(deleteRoundup)로 처리하므로 이 경로는 아직 트리거되지
  //    않는다(= 오발동만 멈춘 상태). D-7 보상 윈도우를 실제로 켜려면 취소를 소프트 취소
  //    (closed:true + cancelledByHost:true)로 전환해야 한다 — 데이터 보관 정책과 함께 후속 결정.
  if (after.cancelledByHost === true && !before.cancelledByHost && after.scope === 'all' && after.authorUid && !after.mannerEvalForHostStartedAt) {
    const teeOff = parseTeeOffKst(after.date, after.time);
    const hoursUntil = teeOff ? (teeOff.getTime() - Date.now()) / HOUR_MS : null;
    const insideD7 = hoursUntil !== null && hoursUntil >= 0 && hoursUntil <= D7_HOURS;
    // 주최자 외 확정 참여자가 실제로 있을 때만 (나홀로 취소는 보상 평가 X)
    const others = (Array.isArray(after.participantUids) ? after.participantUids : [])
      .filter((uid) => uid && uid !== after.authorUid);
    if (insideD7 && others.length >= 1) {
      // 라운딩이 안 열렸으므로 '취소 통보 시점'부터 즉시 48h 평가 윈도우 (티오프+5h 기준 X).
      const now = new Date();
      const windowEnd = new Date(now.getTime() + WINDOW_HOURS * HOUR_MS);
      try {
        await ref.update({
          mannerEvalForHost: true,        // 주최자 대상만 평가
          mannerEvalWindowStart: Timestamp.fromDate(now),
          mannerEvalDeadline: Timestamp.fromDate(windowEnd),
          mannerAggregated: false,
          mannerEvalForHostStartedAt: FieldValue.serverTimestamp(),
        });
        // 확정 참여자에게 취소 통보 + 매너 평가 진입 (주최자 제외)
        for (const uid of others) {
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
