import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

// 주목 유도 모션 래퍼 — 버튼·배너에 드롭인.
//   ★검증된 안전 패턴: JS 드라이버(useNativeDriver:false — 리마운트/포커스 복귀 후에도 새 뷰를 따라옴,
//   네이티브 드라이버가 재부착 안 돼 '움직이다 멈춤'나던 문제 회피) + isInteraction:false(터치 인터럽트 방지)
//   + 마운트 시 시작·언마운트 시 정지. LinearGradient를 애니 자식으로 두는 크래시 패턴은 쓰지 않음.
//
//   type: 'pulse'(은은한 맥동 scale) | 'float'(상하·좌우 부유) | 'nudge'(가로로 콕콕 — 베컨, 사이 쉼)
//   entrance: 등장 시 살짝 페이드+업(한 번). axis/distance/duration로 미세조정.
export function AttentionMotion({
  children, type = 'pulse', entrance = false,
  axis = 'x', distance, duration = 1000, style, enabled = true,
}) {
  const v = useRef(new Animated.Value(0)).current;                       // 루프 0↔1
  const intro = useRef(new Animated.Value(entrance ? 0 : 1)).current;    // 등장 0→1

  // 등장(한 번)
  useEffect(() => {
    if (!entrance || !enabled) return;
    Animated.timing(intro, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: false, isInteraction: false }).start();
  }, [entrance, enabled]);

  // 루프 — 마운트 동안 반복(enabled일 때만)
  useEffect(() => {
    if (!enabled) return;
    let anim;
    if (type === 'nudge') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false, isInteraction: false }),
        Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: false, isInteraction: false }),
        Animated.delay(1800),
      ]));
    } else {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false, isInteraction: false }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false, isInteraction: false }),
      ]));
    }
    anim.start();
    return () => anim.stop();
  }, [type, duration, enabled]);

  const tf = [];
  if (enabled && type === 'pulse') {
    tf.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) });
  } else if (enabled && type === 'float') {
    const d = distance != null ? distance : 6;
    tf.push(axis === 'y'
      ? { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -d] }) }
      : { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, -d] }) });
  } else if (enabled && type === 'nudge') {
    const d = distance != null ? distance : 5;
    tf.push({ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, d] }) });
  }
  if (enabled && entrance) tf.push({ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) });

  return (
    <Animated.View style={[style, { transform: tf }, enabled && entrance && { opacity: intro }]}>
      {children}
    </Animated.View>
  );
}
