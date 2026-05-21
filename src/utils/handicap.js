// 핸디 — 라운딩 기록 중 베스트 5개(가장 좋은 점수)의 평균.
// 전체 평균이 아니라 좋은 라운드 위주로 계산해, 나쁜 날을 기록해도 핸디가
// 잘 나빠지지 않게 한다 (정식 골프 핸디캡 철학 + 기록 부담 최소화).
//
// 기록이 5개 미만이면 표본이 적어 핸디 신뢰도가 낮으므로,
// 사용자가 온보딩/마이페이지에서 입력한 평균타(manualAvg)를 우선 사용한다.
// 입력값도 없으면 있는 기록의 평균, 그것도 없으면 null.
const HANDICAP_BEST_COUNT = 5;

export function calcHandicap(diaries, manualAvg) {
  const scores = (diaries || [])
    .map(d => d?.score)
    .filter(s => typeof s === 'number' && s > 0)
    .sort((a, b) => a - b);
  const hasManual = typeof manualAvg === 'number' && manualAvg > 0;
  const avgOf = (arr) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  // 기록 5개 미만 — 입력값 우선, 없으면 있는 기록 평균, 그것도 없으면 null
  if (scores.length < HANDICAP_BEST_COUNT) {
    if (hasManual) return manualAvg;
    return scores.length ? avgOf(scores) : null;
  }
  // 기록 5개 이상 — 베스트 5개 평균
  return avgOf(scores.slice(0, HANDICAP_BEST_COUNT));
}
