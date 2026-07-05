// 일출·일몰 로컬 계산(NOAA 근사, 오차 ±2분 수준) — API·네트워크 불필요.
// 한국 골프장 전용이라 표시 시각은 KST(UTC+9) 고정. 골프지수 '일몰·종료 여유' 표시용 ([[weather-graph]]).
const rad = Math.PI / 180;

function dayOfYear(y, m, d) {
  return Math.floor((275 * m) / 9) - (Math.floor((m + 9) / 12) * (1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3))) + d - 30;
}

// rising=true 일출 / false 일몰. 반환: UTC 시각(시, 0~24) 또는 null(극야·백야 — 한국엔 없음)
function calcUT(rising, N, lat, lng) {
  const lngHour = lng / 15;
  const t = N + (((rising ? 6 : 18) - lngHour) / 24);
  const M = 0.9856 * t - 3.289; // 태양 평균 근점이각(도)
  let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634; // 황경
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; // 적경
  RA = ((RA % 360) + 360) % 360;
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90; // 황경과 같은 사분면으로 보정
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad)); // 공식 천정각 90°50'
  if (cosH > 1 || cosH < -1) return null;
  let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
  H /= 15;
  const T = H + RA - 0.06571 * t - 6.622;
  return ((T - lngHour) % 24 + 24) % 24;
}

// dateStr: 'YYYY.MM.DD' | 'YYYYMMDD'. 반환 { sunriseMin, sunsetMin, sunrise:'HH:MM', sunset:'HH:MM' } (KST 자정 기준 분) 또는 null
export function getSunTimes(lat, lng, dateStr) {
  const s = String(dateStr || '').replace(/\D/g, '');
  if (s.length < 8 || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const N = dayOfYear(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8));
  const rise = calcUT(true, N, lat, lng);
  const set = calcUT(false, N, lat, lng);
  if (rise == null || set == null) return null;
  const toMin = (ut) => Math.round((((ut + 9) % 24) * 60));
  const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const sunriseMin = toMin(rise);
  const sunsetMin = toMin(set);
  return { sunriseMin, sunsetMin, sunrise: fmt(sunriseMin), sunset: fmt(sunsetMin) };
}
