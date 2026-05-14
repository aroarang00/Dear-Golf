import React, { useState, useEffect, useRef } from 'react';
import { Modal, ScrollView, View, Text, TextInput, TouchableOpacity, Linking, Share, PanResponder, Animated, useWindowDimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { PinchGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { C } from '../constants/colors';
import { wxS } from '../styles/wxS';
import { trS } from '../styles/trS';
import { getCombinedForecast, pickHourSlots, getUVIndex } from '../utils/kma';
import { getAirQuality } from '../utils/airkorea';
import { findUserCourseById, ensureCourseCoord } from '../utils/userCourses';
import { addressToCoord } from '../utils/kakao';
import { getCurrentLocation, reverseGeocode } from '../utils/location';
import { UserContext } from '../contexts/UserContext';

const ROUND_MIN = 5 * 60; // 라운드 평균 5시간
const MODE_LABEL = { home: '마이페이지', course: '골프장', current: '현재위치', custom: '직접입력' };

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
  const [courseCoord, setCourseCoord] = useState(null);   // { x, y, loc }
  const [currentCoord, setCurrentCoord] = useState(null); // { x, y }
  const [homeCoord, setHomeCoord] = useState(null);       // { x, y }
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

  // KMA 예보 fetch — visible 변경 / 일정 변경 / weatherOnly 변경 시
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setForecast(null);
      setAirQuality(null);
      setUvIndex(null);
      setResolvedLoc('');
      try {
        let lat, lng, loc;
        if (weatherOnly) {
          const pos = await getCurrentLocation();
          if (!pos || cancelled) return;
          lat = pos.lat; lng = pos.lng;
          setCurrentCoord({ x: pos.lng, y: pos.lat });
          loc = await reverseGeocode(lat, lng);
          if (cancelled) return;
          setResolvedLoc(loc || '');
        } else if (schedule?.courseId) {
          const course = await findUserCourseById(schedule.courseId);
          const withCoord = await ensureCourseCoord(course);
          if (!withCoord || cancelled) return;
          setCourseCoord({ x: withCoord.x, y: withCoord.y, loc: withCoord.loc });
          lat = withCoord.y; lng = withCoord.x; loc = withCoord.loc;
        } else {
          return; // courseId 없는 일정 → fetch 불가
        }
        // 예보 + 미세먼지 + (UV: 활성화 시) 병렬 호출
        const [f, aq, uv] = await Promise.all([
          getCombinedForecast({ lat, lng, loc }),
          getAirQuality(loc),
          UV_ENABLED ? getUVIndex(loc) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setForecast(f);
        setAirQuality(aq);
        setUvIndex(uv);
      } catch (e) {
        console.warn('[wx popup] forecast fetch failed:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, weatherOnly, schedule?.courseId]);

  // 마이페이지 저장 출발지 → 좌표 변환 (1회 캐시)
  useEffect(() => {
    let cancelled = false;
    if (!homeAddress) { setHomeCoord(null); return; }
    (async () => {
      const coord = await addressToCoord(homeAddress);
      if (!cancelled) setHomeCoord(coord);
    })();
    return () => { cancelled = true; };
  }, [homeAddress]);

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

  if (!schedule) return null;

  const [teeH, teeM] = (schedule.time || '08:00').split(':').map(Number);
  const teeMin = teeH * 60 + teeM;

  // 교통 탭 계산
  const toHHMM = (m) => {
    m = (m + 24 * 60) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const endStr = toHHMM(teeMin + ROUND_MIN + endOffsetMin);
  const recoDriveMin = 80; // 기본 운전시간 가정치 (실제 경로 API 미연동)
  const recommended = toHHMM(teeMin - 30 - recoDriveMin);

  // 슬롯 (mode) → 표시용 라벨/좌표 해석
  const resolveSlot = (slotKey) => {
    const slot = trSlots[slotKey];
    if (slot.mode === 'home') {
      return { label: homeAddress || '마이페이지에 출발지 미설정', coord: homeCoord, placeholder: !homeAddress };
    }
    if (slot.mode === 'course') {
      return { label: schedule.course, coord: courseCoord ? { x: courseCoord.x, y: courseCoord.y } : null };
    }
    if (slot.mode === 'current') {
      return { label: resolvedLoc || '현재 위치', coord: currentCoord, placeholder: !currentCoord };
    }
    return { label: slot.custom || '주소 입력', coord: slot.customCoord, placeholder: !slot.custom };
  };

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

  const handleShareDaeri = () => {
    const msg = `[ Dear Golf ] 같이 대리 부르실 분?\n\n${schedule.course}\n${schedule.date} ${schedule.day}요일 라운딩\n티오프 ${schedule.time}\n\n카카오T 대리: https://www.kakaomobility.com/\n티맵 대리: https://tmap.life\n아이대리: https://www.idaeri.co.kr`;
    Share.share({ message: msg });
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
    (schedules || [schedule]).map(s => s.date || '')
  );

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
                <View style={wxS.gIdxHeadRow}>
                  <Text style={wxS.gIdxBig}>Good</Text>
                  <Text style={wxS.gIdxScore}>78 / 100</Text>
                </View>
                <View style={wxS.gIdxBar}>
                  <View style={[wxS.gIdxBarFill, { width: '78%' }]} />
                </View>
                <View style={wxS.gIdxBadgeRow}>
                  {[
                    { txt: '바람 약함', bg: '#C8D9E6', color: '#1A3D52' },
                    { txt: '강수 없음', bg: '#FFFFFF', color: '#3D3935' },
                    { txt: '기온 적정', bg: '#F5E6A8', color: '#5A4500' },
                  ].map((b, i) => (
                    <View key={i} style={[wxS.gIdxBadge, { backgroundColor: b.bg }]}>
                      <Text style={[wxS.gIdxBadgeTxt, { color: b.color }]}>{b.txt}</Text>
                    </View>
                  ))}
                </View>
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

              {/* ⑦ 네이버 날씨 더보기 */}
              <TouchableOpacity
                onPress={() => Linking.openURL('https://m.weather.naver.com/')}
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
                  <Text style={trS.recoSub}>티오프 {schedule.time} · 여유 30분 포함</Text>
                </View>
                <Text style={{ fontFamily: 'System', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: -8, marginBottom: 14, paddingHorizontal: 4 }}>
                  ⓘ 실제 소요시간은 출발지/도로상황에 따라 다를 수 있어요
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
                    onPress={() => Linking.openURL('kakaotalk://chauffeur').catch(() => Linking.openURL('https://www.kakaomobility.com/'))}
                    activeOpacity={0.85}>
                    <Text style={[trS.daeriBtnTxt, { color: '#3A2000' }]}>카카오T</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#C8D9E6' }]}
                    onPress={() => Linking.openURL('tmap://daeri').catch(() => Linking.openURL('https://tmap.life'))}
                    activeOpacity={0.85}>
                    <Text style={[trS.daeriBtnTxt, { color: '#1A3D52' }]}>티맵대리</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#8B8680' }]}
                    onPress={() => Linking.openURL('idaeri://').catch(() => Linking.openURL('https://www.idaeri.co.kr/'))}
                    activeOpacity={0.85}>
                    <Text style={[trS.daeriBtnTxt, { color: '#fff' }]}>아이대리</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={trS.shareBtn} onPress={handleShareDaeri} activeOpacity={0.85}>
                  <Text style={trS.shareBtnTxt}>동반자에게 공유</Text>
                </TouchableOpacity>
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
