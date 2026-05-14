import AsyncStorage from '@react-native-async-storage/async-storage';
import { UNSPLASH_ACCESS_KEY } from '../constants/api';

const CACHE_KEY = '@dg_unsplash_v2';
const TTL = 24 * 60 * 60 * 1000; // 24h

let memCache = null;
async function loadCache() {
  if (memCache) return memCache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    memCache = raw ? JSON.parse(raw) : {};
  } catch { memCache = {}; }
  return memCache;
}
async function saveCache() {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(memCache || {})); } catch {}
}

// 시간대 (4): 새벽(05-09) / 오전(09-12) / 오후(12-17) / 저녁(17-05, 야간 포함)
export function classifyTime(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 9)  return 'dawn';
  if (h >= 9 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

// 날씨 (4): 비 > 바람(>=7m/s) > 흐림 > 맑음
// cur: { sky:'맑음'|'구름많음'|'흐림'|'비'|... , windSpeed:number }
export function classifyWeather(cur) {
  if (!cur) return 'clear';
  const sky = String(cur.sky || '');
  if (sky.includes('비') || sky.includes('소나기') || sky.includes('눈')) return 'rain';
  if (Number.isFinite(cur.windSpeed) && cur.windSpeed >= 7) return 'wind';
  if (sky.includes('흐림') || sky.includes('구름많음')) return 'cloudy';
  return 'clear';
}

// 16개 조합 키워드 — "사람 없는 골프장" 컨셉
const KEYWORDS = {
  dawn: {
    clear:  'sunrise golf course empty fairway',
    cloudy: 'misty golf course dawn empty',
    rain:   'rainy golf course early morning',
    wind:   'foggy golf course flag morning',
  },
  morning: {
    clear:  'sunny golf course morning fairway empty',
    cloudy: 'cloudy golf course morning landscape',
    rain:   'rainy golf course morning empty',
    wind:   'windy golf course flag morning',
  },
  afternoon: {
    clear:  'golf course blue sky fairway empty',
    cloudy: 'overcast golf course landscape empty',
    rain:   'rainy golf course fairway empty',
    wind:   'windy golf course flag afternoon',
  },
  evening: {
    clear:  'sunset golf course landscape empty',
    cloudy: 'cloudy golf course dusk empty',
    rain:   'rainy golf course evening empty',
    wind:   'windy golf course sunset flag',
  },
};

export function getKeyword(timeOfDay, weather) {
  return KEYWORDS[timeOfDay]?.[weather] || 'golf course landscape empty';
}

export async function fetchBgImages(timeOfDay, weather) {
  const key = `${timeOfDay}:${weather}`;
  const cache = await loadCache();
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < TTL && entry.urls?.length) return entry.urls;

  const query = encodeURIComponent(getKeyword(timeOfDay, weather));
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${query}&per_page=10&orientation=portrait&content_filter=high&client_id=${UNSPLASH_ACCESS_KEY}`,
    );
    if (!res.ok) {
      console.warn('[unsplash] HTTP', res.status);
      return entry?.urls || [];
    }
    const data = await res.json();
    const urls = (data?.results || [])
      .map(p => p.urls?.regular || p.urls?.full || p.urls?.small || null)
      .filter(Boolean)
      .slice(0, 6);
    console.log('[unsplash] key=', key, 'count=', urls.length, urls[0]?.slice(0, 80));
    if (urls.length) {
      cache[key] = { urls, ts: Date.now() };
      saveCache();
      return urls;
    }
    return entry?.urls || [];
  } catch (e) {
    console.warn('[unsplash] fetch failed:', e?.message);
    return entry?.urls || [];
  }
}
