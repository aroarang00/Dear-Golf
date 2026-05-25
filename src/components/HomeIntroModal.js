// Dear Golf 전체 기능 소개 — 홈 헤더 💡 버튼으로 진입. 풀스크린 스크롤 모달.
// 사용자가 한 영역만 쓰지 않고 올인원 골프 라이프 앱이라는 정체성을 발견하도록.
// 라운지 RoundupIntroModal(네이비)과 시각적 차별 — 차콜 헤더 + 베이지 본문.
import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, fs } from '../constants/colors';
import { TripleStripe } from './common/TripleStripe';

// 헤더 배경 — 밝은 햇살·파란 하늘 골프장 (HomeBgSlider의 day 카테고리, 봄·여름 톤)
const HEADER_BG_URI = 'https://images.unsplash.com/photo-1758190153146-a1507e2e000d?w=1080&q=80&auto=format';

// 시각 위주로 압축 — 큰 이모지 + 한 줄 본문. 카카오VX 스타일 가로 카드.
const FEATURES = [
  { icon: '🏌️', title: '예정 라운딩 한 번에',     body: '날짜만 넣어도 날씨·교통·일정·캘린더 자동' },
  { icon: '☀️',  title: '지금 여기 날씨',        body: '현재 위치 자동, 라운딩 시간 날씨까지' },
  { icon: '📓', title: '잠자던 골프 기록',       body: '사진·스코어·동반자·한 줄 메모 함께' },
  { icon: '💰', title: '골프 가계부',           body: '비싼 취미, 비용 한눈에 정리' },
  { icon: '📌', title: '골프장·맛집 저장',       body: '메모와 함께, 골퍼 코멘트도 한 곳에' },
  { icon: '⛳', title: '동반자 모집',           body: '전화·카톡 없이 라운지에서', cta: '자세한 건 라운지의 📢' },
];

export function HomeIntroModal({ visible, onClose, onAddSchedulePress }) {
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* 1. 훅 헤더 — 골든아워 골프장 사진 + 다층 그라데이션 오버레이 */}
            <View style={{ position: 'relative', minHeight: 280, backgroundColor: C.charcoal }}>
              {/* 배경 사진 — 로딩 실패 시 차콜 배경이 폴백 */}
              <Image
                source={{ uri: HEADER_BG_URI }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                resizeMode="cover"
              />
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
                <Text allowFontScaling={false}
                  style={{ fontFamily: F.brand, fontSize: fs(40), lineHeight: fs(52), color: C.butter, paddingHorizontal: 6,
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
                  일정·날씨·기록·가계부·동반자 모집까지,{'\n'}따로 쓰던 앱을 하나로.
                </Text>
              </View>
              {/* 시그니처 삼색 띠 — 헤더와 본문 경계 (butter·paleSky·burgundy) */}
              <TripleStripe height={3} />
            </View>

            {/* 2. 비교 안내 — 짧게 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 4 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, lineHeight: 24 }}>
                여러 앱 따로 쓰셨나요?
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 6, lineHeight: 19 }}>
                Dear Golf 하나면 충분해요
              </Text>
            </View>

            {/* 3. 기능별 카드 — 큰 이모지 + 짧은 텍스트 (시각 위주) */}
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              {FEATURES.map((f, i) => (
                <View key={i} style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
                  flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 10, gap: 14 }}>
                  {/* 좌측 큰 이모지 */}
                  <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: C.bgPrimary,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: fs(28) }}>{f.icon}</Text>
                  </View>
                  {/* 우측 텍스트 */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, lineHeight: 21 }}>
                      {f.title}
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 2, lineHeight: 17 }}>
                      {f.body}
                    </Text>
                    {f.cta && (
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.burgundy, marginTop: 6 }}>
                        → {f.cta}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* 4. 마무리 CTA — 예정 라운딩 추가로 첫걸음 유도 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
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
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
