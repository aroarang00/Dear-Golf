import { KMA_SERVICE_KEY, AIRKOREA_URL, locToSidoName } from '../constants/api';

// =============================================================
// 한국환경공단 에어코리아 — 시도별 실시간 미세먼지
// 같은 공공데이터포털 일반인증키(KMA_SERVICE_KEY) 사용
// =============================================================

const PM10_GRADE_LABEL = { 1: '좋음', 2: '보통', 3: '나쁨', 4: '매우나쁨' };

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) { console.warn('[airkorea] HTTP', res.status); return null; }
    const text = await res.text();
    try { return JSON.parse(text); } catch {
      console.warn('[airkorea] non-JSON response:', text.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.warn('[airkorea] fetch failed:', e?.message);
    return null;
  }
}

// 시도별 실시간 측정정보 평균 PM10
// 반환: { pm10: number, label: '좋음'|'보통'|'나쁨'|'매우나쁨' } | null
export async function getAirQuality(loc) {
  const sidoName = locToSidoName(loc);
  const url = `${AIRKOREA_URL}/getCtprvnRltmMesureDnsty`
    + `?serviceKey=${encodeURIComponent(KMA_SERVICE_KEY)}`
    + `&returnType=json&numOfRows=100&pageNo=1`
    + `&sidoName=${encodeURIComponent(sidoName)}&ver=1.0`;
  const data = await fetchJson(url);
  const items = data?.response?.body?.items;
  if (!Array.isArray(items) || items.length === 0) return null;

  // 첫 페이지 데이터는 보통 가장 최신 dataTime 측정값들. 측정소별 1건.
  // 유효한 pm10Value만 평균 (NaN, '-', '' 제외)
  const vals = items
    .map(it => parseFloat(it.pm10Value))
    .filter(v => Number.isFinite(v) && v >= 0);
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  // PM10 등급 기준 (환경부): 0-30 좋음, 31-80 보통, 81-150 나쁨, 151+ 매우나쁨
  let grade;
  if (avg <= 30) grade = 1;
  else if (avg <= 80) grade = 2;
  else if (avg <= 150) grade = 3;
  else grade = 4;

  return { pm10: Math.round(avg), label: PM10_GRADE_LABEL[grade] };
}
