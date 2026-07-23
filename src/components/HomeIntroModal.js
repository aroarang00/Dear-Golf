// Dear Golf 전체 기능 소개 — 홈 헤더 💡 버튼으로 진입. 풀스크린 스크롤 모달.
// 사용자가 한 영역만 쓰지 않고 올인원 골프 라이프 앱이라는 정체성을 발견하도록.
// 라운지 RoundupIntroModal(네이비)과 시각적 차별 — 차콜 헤더 + 베이지 본문.
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, ImageBackground, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, fs } from '../constants/colors';
import { TripleStripe } from './common/TripleStripe';
import { Icon } from './common/Icon'; // 기능 카드 아이콘 — 유니코드 이모지 → 커스텀 SVG(2026-07-24)

// 헤더 배경 — 사용자 직접 촬영 골프장 사진(번들). day3=가로형 맑은 날 코스 전경이라 가로 헤더에 딱 맞음
//   (세로 day1은 짧은 헤더에 cover하면 하늘만 잘려 부적합, 2026-06-29). 로컬이라 네트워크 없이 즉시·선명.
// 헤더 전용 가로형 사진 — 홈 배경 풀의 day3는 세로로 크롭됐으므로(배경은 세로 화면용) 공유하지 않고
//   가로 원본을 별도 파일로 둔다. 넓은 배너엔 가로 사진이 맞음(2026-07-08 배경 세로크롭 때 분리).
const HEADER_IMG = require('../../assets/home-bg/intro-header.jpg');

// 시각 위주 + 카테고리 컬러로 모던하게. 카드별 다른 액센트 컬러로 시각 리듬감.
// icon = 커스텀 SVG 이름, ic = 아이콘 선 색(tint 톤의 진한 버전). tint = 좌측 박스 배경(옅은 카테고리색).
const FEATURES = [
  { icon: 'calendar',  ic: '#2E5A7A', title: '예정 라운딩 한 번에',        body: '예약 문자·캡처를 AI가 자동입력 · 날씨·교통·캘린더까지', tint: '#D6E4EF' }, // paleSky 톤
  // 기상·출발 알림 — 플랫폼별 동작 차이는 그 기기에 해당하는 안내만(iOS=무음스위치, 안드=시계앱 알람 24시간)
  { icon: 'bell',      ic: '#C2703D', title: '기상·출발 알림',              body: '티오프에 맞춰 일어날 시간·나설 시간을 계산해 알려드려요', tint: '#F4DCC8', // 옅은 코랄
    note: Platform.OS === 'ios'
      ? 'iPhone은 무음 스위치가 켜져 있으면 소리가 안 나요 — 전날 밤 꺼두세요'
      : '기상 알림은 시계 앱 알람으로도 함께 울려요 (라운딩 24시간 안쪽부터)' },
  { icon: 'clubhouse', ic: '#8A6A33', title: '다녀온 골프장 자동 정리',    body: '일정만 등록해도 다녀온 코스가 차곡차곡',   tint: '#FAEDB8' }, // butter 톤
  { icon: 'trophy',    ic: '#6B1E2A', title: '걸어본 코스 한눈에',          body: '100대·해외 라운딩이 자동으로 정리',        tint: '#F0D6D6' }, // 옅은 burgundy
  { icon: 'book',      ic: '#5E7E52', title: '친구 골퍼끼리 기록·사진 공유', body: '스코어카드 사진을 AI가 홀별 자동입력 · 친구와 공유', tint: '#D6E3C8' }, // 옅은 그린
  { icon: 'wallet',    ic: '#8A6A33', title: '골프 가계부',                 body: '영수증·카드문자를 AI가 자동입력 · 비용 한눈에', tint: '#E8D8B0' }, // 옅은 골드
  { icon: 'pin',       ic: '#3A5A78', title: '골프장·맛집 저장',            body: '메모·골퍼 코멘트 한 곳에',                 tint: '#C8D2DE' }, // 옅은 네이비
  { icon: 'people',    ic: '#4A4038', title: '동반자 모집',                 body: '전화·카톡 없이 라운지에서', tint: '#E0D8C8', cta: '자세한 건 라운지에서' }, // 옅은 차콜·베이지
];

