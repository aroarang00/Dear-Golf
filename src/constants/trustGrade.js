// 라운딩 모집 신뢰 등급 — 모집 완료 횟수로 결정한다.
// 낮은 등급부터 높은 등급 순.
export const TRUST_GRADES = [
  { key: 'new',      emoji: '🏌️', label: '신규',   cond: '아직 모집 완료 기록이 적은 골퍼' },
  { key: 'bronze',   emoji: '🥉', label: '브론즈', cond: '모집 완료 3회 이상' },
  { key: 'silver',   emoji: '🥈', label: '실버',   cond: '모집 완료 10회 이상' },
  { key: 'gold',     emoji: '🥇', label: '골드',   cond: '모집 완료 20회 이상' },
  { key: 'champion', emoji: '🏆', label: '챔피언', cond: '모집 완료 30회 이상' },
];

const BY_KEY = TRUST_GRADES.reduce((m, g) => { m[g.key] = g; return m; }, {});

export const trustGradeByKey = (key) => BY_KEY[key] || BY_KEY.new;

// 모집 완료 횟수(completed)로 등급 산출.
export function getTrustGrade(completed = 0) {
  if (completed >= 30) return BY_KEY.champion;
  if (completed >= 20) return BY_KEY.gold;
  if (completed >= 10) return BY_KEY.silver;
  if (completed >= 3) return BY_KEY.bronze;
  return BY_KEY.new;
}
