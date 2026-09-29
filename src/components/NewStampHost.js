import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { PassportStamp } from './PassportStamp';
import { C, F, fs } from '../constants/colors';

// =============================================================
// 새 도장 연출 — 라운딩 기록을 저장한 순간 처음 밟은 구장이면 도장이 '쾅' 찍힌다 ([[golf-passport]] 2단계, 2026-09-29)
//  왜: 여권이 "켜고 싶은 이유"가 되려면 도장이 찍히는 순간이 눈에 보여야 한다. 조용히 여권 안에서만 늘면 아무도 모른다.
//  사용: showNewStamp({ name, region, ink, ordinal, regionOrdinal, top100Rank, date, onOpenPassport, onClose })
//  ★AppAlert·AppToast와 같은 전역 호스트 패턴 — 어느 탭에 있든(일정에서 기록하고 홈으로 돌아가도) 뜬다.
//  ★Modal이 아니라 루트 절대배치 View — 기록 작성 Modal이 닫히는 중에 새 Modal을 띄우면 iOS가 조용히 거부하는
//    함정([[project_deargolf_modal_unmount_freeze]])을 피한다. 호출부가 작성 모달 닫힘 뒤(≈450ms)에 부른다.
// =============================================================
let _host = null;
export function showNewStamp(info) { if (_host && info?.name) _host(info); }

export function NewStampHost() {
  const [data, setData] = useState(null);
  const scrim = useRef(new Animated.Value(0)).current;
  const stampScale = useRef(new Animated.Value(2.4)).current;
  const stampOpacity = useRef(new Animated.Value(0)).current;
  const stampRotate = useRef(new Animated.Value(-14)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  const push = useCallback((d) => setData(d), []);
  useEffect(() => { _host = push; return () => { if (_host === push) _host = null; }; }, [push]);

  useEffect(() => {
    if (!data) return;
    scrim.setValue(0); stampScale.setValue(2.4); stampOpacity.setValue(0); stampRotate.setValue(-14); textOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(scrim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(120),
      // 도장 '쾅' — 크게 떠 있다가 내려찍히며 살짝 튕김. 회전은 -14°에서 0°로(찍힐 때 손목 도는 느낌).
      Animated.parallel([
        Animated.timing(stampOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.spring(stampScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.timing(stampRotate, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [data]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 닫기 — '여권 보기'(then)면 그리로만 가고, 그냥 닫으면 onClose(호출부가 이어서 라운딩 카드 등을 띄운다).
  const close = (then) => {
    const d = data;
    Animated.timing(scrim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setData(null);
      if (then) then();
      else d?.onClose && d.onClose();
    });
  };

  if (!data) return null;
  const ink = data.ink || C.navy;
  const line = [
    data.region && data.regionOrdinal ? `${data.region} ${data.regionOrdinal}번째` : null,
    data.ordinal ? `전체 ${data.ordinal}번째 도장` : null,
  ].filter(Boolean).join(' · ');
  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9000, elevation: 50,
      backgroundColor: 'rgba(20,26,30,0.66)', alignItems: 'center', justifyContent: 'center', padding: 28, opacity: scrim }}>
      <View style={{ width: '100%', maxWidth: 340, backgroundColor: C.bgPrimary, borderRadius: 22, paddingTop: 22, paddingBottom: 16, paddingHorizontal: 20, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.en, fontSize: fs(11), letterSpacing: 2, color: C.warmGray }}>NEW STAMP</Text>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal, marginTop: 4 }}>새 도장이 찍혔어요</Text>
        <Animated.View style={{ marginTop: 18, opacity: stampOpacity,
          transform: [{ scale: stampScale }, { rotate: stampRotate.interpolate({ inputRange: [-14, 0], outputRange: ['-14deg', '0deg'] }) }] }}>
          <PassportStamp size={156} ink={ink} name={data.name} date={data.date || null} count={0} rank={data.top100Rank ?? null} />
        </Animated.View>
        <Animated.View style={{ alignItems: 'center', marginTop: 16, opacity: textOpacity }}>
          {!!line && <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{line}</Text>}
          {data.top100Rank != null && (
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy, marginTop: 4 }}>100대 구장 No.{data.top100Rank}</Text>
          )}
        </Animated.View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
          <TouchableOpacity onPress={() => close()} activeOpacity={0.85}
            style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>닫기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => close(data.onOpenPassport)} activeOpacity={0.85}
            style={{ flex: 1.4, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: C.charcoal }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>여권 보기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}
