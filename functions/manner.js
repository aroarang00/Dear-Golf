// =============================================================
// §C 매너 평가 48h 윈도우 집계 ([[manner-evaluation-policy]])
//
// 흐름:
//   roundup 생성 시 (scope='all'만)  → mannerEvalDeadline 계산 후 저장
//   라운딩 종료(티오프+5h)            → 평가 윈도우 시작 (클라이언트가 직접 작성)
//   티오프+5h+48h (mannerEvalDeadline)→ 시간당 스케줄러가 일괄 집계
//
// 집계 규칙 (정책 §2):
//   - 👍 1명 이상      → +1
//   - 👎 1명           → 0 (자동 보통, 사적 감정 차단)
//   - 👎 2명           → -2
//   - 👎 3명 이상      → -3
//   - 무평가          → 0 (doc 자체가 없음, 정책 §3)
//
// 적용 범위: scope='all' 모집만 (정책 §1-0).
// 친구공개·친구지정·오픈형(date 미정)은 평가 윈도우 X.
// =============================================================

const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();

const HOUR_MS = 3600 * 1000;
const POST_ROUND_HOURS = 5;
const WINDOW_HOURS = 48;
const KST_OFFSET_HOURS = 9;

async function createSystemNotification({ recipientUid, type, postId, postTitle, priority = 'normal' }) {
  if (!recipientUid) return;
  try {
    await db.collection('roundupNotifications').add({
      type,
      actorUid: 'system',
      actorName: '',
      recipientUid,
      postId: postId || null,
      postTitle: postTitle || '',
      priority,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn('[manner] createSystemNotification fail', e?.message);
  }
}

// 티오프 시각 계산 — 'YYYY.MM.DD' + 'HH:MM' (KST) → Date (UTC)
function parseTeeOffKst(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('.').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (timeStr || '07:00').split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  // KST -> UTC: -9시간
  const utcMs = Date.UTC(y, m - 1, d, hh - KST_OFFSET_HOURS, mm || 0);
  if (Number.isNaN(utcMs)) return null;
  return new Date(utcMs);
}

// roundup 생성 시 mannerEvalDeadline 자동 계산.
// scope='all' + 확정형(date·time 있음)만 윈도우 생성. 그 외는 평가 X.
exports.onRoundupCreatedForManner = onDocumentCreated('roundups/{postId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  if (data.scope !== 'all') return;
  if (!data.date || !data.time) return;
  const teeOff = parseTeeOffKst(data.date, data.time);
  if (!teeOff) return;
  const windowStart = new Date(teeOff.getTime() + POST_ROUND_HOURS * HOUR_MS);
  const windowEnd = new Date(windowStart.getTime() + WINDOW_HOURS * HOUR_MS);
  try {
    await snap.ref.update({
      mannerEvalWindowStart: Timestamp.fromDate(windowStart),
      mannerEvalDeadline: Timestamp.fromDate(windowEnd),
      mannerAggregated: false,
    });
  } catch (e) {
    logger.warn('[manner] window write fail', e?.message);
  }
});

// 시간당 스케줄러 — deadline 경과 + 미집계 모집 일괄 집계.
exports.mannerAggregationTick = onSchedule({ schedule: 'every 60 minutes', timeZone: 'Asia/Seoul' }, async () => {
  const now = Timestamp.fromDate(new Date());
  try {
    const snap = await db.collection('roundups')
      .where('mannerAggregated', '==', false)
      .where('mannerEvalDeadline', '<=', now)
      .limit(200)
      .get();
    for (const doc of snap.docs) {
      try {
        await aggregateForRoundup(doc.id, doc.data());
      } catch (e) {
        logger.warn('[manner] aggregate fail', doc.id, e?.message);
      }
    }
  } catch (e) {
    logger.warn('[manner] tick query fail', e?.message);
  }
});

async function aggregateForRoundup(roundupId, roundup) {
  // 멱등 가드 — 집계 시작 전 mannerAggregated를 트랜잭션으로 선점. 이미 집계됐으면 중단.
  // 기존엔 delta 적용 후 마킹해서, 적용~마킹 사이 실패 시 다음 tick에 재집계되어 중복 감점이 났다.
  // 선점-후-적용으로 바꿔 동시 tick·재시도에도 "한 번만 집계"를 보장한다.
  const roundupRef = db.doc(`roundups/${roundupId}`);
  const claimed = await db.runTransaction(async (tx) => {
    const s = await tx.get(roundupRef);
    if (!s.exists) return false;
    if (s.data().mannerAggregated === true) return false;
    tx.update(roundupRef, {
      mannerAggregated: true,
      mannerAggregatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claimed) return;

  // 1) 모든 평가 모음
  const evals = await db.collection('mannerEvaluations')
    .where('roundupId', '==', roundupId)
    .get();

  // 2) target별 카운트 ({ good, bad })
  const counts = {};
  evals.forEach(doc => {
    const d = doc.data();
    if (!d.targetUid || !d.rating) return;
    if (!counts[d.targetUid]) counts[d.targetUid] = { good: 0, bad: 0 };
    if (d.rating === 'good') counts[d.targetUid].good += 1;
    else if (d.rating === 'bad') counts[d.targetUid].bad += 1;
  });

  // 3) target별 delta 계산 + 적용 + 통보
  const postTitle = roundup.course || '';
  for (const [targetUid, { good, bad }] of Object.entries(counts)) {
    const delta = deltaFor(good, bad);
    if (delta === 0) continue;  // 무변화는 통보 X
    try {
      await applyMannerDelta(targetUid, delta);
      await createSystemNotification({
        recipientUid: targetUid,
        type: delta > 0 ? 'mannerScoreUp' : 'mannerScoreDown',
        postId: roundupId,
        postTitle,
        priority: delta < 0 ? 'important' : 'normal',
      });
    } catch (e) {
      logger.warn('[manner] apply delta fail', targetUid, e?.message);
    }
  }
  // 집계 완료 마크는 함수 진입 시 claim에서 이미 처리됨 (멱등 가드)
}

// 평가 그라데이션 (정책 §2):
//   👍 ≥ 1 → +1 / 👎 == 1 → 0 / 👎 == 2 → -2 / 👎 ≥ 3 → -3
function deltaFor(good, bad) {
  let delta = 0;
  if (good >= 1) delta += 1;
  if (bad === 1) delta += 0;
  else if (bad === 2) delta -= 2;
  else if (bad >= 3) delta -= 3;
  return delta;
}

async function applyMannerDelta(uid, delta) {
  if (!uid || !delta) return;
  const ref = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data();
    const cur = typeof data.mannerScore === 'number' ? data.mannerScore : 70;
    const next = Math.max(0, Math.min(100, cur + delta));
    tx.set(ref, {
      mannerScore: next,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}
