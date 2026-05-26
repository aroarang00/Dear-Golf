import { STORAGE_KEYS, storage } from './storage';

// 사용자 신고 월 1건 한도 시스템 — [[report-block-policy]] §3.
// 콘텐츠 신고와 별개. 콘텐츠 신고는 한도 X (단 같은 게시물 1인 1회).
//
// 동작:
// - 매월 1일 자동 초기화 (load 시점에 yearMonth 비교)
// - 신고 1건 등록 시 카운트 +1, 1회 도달 시 추가 신고 차단
// - Phase 2: 실제 신고 컬렉션과 동기화 + Cloud Functions 검증

const MONTH_LIMIT = 1;

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 이번 달 신고 사용 횟수 — 월이 바뀌었으면 자동 초기화
export async function getReportCountThisMonth() {
  const raw = await storage.load(STORAGE_KEYS.userReportCount, null);
  const ym = currentYearMonth();
  if (!raw || raw.yearMonth !== ym) {
    // 새 달 — 자동 초기화 (저장은 다음 신고 시점에)
    return 0;
  }
  return raw.count || 0;
}

// 잔여 신고 가능 횟수 (0 또는 1)
export async function getReportRemainingThisMonth() {
  const used = await getReportCountThisMonth();
  return Math.max(0, MONTH_LIMIT - used);
}

// 한도 도달 여부
export async function isReportLimitReached() {
  const used = await getReportCountThisMonth();
  return used >= MONTH_LIMIT;
}

// 신고 1건 등록 시 호출 — 월이 바뀌었으면 새 달 카운트로 시작
export async function incrementReportCount() {
  const ym = currentYearMonth();
  const raw = await storage.load(STORAGE_KEYS.userReportCount, null);
  const baseCount = (!raw || raw.yearMonth !== ym) ? 0 : (raw.count || 0);
  await storage.save(STORAGE_KEYS.userReportCount, {
    yearMonth: ym,
    count: baseCount + 1,
  });
}

// 개발용·테스트용 — 카운트 강제 초기화 (출시 후엔 호출 X)
export async function resetReportCount() {
  await storage.save(STORAGE_KEYS.userReportCount, {
    yearMonth: currentYearMonth(),
    count: 0,
  });
}

export const REPORT_MONTH_LIMIT = MONTH_LIMIT;
