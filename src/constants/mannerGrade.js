// 매너 등급 — 매너 점수(0~100) 기반. 신규 가입 시 70점에서 시작(보통).
// 4단계: 매너왕(95+) / 좋음(80~94) / 보통(40~79) / 주의(0~39).
// 이용제한 등급은 폐지 — 모집 정지는 별도 상태(노쇼·허위신고 기반)로 관리하고 매너 등급과 분리.
// 낮은 등급부터 높은 등급 순.
export const MANNER_GRADES = [
  { key: 'caution', emoji: '⚠️', label: '주의',   min: 0,  color: '#8B2A2A', cond: '0~39점 — 명확한 매너 문제' },
  { key: 'normal',  emoji: '😐', label: '보통',   min: 40, color: '#6B6660', cond: '40~79점 (신규 70점 시작점)' },
  { key: 'good',    emoji: '🙂', label: '좋음',   min: 80, color: '#3C7D4F', cond: '80~94점' },
  { key: 'king',    emoji: '😊', label: '매너왕', min: 95, color: '#6B1E2A', cond: '95점 이상' },
];

const BY_KEY = MANNER_GRADES.reduce((m, g) => { m[g.key] = g; return m; }, {});

export const mannerGradeByKey = (key) => BY_KEY[key] || BY_KEY.normal;

// 매너 점수로 등급 산출.
export function getMannerGrade(score = 70) {
  if (score >= 95) return BY_KEY.king;
  if (score >= 80) return BY_KEY.good;
  if (score >= 40) return BY_KEY.normal;
  return BY_KEY.caution;
}

// 점수 범위(0~100) 클램프
export function clampMannerScore(s) {
  return Math.max(0, Math.min(100, s));
}

// 매너 점수 변동 사유 (2026-05-25 단순화).
// 취소(7일/5일/임박) 단계별 시스템 차감은 폐기 — 취소는 골프장 위약금(본인 부담)과 매너 평가에서 자연 반영.
// 시스템 강제 패널티는 노쇼·허위신고만 ([[roundup-penalty-policy]], [[noshow-report-system]]).
export const MANNER_DELTAS = {
  roundComplete:    +2,   // 라운딩 정상 완료
  noshow:          -20,   // 노쇼 확정 — 60일 정지도 별도 발동
  falseReport:     -20,   // 허위 노쇼 신고 확정 — 90일 정지도 별도 발동
  reportConfirmed:  -5,   // 사용자 신고 정당 확정 (피신고자, [[report-block-policy]])
  evalGood:         +1,   // 매너 평가 👍 (1명만이라도 가능)
  evalNeutral:       0,   // 매너 평가 😐 또는 무평가(자동 보통 처리)
};

// 매너 평가 👎 개수에 따른 차감 — 그라데이션 ([[manner-evaluation-policy]])
// 1명만 👎는 무시(자동 보통 처리), 2명부터 사회적 합의로 인정.
export function getBadVoteDelta(badCount) {
  if (badCount < 2) return 0;      // 1명 이하 — 사적 감정 차단
  if (badCount === 2) return -2;   // 2명 합의
  return -3;                        // 3명 이상 (4인 라운드 최대치)
}

// 매너 점수에 변동분 적용 (클램프 포함)
export function applyMannerDelta(score, kind) {
  const delta = MANNER_DELTAS[kind] || 0;
  return clampMannerScore((score || 0) + delta);
}

// 라운딩까지 168h(D-7) 이내면 참여자 시스템 취소 차단 ([[roundup-penalty-policy]] §1).
// 주최자는 우천·천재지변 대응으로 [취소]만 가능, 매너 평가로 일임.
export const D7_BLOCK_HOURS = 168;

export function isD7Inside(hoursUntilTeeOff) {
  return hoursUntilTeeOff < D7_BLOCK_HOURS;
}

// 취소 시점 안내 문구 — D-7 이전이면 자유 안내, D-7 이내면 차단 안내.
// 시스템 매너점수 차감은 노쇼만 (단계별 취소 차감 폐기, [[roundup-penalty-policy]] §3).
export function getCancelWarningByHours(hoursUntilTeeOff) {
  if (hoursUntilTeeOff >= D7_BLOCK_HOURS) return null;  // D-7 이전 — 자유 취소, 안내 불필요
  return '⚠️ 라운딩 7일 이내에는 취소가 어려워요. 댓글로 양해를 구하거나 매너 평가에 자연 반영됩니다.';
}
