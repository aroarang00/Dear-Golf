import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, ActivityIndicator } from 'react-native';
import { C, F } from '../constants/colors';

// 로딩 화면 오버레이 — 콘텐츠 위에 떠 있다가 appReady가 되면 페이드아웃 후 사라진다.
// (조건부 언마운트로 휙 사라지는 대신 부드럽게 전환)
export function SplashOverlay({ appReady }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!appReady) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 450,
      useNativeDriver: true,
    }).start(() => setGone(true));
  }, [appReady]);

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={appReady ? 'none' : 'auto'}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.paleSky, opacity,
      }}>
      <Text style={{ fontFamily: F.brand, fontSize: 44, color: C.charcoal, paddingHorizontal: 14 }}>Dear Golf</Text>
      <ActivityIndicator size="small" color={C.burgundy} style={{ marginTop: 24 }} />
    </Animated.View>
  );
}
