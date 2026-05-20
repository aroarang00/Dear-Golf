// 매너 등급 — 매너 점수(0~100) 기반. 신규 가입 시 70점에서 시작(보통).
// 낮은 등급부터 높은 등급 순.
export const MANNER_GRADES = [
  { key: 'restricted', emoji: '🚫', label: '이용제한', min: 0,  color: '#8B2A2A', cond: '39점 이하 — 이용 제한' },
  { key: 'caution',    emoji: '⚠️', label: '주의',     min: 40, color: '#8B6914', cond: '40~59점' },
  { key: 'normal',     emoji: '😐', label: '보통',     min: 60, color: '#6B6660', cond: '60~79점 (신규 시작점)' },
  { key: 'good',       emoji: '🙂', label: '좋음',     min: 80, color: '#3C7D4F', cond: '80~94점' },
  { key: 'king',       emoji: '😊', label: '매너왕',   min: 95, color: '#6B1E2A', cond: '95점 이상' },
];

const BY_KEY = MANNER_GRADES.reduce((m, g) => { m[g.key] = g; return m; }, {});

export const mannerGradeByKey = (key) => BY_KEY[key] || BY_KEY.normal;

// 매너 점수로 등급 산출.
export function getMannerGrade(score = 70) {
  if (score >= 95) return BY_KEY.king;
  if (score >= 80) return BY_KEY.good;
  if (score >= 60) return BY_KEY.normal;
  if (score >= 40) return BY_KEY.caution;
  return BY_KEY.restricted;
}

// 점수 범위(0~100) 클램프
export function clampMannerScore(s) {
  return Math.max(0, Math.min(100, s));
}

// 매너 점수 변동 사유 → 점수 차이.
// 라운딩 종료 감지·평가 집계 등 자동 트리거는 Phase 2(Cloud Functions) 작업.
export const MANNER_DELTAS = {
  roundComplete:    +2,   // 라운딩 정상 완료
  cancelDayBefore:  -1,   // 전날 취소
  cancelDay:        -3,   // 당일 취소
  noshow:          -10,   // 노쇼
  reportConfirmed:  -5,   // 불량 신고 확정
  evalGood:         +1,   // 평가 👍 좋았어요
  evalNeutral:       0,   // 평가 😐 보통 (변동 없음)
  evalBadMulti:     -3,   // 👎 별로였어요가 2명 이상일 때만
};

// 매너 점수에 변동분 적용 (클램프 포함)
export function applyMannerDelta(score, kind) {
  const delta = MANNER_DELTAS[kind] || 0;
  return clampMannerScore((score || 0) + delta);
}
