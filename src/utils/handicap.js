// 핸디 — 라운딩 기록 중 베스트 3개(가장 좋은 점수)의 평균.
// 전체 평균이 아니라 좋은 라운드 위주로 계산해, 나쁜 날을 기록해도 핸디가
// 잘 나빠지지 않게 한다 (정식 골프 핸디캡 철학 + 기록 부담 최소화).
// 기록이 하나도 없으면 수동 입력값(manualAvg)으로 폴백.
const HANDICAP_BEST_COUNT = 3;

export function calcHandicap(diaries, manualAvg) {
  const scores = (diaries || [])
    .map(d => d?.score)
    .filter(s => typeof s === 'number' && s > 0)
    .sort((a, b) => a - b);
  if (scores.length === 0) {
    return (typeof manualAvg === 'number' && manualAvg > 0) ? manualAvg : null;
  }
  const best = scores.slice(0, HANDICAP_BEST_COUNT);
  return Math.round(best.reduce((s, v) => s + v, 0) / best.length);
}
