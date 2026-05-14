import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
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
    (async () => {
      const timeOfDay = classifyTime();
      const weather = await getCurrentWxClass();
      const urls = await fetchBgImages(timeOfDay, weather);
      if (cancelled) return;
      if (urls && urls.length) setImageUri(urls[0]);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,30,16,0.72)' }} />
    </View>
  );
}
