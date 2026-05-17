import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getShortForecast } from '../../utils/kma';
import { getCurrentLocation } from '../../utils/location';
import { fetchBgImages, classifyTime, classifyWeather } from '../../utils/unsplash';

// Unsplash 실패 시 fallback 정적 이미지
const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800',
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800',
  'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800',
  'https://images.unsplash.com/photo-1592919505780-303950717480?w=800',
];

// 현재 좌표 + 날씨 캐시 (1시간 TTL) — 슬라이더 전용
const WX_KEY = '@dg_bg_currentwx_v1';
const WX_TTL = 60 * 60 * 1000;
async function getCurrentWxClass() {
  try {
    const raw = await AsyncStorage.getItem(WX_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.ts < WX_TTL) return cached.weather;
    }
  } catch {}
  try {
    const loc = await getCurrentLocation();
    if (!loc) return 'clear';
    const f = await getShortForecast(loc.lat, loc.lng);
    const weather = classifyWeather(f?.current);
    AsyncStorage.setItem(WX_KEY, JSON.stringify({ weather, ts: Date.now() })).catch(() => {});
    return weather;
  } catch (e) {
    console.warn('[bg slider wx]', e?.message);
    return 'clear';
  }
}

export function HomeBgSlider() {
  const [imageUri, setImageUri] = useState(FALLBACK_IMAGES[0]);

  useEffect(() => {
    let cancelled = false;
    // 현재 시간대·날씨에 맞는 배경 로드 — 같은 조합이라도 여러 장 중 무작위로 골라 변화를 줌
    const loadBg = async () => {
      const timeOfDay = classifyTime();
      const weather = await getCurrentWxClass();
      const urls = await fetchBgImages(timeOfDay, weather);
      if (cancelled || !urls || !urls.length) return;
      setImageUri(urls[Math.floor(Math.random() * urls.length)]);
    };
    loadBg();
    // 앱이 포그라운드로 돌아올 때마다 — 시간이 지났으면 그 시간대·날씨에 맞춰 배경 갱신
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadBg();
    });
    return () => { cancelled = true; sub.remove(); };
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      {/* 균일한 어두운 막 대신 그라데이션 — 글씨가 있는 위(헤더)·아래(메모)는 진하게,
          가운데(D-day 카드 영역)는 옅게 해서 배경 사진이 밝게 보이도록 */}
      <LinearGradient
        style={StyleSheet.absoluteFillObject}
        colors={[
          'rgba(8,24,14,0.86)',
          'rgba(8,24,14,0.40)',
          'rgba(8,24,14,0.46)',
          'rgba(8,24,14,0.74)',
        ]}
        locations={[0, 0.34, 0.6, 1]}
      />
    </View>
  );
}
