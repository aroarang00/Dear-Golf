import React from 'react';
import { View, Text } from 'react-native';
import { C, F, fs } from '../../constants/colors';
import { Spinner } from './Spinner';

// 데이터 로딩 중 표시 — 친구·친구상세·라운지·MY 첫 로드 시 빈 화면 깜빡임 방지([[home-empty-state-flash]]).
//   팔레스카이(소프트·온브랜드) 작은 스피너 + '로딩중'. 크림 배경에서 버터는 안 보여 팔레스카이로 확정(2026-06-04).
export function LoadingState({ style, label = '로딩중' }) {
  return (
    <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 56 }, style]}>
      <Spinner size={30} color={C.paleSky} />
      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 12 }}>{label}</Text>
    </View>
  );
}
