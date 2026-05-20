// 활동 등급 — 주최 완료 횟수(hostedCount) 기반. 레전드는 매너 점수 95+ 추가 충족.
// 낮은 등급부터 높은 등급 순.
export const TRUST_GRADES = [
  { key: 'new',      emoji: '🏌️', label: '신규',   cond: '주최 0회 — 이제 시작이에요' },
  { key: 'bronze',   emoji: '🥉', label: '브론즈', cond: '주최 5회 이상' },
  { key: 'silver',   emoji: '🥈', label: '실버',   cond: '주최 20회 이상' },
  { key: 'gold',     emoji: '🥇', label: '골드',   cond: '주최 50회 이상' },
  { key: 'champion', emoji: '🏆', label: '챔피언', cond: '주최 100회 이상' },
  { key: 'legend',   emoji: '👑', label: '레전드', cond: '주최 200회 이상 · 매너 95점 이상' },
];

const BY_KEY = TRUST_GRADES.reduce((m, g) => { m[g.key] = g; return m; }, {});

export const trustGradeByKey = (key) => BY_KEY[key] || BY_KEY.new;

// 주최 완료 횟수와 매너 점수로 활동 등급 산출.
export function getTrustGrade(hostedCount = 0, mannerScore = 0) {
  if (hostedCount >= 200 && mannerScore >= 95) return BY_KEY.legend;
  if (hostedCount >= 100) return BY_KEY.champion;
  if (hostedCount >= 50)  return BY_KEY.gold;
  if (hostedCount >= 20)  return BY_KEY.silver;
  if (hostedCount >= 5)   return BY_KEY.bronze;
  return BY_KEY.new;
}
