import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';

const { width: SW } = Dimensions.get('window');

// 4장 스와이프 인트로 — 기능 소개. 완료(시작하기) 시 프로필 입력 온보딩으로 연결
export function OnboardingIntro({ onDone }) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <ScrollView
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}>

        {/* 1 — Dear Golf 인트로 (팔레스카이 배경) */}
        <View style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 44, color: C.charcoal }}>Dear Golf</Text>
          <View style={{ width: 52, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginVertical: 20 }} />
          <Text style={{ fontFamily: F.sys, fontSize: 16, color: '#1A3D52', fontWeight: '600', letterSpacing: 1 }}>나만의 골프 캐디</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: 'rgba(26,61,82,0.6)', marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
            일정부터 기록까지,{'\n'}골프 라이프를 한 곳에서
          </Text>
        </View>

        {/* 2 — 일정·날씨·교통 (버터 상단 배너) */}
        <View style={{ width: SW, backgroundColor: C.bgPrimary }}>
          <View style={{ backgroundColor: C.butter, paddingTop: insets.top + 28, paddingBottom: 26, paddingHorizontal: 36 }}>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 14, color: '#8B7000', letterSpacing: 2 }}>01</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 21, color: C.charcoal, fontWeight: '700', marginTop: 4 }}>일정 · 날씨 · 교통</Text>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 36, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, lineHeight: 21, marginBottom: 22 }}>
              라운딩 일정을 등록하면 D-day 카운트와{'\n'}골프장 날씨·교통을 한눈에 볼 수 있어요.
            </Text>
            {/* 미니 D-day 카드 예시 */}
            <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 16 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 2, marginBottom: 8 }}>예정 라운딩</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '600' }}>제이드팰리스 GC</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 3 }}>5월 24일 토 · 07:30</Text>
                </View>
                <View style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ fontFamily: F.en, fontSize: 16, color: C.butter, fontWeight: '700' }}>D-7</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                <View style={{ backgroundColor: C.paleSky + '55', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#1A3D52' }}>☀ 맑음 22°</Text>
                </View>
                <View style={{ backgroundColor: C.hairline, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGray }}>🚗 1시간 20분</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 3 — 기록·통계 (워밍그레이 상단 배너) */}
        <View style={{ width: SW, backgroundColor: C.bgPrimary }}>
          <View style={{ backgroundColor: C.warmGray, paddingTop: insets.top + 28, paddingBottom: 26, paddingHorizontal: 36 }}>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }}>02</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 21, color: '#fff', fontWeight: '700', marginTop: 4 }}>기록 · 통계</Text>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 36, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, lineHeight: 21, marginBottom: 22 }}>
              라운딩이 끝나면 스코어와 한줄 메모를 남기고{'\n'}코스별 베스트·평균을 확인하세요.
            </Text>
            {/* 미니 라운딩 기록 카드 예시 */}
            <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 16 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>2026.05.24 토</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '600', marginTop: 3 }}>제이드팰리스 GC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <Text style={{ fontFamily: F.en, fontSize: 30, color: C.charcoal, fontWeight: '700' }}>88</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray }}>타 · +16</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.burgundy, paddingLeft: 8, marginTop: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary }}>드라이버가 잘 맞은 날 ⛳</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 4 — 시작 (팔레스카이 배경) */}
        <View style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 44, marginBottom: 14 }}>⛳</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 21, color: C.charcoal, fontWeight: '700' }}>지금 시작해보세요</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: 'rgba(26,61,82,0.65)', marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
            간단한 프로필만 입력하면{'\n'}바로 사용할 수 있어요
          </Text>
          <TouchableOpacity onPress={onDone} activeOpacity={0.85}
            style={{ marginTop: 30, backgroundColor: C.charcoal, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 52 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.butter, fontWeight: '600', letterSpacing: 1 }}>시작하기</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* 하단 스와이프 인디케이터 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 14, paddingBottom: insets.bottom + 14 }}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={{
            width: idx === i ? 22 : 7, height: 7, borderRadius: 4,
            backgroundColor: idx === i ? C.burgundy : C.hairline,
          }} />
        ))}
      </View>
    </View>
  );
}
