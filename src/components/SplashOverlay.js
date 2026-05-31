import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, ActivityIndicator } from 'react-native';
import { C, F, fs } from '../constants/colors';

// 로딩 화면 내용 — 온보딩 첫 화면(OnboardingIntro 1장)과 동일한 브랜드 화면.
// 정적 로딩 화면(App.js)과 SplashOverlay가 공용으로 쓴다 — 로딩→온보딩 전환을 이음새 없이.
export function SplashContent() {
  return (
    <>
      {/* italic Lora 워드마크 — 폰트 로드 전엔 시스템 폰트 fallback이라 폭 더 큼 → 부모 View width 명시 + adjustsFontSizeToFit로 자동 축소
          lineHeight 명시는 adjustsFontSizeToFit과 충돌해 제거. allowFontScaling false로 'f' 디센더 잘림 방지.
          색은 charcoal(#3D3935)보다 더 진한 #1A1A1A + 미세한 textShadow로 무게감 강화. paleSky 배경 위에서 또렷하게. */}
      <View style={{ width: '88%', maxWidth: 420, alignItems: 'center', paddingVertical: 8 }}>
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
          style={{
            fontFamily: F.brand, fontSize: fs(44), color: '#1A1A1A', textAlign: 'center',
            textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0,
          }}>
          Dear Golf
        </Text>
      </View>
      <View style={{ width: 52, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginVertical: 20 }} />
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: '#1A3D52', letterSpacing: 0.5, textAlign: 'center', lineHeight: 24 }}>
        라운딩의 모든 순간을{'\n'}더 특별하게
      </Text>
      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(26,61,82,0.6)', marginTop: 12, textAlign: 'center', lineHeight: 20 }}>
        좋은 동반자, 그날의 기록까지
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
