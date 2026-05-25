// Dear Golf 전체 기능 소개 — 홈 헤더 💡 버튼으로 진입. 풀스크린 스크롤 모달.
// 사용자가 한 영역만 쓰지 않고 올인원 골프 라이프 앱이라는 정체성을 발견하도록.
// 라운지 RoundupIntroModal(네이비)과 시각적 차별 — 차콜 헤더 + 베이지 본문.
import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';

const FEATURES = [
  {
    icon: '🏌️', title: '예정 라운딩, 한 번 입력으로 끝',
    body: '날짜·시간만 넣으면 그 시점의 날씨와 교통 소요시간이 자동으로 정리돼요. 일정에도 자동 등록되고, 원하면 폰 캘린더(구글·애플·삼성)에도 함께 들어가요.',
  },
  {
    icon: '☀️', title: '어디서나 현재 위치 날씨',
    body: '예정 라운딩 시점 날씨뿐 아니라, 지금 내가 있는 곳의 날씨도 홈에서 한 번에. 라운딩 가기 전 컨디션 체크에 좋아요.',
  },
  {
    icon: '📓', title: '잠자던 골프 기록을 깨우다',
    body: 'SNS에 올리기는 부담스럽지만 본인 기록은 남기고 싶은 골퍼를 위해. 사진·스코어·동반자·한 줄 메모(다음에 기억할 것)를 함께 저장해서 언제든 다시 봐요.',
  },
  {
    icon: '💰', title: '골프 가계부',
    body: '그린피·캐디피·이동·식사 비용을 라운딩마다 기록해두면, 월별·코스별로 한눈에 정리돼요. 비싼 취미인 만큼 관리도 함께.',
  },
  {
    icon: '🔒', title: '공개 범위는 내 마음대로',
    body: '친구에게 보여줄 기록은 친구공개, 혼자만 보고 싶은 건 나만보기. 모든 라운딩 기록을 SNS처럼 다 알릴 필요 없어요.',
  },
  {
    icon: '💬', title: '골프장 갈 때 다른 골퍼 후기 미리보기',
    body: '예정 라운딩 골프장의 골퍼 코멘트로 코스 컨디션·맛집·캐디 분위기 등 실제 다녀온 분들의 후기를 확인하고 출발해요.',
  },
  {
    icon: '📌', title: '다녀온 골프장·맛집을 잊지 않게',
    body: '어디 다녀왔는지 어디다 저장했는지 헷갈리는 경험 — 메모와 함께 저장해두면 다음에 페이지만 열면 바로 확인돼요.',
  },
  {
    icon: '⛳', title: '전화·카톡 없이 동반자 모집',
    body: '라운딩 함께할 친구·동반자가 필요할 땐 라운지에서 모집글 한 번에. 친구공개·친구지정·전체공개로 상황에 맞춰 골라요.',
    cta: '자세한 건 라운지의 📢 버튼에서',
  },
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
            {/* 1. 훅 헤더 — 차콜 배경 */}
            <View style={{ backgroundColor: C.charcoal, paddingHorizontal: 24, paddingVertical: 36, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: 'rgba(245,230,168,0.7)', letterSpacing: 2, marginBottom: 12 }}>
                ALL IN ONE GOLF
              </Text>
              <Text allowFontScaling={false}
                style={{ fontFamily: F.brand, fontSize: fs(36), lineHeight: fs(48), color: C.butter, paddingHorizontal: 6 }}>
                Dear Golf
              </Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: '#fff', lineHeight: 26, textAlign: 'center', marginTop: 18 }}>
                골프 라이프 전부를{'\n'}한 앱에서
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.7)', lineHeight: 20, textAlign: 'center', marginTop: 14 }}>
                일정·날씨·기록·가계부·동반자 모집까지,{'\n'}따로 쓰던 앱을 하나로.
              </Text>
            </View>

            {/* 2. 비교 카드 — 기존 vs Dear Golf */}
            <View style={{ paddingHorizontal: 20, paddingTop: 26, paddingBottom: 6 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18 }}>
                날씨 앱·캘린더·노션·SNS·카톡·엑셀 가계부…{'\n'}
                골프 하나에 여러 앱을 쓰고 계셨나요?
              </Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginTop: 14 }}>
                Dear Golf 하나면 충분해요
              </Text>
            </View>

            {/* 3. 기능별 카드 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
              {FEATURES.map((f, i) => (
                <View key={i} style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
                  padding: 16, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: fs(20) }}>{f.icon}</Text>
                    <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, lineHeight: 21 }}>
                      {f.title}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 20 }}>
                    {f.body}
                  </Text>
                  {f.cta && (
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.burgundy, marginTop: 10,
                      paddingTop: 10, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                      → {f.cta}
                    </Text>
                  )}
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
