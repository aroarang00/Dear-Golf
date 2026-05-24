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
  noshow:          -20,   // 노쇼 확정 — 90일 정지도 별도 발동
  falseReport:     -20,   // 허위 노쇼 신고 확정 — 120일 정지도 별도 발동
  reportConfirmed:  -5,   // 사용자 신고 정당 확정 (피신고자, [[report-block-policy]])
  evalGood:         +1,   // 매너 평가 👍
  evalNeutral:       0,   // 매너 평가 😐 또는 무평가(자동 보통 처리)
  evalBadMulti:     -3,   // 매너 평가 👎가 2명 이상일 때만
};

// 매너 점수에 변동분 적용 (클램프 포함)
export function applyMannerDelta(score, kind) {
  const delta = MANNER_DELTAS[kind] || 0;
  return clampMannerScore((score || 0) + delta);
}

// 취소 시점 안내 문구 — 시스템 차감 X, 안내만 ([[roundup-penalty-policy]] §2).
// 7일+ 이전: null (위약금 없음, 안내 불필요) / 7일 이내·임박: 골프장 위약금 안내.
export function getCancelWarningByHours(hoursUntilTeeOff) {
  if (hoursUntilTeeOff >= 168) return null;                                                  // 7일+ 이전 — 위약금 없음
  if (hoursUntilTeeOff >= 120) return '⚠️ 골프장 위약금이 발생할 수 있어요 (본인 부담).';      // 5~7일
  if (hoursUntilTeeOff >= 48)  return '⚠️ 골프장 위약금이 큼 — 본인 부담이에요.';              // 48h~5일
  return '⚠️ 임박 취소예요. 골프장 위약금이 매우 크고 동반자에게 큰 피해가 가요.';              // 48h 이내
}
