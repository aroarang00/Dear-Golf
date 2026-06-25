import React, { useState, useEffect, useRef } from 'react';
import { Modal, ScrollView, View, Text, TextInput, TouchableOpacity, Linking, Animated, useWindowDimensions, ActivityIndicator, Platform, Keyboard } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { PinchGestureHandler, State, GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { C, F, fs } from '../constants/colors';
import { wxS } from '../styles/wxS';
import { trS } from '../styles/trS';
import { getCombinedForecast, pickHourSlots, getUVIndex } from '../utils/kma';
import { getAirQuality } from '../utils/airkorea';
import { findUserCourseById, ensureCourseCoord } from '../utils/userCourses';
import { addressToCoord } from '../utils/kakao';
import { getDrivingDirections, formatDriveMin } from '../utils/directions';
import { searchGolfCourses } from '../utils/golfCourses';
import { getOverseasWeather } from '../utils/openweather';
import { getCurrentLocation, reverseGeocode, hasLocationPermission } from '../utils/location';
import { cacheCurrentWx } from './common/HomeBgSlider';
import { WeatherGlyph } from './common/Icon'; // 맑음(☀️·🌤️)만 입체 SVG, 나머지 날씨는 이모지 유지
import { UserContext } from '../contexts/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROUND_MIN = 5 * 60; // 라운드 평균 5시간
const MODE_LABEL = { home: '내 저장 출발지', course: '골프장', current: '현재위치', custom: '주소 입력' };

// 동일 코스 재오픈 시 즉시 표시. in-flight 요청 dedupe + AsyncStorage 영속 캐시
const wxCache = new Map(); // courseId → { data, pending?, ts }
let _curWxPrefetched = false; // 현재위치 날씨 프리페치 세션 1회 가드 (홈 인스턴스 전용)
const WX_TTL = 30 * 60 * 1000;
const WX_CACHE_KEY = '@dg_wx_cache_v2';

// 모듈 로드 즉시 디스크 캐시 복원 시작 (복원 완료 대기용 promise 보관)
const wxRestorePromise = (async () => {
  try {
    const raw = await AsyncStorage.getItem(WX_CACHE_KEY);
    if (!raw) return;
    const persisted = JSON.parse(raw);
    for (const [k, v] of Object.entries(persisted)) {
      if (v && Date.now() - v.ts < WX_TTL) wxCache.set(k, { data: v.data, ts: v.ts });
    }
  } catch {}
})();

function persistWxCache() {
  try {
    const dump = {};
    for (const [k, v] of wxCache.entries()) if (v.data) dump[k] = { data: v.data, ts: v.ts };
    AsyncStorage.setItem(WX_CACHE_KEY, JSON.stringify(dump)).catch(() => {});
  } catch {}
}

// 날씨 fetch (캐시키 + 좌표해석기) — 디스크 복원 대기 + 캐시 적중 시 즉시 반환 + in-flight dedupe
async function fetchWeatherCached(cacheKey, resolveCoords) {
  await wxRestorePromise;
  const existing = wxCache.get(cacheKey);
  if (existing?.data && Date.now() - existing.ts < WX_TTL) return existing.data;
  if (existing?.pending) return existing.pending;

  const promise = (async () => {
    const cc = await resolveCoords();
    if (!cc) return null;
    const [f, aq, uv] = await Promise.all([
      getCombinedForecast({ lat: cc.y, lng: cc.x, loc: cc.loc }),
      getAirQuality(cc.loc),
      UV_ENABLED ? getUVIndex(cc.loc) : Promise.resolve(null),
    ]);
    return { forecast: f, airQuality: aq, uvIndex: uv, courseCoord: cc };
  })().then(data => {
    if (data) { wxCache.set(cacheKey, { data, ts: Date.now() }); persistWxCache(); }
    else { wxCache.delete(cacheKey); }
    return data;
  }).catch(err => { wxCache.delete(cacheKey); throw err; });

  wxCache.set(cacheKey, { pending: promise });
  return promise;
}

// courseId 있는 일정 — userCourses에서 좌표 로드
const fetchWeatherForCourse = (courseId) => fetchWeatherCached(`course:${courseId}`, async () => {
  const course = await findUserCourseById(courseId);
  const withCoord = await ensureCourseCoord(course);
  return withCoord ? { x: withCoord.x, y: withCoord.y, loc: withCoord.loc } : null;
});

// courseId 없는 일정 (직접 입력·데모 데이터 등) — 코스명으로 카카오 골프장 검색.
// 골프장 카테고리 필터가 적용된 searchGolfCourses를 써서 엉뚱한 장소 매칭을 방지.
// 검색 결과의 loc(도로명/지번 주소)에 지역명이 들어 있어 중기예보·미세먼지 매핑에 그대로 사용.
const fetchWeatherByName = (name) => fetchWeatherCached(`name:${name}`, async () => {
  const results = await searchGolfCourses(name);
  const top = results && results[0];
  if (!top || !(top.x > 0) || !(top.y > 0)) return null;
  const loc = top.loc || (await reverseGeocode(top.y, top.x)) || '';
  return { x: top.x, y: top.y, loc };
});

// 좌표를 직접 받은 일정 (코스 상세 화면 등) — 재해석 없이 그대로 사용
const fetchWeatherByCoord = (x, y, loc) => fetchWeatherCached(`coord:${x},${y}`, async () => {
  const l = loc || (await reverseGeocode(y, x));
  return { x, y, loc: l || '' };
});

const BG = '#0a1e10';

const UV_ENABLED = true;

// 'YYYY.MM.DD' → 'YYYYMMDD'
const compactDate = (d) => (d || '').replace(/\./g, '');
// 오늘 'YYYYMMDD'
const todayCompact = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

// 풍속 m/s → 등급 라벨
const windLabel = (ws) => {
  if (ws == null) return '';
  if (ws < 4) return '약함';
  if (ws < 9) return '보통';
  if (ws < 14) return '강함';
  return '매우강함';
};
// 습도 % → 등급 라벨
const humidityLabel = (h) => {
  if (h == null) return '';
  if (h < 40) return '건조';
  if (h <= 70) return '적정';
  return '습함';
};

// 구간 사이를 직선 보간 — 점수가 계단식으로 튀지 않고 연속적으로 변하게 함
const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * (x - x0) / (x1 - x0);

// 체감온도 — 추울 땐 바람으로 더 춥게, 더울 땐 습도로 더 덥게 보정
const feelsLike = (temp, wind, humidity) => {
  if (!Number.isFinite(temp)) return temp;
  let f = temp;
  if (temp <= 15 && Number.isFinite(wind) && wind > 1.5) {
    f -= Math.min(8, (wind - 1.5) * 0.7);            // 풍속 냉각
  }
  if (temp >= 26 && Number.isFinite(humidity) && humidity > 60) {
    f += Math.min(6, ((humidity - 60) / 10) * 1.5);  // 습도 — 더울 때 체감 상승
  }
  return f;
};

// 미세먼지 감점 (PM10 기준: 좋음0~30 / 보통31~80 / 나쁨81~150 / 매우나쁨151~)
const airPenalty = (airQuality) => {
  const lbl = airQuality?.label || '';
  const pm10 = airQuality?.pm10;
  if (lbl.includes('매우나쁨') || (Number.isFinite(pm10) && pm10 > 150)) return 18;
  if (lbl.includes('나쁨') || (Number.isFinite(pm10) && pm10 > 80)) return 10;
  if (lbl.includes('보통') || (Number.isFinite(pm10) && pm10 > 30)) return 3;
  return 0;
};

// 자외선 감점 (UV 지수: 6~ 높음 / 8~ 매우높음 / 11~ 위험)
const uvPenalty = (uvIndex) => {
  const uv = uvIndex?.uv;
  if (!Number.isFinite(uv)) return 0;
  if (uv >= 11) return 10;
  if (uv >= 8) return 6;
  if (uv >= 6) return 3;
  return 0;
};

// 날씨 점수 (0~100) — 골프 지수와 라운딩 컨디션이 공통으로 사용하는 단일 공식
// 풍속(30) + 강수확률(35) + 체감기온(35), 연속 보간 + 강수 상한 + 미세먼지·자외선 감점
const scoreWeather = ({ temp, wind, pop, humidity, windKnown = true, airQuality = null, uvIndex = null }) => {
  if (temp == null || !Number.isFinite(temp)) return null;
  const ft = feelsLike(temp, wind, humidity); // 기온 점수는 체감온도 기준

  // 풍속 (0~30) — 데이터 없으면(중기예보 등) 평균값 21
  let windScore;
  if (!windKnown || wind == null || !Number.isFinite(wind)) windScore = 21;
  else if (wind <= 3) windScore = 30;
  else if (wind <= 5) windScore = lerp(wind, 3, 5, 30, 25);
  else if (wind <= 7) windScore = lerp(wind, 5, 7, 25, 18);
  else if (wind <= 10) windScore = lerp(wind, 7, 10, 18, 10);
  else if (wind <= 15) windScore = lerp(wind, 10, 15, 10, 0);
  else windScore = 0;

  // 강수확률 (0~35)
  const p = Number.isFinite(pop) ? pop : 0;
  let popScore;
  if (p <= 10) popScore = 35;
  else if (p <= 30) popScore = lerp(p, 10, 30, 35, 25);
  else if (p <= 50) popScore = lerp(p, 30, 50, 25, 15);
  else if (p <= 70) popScore = lerp(p, 50, 70, 15, 6);
  else if (p <= 100) popScore = lerp(p, 70, 100, 6, 0);
  else popScore = 0;

  // 체감기온 (0~35) — 18~24°C 최적, 양쪽으로 대칭 감점
  let tempScore;
  if (ft >= 18 && ft <= 24) tempScore = 35;
  else if (ft >= 15 && ft < 18) tempScore = lerp(ft, 15, 18, 28, 35);
  else if (ft > 24 && ft <= 27) tempScore = lerp(ft, 24, 27, 35, 28);
  else if (ft >= 10 && ft < 15) tempScore = lerp(ft, 10, 15, 18, 28);
  else if (ft > 27 && ft <= 30) tempScore = lerp(ft, 27, 30, 28, 18);
  else if (ft >= 5 && ft < 10) tempScore = lerp(ft, 5, 10, 8, 18);
  else if (ft > 30 && ft <= 33) tempScore = lerp(ft, 30, 33, 18, 8);
  else if (ft >= 0 && ft < 5) tempScore = lerp(ft, 0, 5, 0, 8);
  else if (ft > 33 && ft <= 38) tempScore = lerp(ft, 33, 38, 8, 0);
  else tempScore = 0;

  let total = windScore + popScore + tempScore;
  // 강수 상한 — 비 올 확률이 높으면 기온·바람이 좋아도 등급 상한을 둠
  if (p >= 70) total = Math.min(total, 38);       // 최대 '주의'
  else if (p >= 50) total = Math.min(total, 58);  // 최대 '보통'
  // 미세먼지·자외선 감점 (해당일 데이터가 있을 때만 전달됨)
  total -= airPenalty(airQuality);
  total -= uvPenalty(uvIndex);

  return Math.round(Math.max(0, Math.min(100, total)));
};

// 점수(0~100) → 등급 — 골프 지수(idx)와 라운딩 컨디션(dots·cond)이 같은 기준에서 파생
// dots: 0.5 단위(10단계)로 세분화, cond/idx 라벨은 dots와 1:1 대응 → 두 지표가 절대 어긋나지 않음
const gradeFromScore = (total) => {
  const dots = Math.max(0.5, Math.min(5, Math.round(total / 10) / 2));
  let cond, idx;
  if (dots >= 4.5) { cond = '최적'; idx = 'Great'; }
  else if (dots >= 3.5) { cond = '좋음'; idx = 'Good'; }
  else if (dots >= 2.5) { cond = '보통'; idx = 'OK'; }
  else if (dots >= 1.5) { cond = '주의'; idx = 'Poor'; }
  else { cond = '어려움'; idx = 'Bad'; }
  return { dots, cond, idx };
};

// 라운딩 컨디션 시간대별 — 골프 지수와 동일한 scoreWeather 공식 사용
const calcDots = (slot, airQuality, uvIndex) => {
  const total = scoreWeather({
    temp: slot?.temp, wind: slot?.wind, pop: slot?.rain,
    humidity: slot?.humidity, windKnown: true, airQuality, uvIndex,
  });
  if (total == null) return { dots: 0, label: '—', total: null };
  const g = gradeFromScore(total);
  return { dots: g.dots, label: g.cond, total };
};

export function WeatherTransportPopup({ visible, initialTab, onClose, schedule, schedules, weatherOnly }) {
  const [tab, setTab] = useState(initialTab || 'wx');
  const [forecast, setForecast] = useState(null);
  const [airQuality, setAirQuality] = useState(null);
  const [uvIndex, setUvIndex] = useState(null);
  const [resolvedLoc, setResolvedLoc] = useState('');
  const [wxFailed, setWxFailed] = useState(false); // 날씨 데이터 로드 실패 (좌표 미해석 등)
  const [retryTick, setRetryTick] = useState(0);   // 다시 시도 트리거
  const { width: SW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets(); // 하단 시스템바 — 스크롤 끝 버튼이 안 잘리도록

  const { userProfile } = React.useContext(UserContext);
  const homeAddress = userProfile?.departure || '';
  const savedDepX = userProfile?.departureCoord?.x;
  const savedDepY = userProfile?.departureCoord?.y;
  const [courseCoord, setCourseCoord] = useState(null);   // { x, y, loc }
  const [currentCoord, setCurrentCoord] = useState(null); // { x, y }
  const [homeCoord, setHomeCoord] = useState(null);       // { x, y }
  const [driveMin, setDriveMin] = useState(null);         // 갈 때 실측 소요(분), 실시간 교통 길찾기(TMap 우선·카카오 폴백)
  const [trSlots, setTrSlots] = useState({
    goOrigin:   { mode: 'home',   custom: '', customCoord: null },
    goDest:     { mode: 'course', custom: '', customCoord: null },
    backOrigin: { mode: 'course', custom: '', customCoord: null },
    backDest:   { mode: 'home',   custom: '', customCoord: null },
  });
  const [expandedSlot, setExpandedSlot] = useState(null);
  const [endOffsetMin, setEndOffsetMin] = useState(0);
  const [locating, setLocating] = useState(false);   // 현재위치 GPS 찾는 중 — '주소 입력' 안내 깜빡임 방지(계산 중 표시)
  // 안드(엣지투엣지): 키보드가 창을 리사이즈하지 않고 콘텐츠 위로 떠서, 하단 입력칸이 가려짐.
  // 키보드 높이만큼 스크롤 여백을 주고, 포커스 시 입력칸을 키보드 위로 직접 올린다. (iOS는 automaticallyAdjustKeyboardInsets가 처리)
  const [kbHeight, setKbHeight] = useState(0);
  const kbHeightRef = useRef(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', e => {
      const h = e.endCoordinates?.height || 0;
      kbHeightRef.current = h;
      setKbHeight(h);
      scrollCustomIntoView(); // 키보드가 실제로 뜬 시점에 한 번 더 보정
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbHeightRef.current = 0; setKbHeight(0); });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const trScrollRef = useRef(null);       // 교통 탭 ScrollView
  const trScrollY = useRef(0);            // 현재 스크롤 오프셋
  const customInputNode = useRef(null);   // 현재 포커스된 직접입력 TextInput
  // 안드: 포커스된 직접입력 칸이 키보드에 가리면 그만큼 위로 스크롤 (iOS는 automaticallyAdjustKeyboardInsets가 처리)
  const scrollCustomIntoView = () => {
    if (Platform.OS !== 'android') return;
    setTimeout(() => {
      const node = customInputNode.current;
      const scroll = trScrollRef.current;
      const kb = kbHeightRef.current;
      if (!node?.measureInWindow || !scroll || !kb) return;
      node.measureInWindow((x, y, w, h) => {
        // 키보드 상단 Y. 엣지투엣지에선 endCoordinates.height에 내비바가 빠질 수 있어 insets.bottom 보정
        const kbTop = winH - kb - insets.bottom;
        const overlap = (y + h + 48) - kbTop;    // 입력칸 하단이 키보드를 침범한 양 (+여유 48)
        if (overlap > 0) scroll.scrollTo({ y: trScrollY.current + overlap, animated: true });
      });
    }, 160);
  };

  const slideAnim = useRef(new Animated.Value(0)).current;
  const slideBase = useRef(0);

  // 핀치 줌 (날씨 탭 한정)
  const scale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale } }],
    { useNativeDriver: true }
  );

  const onPinchStateChange = (event) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      let next = lastScale.current * event.nativeEvent.scale;
      next = Math.max(1, Math.min(2, next));
      lastScale.current = next;
      scale.setValue(next);
    }
  };

  const animateTo = (target, newTab) => {
    Animated.spring(slideAnim, {
      toValue: target,
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
    slideBase.current = target;
    if (newTab) setTab(newTab);
  };

  useEffect(() => {
    if (visible) {
      const t = (weatherOnly || schedule?.overseas) ? 'wx' : (initialTab || 'wx');
      setTab(t);
      const target = t === 'wx' ? 0 : -SW;
      slideAnim.setValue(target);
      slideBase.current = target;
    }
  }, [visible, initialTab, SW, weatherOnly, schedule?.overseas]);

  // 저장 출발지가 없으면 '갈 때 출발'을 현재위치로 기본 — GPS로 실제 추정치 제공(안 되면 마이페이지 설정 유도)
  useEffect(() => {
    if (!visible || weatherOnly || schedule?.overseas) return;
    if (!homeAddress && trSlots.goOrigin.mode === 'home') setSlotMode('goOrigin', 'current');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, homeAddress]);

  // 탭 변경 시 핀치 줌 리셋
  useEffect(() => {
    scale.setValue(1);
    lastScale.current = 1;
  }, [tab]);

  // 날씨 fetch — visible 변경 / 일정 변경 / weatherOnly 변경 시
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        setWxFailed(false);
        if (schedule?.overseas) {
          // 해외 일정 — OpenWeather로 현지 날씨 (입력한 도시 좌표 기반)
          setForecast(null); setAirQuality(null); setUvIndex(null);
          if (typeof schedule.cityLat !== 'number' || typeof schedule.cityLon !== 'number') {
            setWxFailed(true); return;
          }
          const ow = await getOverseasWeather(schedule.cityLat, schedule.cityLon);
          if (cancelled) return;
          if (!ow) { setWxFailed(true); return; }
          setForecast({ current: ow.current, days: ow.days, slotsByDate: {} });
        } else if (weatherOnly) {
          // 현재위치 날씨 — 일정 날씨와 동일한 캐시 체계(fetchWeatherByCoord: 30분 TTL+디스크영속+dedupe)로 통합(2026-06-11).
          //   이전엔 캐시 없이 매번 GPS→역지오코딩→예보 직렬 풀코스라 느렸음. 좌표는 소수 2자리(≈1.1km) 반올림으로
          //   GPS 미세요동에도 캐시키 안정화(KMA 격자 ~5km라 정확도 무손실). 역지오코딩도 resolver 안에서 1회만.
          await wxRestorePromise;
          if (cancelled) return;
          const pos = await getCurrentLocation();
          if (cancelled) return;
          if (!pos) { setWxFailed(true); return; }
          const cx = Number(pos.lng.toFixed(2)), cy = Number(pos.lat.toFixed(2));
          setCurrentCoord({ x: pos.lng, y: pos.lat });
          const existing = wxCache.get(`coord:${cx},${cy}`);
          const hasFresh = existing?.data && Date.now() - existing.ts < WX_TTL;
          if (!hasFresh) { setForecast(null); setAirQuality(null); setUvIndex(null); setResolvedLoc(''); }
          const data = await fetchWeatherByCoord(cx, cy);
          if (cancelled) return;
          if (!data?.forecast?.current) { setWxFailed(true); return; } // 429 등으로 날씨를 못 받으면 안내 표시(빈 카드 방지)
          setResolvedLoc(data.courseCoord?.loc || '');
          setForecast(data.forecast); setAirQuality(data.airQuality); setUvIndex(data.uvIndex);
          cacheCurrentWx(data.forecast.current); // 홈 헤더 이모지·배경 톤을 방금 받은 현재 위치 날씨와 일치시킴
        } else if ((schedule?.courseX != null && schedule?.courseY != null) || schedule?.courseId || schedule?.course) {
          // 디스크 캐시 복원 대기 후 cache 체크 (보통 즉시 resolve)
          await wxRestorePromise;
          if (cancelled) return;
          // 좌표를 직접 받았으면 그대로 사용 (코스 상세 화면 — 해당 구장 보장)
          const hasCoord = schedule?.courseX != null && schedule?.courseY != null;
          const useCourseId = !hasCoord && !!schedule.courseId;
          const key = hasCoord
            ? `coord:${schedule.courseX},${schedule.courseY}`
            : useCourseId ? `course:${schedule.courseId}` : `name:${schedule.course}`;
          const existing = wxCache.get(key);
          const hasFresh = existing?.data && Date.now() - existing.ts < WX_TTL;
          if (!hasFresh) {
            setForecast(null); setAirQuality(null); setUvIndex(null);
          }
          const data = hasCoord
            ? await fetchWeatherByCoord(schedule.courseX, schedule.courseY, schedule.courseLoc)
            : useCourseId
              ? await fetchWeatherForCourse(schedule.courseId)
              : await fetchWeatherByName(schedule.course);
          if (cancelled) return;
          if (!data || !data.forecast?.current) { setWxFailed(true); return; } // forecast가 비면(429 등) 안내(빈 카드 방지)
          setForecast(data.forecast);
          setAirQuality(data.airQuality);
          setUvIndex(data.uvIndex);
          setCourseCoord(data.courseCoord);
        }
      } catch (e) {
        console.warn('[wx popup] forecast fetch failed:', e?.message);
        if (!cancelled) setWxFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, weatherOnly, schedule?.overseas, schedule?.cityLat, schedule?.cityLon, schedule?.courseId, schedule?.courseX, schedule?.courseY, retryTick]);

  // 마이페이지 저장 출발지 → 좌표
  // 검색에서 선택해 저장한 정확 좌표가 있으면 그대로 사용, 없으면 주소 텍스트로 변환(폴백)
  useEffect(() => {
    let cancelled = false;
    if (typeof savedDepX === 'number' && typeof savedDepY === 'number') {
      setHomeCoord({ x: savedDepX, y: savedDepY });
      return;
    }
    if (!homeAddress) { setHomeCoord(null); return; }
    (async () => {
      const coord = await addressToCoord(homeAddress);
      if (!cancelled) setHomeCoord(coord);
    })();
    return () => { cancelled = true; };
  }, [homeAddress, savedDepX, savedDepY]);

  // 백그라운드 prefetch — 일정이 정해지면 팝업 열기 전부터 미리 받아둠 (in-flight dedupe로 중복 fetch 방지)
  useEffect(() => {
    if (weatherOnly) return;
    if (schedule?.courseX != null && schedule?.courseY != null) {
      fetchWeatherByCoord(schedule.courseX, schedule.courseY, schedule.courseLoc).catch(() => {});
    } else if (schedule?.courseId) fetchWeatherForCourse(schedule.courseId).catch(() => {});
    else if (schedule?.course) fetchWeatherByName(schedule.course).catch(() => {});
  }, [schedule?.courseId, schedule?.course, schedule?.courseX, schedule?.courseY, weatherOnly]);

  // 현재위치 날씨 prefetch — 홈 인스턴스(weatherOnly prop 보유)만, 세션 1회, 권한 이미 허용된 경우만(OS 팝업 금지).
  //   홈 진입 시 미리 받아둬 날씨 버튼 첫 탭도 즉시 표시. 이후엔 위 30분 캐시가 커버.
  useEffect(() => {
    if (weatherOnly === undefined || _curWxPrefetched) return;
    _curWxPrefetched = true;
    (async () => {
      try {
        if (!(await hasLocationPermission())) return;
        const pos = await getCurrentLocation();
        if (!pos) return;
        fetchWeatherByCoord(Number(pos.lng.toFixed(2)), Number(pos.lat.toFixed(2))).catch(() => {});
      } catch {}
    })();
  }, []);

  // 일정 바뀌면 종료시간 오프셋 리셋
  useEffect(() => { setEndOffsetMin(0); }, [schedule?.courseId, schedule?.time]);

  const handleTabPress = (newTab) => {
    if (newTab === tab) return;
    animateTo(newTab === 'wx' ? 0 : -SW, newTab);
  };

  // 날씨 ↔ 교통 가로 스와이프 — gesture-handler Pan
  // activeOffsetX: 가로로 8px만 움직여도 인식 (감도↑) / failOffsetY: 세로 스크롤이 먼저면 양보
  const slidePan = React.useMemo(() => Gesture.Pan()
    .enabled(!weatherOnly && !schedule?.overseas)
    .activeOffsetX([-8, 8])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onUpdate((e) => {
      let next = slideBase.current + e.translationX;
      if (next > 0) next = 0;
      if (next < -SW) next = -SW;
      slideAnim.setValue(next);
    })
    .onEnd((e) => {
      const commit = SW * 0.18;            // 페이지의 18%만 끌어도 전환
      const flick = Math.abs(e.velocityX) > 300; // 빠른 플릭이면 거리 무관 전환
      if ((e.translationX < -commit || (flick && e.velocityX < 0)) && slideBase.current === 0) {
        animateTo(-SW, 'tr');
      } else if ((e.translationX > commit || (flick && e.velocityX > 0)) && slideBase.current === -SW) {
        animateTo(0, 'wx');
      } else {
        animateTo(slideBase.current, null);
      }
    }), [weatherOnly, SW, schedule?.overseas]);

  const [teeH, teeM] = (schedule?.time || '08:00').split(':').map(Number);
  const teeMin = teeH * 60 + teeM;

  // 교통 탭 계산
  const toHHMM = (m) => {
    m = (m + 24 * 60) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const endStr = toHHMM(teeMin + ROUND_MIN + endOffsetMin);
  const recoDriveMin = driveMin ?? 80; // 길찾기 API 실측 소요, 없으면 기본 가정치
  const recommended = toHHMM(teeMin - 30 - recoDriveMin);
  const arrival = toHHMM(teeMin - 30); // 추천 출발로 가면 티오프 30분 전 도착

  // 슬롯 (mode) → 표시용 라벨/좌표 해석
  const resolveSlot = (slotKey) => {
    const slot = trSlots[slotKey];
    if (slot.mode === 'home') {
      return { label: homeAddress || '마이페이지에 출발지 미설정', coord: homeCoord, placeholder: !homeAddress };
    }
    if (slot.mode === 'course') {
      return { label: schedule?.course, coord: courseCoord ? { x: courseCoord.x, y: courseCoord.y } : null };
    }
    if (slot.mode === 'current') {
      return { label: resolvedLoc || '현재 위치', coord: currentCoord, placeholder: !currentCoord };
    }
    return { label: slot.custom || '주소 입력', coord: slot.customCoord, placeholder: !slot.custom };
  };

  // 갈 때 출발→도착 실제 소요시간 (실시간 교통 길찾기 — TMap 우선·카카오 폴백) — 좌표 변경 시 1회 조회
  // schedule 없는 렌더(가드 이전)에서도 안전하도록 schedule 있을 때만 해석
  const goOriginInfo = schedule ? resolveSlot('goOrigin') : { label: '', placeholder: true, coord: null };
  const goOriginCoord = goOriginInfo.coord;
  const goDestCoord = schedule ? resolveSlot('goDest').coord : null;
  // 출발지 좌표 '해석 중'(GPS·지오코딩 진행) — 좌표 없어도 안내 깜빡임 대신 '계산 중'을 보이려는 판단용
  const _goSlot = trSlots.goOrigin;
  const originResolving = locating
    || (_goSlot.mode === 'home' && !!homeAddress && !homeCoord)
    || (_goSlot.mode === 'custom' && !!_goSlot.custom && !_goSlot.customCoord);
  useEffect(() => {
    let cancelled = false;
    if (!goOriginCoord || !goDestCoord) { setDriveMin(null); return; }
    (async () => {
      const r = await getDrivingDirections(goOriginCoord, goDestCoord);
      if (!cancelled) setDriveMin(r ? r.durationMin : null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goOriginCoord?.x, goOriginCoord?.y, goDestCoord?.x, goDestCoord?.y]);

  const setSlotMode = async (slotKey, mode) => {
    setTrSlots(prev => ({ ...prev, [slotKey]: { ...prev[slotKey], mode } }));
    if (mode === 'current' && !currentCoord) {
      setLocating(true);
      try { const pos = await getCurrentLocation(); if (pos) setCurrentCoord({ x: pos.lng, y: pos.lat }); }
      finally { setLocating(false); }
    }
  };

  const setCustomText = (slotKey, text) => {
    setTrSlots(prev => ({ ...prev, [slotKey]: { ...prev[slotKey], custom: text, customCoord: null } }));
  };

  const resolveCustomCoord = async (slotKey) => {
    const slot = trSlots[slotKey];
    if (!slot.custom || slot.customCoord) return;
    const coord = await addressToCoord(slot.custom);
    if (coord) {
      setTrSlots(prev => ({ ...prev, [slotKey]: { ...prev[slotKey], customCoord: coord } }));
    }
  };

  const openNaverRoute = async (originKey, destKey) => {
    if (trSlots[originKey].mode === 'custom') await resolveCustomCoord(originKey);
    if (trSlots[destKey].mode === 'custom') await resolveCustomCoord(destKey);
    const orig = resolveSlot(originKey);
    const dest = resolveSlot(destKey);
    const p = [];
    if (orig.coord) { p.push(`slat=${orig.coord.y}`); p.push(`slng=${orig.coord.x}`); }
    if (orig.label) p.push(`sname=${encodeURIComponent(orig.label)}`);
    if (dest.coord) { p.push(`dlat=${dest.coord.y}`); p.push(`dlng=${dest.coord.x}`); }
    if (dest.label) p.push(`dname=${encodeURIComponent(dest.label)}`);
    p.push('appname=deargolf');
    Linking.openURL(`nmap://route/car?${p.join('&')}`).catch(() => Linking.openURL('https://map.naver.com/'));
  };

  const openTmapRoute = async (originKey, destKey) => {
    if (trSlots[originKey].mode === 'custom') await resolveCustomCoord(originKey);
    if (trSlots[destKey].mode === 'custom') await resolveCustomCoord(destKey);
    const orig = resolveSlot(originKey);
    const dest = resolveSlot(destKey);
    const p = [];
    if (orig.coord) { p.push(`startx=${orig.coord.x}`); p.push(`starty=${orig.coord.y}`); }
    if (orig.label) p.push(`startname=${encodeURIComponent(orig.label)}`);
    if (dest.coord) { p.push(`goalx=${dest.coord.x}`); p.push(`goaly=${dest.coord.y}`); }
    if (dest.label) p.push(`goalname=${encodeURIComponent(dest.label)}`);
    Linking.openURL(`tmap://route?${p.join('&')}`).catch(() => Linking.openURL('https://tmap.life'));
  };

  const renderSlot = (slotKey, kind) => {
    const expanded = expandedSlot === slotKey;
    const slot = trSlots[slotKey];
    const info = resolveSlot(slotKey);
    const defaultMode = (slotKey === 'goOrigin' || slotKey === 'backDest') ? 'home' : 'course';
    const modes = [defaultMode, 'current', 'custom'];
    return (
      <View key={slotKey}>
        <TouchableOpacity style={trS.slotRow} activeOpacity={0.7}
          onPress={() => setExpandedSlot(expanded ? null : slotKey)}>
          <Text style={trS.slotKindTxt}>{kind}</Text>
          <Text style={info.placeholder ? trS.slotLocPh : trS.slotLocTxt} numberOfLines={1}>{info.label}</Text>
          {/* '변경' 칩 — 탭하면 내 저장 출발지·현재위치·주소 입력 중 고를 수 있음을 또렷이(테스터가 못 찾던 직접입력 발견성) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.45)', backgroundColor: 'rgba(245,230,168,0.08)' }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: 'rgba(245,230,168,0.9)' }}>{expanded ? '닫기' : '변경'}</Text>
            <Text style={{ fontSize: fs(9), color: 'rgba(245,230,168,0.7)' }}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </TouchableOpacity>
        {expanded && (
          <View style={trS.slotPicker}>
            <View style={trS.pickerRow}>
              {modes.map(m => {
                const on = slot.mode === m;
                return (
                  <TouchableOpacity key={m} activeOpacity={0.75}
                    style={[trS.pickerPill, on ? trS.pickerPillOn : trS.pickerPillOff]}
                    onPress={() => setSlotMode(slotKey, m)}>
                    <Text style={on ? trS.pickerPillTxtOn : trS.pickerPillTxtOff}>{MODE_LABEL[m]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {slot.mode === 'custom' && (
              <View>
                <Text style={trS.customHint}>아래 칸에 {kind}지를 입력해 주세요</Text>
                <AppTextInput style={trS.customInput}
                  ref={(r) => { customInputNode.current = r; }}
                  value={slot.custom}
                  onChangeText={(t) => setCustomText(slotKey, t)}
                  onFocus={scrollCustomIntoView}
                  onBlur={() => resolveCustomCoord(slotKey)}
                  onSubmitEditing={() => resolveCustomCoord(slotKey)}
                  placeholder="예) 강남역, 서울시 ○○구 ○○로"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  returnKeyType="done"
                  autoFocus />
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // KMA 예보 derive
  const cur = forecast?.current || null;
  const days = forecast?.days || [];
  const todayDay = days[0] || null;
  // 라운딩 컨디션 슬롯: 일정 모드는 라운드 날짜, weatherOnly는 오늘
  const targetDateCompact = weatherOnly ? todayCompact() : compactDate(schedule?.date);
  const hourSlots = pickHourSlots(forecast?.slotsByDate || {}, targetDateCompact);

  // 미세먼지·자외선은 '오늘' 측정값만 정확 — 오늘 라운딩/현재날씨일 때만 점수에 반영
  const isTodayWx = weatherOnly || schedule?.dDay === 0;
  const airForScore = isTodayWx ? airQuality : null;
  const uvForScore = isTodayWx ? uvIndex : null;

  // 코스 둘러보기(isPreview)는 실제 예정 라운딩이 아님 — GuideScreen이 '오늘 07:00 가상 일정'으로 열기 때문에
  // dDay가 0으로 들어온다. '라운딩 시점' 정밀 라벨·티오프 배지·10일예보 라운딩 배지에서 제외하고 현재 날씨로 안내.
  const isRealRound = !weatherOnly && !schedule?.overseas && !schedule?.isPreview && Number.isFinite(schedule?.dDay);

  // 티오프와 가장 가까운 슬롯 — 90분(슬롯 간격의 절반) 초과면 표시 안 함
  // (이른 슬롯이 base_time 이전이라 빠진 경우 멀리 떨어진 오후 슬롯에 잘못 붙는 것 방지)
  const teeoffSlotIdx = (() => {
    if (hourSlots.length === 0) return -1;
    const best = hourSlots.reduce((b, s, i) => {
      const diff = Math.abs(s.hour * 60 - teeMin);
      return diff < b.diff ? { idx: i, diff } : b;
    }, { idx: -1, diff: Infinity });
    return best.diff <= 90 ? best.idx : -1;
  })();

  // 일정 날짜 매칭용 (full 'YYYY.MM.DD'로 비교)
  // isPreview(코스 둘러보기 가상 일정)는 제외 — 10일 예보에 '라운딩' 배지가 잘못 붙지 않게
  const scheduleDateSet = new Set(
    (schedules || [schedule]).filter(s => s && !s.isPreview).map(s => s.date || '')
  );

  // 골프 지수 — 라운딩 컨디션과 동일한 scoreWeather 공식 (풍속·강수·체감온도 + 미세먼지·자외선)
  // 정밀 예보 시점 분기 (큰 기온 영역과 일관):
  // · weatherOnly·해외 → 현재
  // · 라운딩 D+0~D+3 (시간별 정밀) → 티오프 슬롯
  // · 라운딩 D+4+ → 현재 날씨로 대체 (정밀도 낮은 중기예보 미사용, 사용자 결정 2026-05-27)
  const golfIdx = React.useMemo(() => {
    const isScheduled = isRealRound;
    const usePrecise = isScheduled && schedule.dDay <= 3 && hourSlots.length > 0;

    let temp = null, wind = null, pop = null, humidity = null, windKnown = true;
    if (usePrecise) {
      const slot = hourSlots[teeoffSlotIdx >= 0 ? teeoffSlotIdx : Math.min(2, hourSlots.length - 1)];
      temp = slot?.temp; wind = slot?.wind; pop = slot?.rain; humidity = slot?.humidity;
    } else {
      // weatherOnly·해외·D+4+ 모두 현재 날씨로
      temp = cur?.temp;
      wind = cur?.windSpeed;
      pop = cur?.pop ?? todayDay?.pop ?? 0;
      humidity = cur?.humidity;
    }

    const total = scoreWeather({
      temp, wind, pop, humidity, windKnown,
      airQuality: airForScore, uvIndex: uvForScore,
    });
    if (total == null) return null;
    const label = gradeFromScore(total).idx;
    const p = Number.isFinite(pop) ? pop : 0; // 아래 배지 표시용

    const badges = [];
    if (windKnown && wind != null && Number.isFinite(wind)) {
      if (wind <= 5) badges.push({ txt: '바람 약함', bg: '#C8D9E6', color: C.navy });
      else if (wind <= 10) badges.push({ txt: '바람 보통', bg: '#C8D9E6', color: C.navy });
      else badges.push({ txt: '바람 강함', bg: '#E6C8C8', color: '#5C1E1E' });
    }
    if (p <= 10) badges.push({ txt: '강수 없음', bg: '#FFFFFF', color: '#3D3935' });
    else if (p <= 50) badges.push({ txt: '강수 가능', bg: '#FFFFFF', color: '#3D3935' });
    else badges.push({ txt: '강수 높음', bg: '#E6C8C8', color: '#5C1E1E' });

    if (temp >= 15 && temp <= 27) badges.push({ txt: '기온 적정', bg: '#F5E6A8', color: '#5A4500' });
    else if (temp < 15) badges.push({ txt: '기온 낮음', bg: '#C8D9E6', color: C.navy });
    else badges.push({ txt: '기온 높음', bg: '#E6C8C8', color: '#5C1E1E' });

    const ap = airPenalty(airForScore);
    if (ap >= 18) badges.push({ txt: '미세먼지 매우나쁨', bg: '#E6C8C8', color: '#5C1E1E' });
    else if (ap >= 10) badges.push({ txt: '미세먼지 나쁨', bg: '#E6C8C8', color: '#5C1E1E' });
    const up = uvPenalty(uvForScore);
    if (up >= 10) badges.push({ txt: '자외선 위험', bg: '#E6C8C8', color: '#5C1E1E' });
    else if (up >= 6) badges.push({ txt: '자외선 매우높음', bg: '#E6C8C8', color: '#5C1E1E' });

    return { total, label, badges };
  }, [weatherOnly, cur, days, hourSlots, teeoffSlotIdx, schedule, todayDay, airForScore, uvForScore]);

  // 모든 훅 실행 이후 조기 반환 — 훅 순서 보장 (Rules of Hooks)
  if (!schedule) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* 라디얼 배경 효과 (큰 원형 View로 흉내) */}
        <View style={wxS.glowTopRight} pointerEvents="none" />
        <View style={wxS.glowBotLeft} pointerEvents="none" />

        <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
          {/* 헤더 */}
          <View style={wxS.shellRow}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.6} style={wxS.backBtn}>
              <Text style={wxS.backArrow}>←</Text>
            </TouchableOpacity>
            {weatherOnly || schedule.overseas ? (
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: 'rgba(255,255,255,0.85)' }}>
                {weatherOnly ? '현재 위치 날씨' : '현지 날씨'}
              </Text>
            ) : (
              <View style={wxS.pillTabs}>
                {[{ k: 'wx', l: '날씨' }, { k: 'tr', l: '교통' }].map(t => {
                  const on = tab === t.k;
                  return (
                    <TouchableOpacity key={t.k} onPress={() => handleTabPress(t.k)} activeOpacity={0.7}
                      style={[wxS.pillTab, on ? wxS.pillTabOn : wxS.pillTabOff]}>
                      <Text style={on ? wxS.pillTxtOn : wxS.pillTxtOff}>{t.l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* 가로 슬라이더 — 두 페이지를 나란히 배치 + translateX */}
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <GestureDetector gesture={slidePan}>
            <Animated.View
              style={{
                flex: 1,
                flexDirection: 'row',
                width: SW * 2,
                transform: [{ translateX: slideAnim }],
              }}>
            <View style={{ width: SW }}>
            <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
            <Animated.ScrollView
              style={{ flex: 1, transform: [{ scale }] }}
              contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
              showsVerticalScrollIndicator={false}>

              {/* ① 구장명 + 날짜 */}
              <View style={wxS.wxHeader}>
                {weatherOnly ? (
                  <>
                    <Text style={[wxS.wxCourse, { fontSize: fs(19) }]}>
                      📍 {resolvedLoc || '현재 위치'}
                    </Text>
                    <Text style={wxS.wxDate}>{schedule.date}</Text>
                  </>
                ) : (
                  <>
                    <Text style={wxS.wxCourse}>{schedule.course}</Text>
                    <Text style={wxS.wxDate}>
                      {schedule.isPreview ? '날씨 미리보기' : `${schedule.date} · 티오프 ${schedule.time}`}
                    </Text>
                  </>
                )}
              </View>

              {forecast === null ? (
                wxFailed ? (
                  <View style={{ paddingVertical: 72, paddingHorizontal: 32, alignItems: 'center' }}>
                    <Text style={{ fontSize: fs(30), marginBottom: 12 }}>🌧️</Text>
                    <Text style={{ fontFamily: F.sysSb, color: 'rgba(255,255,255,0.85)', fontSize: fs(14), textAlign: 'center' }}>
                      {weatherOnly ? '현재 위치를 가져올 수 없어요' : '날씨 정보를 불러올 수 없어요'}
                    </Text>
                    <Text style={{ marginTop: 8, color: 'rgba(255,255,255,0.45)', fontSize: fs(12), textAlign: 'center', lineHeight: 18 }}>
                      {weatherOnly
                        ? '위치 권한을 확인하거나\n잠시 후 다시 시도해주세요'
                        : '골프장 위치를 찾지 못했어요.\n일정 수정에서 골프장을 검색해\n선택하면 정확해져요'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setRetryTick(t => t + 1)}
                      activeOpacity={0.8}
                      style={{ marginTop: 18, borderWidth: 1, borderColor: 'rgba(245,230,168,0.6)', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 9 }}>
                      <Text style={{ color: '#F5E6A8', fontSize: fs(13) }}>다시 시도</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ paddingVertical: 80, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#F5E6A8" />
                    <Text style={{ marginTop: 12, color: 'rgba(255,255,255,0.5)', fontSize: fs(12) }}>날씨 데이터 불러오는 중…</Text>
                  </View>
                )
              ) : (
              <>
              {/* ② 기온 히어로 — 정밀 예보 시점 분기 (사용자 명시 라벨)
                  · weatherOnly·해외 일정 → 현재 (라벨 없음, 일정 정보 없음)
                  · 라운딩 D+0~D+3 (시간별 정밀 예보) → 라운딩 시점 기준 + "라운딩 시점 날씨" 라벨
                  · 라운딩 D+4+ (시간별 예보 밖) → 현재 날씨로 대체 + "현재 날씨 · 라운딩 3일 전부터 더 정확해져요" 라벨 */}
              {(() => {
                const isScheduled = isRealRound;
                const usePrecise = isScheduled && schedule.dDay <= 3 && hourSlots.length > 0;
                let icon, sky, temp, pop, tmin, tmax, label;
                if (usePrecise) {
                  const slot = hourSlots[teeoffSlotIdx >= 0 ? teeoffSlotIdx : Math.min(2, hourSlots.length - 1)];
                  icon = slot?.icon; sky = slot?.sky;
                  temp = slot?.temp; pop = slot?.rain;
                  const roundDay = days.find(d => d.date === schedule?.date);
                  tmin = roundDay?.tmin; tmax = roundDay?.tmax;
                  label = '라운딩 시점 날씨';
                } else {
                  icon = cur?.icon; sky = cur?.sky; temp = cur?.temp; pop = cur?.pop;
                  tmin = todayDay?.tmin; tmax = todayDay?.tmax;
                  if (isScheduled) {
                    label = '현재 날씨 · 라운딩 3일 전부터 더 정확해져요';
                  }
                }
                return (
                  <>
                    {label && (usePrecise ? (
                      // 어두운 배경에 버건디 글씨가 묻혀서 → 버터색 배지로 강조 (팝업 강조색과 일관)
                      <View style={{ alignSelf: 'center', marginBottom: 10, paddingHorizontal: 12, paddingVertical: 4,
                        borderRadius: 999, backgroundColor: 'rgba(245,230,168,0.16)',
                        borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.45)' }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.butter, textAlign: 'center', letterSpacing: 0.5 }}>
                          {label}
                        </Text>
                      </View>
                    ) : (
                      // D+4+ 현재 날씨 — warmGray가 어두운 배경에 묻혀 안 보이던 문제 → 흰색 배지로 가독성↑.
                      // 버터 배지는 정밀 예보(D+3 이내) 전용이라, 현재 날씨는 흰 배지로 톤 구분.
                      <View style={{ alignSelf: 'center', marginBottom: 10, paddingHorizontal: 12, paddingVertical: 4,
                        borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)',
                        borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.42)' }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.5 }}>
                          {label}
                        </Text>
                      </View>
                    ))}
                    <View style={wxS.tempHero}>
                      <View style={{ marginRight: 10 }}><WeatherGlyph icon={icon || '🌤️'} size={fs(44)} /></View>
                      <Text style={wxS.tempBig}>
                        {Number.isFinite(temp) ? `${Math.round(temp)}°` : '—'}
                      </Text>
                      <View style={wxS.tempRight}>
                        <Text style={wxS.tempSky}>{sky || '—'}</Text>
                        <Text style={wxS.tempSub}>
                          강수확률 {Number.isFinite(pop) ? `${Math.round(pop)}%` : '—'}
                        </Text>
                        <Text style={wxS.tempSub}>
                          {Number.isFinite(tmin) && Number.isFinite(tmax)
                            ? `최저 ${Math.round(tmin)}° / 최고 ${Math.round(tmax)}°`
                            : '최저 — / 최고 —'}
                        </Text>
                      </View>
                    </View>
                  </>
                );
              })()}

              {/* ③ 4칸 카드 — 바람·습도는 라운딩 시점(D+3 이내) 슬롯 사용, 그 외엔 현재.
                  미세먼지·자외선은 일별만 제공되므로 그대로 (시간대별 X) */}
              {(() => {
                const isSched = isRealRound;
                const useSlot = isSched && schedule.dDay <= 3 && hourSlots.length > 0;
                const slot = useSlot ? hourSlots[teeoffSlotIdx >= 0 ? teeoffSlotIdx : Math.min(2, hourSlots.length - 1)] : null;
                const wind = slot?.wind ?? cur?.windSpeed;
                const humidity = slot?.humidity ?? cur?.humidity;
                return (
                  <View style={wxS.gridCard}>
                    {[
                      {
                        label: '바람',
                        val: Number.isFinite(wind) ? `${wind.toFixed(1)}m/s` : '—',
                        sub: Number.isFinite(wind) ? windLabel(wind) : '',
                      },
                      {
                        label: '습도',
                        val: Number.isFinite(humidity) ? `${Math.round(humidity)}%` : '—',
                        sub: Number.isFinite(humidity) ? humidityLabel(humidity) : '',
                      },
                      {
                        label: '미세먼지',
                        val: airQuality?.label || '—',
                        sub: airQuality?.pm10 != null ? `PM10 ${airQuality.pm10}` : '',
                      },
                      {
                        label: '자외선',
                        val: uvIndex?.label || '—',
                        sub: Number.isFinite(uvIndex?.uv) ? `UV ${Math.round(uvIndex.uv)}` : '',
                      },
                    ].map((c, i, arr) => (
                      <View key={i} style={[wxS.gridCell, i < arr.length - 1 && wxS.gridCellBorder]}>
                        <Text style={wxS.gridLabel}>{c.label}</Text>
                        <Text style={wxS.gridValue}>{c.val}</Text>
                        <Text style={wxS.gridSub}>{c.sub}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {/* ④ 골프 지수 카드 */}
              <Text style={[wxS.sectionLabel, { paddingHorizontal: 20, marginTop: 28 }]}>골프 지수</Text>
              <View style={[wxS.gIdxCard, { marginTop: 0 }]}>
                {golfIdx ? (
                  <>
                    <View style={wxS.gIdxHeadRow}>
                      <Text style={wxS.gIdxBig}>{golfIdx.label}</Text>
                      <Text style={wxS.gIdxScore}>{golfIdx.total} / 100</Text>
                    </View>
                    <View style={wxS.gIdxBar}>
                      <View style={[wxS.gIdxBarFill, { width: `${golfIdx.total}%` }]} />
                    </View>
                    <View style={wxS.gIdxBadgeRow}>
                      {golfIdx.badges.map((b, i) => (
                        <View key={i} style={[wxS.gIdxBadge, { backgroundColor: b.bg }]}>
                          <Text style={[wxS.gIdxBadgeTxt, { color: b.color }]}>{b.txt}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: fs(12), paddingVertical: 8, textAlign: 'center' }}>
                    데이터 부족
                  </Text>
                )}
              </View>

              {/* ⑤ 라운딩 컨디션 */}
              <View style={wxS.condWrap}>
                <Text style={wxS.sectionLabel}>라운딩 컨디션</Text>
                {hourSlots.length === 0 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: fs(12), paddingVertical: 16, textAlign: 'center' }}>
                    시간대 예보 정보가 없습니다 (D+3 이후)
                  </Text>
                ) : hourSlots.map((slot, i) => {
                  const isTee = isRealRound && i === teeoffSlotIdx;
                  const { dots, label } = calcDots(slot, airForScore, uvForScore);
                  return (
                    <View key={i} style={[wxS.condRow, isTee && wxS.condRowTee]}>
                      <Text style={wxS.condTime} numberOfLines={1}>{slot.time}</Text>
                      <View style={{ marginRight: 12 }}><WeatherGlyph icon={slot.icon} size={fs(18)} /></View>
                      <View style={wxS.condDots}>
                        {[1, 2, 3, 4, 5].map(d => {
                          const full = d <= Math.floor(dots);
                          const half = !full && d === Math.ceil(dots) && dots % 1 !== 0;
                          return (
                            <View key={d} style={[wxS.condDot, {
                              backgroundColor: full
                                ? '#F5E6A8'
                                : half ? 'rgba(245,230,168,0.45)' : 'rgba(255,255,255,0.1)',
                            }]} />
                          );
                        })}
                      </View>
                      <Text style={wxS.condLabel}>{label}</Text>
                      {isTee && (
                        <View style={wxS.teeBadge}>
                          <Text style={wxS.teeBadgeTxt}>티오프</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* ⑥ 10일 예보 */}
              <View style={wxS.fcWrap}>
                <Text style={wxS.sectionLabel}>10일 예보</Text>
                <View style={wxS.fcCard}>
                  {days.length === 0 ? (
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: fs(12), paddingVertical: 16, textAlign: 'center' }}>
                      예보 정보가 없습니다
                    </Text>
                  ) : days.map((w, i) => {
                    const isToday = w.day === '오늘';
                    const isRound = scheduleDateSet.has(w.date);
                    const isLast = i === days.length - 1;
                    const dateLabel = (w.date || '').slice(5); // 'YYYY.MM.DD' → 'MM.DD'
                    return (
                      <View key={i} style={[
                        wxS.fcRow,
                        isLast && wxS.fcRowLast,
                        isToday && wxS.fcRowToday,
                      ]}>
                        <View style={wxS.fcDayBox}>
                          <Text style={[wxS.fcDay, isToday && wxS.fcDayToday]}>{w.day}</Text>
                          <Text style={wxS.fcDate}>{dateLabel}</Text>
                        </View>
                        <View style={{ marginRight: 8 }}><WeatherGlyph icon={w.icon} size={fs(20)} /></View>
                        <View style={wxS.fcMain}>
                          <View style={wxS.fcSkyRow}>
                            <Text style={wxS.fcSky}>{w.sky || '—'}</Text>
                            {isRound && (
                              <View style={wxS.roundBadge}>
                                <Text style={wxS.roundBadgeTxt}>라운딩</Text>
                              </View>
                            )}
                          </View>
                          <Text style={wxS.fcSub}>강수 {Math.round(w.pop || 0)}%</Text>
                        </View>
                        <Text style={wxS.fcTempMin}>{Number.isFinite(w.tmin) ? `${Math.round(w.tmin)}°` : '—'} / </Text>
                        <Text style={wxS.fcTempMax}>{Number.isFinite(w.tmax) ? `${Math.round(w.tmax)}°` : '—'}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* ⑦ 네이버 날씨 더보기 — 해당 골프장(또는 현재 위치)으로 검색 연결 */}
              <TouchableOpacity
                onPress={() => {
                  const courseName = (schedule?.course || '').trim();
                  const locName = (courseCoord?.loc || '').trim();
                  const place = (weatherOnly || courseName === '현재 위치')
                    ? locName
                    : (courseName || locName);
                  const q = place ? `${place} 날씨` : '날씨';
                  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`;
                  Linking.openURL(url).catch(() => Linking.openURL('https://m.weather.naver.com/'));
                }}
                activeOpacity={0.7}
                style={wxS.naverBtn}>
                <Text style={wxS.naverBtnTxt}>네이버 날씨 더보기 →</Text>
              </TouchableOpacity>
              </>
              )}
            </Animated.ScrollView>
            </PinchGestureHandler>
            </View>

            <View style={{ width: SW }}>
            <ScrollView
              ref={trScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40 + insets.bottom + (kbHeight ? kbHeight + 80 : 0) }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              scrollEventThrottle={16}
              onScroll={(e) => { trScrollY.current = e.nativeEvent.contentOffset.y; }}
              automaticallyAdjustKeyboardInsets>

              {/* 교통 탭 헤더 (다크 톤 통일) */}
              <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(18), color: '#fff', marginBottom: 4 }}>{schedule.course}</Text>
                <Text style={{ fontSize: fs(11), color: 'rgba(255,255,255,0.65)' }}>
                  {schedule.isPreview ? '교통편 미리보기' : `${schedule.date} · 티오프 ${schedule.time}`}
                </Text>
              </View>

              {/* 갈 때 섹션 */}
              <View style={trS.twoSection}>
                <Text style={trS.twoLabel}>갈 때</Text>
                {schedule.isPreview ? (
                  <View style={{ backgroundColor: 'rgba(245,230,168,0.1)', borderWidth: 1, borderColor: 'rgba(245,230,168,0.3)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 22, marginBottom: 16 }}>
                    <Text style={{ fontFamily: 'System', fontSize: fs(13), color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 21 }}>
                      📅 라운딩 일정을 등록하면{'\n'}출발 시간을 알려드려요
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={trS.recoBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={{ fontSize: fs(13) }}>📍</Text>
                        <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13.5), color: 'rgba(255,255,255,0.9)', marginLeft: 5 }} numberOfLines={1}>
                          {goOriginInfo.placeholder ? '출발지 미설정' : `${goOriginInfo.label} 출발`}
                        </Text>
                      </View>
                      {/* 권장 출발 + 소요시간 — 둘 다 핵심이라 나란히 크게(소요시간이 안 보이던 것 보강) */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[trS.recoLabel, { marginBottom: 3 }]}>출발 권장</Text>
                          <Text style={[trS.recoTime, { fontSize: fs(40), lineHeight: 44, color: driveMin == null ? 'rgba(245,230,168,0.55)' : '#F5E6A8' }]}>{recommended}</Text>
                        </View>
                        <View style={{ width: 1, height: 40, backgroundColor: 'rgba(245,230,168,0.25)', marginHorizontal: 14 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[trS.recoLabel, { marginBottom: 3 }]}>소요시간</Text>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(28), color: driveMin == null ? 'rgba(245,230,168,0.55)' : '#F5E6A8' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            {driveMin != null ? formatDriveMin(driveMin) : ((goOriginCoord || originResolving) ? '계산 중' : `약 ${formatDriveMin(recoDriveMin)}`)}
                          </Text>
                        </View>
                      </View>
                      <Text style={trS.recoSub}>티오프 {schedule.time} · {arrival} 도착 (30분 전)</Text>
                    </View>
                    {driveMin != null && trSlots.goOrigin.mode !== 'current' ? (
                      <Text style={{ fontFamily: 'System', fontSize: fs(11), color: 'rgba(255,255,255,0.65)', marginTop: -8, marginBottom: 14, paddingHorizontal: 4 }}>
                        ⓘ 실시간 교통 기준 · 도로상황에 따라 달라질 수 있어요
                      </Text>
                    ) : (driveMin == null && (goOriginCoord || originResolving)) ? (
                      // 좌표는 있고(또는 GPS·지오코딩 진행 중) 소요 계산 전 — 깜빡임 없이 '계산 중'
                      <Text style={{ fontFamily: 'System', fontSize: fs(11), color: 'rgba(255,255,255,0.65)', marginTop: -8, marginBottom: 14, paddingHorizontal: 4 }}>
                        ⓘ 소요시간 계산 중…
                      </Text>
                    ) : (
                      // 마이페이지 설정 유도 — 또렷한 박스로(작은 ⓘ는 잘 안 보임). 현재위치로 계산된 경우/미설정 모두.
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -6, marginBottom: 14,
                        backgroundColor: 'rgba(245,230,168,0.12)', borderWidth: 1, borderColor: 'rgba(245,230,168,0.45)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 }}>
                        <Text style={{ fontSize: fs(15) }}>📍</Text>
                        <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12.5), color: 'rgba(255,255,255,0.9)', lineHeight: fs(18) }}>
                          {driveMin != null
                            ? '지금은 현재 위치 기준 · 마이페이지에서 출발지를 설정하면 매번 자동으로 계산돼요'
                            : '마이페이지에서 출발지를 설정하면 정확한 출발 시간을 알려드려요 (지금은 기본 추정치)'}
                        </Text>
                      </View>
                    )}
                  </>
                )}
                {renderSlot('goOrigin', '출발')}
                {renderSlot('goDest', '도착')}
                <View style={trS.linkBtnRow}>
                  <TouchableOpacity style={[trS.linkBtn, { backgroundColor: '#03C75A' }]}
                    onPress={() => openNaverRoute('goOrigin', 'goDest')} activeOpacity={0.85}>
                    <Text style={[trS.linkBtnTxt, { color: '#fff' }]}>네이버 경로</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[trS.linkBtn, { backgroundColor: C.charcoal }]}
                    onPress={() => openTmapRoute('goOrigin', 'goDest')} activeOpacity={0.85}>
                    <Text style={[trS.linkBtnTxt, { color: C.butter }]}>티맵 경로</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 올 때 섹션 */}
              <View style={trS.twoSection}>
                <Text style={trS.twoLabel}>올 때</Text>
                <View style={trS.endTimeRow}>
                  <Text style={trS.endLabel}>예상 종료</Text>
                  <TouchableOpacity style={trS.endBtn} onPress={() => setEndOffsetMin(o => o - 30)} activeOpacity={0.7}>
                    <Text style={trS.endBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={trS.endValue}>{endStr}</Text>
                  <TouchableOpacity style={trS.endBtn} onPress={() => setEndOffsetMin(o => o + 30)} activeOpacity={0.7}>
                    <Text style={trS.endBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>
                {renderSlot('backOrigin', '출발')}
                {renderSlot('backDest', '도착')}
                <View style={trS.linkBtnRow}>
                  <TouchableOpacity style={[trS.linkBtn, { backgroundColor: '#03C75A' }]}
                    onPress={() => openNaverRoute('backOrigin', 'backDest')} activeOpacity={0.85}>
                    <Text style={[trS.linkBtnTxt, { color: '#fff' }]}>네이버 경로</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[trS.linkBtn, { backgroundColor: C.charcoal }]}
                    onPress={() => openTmapRoute('backOrigin', 'backDest')} activeOpacity={0.85}>
                    <Text style={[trS.linkBtnTxt, { color: C.butter }]}>티맵 경로</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[trS.charcoalSection, { marginTop: 16 }]}>
                <Text style={trS.darkLabel}>대리운전</Text>
                <View style={trS.daeriRow}>
                  <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#FEE500' }]}
                    onPress={() => Linking.openURL('kakaot://').catch(() => Linking.openURL('https://kakaot.kakao.com/'))}
                    activeOpacity={0.85}>
                    <Text style={[trS.daeriBtnTxt, { color: '#3A2000' }]}>카카오T</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#C8D9E6' }]}
                    onPress={() => Linking.openURL('tmap://daeri').catch(() => Linking.openURL('https://tmap.life'))}
                    activeOpacity={0.85}>
                    <Text style={[trS.daeriBtnTxt, { color: C.navy }]}>티맵대리</Text>
                  </TouchableOpacity>
                  {/* 아이대리 — 연동 준비 중 (버튼만 표시, 비활성) */}
                  <View style={[trS.daeriBtn, { backgroundColor: '#8B8680', opacity: 0.45 }]}>
                    <Text style={[trS.daeriBtnTxt, { color: '#fff' }]}>아이대리</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
            </View>
            </Animated.View>
            </GestureDetector>
          </View>
        </SafeAreaView>
      </View>
      </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}
