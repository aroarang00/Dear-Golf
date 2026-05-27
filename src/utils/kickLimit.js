import { STORAGE_KEYS, storage } from './storage';

// 주최자 강퇴 월 2회 한도 — [[roundup-kick-policy]] §4.
// 12개월 롤링 10회 → 2개월 정지는 Phase 2 Cloud Functions에서 처리.
//
// 동작:
//  - 매월 1일 자동 초기화 (load 시점에 yearMonth 비교)
//  - 강퇴 1건 등록 시 카운트 +1, 2회 도달 시 추가 강퇴 차단

const MONTH_LIMIT = 2;

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getKickCountThisMonth() {
  const raw = await storage.load(STORAGE_KEYS.kickCount, null);
  const ym = currentYearMonth();
  if (!raw || raw.yearMonth !== ym) return 0;
  return raw.count || 0;
}

export async function getKickRemainingThisMonth() {
  const used = await getKickCountThisMonth();
  return Math.max(0, MONTH_LIMIT - used);
}

export async function isKickLimitReached() {
  const used = await getKickCountThisMonth();
  return used >= MONTH_LIMIT;
}

export async function incrementKickCount() {
  const ym = currentYearMonth();
  const raw = await storage.load(STORAGE_KEYS.kickCount, null);
  const baseCount = (!raw || raw.yearMonth !== ym) ? 0 : (raw.count || 0);
  await storage.save(STORAGE_KEYS.kickCount, {
    yearMonth: ym,
    count: baseCount + 1,
  });
}

export const KICK_MONTH_LIMIT = MONTH_LIMIT;

// 강퇴 사유 — 2개만, 기타 없음 ([[roundup-kick-policy]] §2)
export const KICK_REASONS = [
  { key: 'misbehavior', label: '비매너 행동' },
  { key: 'fake_profile', label: '허위 프로필' },
];
