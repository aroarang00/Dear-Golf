// 일상(모멘트) 격리 — 단일 진실원.
// '일상' 글은 라운딩 기록과 같은 diaries 컬렉션에 kind:'moment'로 섞여 저장된다.
// 따라서 라운딩 통계·집계(총 라운딩·핸디·베스트·방문 구장·마일스톤 등)는
// 전부 라운딩(kind!=='moment')만 봐야 한다. 기본값은 round(플래그 없는 옛 데이터=하위호환).
//
// 'moment' 문자열을 화면마다 흩뿌리면 오타·누락 한 번에 통계가 조용히 오염되므로
// (예: "라운딩 안 갔는데 카운트↑"), 반드시 이 헬퍼를 거쳐 격리한다.
export const isMomentDiary = (d) => d?.kind === 'moment';
export const isRoundDiary = (d) => !isMomentDiary(d);
// 라운딩 기록만 남긴 배열 (null/undefined 입력 안전)
export const roundsOnly = (diaries) => (diaries || []).filter(isRoundDiary);
