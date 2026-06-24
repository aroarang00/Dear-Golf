import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { F } from '../../constants/colors';

// 크루 프로필 — 사진(imageUrl) 있으면 이미지, 없으면 크루 색 배경 + 크루명 이니셜(유저 아바타 폴백과 동일 결).
//   사진 업로드는 2차. 현재는 themeColor + 이니셜 '색깔 이미지'가 기본.
export function CrewAvatar({ name = '', color = '#5E7E42', imageUrl = null, size = 44, radius }) {
  const r = radius != null ? radius : size / 2;
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: r, backgroundColor: color }} contentFit="cover" transition={0} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: Math.round(size * 0.42), color: '#fff' }} allowFontScaling={false}>{(name || '?').charAt(0)}</Text>
    </View>
  );
}
