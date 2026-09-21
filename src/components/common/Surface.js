import React, { useRef } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// 카드 입체감 공용 부품(2026-09-21, 사용자 "디데이 카드·피드가 더 입체적으로 보이는 방법")
//  · SurfaceLight — 카드 표면에 '빛': 위쪽 살짝 밝고 아래로 어두워지는 그라데이션 + 맨 위 1px 밝은 선 + 맨 아래 2px 어두운 선.
//    평평한 종이가 '두께 있는 판'으로 읽힌다. 카드의 첫 자식으로 넣는다(내용 아래 깔림). 자기 radius로 스스로 클립하므로
//    부모에 overflow:hidden이 없어도(그림자 있는 카드) 모서리 밖으로 안 샌다.
//    tone: 'light'(크림·흰 카드) / 'dark'(네이비·검정 카드 — 위쪽 흰빛 조금, 아래 검은 그늘 조금).
//  · PressScale — 누르는 동안 0.98로 살짝 눌렸다 놓으면 돌아오는 카드(눈이 아니라 손으로 느끼는 입체감).
//    TouchableOpacity 자리에 그대로 쓴다(onPress·disabled·style 동일). style은 안쪽 Animated.View에 간다.
export function SurfaceLight({ radius = 16, tone = 'light' }) {
  const dark = tone === 'dark';
  const colors = dark
    ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.16)']
    : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)', 'rgba(61,57,53,0.07)'];
  const inset = Math.round(radius * 0.6);   // 모서리 곡선 안쪽에서 선이 끝나게
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <LinearGradient colors={colors} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', top: 0, left: inset, right: inset, height: 1, backgroundColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)' }} />
      <View style={{ position: 'absolute', bottom: 0, left: inset, right: inset, height: 2, backgroundColor: dark ? 'rgba(0,0,0,0.28)' : 'rgba(61,57,53,0.13)' }} />
    </View>
  );
}

export function PressScale({ onPress, onLongPress, disabled, style, children, activeScale = 0.98, hitSlop, delayLongPress }) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (x) => Animated.spring(v, { toValue: x, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} hitSlop={hitSlop} delayLongPress={delayLongPress}
      onPressIn={() => to(activeScale)} onPressOut={() => to(1)}>
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
