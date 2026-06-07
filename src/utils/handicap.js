// 핸디 — 라운딩 기록 중 베스트 5개(가장 좋은 점수)의 평균.
// 전체 평균이 아니라 좋은 라운드 위주로 계산해, 나쁜 날을 기록해도 핸디가
// 잘 나빠지지 않게 한다 (정식 골프 핸디캡 철학 + 기록 부담 최소화).
//
// 기록이 5개 이하면(=6개 미만) 표본이 적고 버릴 라운드도 없어 핸디 신뢰도가 낮으므로,
// 사용자가 온보딩/마이페이지에서 입력한 평균타(manualAvg)를 우선 사용한다.
// 입력값도 없으면 있는 기록의 평균, 그것도 없으면 null.
import { roundsOnly } from './diaryKind';

export const HANDICAP_BEST_COUNT = 5;

const collectScores = (diaries) => roundsOnly(diaries) // 일상(모멘트) 제외
  .map(d => d?.score)
  .filter(s => typeof s === 'number' && s > 0);

const avgOf = (arr) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

export function calcHandicap(diaries, manualAvg) {
  const scores = collectScores(diaries).sort((a, b) => a - b);
  const hasManual = typeof manualAvg === 'number' && manualAvg > 0;

  // 기록 5개 이하 — 입력값 우선, 없으면 있는 기록 평균, 그것도 없으면 null.
  // (가장 나쁜 라운드를 버리고 베스트 5개를 고르려면 6개 이상 필요 → 그 전엔 입력값)
  if (scores.length <= HANDICAP_BEST_COUNT) {
    if (hasManual) return manualAvg;
    return scores.length ? avgOf(scores) : null;
  }
  // 기록 6개 이상 — 베스트 5개 평균 (정렬 오름차순이라 앞 5개 = 좋은 5개, 가장 나쁜 건 버림)
  return avgOf(scores.slice(0, HANDICAP_BEST_COUNT));
}

// (폐기) 평균타 = 전체 평균 함수 — 2026-05-26 통계 박스 라벨을 '핸디'로 통일하면서 미사용.
// DiaryScreen 통계·DiaryCard 색상 비교 모두 calcHandicap 사용.
// 향후 평균타 별도 지표가 필요해지면 다시 복원.
