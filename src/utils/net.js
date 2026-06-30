// fetch + 타임아웃 — RN fetch는 기본 타임아웃이 없어 서버가 응답을 안 주면 무한 대기한다.
//   교통 길찾기(TMap/카카오)처럼 '느리면 폴백해야' 하는 호출에서, 일정 시간 내 응답 없으면 abort →
//   호출부 catch가 null 반환 → 다음 제공자로 폴백. 사용자가 '계산 중'에 갇히는 것 방지.
export async function fetchWithTimeout(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
