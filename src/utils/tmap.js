import AsyncStorage from '@react-native-async-storage/async-storage';
import { TMAP_APP_KEY, TMAP_ROUTES_URL } from '../constants/api';

// =============================================================
// 티맵모빌리티 자동차 경로안내 — 출발/도착 좌표로 실제 소요시간 조회 (실시간 교통 반영)
// 교통탭 추천 출발시간 계산용. 카카오모빌리티보다 소요시간 정확도가 높다는 평가로 1차 채택.
//   진입점은 utils/directions.js (TMap 우선 → 카카오 폴백). 여기는 TMap 프리미티브.
//   origin/destination: { x: 경도, y: 위도 }
//   반환: { durationMin, distanceM } | null
//
// ▸ 무료 한도(2만건/일) 초과 시 자동 카카오 전환:
//   2만건/일 무료 한도는 '계정 전체' 기준이라 기기별 카운터로는 정확히 못 막는다.
//   대신 TMap이 한도 초과로 429를 주면(계정 총량은 TMap이 알고 거절) 그날은 TMap을 끄고
//   directions.js가 카카오로 폴백. 일(日) 단위 키라 자정 지나면 자동 해제(다음 날 정상 재개).
//   → 일 한도에 딱 맞고, 차단 중엔 무의미한 TMap 호출도 아낌.
// =============================================================

const isKeyConfigured = () =>
  !!TMAP_APP_KEY && TMAP_APP_KEY !== 'YOUR_TMAP_APP_KEY';

// 오늘 날짜 키 (YYYYMMDD) — 날이 바뀌면 키가 바뀌어 차단이 자동 해제됨
const todayKey = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `@dg_tmap_quota_blocked_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};
let memBlockedKey = null; // 메모리 캐시 — AsyncStorage 왕복 최소화

async function isQuotaBlockedToday() {
  const k = todayKey();
  if (memBlockedKey === k) return true;
  try {
    if (await AsyncStorage.getItem(k)) { memBlockedKey = k; return true; }
  } catch {}
  return false;
}
async function markQuotaBlockedToday() {
  const k = todayKey();
  memBlockedKey = k;
  try { await AsyncStorage.setItem(k, '1'); } catch {}
}

// 타임머신(미래 시각 예측) — predictionType:'arrival' + predictionTime(도착 목표)로 그 시각 도착 기준 교통 소요 예측.
//   엔드포인트가 일반 routes와 다름(routes/prediction), 본문도 routesInfo 래퍼(검색 확인). 응답 형식은 일반과 동일 가정(totalTime).
//   ★형식 미확정 부분 있어 응답 로깅 + 실패 시 null(directions.js가 현재 기준으로 폴백). 새벽 라운드를 낮에 조회해도 그 시각 교통 반영.
const TMAP_PREDICTION_URL = 'https://apis.openapi.sk.com/tmap/routes/prediction';
const fmtTmapPredTime = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00+0900`; // ISO-8601 KST
};
export async function getDrivingDirectionsTmapPrediction(origin, destination, arrivalAt) {
  if (!origin || !destination || !(arrivalAt instanceof Date)) return null;
  if (!(origin.x > 0) || !(origin.y > 0) || !(destination.x > 0) || !(destination.y > 0)) return null;
  if (!isKeyConfigured()) return null;
  if (await isQuotaBlockedToday()) return null;
  try {
    const { recordLocationAccess } = require('./locationAccessLog');
    recordLocationAccess({ providerName: 'tmap', purpose: '교통 미래소요 예측(타임머신)', method: 'send' });
  } catch {}
  try {
    const res = await fetch(`${TMAP_PREDICTION_URL}?version=1&format=json`, {
      method: 'POST',
      headers: { appKey: TMAP_APP_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // 공식 타임머신 예제 형식 — routesInfo 래퍼, departure/destination는 name/lon/lat만. searchOption 등 추가하면 1100 오류.
        routesInfo: {
          departure: { name: '출발', lon: String(origin.x), lat: String(origin.y) },
          destination: { name: '도착', lon: String(destination.x), lat: String(destination.y) },
          predictionType: 'arrival',
          predictionTime: fmtTmapPredTime(arrivalAt),
        },
      }),
    });
    if (res.status === 429) { console.warn('[tmap] prediction 일한도 초과(429)'); await markQuotaBlockedToday(); return null; }
    if (!res.ok) { console.warn('[tmap] prediction HTTP', res.status); return null; }
    const data = await res.json();
    const props = data?.features?.find(f => f?.properties?.totalTime != null)?.properties;
    if (!props || props.totalTime == null) {
      if (__DEV__) console.warn('[tmap] prediction totalTime 없음 — 응답:', JSON.stringify(data)?.slice(0, 300));
      return null;
    }
    return { durationMin: Math.round((props.totalTime || 0) / 60), distanceM: props.totalDistance || 0 };
  } catch (e) {
    console.warn('[tmap] getDrivingDirectionsTmapPrediction failed:', e?.message);
    return null;
  }
}

export async function getDrivingDirectionsTmap(origin, destination) {
  if (!origin || !destination) return null;
  if (!(origin.x > 0) || !(origin.y > 0) || !(destination.x > 0) || !(destination.y > 0)) return null;
  if (!isKeyConfigured()) {
    console.warn('[tmap] EXPO_PUBLIC_TMAP_APP_KEY not configured.');
    return null;
  }
  // 이미 오늘 한도 초과를 받았으면 TMap 건너뛰고 즉시 카카오 폴백
  if (await isQuotaBlockedToday()) return null;

  try {
    const { recordLocationAccess } = require('./locationAccessLog');
    recordLocationAccess({ providerName: 'tmap', purpose: '교통 소요시간 조회', method: 'send' });
  } catch {}
  try {
    const res = await fetch(`${TMAP_ROUTES_URL}?version=1&format=json`, {
      method: 'POST',
      headers: { appKey: TMAP_APP_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startX: origin.x, startY: origin.y,        // WGS84 경도/위도
        endX: destination.x, endY: destination.y,
        reqCoordType: 'WGS84GEO',
        resCoordType: 'WGS84GEO',
        searchOption: '0',    // 0 = 교통최적+추천 (기본)
        trafficInfo: 'Y',     // 실시간 교통 반영
      }),
    });
    // 429 = 일 무료한도(2만건/일) 초과 → 오늘은 TMap 차단하고 카카오로 (자정 지나면 자동 재개)
    if (res.status === 429) {
      console.warn('[tmap] 일 무료한도 초과(429) — 오늘은 카카오로 전환');
      await markQuotaBlockedToday();
      return null;
    }
    if (!res.ok) { console.warn('[tmap] routes HTTP', res.status); return null; } // 그 외 오류는 일시적 — 차단 안 함
    const data = await res.json();
    // 경로 요약(totalTime 초·totalDistance m)은 응답 features 중 properties.totalTime을 가진 첫 항목에 담김
    const props = data?.features?.find(f => f?.properties?.totalTime != null)?.properties;
    if (!props || props.totalTime == null) {
      console.warn('[tmap] routes: totalTime 없음', data?.error?.message || '');
      return null;
    }
    return {
      durationMin: Math.round((props.totalTime || 0) / 60),
      distanceM: props.totalDistance || 0,
    };
  } catch (e) {
    console.warn('[tmap] getDrivingDirectionsTmap failed:', e?.message);
    return null;
  }
}
