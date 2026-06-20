import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { F, fs } from '../constants/colors';

// =============================================================
// 전역 토스트 — 차단형 AppAlert 대신 '~했어요' 같은 순수 성공 알림을 잠깐 띄우고 자동으로 사라짐.
//   "확인 눌러 닫기" 마찰 제거가 목적(성공 알림 한정 — 에러·확인창·중요 안내는 AppAlert 유지).
//   사용법: showToast('초대를 보냈어요')  — 어디서나 호출.
//   AppToastHost 를 앱 루트에 한 번 렌더(AppAlertHost 와 동일 호스트 패턴).
// =============================================================

let _host = null;

export function showToast(message, opts = {}) {
  if (_host && message) _host({ message: String(message), duration: opts.duration || 2200 });
}

export function AppToastHost() {
  const [data, setData] = useState(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef(null);

  const push = useCallback((d) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setData(d);
  }, []);

  useEffect(() => {
    _host = push;
    return () => { if (_host === push) _host = null; };
  }, [push]);

  useEffect(() => {
    if (!data) return undefined;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setData(null); });
    }, data.duration);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [data, opacity]);

  if (!data) return null;
  // pointerEvents="none" — 토스트가 떠 있어도 뒤 화면 터치를 막지 않음(비차단).
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.pill, { opacity }]}>
        <Text style={styles.text} numberOfLines={2}>{data.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 108, alignItems: 'center', paddingHorizontal: 32 },
  pill: {
    backgroundColor: 'rgba(45,42,38,0.96)', borderRadius: 22,
    paddingVertical: 11, paddingHorizontal: 20, maxWidth: 360,
  },
  text: { fontFamily: F.sysM, fontSize: fs(13), color: '#fff', textAlign: 'center', lineHeight: 19 },
});
