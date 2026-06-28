// 핸디 — 최근 N라운드(HANDICAP_RECENT_WINDOW) 중 베스트 5개(가장 좋은 점수)의 평균.
// 전체 평균이 아니라 '최근의 좋은 라운드' 위주로 계산해, 나쁜 날을 기록해도 핸디가 잘 나빠지지
// 않으면서도, 옛 베스트가 핸디를 영영 붙잡지 않게 한다 (정식 핸디캡 철학 — 최근 라운드 기준).
//
// 기록이 5개 이하면(=6개 미만) 표본이 적고 버릴 라운드도 없어 핸디 신뢰도가 낮으므로,
// 사용자가 온보딩/마이페이지에서 입력한 평균타(manualAvg)를 우선 사용한다.
// 입력값도 없으면 있는 기록의 평균, 그것도 없으면 null.
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUid } from './firebase';
import { roundsOnly } from './diaryKind';

export const HANDICAP_BEST_COUNT = 5;
export const HANDICAP_RECENT_WINDOW = 20;   // 최근 20라운드 중에서 베스트 선정(옛 베스트가 핸디를 영영 붙잡지 않게)

// "YYYY.MM.DD" → 정렬 키(숫자). 형식 깨지면 0(가장 오래된 것으로 취급).
const dateKey = (s) => {
  const m = String(s || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
};

// 최근 윈도우 점수 — 일상(모멘트) 제외, score>0, 날짜 최근순 정렬 후 상위 N개만.
const collectRecentScores = (diaries) => roundsOnly(diaries)
  .filter(d => typeof d?.score === 'number' && d.score > 0)
  .map(d => ({ score: d.score, k: dateKey(d.date) }))
  .sort((a, b) => b.k - a.k)                  // 최근 라운드 먼저
  .slice(0, HANDICAP_RECENT_WINDOW)           // 최근 N라운드만
  .map(d => d.score);

const avgOf = (arr) => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

export function calcHandicap(diaries, manualAvg) {
  const recent = collectRecentScores(diaries);
  const hasManual = typeof manualAvg === 'number' && manualAvg > 0;

  // 기록 5개 이하 — 입력값 우선, 없으면 있는 기록 평균, 그것도 없으면 null.
  if (recent.length <= HANDICAP_BEST_COUNT) {
    if (hasManual) return manualAvg;
    return recent.length ? avgOf(recent) : null;
  }
  // 기록 6개 이상 — 최근 N라운드 중 베스트 5개 평균 (오름차순 정렬 후 앞 5개).
  const best5 = [...recent].sort((a, b) => a - b).slice(0, HANDICAP_BEST_COUNT);
  return avgOf(best5);
}

// 내 핸디를 users 문서에 동기화 — 라운지 모집 상세에서 남(주최자·참여자)이 내 핸디를 보려면
//   user 문서에 있어야 함(남의 다이어리엔 접근 불가). 변경 시에만 호출(중복 write 방지는 호출부).
//   uid 필수(규칙 [[users_doc_uid_required]]). 친구공개 user 문서라 모집 정보 제공 의도에 부합.
export async function syncMyHandicap(handicap) {
  const uid = await getUid();
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid),
      { uid, handicap: (typeof handicap === 'number' ? handicap : null), updatedAt: serverTimestamp() },
      { merge: true });
  } catch (e) {
    if (__DEV__) console.warn('[handicap] syncMyHandicap', e?.message);
  }
}

// (폐기) 평균타 = 전체 평균 함수 — 2026-05-26 통계 박스 라벨을 '핸디'로 통일하면서 미사용.
// DiaryScreen 통계·DiaryCard 색상 비교 모두 calcHandicap 사용.
// 향후 평균타 별도 지표가 필요해지면 다시 복원.
