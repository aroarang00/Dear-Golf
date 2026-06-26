// =============================================================
// TTL 정리 — 임시·공유 문서가 무한 누적되던 것 정리 (비용·개인정보 최소화).
//   대상: scheduleGroups(일정 전파 그룹) · mealSuggestions(뒤풀이 식사) · roundScoreShares(스코어 공유)
//   ★보존이 필요한 컬렉션은 제외: roundupApplications(분쟁 이력 보존) · diaries/rounds(영구) 등.
//
//   판정: 각 문서의 라운드 날짜 `date`('YYYY.MM.DD')가 RETENTION_DAYS 지난 것만 삭제.
//   - date 문자열은 사전식 정렬 = 시간순이라 범위 쿼리(`date < cutoff`) 가능(단일 필드 자동 인덱스).
//   - 하한 '2000.01.01'로 빈 date(오픈형 등)·필드 없는 문서는 제외(안 지움) — createdAt 기준이면
//     먼 미래로 잡은 일정을 라운드 전에 지울 위험이 있어 라운드 날짜 기준이 안전.
//   - 안정성 감사(2026-06-26) YELLOW-C2. [[stability-audit-2026-06]]
// =============================================================

const { getFirestore } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();
const RETENTION_DAYS = 30;          // 라운드 날짜 + 30일 지나면 정리(보수적 — 의도 TTL보다 길게)
const TTL_COLLECTIONS = ['scheduleGroups', 'mealSuggestions', 'roundScoreShares'];
const BATCH = 400;
const MAX_BATCHES = 10;             // 실행당 컬렉션별 최대 4000건 — 백로그도 빠르게, 타임아웃·런어웨이 방지

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

exports.ttlCleanupTick = onSchedule({ schedule: 'every day 04:00', timeZone: 'Asia/Seoul' }, async () => {
  const cutoff = ymd(new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000));
  for (const coll of TTL_COLLECTIONS) {
    let deleted = 0;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const snap = await db.collection(coll)
          .where('date', '>=', '2000.01.01')   // 빈/누락 date 제외(안 지움)
          .where('date', '<', cutoff)          // 라운드 날짜가 보존기간 지난 것만
          .limit(BATCH)
          .get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += snap.size;
        if (snap.size < BATCH) break;
      }
      if (deleted) logger.info(`[ttl] ${coll}: deleted ${deleted} (date < ${cutoff})`);
    } catch (e) {
      logger.warn(`[ttl] ${coll} cleanup fail`, e?.message);
    }
  }
});
