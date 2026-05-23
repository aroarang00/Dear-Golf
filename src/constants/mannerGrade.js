// 매너 등급 — 매너 점수(0~100) 기반. 신규 가입 시 70점에서 시작(보통).
// 4단계: 매너왕(95+) / 좋음(80~94) / 보통(40~79) / 주의(0~39).
// 이용제한 등급은 폐지 — 모집 정지는 별도 상태(노쇼·임박취소 누적 기반)로 관리하고 매너 등급과 분리.
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

// 매너 점수 변동 사유 → 점수 차이.
// 취소 시간 구간은 티오프 시각 기준 — 골프 라운딩 대체자 구하는 시간 고려해 48h 기준.
// 라운딩 종료 감지·평가 집계 등 자동 트리거는 Phase 2(Cloud Functions) 작업.
export const MANNER_DELTAS = {
  roundComplete:    +2,   // 라운딩 정상 완료
  cancel7dPlus:      0,   // 7일 이전 취소 — 패널티 없음
  cancel7d:         -1,   // 7일 이내 취소 (티오프 5~7일)
  cancel5d:         -2,   // 5일 이내 취소 (티오프 48h~5일)
  cancelImminent:   -5,   // 임박 취소 (티오프 48h 이내) — 모집 정지 14일도 별도 발동
  noshow:          -10,   // 노쇼 — 모집 정지 60일도 별도 발동
  reportConfirmed:  -5,   // 사용자 신고 정당 확정 (피신고자)
  evalGood:         +1,   // 매너 평가 👍
  evalNeutral:       0,   // 매너 평가 😐 또는 무평가(자동 보통 처리)
  evalBadMulti:     -3,   // 매너 평가 👎가 2명 이상일 때만
};

// 매너 점수에 변동분 적용 (클램프 포함)
export function applyMannerDelta(score, kind) {
  const delta = MANNER_DELTAS[kind] || 0;
  return clampMannerScore((score || 0) + delta);
}

// 취소 시점(티오프까지 남은 시간, 단위: 시간)으로 차감 키 산출.
// 임박 모집(48h 이내 작성)에 참여한 경우도 자연스럽게 cancelImminent로 분기됨.
// 7일+ 이전: cancel7dPlus (0) / 5~7일: cancel7d (-1) / 48h~5일: cancel5d (-2) / 48h 이내: cancelImminent (-5)
export function cancelDeltaKindByHours(hoursUntilTeeOff) {
  if (hoursUntilTeeOff >= 168) return 'cancel7dPlus';   // 7일+ 이전
  if (hoursUntilTeeOff >= 120) return 'cancel7d';       // 5~7일
  if (hoursUntilTeeOff >= 48)  return 'cancel5d';       // 48h~5일
  return 'cancelImminent';                              // 48h 이내
}

// 취소 키 → 사용자 노출 라벨
export const CANCEL_DELTA_LABEL = {
  cancel7dPlus:   '7일 이전 취소',
  cancel7d:       '7일 이내 취소',
  cancel5d:       '5일 이내 취소',
  cancelImminent: '임박 취소',
};
