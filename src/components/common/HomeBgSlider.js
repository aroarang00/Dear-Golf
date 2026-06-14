import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getShortForecast } from '../../utils/kma';
import { getCurrentLocation } from '../../utils/location';
import { classifyWeather } from '../../utils/unsplash';

// =============================================================
// 홈 배경 — 시간대별 골프장 사진(직접 검증한 큐레이션) + 날씨별 화면 톤.
//  · 사진: 시간대(아침/낮/늦은오후/밤)에 맞춰 교체
//  · 날씨: 비/흐림이면 화면을 어둡고 회색톤으로 덮음 (Unsplash에 비 오는
//          골프장 사진이 거의 없어, 사진 교체 대신 톤으로 날씨 분위기를 냄)
// =============================================================
// 로컬 번들 에셋 — 네트워크 다운로드 없이 즉시·선명하게 표시 (Unsplash에서 받아 앱에 포함).
// require는 정적 경로만 허용돼 개별 나열. 시간대별 풀에서 랜덤 1장.
const TIME_IMAGES = {
  morning: [ // 아침 (05~09시) — 안개·서리·여명
    require('../../../assets/home-bg/morning1.jpg'),
    require('../../../assets/home-bg/morning2.jpg'),
  ],
  day: [ // 낮 (09~16시) — 밝은 햇살·파란 하늘
    require('../../../assets/home-bg/day1.jpg'),
    require('../../../assets/home-bg/day2.jpg'), // 자연 풍경 + 코스·페어웨이·호수
    require('../../../assets/home-bg/day3.jpg'), // 화창 — 연못·벙커·숲 (사용자 사진, 2026-06-14 추가)
    require('../../../assets/home-bg/day4.jpg'), // 화창 — 페어웨이·연못·산·카트 (사용자 사진, 2026-06-14 추가)
    require('../../../assets/home-bg/lateAfternoon3.jpg'), // 대낮 파란하늘 — 노을 아님(늦은오후 풀에서 이동)
  ],
  lateAfternoon: [ // 늦은 오후·황혼 (16~21시) — 골든아워·노을
    require('../../../assets/home-bg/lateAfternoon1.jpg'),
    require('../../../assets/home-bg/lateAfternoon2.jpg'),
    require('../../../assets/home-bg/lateAfternoon4.jpg'),
    require('../../../assets/home-bg/lateAfternoon5.jpg'),
  ],
  night: [ // 진짜 밤 (21~05시) — 별·달·자연 야경 (도시 야경 X)
    require('../../../assets/home-bg/night1.jpg'), // 별 + 호수 야경
    require('../../../assets/home-bg/night2.jpg'), // 별 + 나무 실루엣
  ],
};

// 흐림(cloudy) 전용 사진 — 실제 구름 낀 골프장(회색 하늘). 날씨가 흐림이고 낮 시간대면 시간대 사진 대신 사용
//   (톤 오버레이로만 표현하던 것 보강, 사용자 사진 2026-06-14). 밤엔 낮 흐림 사진이 안 어울려 제외. 비(rain)는 사진 없어 톤만(현행).
const CLOUDY_IMAGES = [
  require('../../../assets/home-bg/cloudy1.jpg'),
];

// 날씨별 그라데이션 오버레이 — 위/아래(글씨 영역)는 진하게, 가운데는 옅게.
//  맑음: 초록 다크톤 / 흐림: 회색 (사진 채도·밝기 죽임) / 비: 더 어두운 청회색
const OVERLAYS = {
  clear:  ['rgba(8,24,14,0.86)',  'rgba(8,24,14,0.40)',  'rgba(8,24,14,0.46)',  'rgba(8,24,14,0.74)'],
  cloudy: ['rgba(42,46,50,0.80)', 'rgba(42,46,50,0.42)', 'rgba(42,46,50,0.46)', 'rgba(42,46,50,0.74)'], // 옅게(2026-06-14) — 구름 낀 날 회색이 과해 사진이 묻혀 뿌옇던 것 완화. 가운데를 확 낮춰 사진 비치게, 상·하단만 글씨 가독 위해 유지(clear 수준 곡선)
  rain:   ['rgba(16,24,34,0.95)', 'rgba(16,24,34,0.72)', 'rgba(16,24,34,0.76)', 'rgba(16,24,34,0.91)'],
};

