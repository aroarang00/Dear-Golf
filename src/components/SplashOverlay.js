import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, ActivityIndicator } from 'react-native';
import { C, F, fs } from '../constants/colors';

// 로딩 화면 내용 — 온보딩 첫 화면(OnboardingIntro 1장)과 동일한 브랜드 화면.
// 정적 로딩 화면(App.js)과 SplashOverlay가 공용으로 쓴다 — 로딩→온보딩 전환을 이음새 없이.
export function SplashContent() {
  return (
    <>
      {/* italic Lora 워드마크 — lineHeight 명시 + allowFontScaling false로 'f' 디센더 잘림 방지 (iOS 시스템 텍스트 크기 최대 환경 대응) */}
      <Text allowFontScaling={false}
        style={{ fontFamily: F.brand, fontSize: fs(44), lineHeight: fs(56), color: C.charcoal, paddingHorizontal: 14 }}>
        Dear Golf
      </Text>
      <View style={{ width: 52, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginVertical: 20 }} />
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: '#1A3D52', letterSpacing: 1 }}>나만의 골프 캐디</Text>
      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(26,61,82,0.6)', marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
        혼자서도, 함께서도{'\n'}골프 라이프를 한 곳에서
      </Text>
      <ActivityIndicator size="small" color={C.burgundy} style={{ marginTop: 24 }} />
    </>
  );
}

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
      <SplashContent />
    </Animated.View>
  );
}
