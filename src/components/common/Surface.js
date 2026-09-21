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

// 그림자 두 겹(2026-09-21, 입체감 3단계) — 실제 물체 그림자처럼 '멀리 넓게 퍼지는 연한 그림자(ambient)' +
//   '바로 아래 좁고 진한 그림자(contact)'. iOS는 뷰당 그림자 하나라 바깥/안쪽 뷰에 나눠 준다(둘 다 같은 radius·배경색 필요).
//   안드는 elevation 하나뿐이라 바깥에만(안쪽 0 — 겹치면 이중 그늘). ★overflow:hidden 뷰엔 못 씀(iOS가 그림자까지 자름).
export const LIFT_AMBIENT = { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 8 };
export const LIFT_CONTACT = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 3, elevation: 0 };

// shadow={{ radius, bg }}를 주면 두 겹 그림자 구조(바깥 Animated.View=ambient / 안쪽 View=contact+contentStyle)로 그린다.
//   이때 style엔 폭·마진만, 패딩은 contentStyle로. shadow 없으면 예전처럼 style 하나.
// mode: 'press'(기본) = 누르는 동안 0.98로 눌림 / 'lift' = 누르는 동안 5px 위로 떠오르며 1.01(사용자 2026-09-21 "선택되면 살짝 위로").
//   내부 값 p(0→1)를 스프링으로 움직이고 scale·translateY를 보간 — 네이티브 드라이버.
export function PressScale({ onPress, onLongPress, disabled, style, contentStyle, shadow, children, activeScale = 0.98, mode = 'press', hitSlop, delayLongPress }) {
  const p = useRef(new Animated.Value(0)).current;
  const to = (x) => Animated.spring(p, { toValue: x, useNativeDriver: true, speed: 40, bounciness: mode === 'lift' ? 6 : 0 }).start();
  const scale = p.interpolate({ inputRange: [0, 1], outputRange: [1, mode === 'lift' ? 1.01 : activeScale] });
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [0, mode === 'lift' ? -5 : 0] });
  const anim = { transform: [{ translateY }, { scale }] };
  const body = shadow ? (
    <Animated.View style={[style, { borderRadius: shadow.radius, backgroundColor: shadow.bg }, LIFT_AMBIENT, anim]}>
      <View style={[{ borderRadius: shadow.radius, backgroundColor: shadow.bg }, LIFT_CONTACT, contentStyle]}>{children}</View>
    </Animated.View>
  ) : (
    <Animated.View style={[style, contentStyle, anim]}>{children}</Animated.View>
  );
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} hitSlop={hitSlop} delayLongPress={delayLongPress}
      onPressIn={() => to(1)} onPressOut={() => to(0)}>
      {body}
    </Pressable>
  );
}
