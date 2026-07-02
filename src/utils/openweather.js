// =============================================================
// OpenWeatherMap — 해외 골프장 날씨 (국내는 기상청, 해외는 OpenWeather)
//  · 해외 골프장은 위치 DB가 없어 → 사용자가 입력한 '도시'를 지오코딩해 좌표를 얻고
//    그 좌표로 현지 날씨를 호출한다.
// =============================================================
import { OPENWEATHER_API_KEY, OPENWEATHER_URL } from '../constants/api';
import { WEEKDAYS } from '../constants/data';
import { fetchWithTimeout } from './net'; // RN fetch는 기본 타임아웃 없음 — 무한대기 방지(8s)

const GEO_URL = 'https://api.openweathermap.org/geo/1.0/direct';

// 날씨 코드(id) → 이모지
function weatherEmoji(id) {
  if (id == null) return '🌤️';
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return '☀️';
  return '☁️';
}

// 도시명 → 좌표 후보 목록 (사용자가 골라 정확한 위치를 지정)
export async function geocodeCity(query) {
  const q = (query || '').trim();
  if (!q || !OPENWEATHER_API_KEY) return [];
  try {
    const res = await fetchWithTimeout(`${GEO_URL}?q=${encodeURIComponent(q)}&limit=6&appid=${OPENWEATHER_API_KEY}`, {}, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map(d => ({
      name: (d.local_names && d.local_names.ko) || d.name,
      enName: d.name,
      country: d.country || '',
      state: d.state || '',
      lat: d.lat,
      lon: d.lon,
    }));
  } catch (e) {
    console.warn('[openweather] geocode 실패', e?.message);
    return [];
  }
}

// 3시간 간격 예보 목록 → 일별 집계 (기상청 days 형식과 호환되게)
function aggregateDays(list) {
  const DAYS = WEEKDAYS;
  const todayKey = new Date().toISOString().slice(0, 10);
  const byDate = {};
  (list || []).forEach(it => {
    const key = (it.dt_txt || '').slice(0, 10); // 'YYYY-MM-DD'
    if (!key) return;
    if (!byDate[key]) byDate[key] = { key, temps: [], pops: [], items: [] };
    byDate[key].temps.push(it.main?.temp);
    byDate[key].pops.push((it.pop || 0) * 100);
    byDate[key].items.push(it);
  });
  return Object.values(byDate).slice(0, 6).map(g => {
    const temps = g.temps.filter(Number.isFinite);
    const noon = g.items.find(i => (i.dt_txt || '').includes('12:00:00')) || g.items[Math.floor(g.items.length / 2)];
    const [y, m, d] = g.key.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    return {
      day: g.key === todayKey ? '오늘' : DAYS[dateObj.getDay()],
      date: `${y}.${m}.${d}`,
      icon: weatherEmoji(noon?.weather?.[0]?.id),
      sky: noon?.weather?.[0]?.description || '',
      pop: g.pops.length ? Math.round(Math.max(...g.pops)) : 0,
      tmin: temps.length ? Math.round(Math.min(...temps)) : null,
      tmax: temps.length ? Math.round(Math.max(...temps)) : null,
    };
  });
}

// 좌표 → 현재 날씨 + 5일 예보. 기상청 forecast와 비슷한 형태로 반환.
export async function getOverseasWeather(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !OPENWEATHER_API_KEY) return null;
  try {
    const { recordLocationAccess } = require('./locationAccessLog');
    recordLocationAccess({ providerName: 'openweather', purpose: '해외 날씨 조회', method: 'send' });
  } catch {}
  try {
    const [curRes, fcRes] = await Promise.all([
      fetchWithTimeout(`${OPENWEATHER_URL}/weather?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${OPENWEATHER_API_KEY}`, {}, 8000),
      fetchWithTimeout(`${OPENWEATHER_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&lang=kr&appid=${OPENWEATHER_API_KEY}`, {}, 8000),
    ]);
    if (!curRes.ok) return null;
    const cur = await curRes.json();
    const fc = fcRes.ok ? await fcRes.json() : null;
    const w0 = cur.weather && cur.weather[0];
    return {
      current: {
        temp: cur.main?.temp,
        humidity: cur.main?.humidity,
        windSpeed: cur.wind?.speed,
        sky: w0?.description || '',
        icon: weatherEmoji(w0?.id),
        pop: fc?.list?.[0]?.pop != null ? Math.round(fc.list[0].pop * 100) : 0,
      },
      days: fc ? aggregateDays(fc.list) : [],
      cityName: cur.name || '',
    };
  } catch (e) {
    console.warn('[openweather] 날씨 호출 실패', e?.message);
    return null;
  }
}
