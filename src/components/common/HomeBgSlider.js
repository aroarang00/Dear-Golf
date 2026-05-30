import React, { useState, useEffect } from 'react';
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
  ],
  lateAfternoon: [ // 늦은 오후·황혼 (16~21시) — 골든아워·노을
    require('../../../assets/home-bg/lateAfternoon1.jpg'),
    require('../../../assets/home-bg/lateAfternoon2.jpg'),
    require('../../../assets/home-bg/lateAfternoon3.jpg'),
    require('../../../assets/home-bg/lateAfternoon4.jpg'),
    require('../../../assets/home-bg/lateAfternoon5.jpg'),
  ],
  night: [ // 진짜 밤 (21~05시) — 별·달·자연 야경 (도시 야경 X)
    require('../../../assets/home-bg/night1.jpg'), // 별 + 호수 야경
    require('../../../assets/home-bg/night2.jpg'), // 별 + 나무 실루엣
  ],
};

// 날씨별 그라데이션 오버레이 — 위/아래(글씨 영역)는 진하게, 가운데는 옅게.
//  맑음: 초록 다크톤 / 흐림: 회색 (사진 채도·밝기 죽임) / 비: 더 어두운 청회색
const OVERLAYS = {
  clear:  ['rgba(8,24,14,0.86)',  'rgba(8,24,14,0.40)',  'rgba(8,24,14,0.46)',  'rgba(8,24,14,0.74)'],
  cloudy: ['rgba(42,46,50,0.92)', 'rgba(42,46,50,0.62)', 'rgba(42,46,50,0.66)', 'rgba(42,46,50,0.86)'],
  rain:   ['rgba(16,24,34,0.95)', 'rgba(16,24,34,0.72)', 'rgba(16,24,34,0.76)', 'rgba(16,24,34,0.91)'],
};

function timeBucket(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 9)  return 'morning';
  if (h >= 9 && h < 16) return 'day';
  if (h >= 16 && h < 21) return 'lateAfternoon'; // 황혼·노을 21시까지
  return 'night';                                 // 21~05 진짜 밤
}

function pickImage() {
  const arr = TIME_IMAGES[timeBucket()] || TIME_IMAGES.day;
  return arr[Math.floor(Math.random() * arr.length)];
}

// 현재 날씨 분류 (1시간 캐시) — 위치 권한 없으면 'clear'. 반환: clear|cloudy|rain|wind
// 홈 배경 + 홈 헤더의 날씨 이모지 버튼이 같은 캐시를 공유한다.
const WX_KEY = '@dg_bg_currentwx_v2';
const WX_TTL = 60 * 60 * 1000;
export async function getCurrentWxClass() {
  try {
    const raw = await AsyncStorage.getItem(WX_KEY);
    if (raw) { const c = JSON.parse(raw); if (c && Date.now() - c.ts < WX_TTL) return c.weather; }
  } catch {}
  try {
    const loc = await getCurrentLocation();
    if (!loc) return 'clear';
    const f = await getShortForecast(loc.lat, loc.lng);
    const weather = classifyWeather(f?.current); // clear | cloudy | rain | wind
    AsyncStorage.setItem(WX_KEY, JSON.stringify({ weather, ts: Date.now() })).catch(() => {});
    return weather;
  } catch (e) {
    return 'clear';
  }
}

export function HomeBgSlider() {
  const [imageUri, setImageUri] = useState(pickImage);
  const [weather, setWeather] = useState('clear');

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      setImageUri(pickImage());
      const w = await getCurrentWxClass();
      if (cancelled) return;
      setWeather(w === 'rain' ? 'rain' : w === 'cloudy' ? 'cloudy' : 'clear');
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
      <Image source={imageUri} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <LinearGradient
        style={StyleSheet.absoluteFillObject}
        colors={OVERLAYS[weather] || OVERLAYS.clear}
        locations={[0, 0.34, 0.6, 1]}
      />
    </View>
  );
}
