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

// 정원 만석 판정 — 단체·개별 모두 joined 기반. teamJoined는 joinRoundup이 갱신하지 않아 신뢰 불가.
function isFull(p) {
  const cap = p.capacity || (p.teams > 1 ? p.teams * 4 : 4);
  return (p.joined || 0) >= cap;
}

// 자리 차감 감지용 총원 — joined 기반 통일(단체 모집에서 자리열림이 안 잡히던 버그 수정).
function totalCount(p) {
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

  // (A) 만석 자동 closed — 제거됨 (2026-06-03).
  //  정책: "만석 자체는 자동 확정 X" (2026-05-28) — 만석이어도 주최자가 명시적으로 "모집 확정하기"를 눌러야 closed.
  //  특히 오픈형(날짜 미정)은 자동 확정되면 안 됨(일정 미정인데 확정·수정잠김 발생). 클라가 allFull→확정버튼으로 처리.

  // (A2) 만석 전환 알림 — 미만석→만석 순간 주최자에게 '확정하세요' 인앱+푸시(만석=확정 아님이라 놓치기 쉬움 [[roundup-confirm-judgment]]).
  //   멱등=전환 1회(만석 유지 중엔 before도 만석이라 재발 안 함). 이미 확정/취소면 스킵. onNotificationCreated가 푸시 발송.
  if (!isFull(before) && isFull(after) && !after.closed && !after.cancelledByHost && after.authorUid) {
    await createSystemNotification({
      recipientUid: after.authorUid,
      type: 'roundupFull',
      postId,
      postTitle: after.course || '',
    });
  }

  // (B0) 호출된 대기자가 참여 확정되면 정리 — calledWaitlistUid 비우고 waitlistUids에서 제거.
  //   안 그러면 같은 사람이 '참여자+대기자'로 중복 잔존하고, calledWaitlistUid가 남아 다음 자리열림
  //   호출이 (B) 가드(!calledWaitlistUid)에 막혀 최대 12h(cutoff tick) 지연된다.
  //   클라(참여자)는 보안규칙상 calledWaitlistUid를 못 지우므로 서버에서 처리(멱등).
  const calledUid = after.calledWaitlistUid;
  if (calledUid && Array.isArray(after.participantUids) && after.participantUids.includes(calledUid)) {
    try {
      await ref.update({
        calledWaitlistUid: FieldValue.delete(),
        calledAt: FieldValue.delete(),
        waitlistUids: FieldValue.arrayRemove(calledUid),
      });
    } catch (e) {
      logger.warn('[roundup] called-waitlist cleanup fail', e?.message);
    }
    return; // 자리 채워짐(열림 아님) — 이 이벤트는 정리 전용
  }

  // (B0.5) 호출된 대기자가 거절/이탈 — calledWaitlistUid가 참여자도 대기자도 아니면(leaveWaitlist로 빠짐)
  //   즉시 다음 대기자 호출(없으면 호출 상태 정리). 클라는 보안규칙상 calledWaitlistUid를 못 지워
  //   (B)의 !calledWaitlistUid 가드에 막히므로, 서버가 여기서 즉시 인계해 12h cutoff 지연을 없앤다(거절 즉시성).
  //   가드 정밀: calledUid는 (B)/cutoff에서 항상 waitlist에 남겨두므로, 둘 다 아님 = 호출 본인이 빠진 경우 뿐.
  if (calledUid
    && !(Array.isArray(after.participantUids) && after.participantUids.includes(calledUid))
    && !(Array.isArray(after.waitlistUids) && after.waitlistUids.includes(calledUid))) {
    const rest = Array.isArray(after.waitlistUids) ? after.waitlistUids : [];
    const next = rest[0] || null;
    try {
      await ref.update({
        calledWaitlistUid: next || FieldValue.delete(),
        calledAt: next ? FieldValue.serverTimestamp() : FieldValue.delete(),
      });
      if (next) {
        await createSystemNotification({
          recipientUid: next,
          type: 'slotOpen',
          postId,
          postTitle: after.course || '',
          priority: 'important',
        });
      }
    } catch (e) {
      logger.warn('[roundup] declined-handover fail', e?.message);
    }
    return; // 인계/정리 완료
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
// 응답: 참여 확정(participantUids에 calledWaitlistUid 추가됨) → 트리거 (B0)에서 정리
//      거절(leaveWaitlist로 waitlistUids에서 빠짐) → onRoundupUpdated (B0.5)가 즉시 다음 인계(이 틱은 무응답 전용)
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
        // 넘어간 본인에게 닫힘 통보 — '자리 났어요' 기대만 주고 침묵으로 탈락시키던 정서 공백 보완.
        //   정보성이라 normal 우선순위. 재대기 가능 안내로 잔류 유도 ([[roundup-waitlist-policy]]).
        await createSystemNotification({
          recipientUid: stuckUid,
          type: 'slotPassed',
          postId: doc.id,
          postTitle: d.course || '',
          priority: 'normal',
        });
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
