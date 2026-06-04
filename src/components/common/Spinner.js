import React, { useEffect, useRef } from 'react';
import { Animated, View, Easing } from 'react-native';
import { C } from '../../constants/colors';

// 크로스플랫폼 로딩 스피너 — RN 기본 ActivityIndicator는 iOS=방사형 막대, 안드=머티리얼 원호로
//   플랫폼마다 모양이 달라 보인다. 이건 양쪽 동일하게 'iOS풍 방사형 막대 12개'를 회전시킨다(2026-06-04).
//   useNativeDriver 회전이라 부드럽고 가볍다. size·color만 받음(기본 팔레스카이).
const BARS = 12;

export function Spinner({ size = 28, color = C.paleSky, style }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const barW = Math.max(2, Math.round(size * 0.09));
  const barH = Math.round(size * 0.28);
  const barRadius = barW / 2;

  return (
    <Animated.View style={[{ width: size, height: size, transform: [{ rotate }] }, style]}>
      {Array.from({ length: BARS }).map((_, i) => (
        // 각 막대를 size×size 래퍼에 담아 통째로 회전 → 컨테이너 중심을 축으로 막대가 방사형으로 배치됨.
        <View
          key={i}
          style={{
            position: 'absolute', width: size, height: size, alignItems: 'center',
            transform: [{ rotate: `${(360 / BARS) * i}deg` }],
          }}>
          <View style={{ width: barW, height: barH, borderRadius: barRadius, backgroundColor: color, opacity: (i + 1) / BARS }} />
        </View>
      ))}
    </Animated.View>
  );
}