export function HomeIntroModal({ visible, onClose, onAddSchedulePress }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (visible) { const t = setTimeout(() => setReady(true), 250); return () => clearTimeout(t); }
    else setReady(false);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 닫기 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13,
            borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginLeft: 12 }}>Dear Golf 이용 안내</Text>
          </View>

          {!ready ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.charcoal} />
            </View>
          ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* 1. 훅 헤더 — 가로형 골프장 사진(day3) 배경 + 다층 그라데이션 오버레이.
                 ★로컬 require 이미지를 absolute <Image>로 깔면 헤더 height(내용 의존)를 못 채우고 아래로 흐름 → ImageBackground로 안정화(2026-06-29). */}
            <ImageBackground source={HEADER_IMG} resizeMode="cover"
              style={{ minHeight: 280, backgroundColor: C.charcoal }}>
              {/* 그라데이션 오버레이 — 밝은 사진 살리기 위해 옅게. 아래는 burgundy 톤으로 텍스트 가독성 확보 */}
              <LinearGradient
                colors={['rgba(0,0,0,0.30)', 'rgba(8,24,14,0.55)', 'rgba(60,30,40,0.82)']}
                locations={[0, 0.55, 1]}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
              {/* 텍스트 */}
              <View style={{ paddingHorizontal: 24, paddingVertical: 42, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.butter, letterSpacing: 3, marginBottom: 14 }}>
                  ALL IN ONE GOLF
                </Text>
                <Text allowFontScaling={false} numberOfLines={1}
                  style={{ fontFamily: F.brand, fontSize: fs(40), lineHeight: fs(52), color: C.butter, paddingHorizontal: 18, includeFontPadding: false,
                    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>
                  Dear Golf
                </Text>
                {/* 워드마크 아래 짧은 시그니처 삼색 선 (헤더 안 미니 액센트) */}
                <View style={{ flexDirection: 'row', width: 60, height: 2, borderRadius: 1, marginVertical: 18, opacity: 0.92, overflow: 'hidden' }}>
                  <View style={{ flex: 1, backgroundColor: C.butter }} />
                  <View style={{ flex: 1, backgroundColor: C.paleSky }} />
                  <View style={{ flex: 1, backgroundColor: C.burgundy }} />
                </View>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(19), color: '#fff', lineHeight: 28, textAlign: 'center',
                  textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                  골프 라이프 전부를{'\n'}한 앱에서
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.85)', lineHeight: 20, textAlign: 'center', marginTop: 12 }}>
                  일정·날씨·기록·가계부·모집까지,{'\n'}예약·스코어·영수증은 AI가 대신 입력해요.
                </Text>
              </View>
              {/* 시그니처 삼색 띠 — 헤더와 본문 경계 (butter·paleSky·burgundy). 사진 어두운 톤·본문 베이지 톤과 섞이지 않게 두껍게 */}
              <TripleStripe height={6} />
            </ImageBackground>

            {/* 2. 비교 안내 — 짧게 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 4 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, lineHeight: 24 }}>
                여러 앱 따로 쓰셨나요?
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 6, lineHeight: 19 }}>
                Dear Golf 하나면 충분해요
              </Text>
            </View>

            {/* 3. 기능별 카드 — 흰 배경 + 그림자 + 카테고리 컬러 박스 (모던 톤, 브랜드 팔레트 내) */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              {FEATURES.map((f, i) => (
                <View key={i} style={{
                  backgroundColor: '#fff', borderRadius: 16,
                  flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 14, gap: 14,
                  // 부드러운 그림자 (iOS + Android)
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
                  elevation: 2,
                }}>
                  {/* 좌측 카테고리 컬러 박스 + 커스텀 아이콘 */}
                  <View style={{ width: 60, height: 60, borderRadius: 16, backgroundColor: f.tint,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={f.icon} size={fs(28)} color={f.ic} strokeWidth={1.8} />
                  </View>
                  {/* 우측 텍스트 — 가독성 우선, 색 진하게 */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, lineHeight: 22 }}>
                      {f.title}
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, marginTop: 3, lineHeight: 19 }}>
                      {f.body}
                    </Text>
                    {f.cta && (
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.burgundy, marginTop: 6 }}>
                        → {f.cta}
                      </Text>
                    )}
                    {f.note && (
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                        {f.note}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* 4. 마무리 CTA — 예정 라운딩 추가로 첫걸음 유도.
                onAddSchedulePress 없이 열리면(마이페이지 재열람) 일정 추가 동선이 없으니 닫기 버튼만. */}
            <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
              {onAddSchedulePress ? (<>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 18, marginBottom: 14 }}>
                  기능을 다 쓰지 않아도 괜찮아요.{'\n'}예정 라운딩 하나만 추가해도 절반은 시작이에요.
                </Text>
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => { onClose(); onAddSchedulePress?.(); }}
                  style={{ backgroundColor: C.charcoal, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>+ 예정 라운딩 추가하기</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7} onPress={onClose}
                  style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>나중에</Text>
                </TouchableOpacity>
              </>) : (
                <TouchableOpacity activeOpacity={0.85} onPress={onClose}
                  style={{ backgroundColor: C.charcoal, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>확인</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
