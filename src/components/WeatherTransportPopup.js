import React, { useState, useEffect, useRef } from 'react';
import { Modal, ScrollView, View, Text, TextInput, TouchableOpacity, Linking, PanResponder, Animated, useWindowDimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { C } from '../constants/colors';
import { wxS } from '../styles/wxS';
import { trS } from '../styles/trS';
import { getCombinedForecast, pickHourSlots, getUVIndex } from '../utils/kma';
import { getAirQuality } from '../utils/airkorea';
import { findUserCourseById, ensureCourseCoord } from '../utils/userCourses';
import { addressToCoord, getDrivingDirections } from '../utils/kakao';
import { getCurrentLocation, reverseGeocode } from '../utils/location';
import { UserContext } from '../contexts/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROUND_MIN = 5 * 60; // 라운드 평균 5시간
const MODE_LABEL = { home: '마이페이지', course: '골프장', current: '현재위치', custom: '직접입력' };

// 동일 코스 재오픈 시 즉시 표시. in-flight 요청 dedupe + AsyncStorage 영속 캐시
const wxCache = new Map(); // courseId → { data, pending?, ts }
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

// courseId 없는 일정 (데모 데이터 등) — 코스명으로 카카오 검색 + reverseGeocode
const fetchWeatherByName = (name) => fetchWeatherCached(`name:${name}`, async () => {
  const coord = await addressToCoord(name);
  if (!coord) return null;
  const loc = await reverseGeocode(coord.y, coord.x);
  return { x: coord.x, y: coord.y, loc: loc || '' };
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

const calcDots = ({ temp, wind, rain }) => {
  if (rain >= 50) return { dots: 1, label: '어려움' };
  if (temp >= 29 || wind >= 12) return { dots: 2, label: '주의' };
  if ((temp >= 25 && temp <= 28) || (wind >= 8 && wind < 12)) return { dots: 3, label: '보통' };
  if ((temp >= 15 && temp <= 17) || (wind >= 5 && wind < 8)) return { dots: 4, label: '좋음' };
  if (temp >= 18 && temp <= 24 && wind <= 5 && rain <= 20) return { dots: 5, label: '최적' };
  return { dots: 3, label: '보통' };
};

export function WeatherTransportPopup({ visible, initialTab, onClose, schedule, schedules, weatherOnly }) {
  const [tab, setTab] = useState(initialTab || 'wx');
  const [forecast, setForecast] = useState(null);
  const [airQuality, setAirQuality] = useState(null);
  const [uvIndex, setUvIndex] = useState(null);
  const [resolvedLoc, setResolvedLoc] = useState('');
  const { width: SW } = useWindowDimensions();

  const { userProfile } = React.useContext(UserContext);
  const homeAddress = userProfile?.departure || '';
  const savedDepX = userProfile?.departureCoord?.x;
  const savedDepY = userProfile?.departureCoord?.y;
  const [courseCoord, setCourseCoord] = useState(null);   // { x, y, loc }
  const [currentCoord, setCurrentCoord] = useState(null); // { x, y }
  const [homeCoord, setHomeCoord] = useState(null);       // { x, y }
  const [driveMin, setDriveMin] = useState(null);         // 갈 때 실측 소요(분), 카카오 길찾기
  const [trSlots, setTrSlots] = useState({
    goOrigin:   { mode: 'home',   custom: '', customCoord: null },
    goDest:     { mode: 'course', custom: '', customCoord: null },
    backOrigin: { mode: 'course', custom: '', customCoord: null },
    backDest:   { mode: 'home',   custom: '', customCoord: null },
  });
  const [expandedSlot, setExpandedSlot] = useState(null);
  const [endOffsetMin, setEndOffsetMin] = useState(0);

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
      const t = weatherOnly ? 'wx' : (initialTab || 'wx');
      setTab(t);
      const target = t === 'wx' ? 0 : -SW;
      slideAnim.setValue(target);
      slideBase.current = target;
    }
  }, [visible, initialTab, SW, weatherOnly]);

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
        if (weatherOnly) {
          setForecast(null); setAirQuality(null); setUvIndex(null); setResolvedLoc('');
          const pos = await getCurrentLocation();
          if (!pos || cancelled) return;
          setCurrentCoord({ x: pos.lng, y: pos.lat });
          const loc = await reverseGeocode(pos.lat, pos.lng);
          if (cancelled) return;
          setResolvedLoc(loc || '');
          const [f, aq, uv] = await Promise.all([
            getCombinedForecast({ lat: pos.lat, lng: pos.lng, loc }),
            getAirQuality(loc),
            UV_ENABLED ? getUVIndex(loc) : Promise.resolve(null),
          ]);
          if (cancelled) return;
          setForecast(f); setAirQuality(aq); setUvIndex(uv);
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
          if (cancelled || !data) return;
          setForecast(data.forecast);
          setAirQuality(data.airQuality);
          setUvIndex(data.uvIndex);
          setCourseCoord(data.courseCoord);
        }
      } catch (e) {
        console.warn('[wx popup] forecast fetch failed:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, weatherOnly, schedule?.courseId, schedule?.courseX, schedule?.courseY]);

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

  // 일정 바뀌면 종료시간 오프셋 리셋
  useEffect(() => { setEndOffsetMin(0); }, [schedule?.courseId, schedule?.time]);

  const handleTabPress = (newTab) => {
    if (newTab === tab) return;
    animateTo(newTab === 'wx' ? 0 : -SW, newTab);
  };

  const weatherOnlyRef = useRef(weatherOnly);
  useEffect(() => { weatherOnlyRef.current = weatherOnly; }, [weatherOnly]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gs) =>
      !weatherOnlyRef.current && Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < 15,
    onMoveShouldSetPanResponderCapture: (_, gs) =>
      !weatherOnlyRef.current && Math.abs(gs.dx) > 10 && Math.abs(gs.dy) < 15,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, gs) => {
      let next = slideBase.current + gs.dx;
      if (next > 0) next = 0;
      if (next < -SW) next = -SW;
      slideAnim.setValue(next);
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx < -50 && slideBase.current === 0) {
        animateTo(-SW, 'tr');
      } else if (gs.dx > 50 && slideBase.current === -SW) {
        animateTo(0, 'wx');
      } else {
        animateTo(slideBase.current, null);
      }
    },
    onPanResponderTerminate: () => {
      animateTo(slideBase.current, null);
    },
  })).current;

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

  // 갈 때 출발→도착 실제 소요시간 (카카오모빌리티 길찾기) — 좌표 변경 시 1회 조회
  // schedule 없는 렌더(가드 이전)에서도 안전하도록 schedule 있을 때만 해석
  const goOriginCoord = schedule ? resolveSlot('goOrigin').coord : null;
  const goDestCoord = schedule ? resolveSlot('goDest').coord : null;
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
      const pos = await getCurrentLocation();
      if (pos) setCurrentCoord({ x: pos.lng, y: pos.lat });
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
          <Text style={trS.slotChevTxt}>{expanded ? '▲' : '▼'}</Text>
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
              <TextInput style={trS.customInput}
                value={slot.custom}
                onChangeText={(t) => setCustomText(slotKey, t)}
                onBlur={() => resolveCustomCoord(slotKey)}
                onSubmitEditing={() => resolveCustomCoord(slotKey)}
                placeholder="주소 또는 장소명 입력"
                placeholderTextColor="rgba(255,255,255,0.3)"
                returnKeyType="done" />
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
  const scheduleDateSet = new Set(
    (schedules || [schedule]).filter(Boolean).map(s => s.date || '')
  );

  // 골프 지수: 풍속(30) + 강수확률(35) + 기온(35) = 100
  // 데이터 소스: weatherOnly→현재, 일정 D+0~D+3→티오프(또는 정오) 슬롯, D+4~D+10→중기 일별
  // 일정 D+11 이후는 예보 범위 밖 → kind:'too-far' 반환해서 UI에서 안내 문구 표시
  const golfIdx = React.useMemo(() => {
    if (!weatherOnly && Number.isFinite(schedule?.dDay) && schedule.dDay > 10) {
      return { kind: 'too-far' };
    }

    let temp = null, wind = null, pop = null, windKnown = true;
    if (weatherOnly) {
      temp = cur?.temp;
      wind = cur?.windSpeed;
      pop = cur?.pop ?? todayDay?.pop ?? 0;
    } else if (hourSlots.length > 0) {
      const slot = hourSlots[teeoffSlotIdx >= 0 ? teeoffSlotIdx : Math.min(2, hourSlots.length - 1)];
      temp = slot?.temp; wind = slot?.wind; pop = slot?.rain;
    } else {
      const roundDay = days.find(d => d.date === schedule?.date);
      if (roundDay && Number.isFinite(roundDay.tmin) && Number.isFinite(roundDay.tmax)) {
        temp = (roundDay.tmin + roundDay.tmax) / 2;
        pop = roundDay.pop || 0;
        windKnown = false; // 중기예보엔 풍속 없음
      }
    }
    if (temp == null || !Number.isFinite(temp)) return null;

    // 풍속 (30점)
    let windScore;
    if (!windKnown || wind == null || !Number.isFinite(wind)) windScore = 21;
    else if (wind <= 3) windScore = 30;
    else if (wind <= 5) windScore = 25;
    else if (wind <= 7) windScore = 18;
    else if (wind <= 10) windScore = 10;
    else windScore = 0;

    // 강수확률 (35점)
    const p = Number.isFinite(pop) ? pop : 0;
    let popScore;
    if (p <= 10) popScore = 35;
    else if (p <= 30) popScore = 25;
    else if (p <= 50) popScore = 15;
    else if (p <= 70) popScore = 6;
    else popScore = 0;

    // 기온 (35점)
    let tempScore;
    if (temp >= 18 && temp <= 24) tempScore = 35;
    else if ((temp >= 15 && temp < 18) || (temp > 24 && temp <= 27)) tempScore = 28;
    else if ((temp >= 10 && temp < 15) || (temp > 27 && temp <= 30)) tempScore = 18;
    else if ((temp >= 5 && temp < 10) || (temp > 30 && temp <= 33)) tempScore = 8;
    else tempScore = 0;

    const total = Math.round(windScore + popScore + tempScore);
    let label;
    if (total >= 80) label = 'Great';
    else if (total >= 60) label = 'Good';
    else if (total >= 40) label = 'OK';
    else if (total >= 20) label = 'Poor';
    else label = 'Bad';

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

    return { total, label, badges };
  }, [weatherOnly, cur, days, hourSlots, teeoffSlotIdx, schedule, todayDay]);

  // 모든 훅 실행 이후 조기 반환 — 훅 순서 보장 (Rules of Hooks)
  if (!schedule) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
            {weatherOnly ? (
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>현재 위치 날씨</Text>
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
            <Animated.View
              {...panResponder.panHandlers}
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
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>

              {/* ① 구장명 + 날짜 */}
              <View style={wxS.wxHeader}>
                {weatherOnly ? (
                  <>
                    <Text style={[wxS.wxCourse, { fontSize: 18 }]}>
                      📍 {resolvedLoc || '현재 위치'}
                    </Text>
                    <Text style={wxS.wxDate}>{schedule.date}</Text>
                  </>
                ) : (
                  <>
                    <Text style={wxS.wxCourse}>{schedule.course}</Text>
                    <Text style={wxS.wxDate}>{schedule.date} · 티오프 {schedule.time}</Text>
                  </>
                )}
              </View>

              {forecast === null ? (
                <View style={{ paddingVertical: 80, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#F5E6A8" />
                  <Text style={{ marginTop: 12, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>날씨 데이터 불러오는 중…</Text>
                </View>
              ) : (
              <>
              {/* ② 기온 히어로 */}
              <View style={wxS.tempHero}>
                <Text style={wxS.tempEmoji}>{cur?.icon || '🌤️'}</Text>
                <Text style={wxS.tempBig}>
                  {Number.isFinite(cur?.temp) ? `${Math.round(cur.temp)}°` : '—'}
                </Text>
                <View style={wxS.tempRight}>
                  <Text style={wxS.tempSky}>{cur?.sky || '—'}</Text>
                  <Text style={wxS.tempSub}>
                    강수확률 {Number.isFinite(cur?.pop) ? `${Math.round(cur.pop)}%` : '—'}
                  </Text>
                  <Text style={wxS.tempSub}>
                    {todayDay && Number.isFinite(todayDay.tmin) && Number.isFinite(todayDay.tmax)
                      ? `최저 ${Math.round(todayDay.tmin)}° / 최고 ${Math.round(todayDay.tmax)}°`
                      : '최저 — / 최고 —'}
                  </Text>
                </View>
              </View>

              {/* ③ 4칸 카드 */}
              <View style={wxS.gridCard}>
                {[
                  {
                    label: '바람',
                    val: Number.isFinite(cur?.windSpeed) ? `${cur.windSpeed.toFixed(1)}m/s` : '—',
                    sub: Number.isFinite(cur?.windSpeed) ? windLabel(cur.windSpeed) : '',
                  },
                  {
                    label: '습도',
                    val: Number.isFinite(cur?.humidity) ? `${Math.round(cur.humidity)}%` : '—',
                    sub: Number.isFinite(cur?.humidity) ? humidityLabel(cur.humidity) : '',
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

              {/* ④ 골프 지수 카드 */}
              <Text style={[wxS.sectionLabel, { paddingHorizontal: 20, marginTop: 28 }]}>골프 지수</Text>
              <View style={[wxS.gIdxCard, { marginTop: 0 }]}>
                {golfIdx?.kind === 'too-far' ? (
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, paddingVertical: 10, textAlign: 'center' }}>
                    10일 전부터 확인할 수 있어요
                  </Text>
                ) : golfIdx ? (
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
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, paddingVertical: 8, textAlign: 'center' }}>
                    데이터 부족
                  </Text>
                )}
              </View>

              {/* ⑤ 라운딩 컨디션 */}
              <View style={wxS.condWrap}>
                <Text style={wxS.sectionLabel}>라운딩 컨디션</Text>
                {hourSlots.length === 0 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, paddingVertical: 16, textAlign: 'center' }}>
                    시간대 예보 정보가 없습니다 (D+3 이후)
                  </Text>
                ) : hourSlots.map((slot, i) => {
                  const isTee = i === teeoffSlotIdx;
                  const { dots, label } = calcDots(slot);
                  return (
                    <View key={i} style={[wxS.condRow, isTee && wxS.condRowTee]}>
                      <Text style={wxS.condTime}>{slot.time}</Text>
                      <Text style={wxS.condIcon}>{slot.icon}</Text>
                      <View style={wxS.condDots}>
                        {[1, 2, 3, 4, 5].map(d => {
                          const on = d <= dots;
                          const isHalf = d === dots && dots >= 3 && dots < 5;
                          return (
                            <View key={d} style={[wxS.condDot, {
                              backgroundColor: on
                                ? (isHalf ? 'rgba(201,168,76,0.55)' : '#F5E6A8')
                                : 'rgba(255,255,255,0.1)',
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
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, paddingVertical: 16, textAlign: 'center' }}>
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
                        <Text style={wxS.fcIcon}>{w.icon}</Text>
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
                  const q = (weatherOnly || courseName === '현재 위치')
                    ? (locName || '날씨')
                    : (courseName || locName || '날씨');
                  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(q + ' 날씨')}`;
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
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}>

              {/* 교통 탭 헤더 (다크 톤 통일) */}
              <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
                <Text style={{ fontSize: 18, color: '#fff', fontWeight: '600', marginBottom: 4 }}>{schedule.course}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{schedule.date} · 티오프 {schedule.time}</Text>
              </View>

              {/* 갈 때 섹션 */}
              <View style={trS.twoSection}>
                <Text style={trS.twoLabel}>갈 때</Text>
                <View style={trS.recoBox}>
                  <Text style={trS.recoLabel}>추천 출발</Text>
                  <Text style={trS.recoTime}>{recommended}</Text>
                  <Text style={trS.recoSub}>
                    티오프 {schedule.time} · {driveMin != null ? `운전 ${driveMin}분 · ` : ''}여유 30분 포함
                  </Text>
                </View>
                <Text style={{ fontFamily: 'System', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -8, marginBottom: 14, paddingHorizontal: 4 }}>
                  {driveMin != null
                    ? 'ⓘ 카카오 실시간 교통 기준 · 도로상황에 따라 달라질 수 있어요'
                    : 'ⓘ 출발지 좌표가 있어야 실제 소요시간으로 계산해요 (지금은 기본 추정치)'}
                </Text>
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
          </View>
        </SafeAreaView>
      </View>
      </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}
