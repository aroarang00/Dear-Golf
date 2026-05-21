import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { mS } from '../styles/mS';

// 라운지 이용 안내 — 헤더 ℹ️ 버튼으로 열림. 모집 진행 방식을 처음 보는 사람도 알 수 있게.
const SECTIONS = [
  {
    icon: '📋', title: '모집 종류',
    body: '확정형 — 코스·날짜·시간이 정해진 모집\n오픈형 — 날짜·장소를 동반자와 함께 정하는 모집',
  },
  {
    icon: '✋', title: '참여 방법',
    body: '전체공개 모집 — 참여 신청 → 주최자 수락 → 확정. 주최자가 신청자의 신뢰 등급·매너 점수를 보고 수락 여부를 정해요.\n친구공개·친구지정 모집 — 바로 참여가 확정돼요.',
  },
  {
    icon: '⏳', title: '대기',
    body: '정원이 찬 모집은 대기 신청할 수 있어요. 취소자가 생기면 알림을 받고, 정해진 시간 안에 응답하면 합류돼요.',
  },
  {
    icon: '🤝', title: '매너 점수',
    body: '참여를 취소하면 시점에 따라 매너 점수가 차감돼요 (전날 -1 · 당일 -3 · 노쇼 -10). 대기 취소는 차감되지 않아요.',
  },
  {
    icon: '🛡️', title: '신뢰 등급',
    body: '모집을 주최하거나 참석할수록 신뢰 등급이 올라가요. 활동으로 쌓이는 것이라 줄어들지 않아요.',
  },
  {
    icon: '🎯', title: '맞춤 모집',
    body: '🎯 버튼으로 관심 지역·요일·기간·동반자 조건을 저장하면, 조건에 맞는 모집을 라운지에서 모아 볼 수 있어요.',
  },
];

export function RoundupGuideModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={mS.handle} />
          <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 17, fontWeight: '700', color: C.charcoal }}>라운지 이용 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 6 }}>
              라운딩 모집이 어떻게 진행되는지 알려드려요.
            </Text>
          </View>
          <ScrollView style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}>
            {SECTIONS.map(s => (
              <View key={s.title} style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <Text style={{ fontSize: 15 }}>{s.icon}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, fontWeight: '700', color: C.charcoal }}>{s.title}</Text>
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, lineHeight: 20 }}>{s.body}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} activeOpacity={0.85}
            style={{ marginHorizontal: 20, marginTop: 4, backgroundColor: C.charcoal, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.butter, fontWeight: '700' }}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
