// 신뢰등급 — 라운딩 완료 카운트(hostedCount) + 매너 조건.
// 카운트는 라운딩 정상 완료 시 +1, 노쇼·취소는 +1 안 됨 ([[trust-grade-system]]).
// 골드·챔피언은 매너 80+(좋음), 레전드는 매너 95+(매너왕) 조건 동반.
// 낮은 등급부터 높은 등급 순.
export const TRUST_GRADES = [
  { key: 'new',      emoji: '🏌️', label: '신규',   cond: '주최 0회 — 이제 시작이에요' },
  { key: 'bronze',   emoji: '🥉', label: '브론즈', cond: '주최 5회 이상' },
  { key: 'silver',   emoji: '🥈', label: '실버',   cond: '주최 20회 이상' },
  { key: 'gold',     emoji: '🥇', label: '골드',   cond: '주최 50회 이상 · 매너 좋음 이상' },
  { key: 'champion', emoji: '🏆', label: '챔피언', cond: '주최 100회 이상 · 매너 좋음 이상' },
  { key: 'legend',   emoji: '👑', label: '레전드', cond: '주최 200회 이상 · 매너왕' },
];

const BY_KEY = TRUST_GRADES.reduce((m, g) => { m[g.key] = g; return m; }, {});

// 주최 완료 횟수와 매너 점수로 신뢰등급 산출.
// 매너 조건 미달 시 한 등급 아래로 떨어짐 (예: 주최 100회 + 매너 75 → 실버).
export function getTrustGrade(hostedCount = 0, mannerScore = 0) {
  if (hostedCount >= 200 && mannerScore >= 95) return BY_KEY.legend;
  if (hostedCount >= 100 && mannerScore >= 80) return BY_KEY.champion;
  if (hostedCount >= 50  && mannerScore >= 80) return BY_KEY.gold;
  if (hostedCount >= 20) return BY_KEY.silver;
  if (hostedCount >= 5)  return BY_KEY.bronze;
  return BY_KEY.new;
}
