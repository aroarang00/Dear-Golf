import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// 시간대별 홈 배경 사진 — 직접 검증한 큐레이션 세트.
// (Unsplash 키워드 검색은 "morning"으로 검색해도 노을 사진이 섞여 나와 시간대를 못 맞춤)
const U = (base) => `${base}?w=1080&q=80&auto=format`;
const TIME_IMAGES = {
  // 새벽·이른 아침 (05~09시) — 안개·서리·여명
  dawn: [
    U('https://images.unsplash.com/photo-1725835567442-7f39d9199f8c'),
    U('https://images.unsplash.com/photo-1672871583025-701bdb84b370'),
  ],
  // 낮 (09~17시) — 밝은 햇살·파란 하늘
  day: [
    U('https://images.unsplash.com/photo-1758190153146-a1507e2e000d'),
    U('https://images.unsplash.com/photo-1634140255781-e900c47ecf1f'),
    U('https://images.unsplash.com/photo-1592919505780-303950717480'),
  ],
  // 저녁·밤 (17~05시) — 노을·골든아워·일몰
  evening: [
    U('https://images.unsplash.com/photo-1709525617237-778500c895a8'),
    U('https://images.unsplash.com/photo-1672871583040-42826d4e9ca4'),
    U('https://images.unsplash.com/photo-1629293821758-a0400037edf1'),
  ],
};

// 현재 시각 → 시간대 버킷
function timeBucket(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  return 'evening';
}

// 현재 시간대 사진 중 무작위 1장
function pickImage() {
  const arr = TIME_IMAGES[timeBucket()] || TIME_IMAGES.day;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function HomeBgSlider() {
  const [imageUri, setImageUri] = useState(pickImage);

  useEffect(() => {
    // 앱이 포그라운드로 돌아올 때마다 — 현재 시간대에 맞춰 배경 갱신
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setImageUri(pickImage());
    });
    return () => sub.remove();
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