function timeBucket(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 9)  return 'morning';
  if (h >= 9 && h < 16) return 'day';
  if (h >= 16 && h < 21) return 'lateAfternoon'; // 황혼·노을 21시까지
  return 'night';                                 // 21~05 진짜 밤
}

function pickFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickImage() {
  return pickFrom(TIME_IMAGES[timeBucket()] || TIME_IMAGES.day);
}

// 현재 날씨 (30분 캐시) — 위치 권한 없으면 맑음.
// 반환: { weather: clear|cloudy|rain|wind, icon: 이모지 }
// 홈 배경 톤(weather) + 홈 헤더 이모지(icon)가 같은 캐시를 공유하고,
// 날씨 상세 팝업이 새로 받은 값(cacheCurrentWx)으로 갱신해 둘이 항상 일치한다.
const WX_KEY = '@dg_bg_currentwx_v3';
const WX_TTL = 30 * 60 * 1000;
const WX_FALLBACK = { weather: 'clear', icon: '☀️' };

export async function getCurrentWx() {
  try {
    const raw = await AsyncStorage.getItem(WX_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && Date.now() - c.ts < WX_TTL) return { weather: c.weather, icon: c.icon || '☀️' };
    }
  } catch {}
  try {
    const loc = await getCurrentLocation();
    if (!loc) return WX_FALLBACK;
    const f = await getShortForecast(loc.lat, loc.lng);
    const weather = classifyWeather(f?.current); // clear | cloudy | rain | wind
    const icon = f?.current?.icon || '☀️';        // 상세탭과 동일한 skyToIcon 결과
    AsyncStorage.setItem(WX_KEY, JSON.stringify({ weather, icon, ts: Date.now() })).catch(() => {});
    return { weather, icon };
  } catch (e) {
    return WX_FALLBACK;
  }
}

// 배경 톤 등 분류 문자열만 필요할 때 (하위호환)
export async function getCurrentWxClass() {
  return (await getCurrentWx()).weather;
}

// 날씨 상세 팝업이 '현재 위치'로 새로 받은 forecast.current를 홈 공유 캐시에 반영 —
// 팝업을 닫고 홈으로 돌아오면 헤더 이모지·배경 톤이 방금 본 값과 일치한다.
export function cacheCurrentWx(current) {
  if (!current) return;
  const payload = { weather: classifyWeather(current), icon: current.icon || '☀️', ts: Date.now() };
  AsyncStorage.setItem(WX_KEY, JSON.stringify(payload)).catch(() => {});
}

export function HomeBgSlider() {
  const [imageUri, setImageUri] = useState(pickImage);
  const [weather, setWeather] = useState('clear');
  // 현재 표시 사진의 '카테고리'(시간대 morning/day/lateAfternoon/night 또는 흐림 'cloudy') — 같은 카테고리면 사진 유지.
  // (매 포그라운드 복귀마다 랜덤 재추출하면 안드 <Image> 크로스페이드로 두 사진이 겹쳐 보임)
  const catRef = useRef(timeBucket());

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const b = timeBucket();
      const w = await getCurrentWxClass();
      if (cancelled) return;
      const tone = w === 'rain' ? 'rain' : w === 'cloudy' ? 'cloudy' : 'clear';
      setWeather(tone);
      // 흐림이고 낮 시간대면 실제 흐림 사진, 아니면 시간대 사진. 카테고리(시간대/흐림)가 바뀔 때만 교체(깜빡임 제거)
      const useCloudy = tone === 'cloudy' && b !== 'night';
      const cat = useCloudy ? 'cloudy' : b;
      if (cat !== catRef.current) {
        catRef.current = cat;
        setImageUri(useCloudy ? pickFrom(CLOUDY_IMAGES) : pickFrom(TIME_IMAGES[b] || TIME_IMAGES.day));
      }
    };
    refresh();
    // 앱이 포그라운드로 돌아올 때마다 — 현재 시간대·날씨로 갱신
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => { cancelled = true; sub.remove(); };
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Image source={imageUri} fadeDuration={0} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <LinearGradient
        style={StyleSheet.absoluteFillObject}
        colors={OVERLAYS[weather] || OVERLAYS.clear}
        locations={[0, 0.34, 0.6, 1]}
      />
    </View>
  );
}
