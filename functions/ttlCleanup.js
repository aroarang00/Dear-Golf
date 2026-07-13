// =============================================================
// TTL 정리 — 임시·공유 문서가 무한 누적되던 것 정리 (비용·개인정보 최소화).
//   대상: scheduleGroups(일정 전파 그룹) · mealSuggestions(뒤풀이 식사) · roundScoreShares(스코어 공유) [30일]
//        + roundups 확정형 — 티오프 후 7일 지나면 확정·취소 여부 무관 삭제(사용자 2026-07-04 '모집은 기록 아님',
//          신고 접수 창구로 7일만 유예. 신고된 내용은 신고 문서에 이력 보존). 댓글 서브컬렉션까지 recursiveDelete.
//        + roundups 오픈형 — 날짜 미정(date=null)은 createdAt + 21일 경과 시 삭제(방치 방지).
//        + roundupNotifications — 30일 지난 알림 정리.
//   ★보존: diaries/rounds(영구 — 미디어 백업 [[diary-media-backup-plan]]) · 신고 이력(3년, contentReports).
//
//   판정: 각 문서의 라운드 날짜 `date`('YYYY.MM.DD')가 보존일수 지난 것만 삭제.
//   - date 문자열은 사전식 정렬 = 시간순이라 범위 쿼리(`date < cutoff`) 가능(단일 필드 자동 인덱스).
//   - 하한 '2000.01.01'로 빈 date(오픈형 등)·필드 없는 문서는 제외(안 지움) — createdAt 기준이면
//     먼 미래로 잡은 일정을 라운드 전에 지울 위험이 있어 라운드 날짜 기준이 안전.
//   - 안정성 감사(2026-06-26) YELLOW-C2. [[stability-audit-2026-06]]
// =============================================================

const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();
const RETENTION_DAYS = 30;          // 임시·공유 문서: 라운드 날짜 + 30일
const ROUNDUP_RETENTION_DAYS = 7;   // 모집글: 티오프 + 7일(신고 창구 유예) — 처리방침 문구와 일치 유지
const OPEN_ROUNDUP_RETENTION_DAYS = 21; // 오픈형 모집글: 생성 + 21일(날짜 미정 방치 방지)
const NOTI_RETENTION_DAYS = 30;     // 라운지 알림: 생성 30일
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

  // 모집글 정리 — 티오프 후 7일 지나면 확정·취소·방치 구분 없이 전부 삭제(2026-07-04 정책 확정).
  //   '모집은 기록이 아님' — 참여자 일정은 별도 schedules 문서로 이미 전파돼 무관, 크루 공유카드는 '종료' 표시로 graceful.
  //   신고 대응은 7일 유예로 커버(신고된 내용 자체는 contentReports에 3년 보존). 빈 date(오픈형)는 하한으로 제외.
  //   댓글 서브컬렉션(roundups/{id}/comments)까지 recursiveDelete — 고아 문서 방지.
  try {
    const roundupCutoff = ymd(new Date(Date.now() - ROUNDUP_RETENTION_DAYS * 24 * 3600 * 1000));
    const snap = await db.collection('roundups')
      .where('date', '>=', '2000.01.01')     // 빈/누락 date(오픈형) 제외
      .where('date', '<', roundupCutoff)     // 티오프 + 7일 경과
      .limit(300)                            // 실행당 상한 — recursiveDelete는 문서당 왕복이라 보수적으로(백로그는 다음 날 이어감)
      .get();
    let deleted = 0;
    for (const d of snap.docs) {
      try {
        await db.recursiveDelete(d.ref);     // 문서 + comments 서브컬렉션까지
        deleted++;
      } catch (e) {
        logger.warn('[ttl] roundup recursiveDelete fail', d.id, e?.message);
      }
    }
    if (deleted) logger.info(`[ttl] roundups: deleted ${deleted} (date < ${roundupCutoff}, teeoff+${ROUNDUP_RETENTION_DAYS}d)`);
  } catch (e) {
    logger.warn('[ttl] roundups cleanup fail', e?.message);
  }

  // 오픈형 모집글 정리 — date가 null(날짜 미정)인 모집은 createdAt + 21일 경과 시 삭제.
  //   위 date 기반 쿼리에서 빠지므로 별도 처리. type='open'이 아니라 date==null로 판별(기존 방식과 일관).
  try {
    const openCutoff = Timestamp.fromMillis(Date.now() - OPEN_ROUNDUP_RETENTION_DAYS * 24 * 3600 * 1000);
    const snap = await db.collection('roundups')
      .where('date', '==', null)
      .where('createdAt', '<', openCutoff)
      .limit(300)
      .get();
    let deleted = 0;
    for (const d of snap.docs) {
      try {
        await db.recursiveDelete(d.ref);
        deleted++;
      } catch (e) {
        logger.warn('[ttl] open roundup recursiveDelete fail', d.id, e?.message);
      }
    }
    if (deleted) logger.info(`[ttl] open roundups: deleted ${deleted} (createdAt < -${OPEN_ROUNDUP_RETENTION_DAYS}d)`);
  } catch (e) {
    logger.warn('[ttl] open roundups cleanup fail', e?.message);
  }

  // 라운지 알림 정리 — 생성 30일 지난 roundupNotifications 삭제(읽음 여부 무관).
  try {
    const notiCutoff = Timestamp.fromMillis(Date.now() - NOTI_RETENTION_DAYS * 24 * 3600 * 1000);
    let deleted = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const snap = await db.collection('roundupNotifications')
        .where('createdAt', '<', notiCutoff)
        .limit(BATCH)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < BATCH) break;
    }
    if (deleted) logger.info(`[ttl] roundupNotifications: deleted ${deleted} (createdAt < -${NOTI_RETENTION_DAYS}d)`);
  } catch (e) {
    logger.warn('[ttl] roundupNotifications cleanup fail', e?.message);
  }
});
