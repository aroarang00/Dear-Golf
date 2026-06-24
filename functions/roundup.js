// =============================================================
// §A 라운지 자동 처리 ([[roundup-waitlist-policy]] / [[manner-evaluation-policy]] §1-A)
//
// 트리거:
//   onRoundupUpdated  — 미만석→만석 전환 알림, 자리 열림 시 대기자를 빈자리 수만큼 자동 승격(즉시 참여 확정),
//                       주최자 D-7 이내 취소 시 주최자 대상 매너 평가 윈도우 발동
// =============================================================

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');

const db = getFirestore();

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WINDOW_HOURS = 48;
const D7_HOURS = 7 * 24;
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

  // (B) 자리 열림 → 대기자 자동 승격 (호출·12h 수락 없이 즉시 확정) ([[roundup-waitlist-autopromote]])
  //   개별 모집이 만석이었다가(=대기자 발생) 자리가 나면, 빈자리 수(openSeats)만큼 대기 1번부터 한 번에
  //   participantUids로 올린다. 확정(closed)·미확정 만석 모두 대상 — 대기자는 만석일 때만 생기므로 closed
  //   여부와 무관. 제3자 선참은 클라 joinRoundup이 '대기자 있으면 비대기자 신규 참여 차단'으로 막고, 그 자리를
  //   여기서 대기 순번대로 채운다. 여러 명 취소·여러 대기자도 빈자리 수만큼 반복 충원, 승격 후 openSeats=0이면
  //   재트리거 시 조건 거짓이라 멱등(무한루프 없음). 단체(teams>1)는 결원 충원이 자유라 제외.
  //   동시성: 트랜잭션 안 fresh read로 정원·대기열 재계산 → 동시 취소/승격에도 정원 초과 없음.
  const isTeamPost = (after.teams || 1) > 1;
  if (!isTeamPost
    && Array.isArray(after.waitlistUids) && after.waitlistUids.length > 0) {
    let promoted = [];
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const d = snap.data();
        if ((d.teams || 1) > 1) return;                  // 단체면 중단(개별만 자동 승격)
        const cap = d.capacity || 4;                      // 개별 정원(=members+1, 보통 4)
        const open = cap - (d.joined || 0);
        const wl = Array.isArray(d.waitlistUids) ? d.waitlistUids : [];
        if (open <= 0 || wl.length === 0) return;
        promoted = wl.slice(0, open);                     // 빈자리 수만큼 앞에서부터
        tx.update(ref, {
          participantUids: FieldValue.arrayUnion(...promoted),
          waitlistUids: FieldValue.arrayRemove(...promoted),
          joined: FieldValue.increment(promoted.length),  // open 이내라 정원 초과 없음
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      for (const uid of promoted) {
        await createSystemNotification({
          recipientUid: uid,
          type: 'waitlistPromoted',     // 호출(slotOpen)이 아니라 '자동 참여 확정' 통지
          postId,
          postTitle: after.course || '',
          priority: 'important',
        });
      }
    } catch (e) {
      logger.warn('[roundup] waitlist auto-promote fail', e?.message);
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
