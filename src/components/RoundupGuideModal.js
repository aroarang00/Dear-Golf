import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
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
    body: '정원이 찬 모집은 대기 신청할 수 있어요. 취소자가 생기면 알림을 받고, 정해진 시간 안에 응답하면 합류돼요. 대기 취소는 패널티가 없어요.',
  },
  {
    icon: '🤝', title: '취소 · 노쇼',
    body: '함께하는 골프, 서로의 시간을 존중해요.\n\n• 라운딩 7일 이전: 자유롭게 취소할 수 있어요\n• 라운딩 7일 이내: 시스템적으로 취소가 막혀요. 못 가는 사정이 생기면 댓글로 양해를 구해주세요.\n  주최자는 우천·천재지변 같은 사유로 모집을 취소할 수 있어요.\n  골프장 위약금은 본인 부담이에요 (Dear Golf는 정산에 관여하지 않아요).\n\n⚠️ 노쇼는 가장 큰 문제예요\n티오프 시각이 지나도록 사전 안내 없이 나타나지 않으면 노쇼로 신고받을 수 있어요.\n• 노쇼 확정 시: 60일 모집·참여 정지 + 매너 등급 큰 폭 하락\n• 2회 누적 시: 영구 정지 (12개월 시점 카운트 자동 -1)\n\n신고가 접수되면 7일 동안 당사자끼리 해결할 시간이 있어요. 신고자가 자율 취소하면 종결되고, 7일이 지나면 자동 확정되어 48시간 안에 소명을 제출할 수 있어요. 소명이 명확하면 신고자가 오히려 허위신고 패널티(90일 정지)를 받아요.',
  },
  {
    icon: '😊', title: '매너 등급',
    body: '4단계로 표시돼요 — 매너왕 / 좋음 / 보통 (신규 시작) / 주의.\n정확한 점수는 시스템에서만 관리하고, 사용자에게는 등급 라벨로만 보여요. 다른 사용자의 매너 평가가 누적되면 등급이 천천히 변해요.',
  },
  {
    icon: '🛡️', title: '신뢰 등급',
    body: '라운딩을 정상 완료한 횟수가 쌓이면 신뢰 등급이 올라가요 (브론즈 → 실버 → 골드 → 챔피언 → 레전드). 골드부터는 매너 등급 "좋음" 이상, 레전드는 "매너왕" 조건도 함께 필요해요.\n노쇼 확정으로 매너 등급이 떨어지면 신뢰 등급도 함께 강등될 수 있어요.',
  },
  {
    icon: '💬', title: '단톡방',
    body: '친구공개·친구지정 모집에서만 주최자가 [단톡방 안내하기] 버튼으로 카카오톡 단톡방을 만들 수 있어요. 전체공개 모집은 댓글로만 소통해요 (모르는 사이엔 단톡방이 부담스러우니까).',
  },
  {
    icon: '🚨', title: '신고 · 차단',
    body: '심각한 비매너·허위 프로필·욕설·사기·노쇼는 마이페이지 → 신고하기에서 디어골프 팀에 신고할 수 있어요.\n• 비매너·허위프로필·욕설·사기: 7일 검토 후 확정 시 양방향 차단\n• 노쇼: 신고 접수 후 7일 동안 당사자끼리 해결할 시간이 있어요. 7일 안에 신고자가 취소하면 종결되고, 7일이 지나면 피신고자가 48시간 안에 소명을 제출해요.\n\n가볍게 안 보고 싶을 때는 차단으로 충분해요. 차단·삭제는 상대에게 알림이 가지 않아요.',
  },
  {
    icon: '🎯', title: '맞춤 모집',
    body: '🎯 버튼으로 관심 지역·요일·기간·동반자 조건을 저장하면, 조건에 맞는 모집을 라운지에서 모아 볼 수 있어요.',
  },
  {
    icon: '🛡️', title: '책임 안내',
    body: 'Dear Golf는 동반자 매칭을 돕는 \'장(場)\' 역할만 해요. 라운딩 중 발생한 사고·금전 분쟁·약속 위반 등에 대해서는 관여하지 않으니 동반자 약속은 신중히 결정해주세요.\n\n• 동반자 평가는 본인의 정직한 의견에 기반해야 해요\n• 비용 정산(그린피·캐디피·위약금 등)은 사용자 간 직접 처리하며, Dear Golf는 정산에 관여하지 않아요\n• 동반자(앱 미사용자) 입력 시 본인 동의 확보는 입력자(주최자) 책임이에요\n• 노쇼 신고 시 제출된 소명 자료의 진위 여부를 Dear Golf가 감정할 의무는 없으며, 제출 자료를 기반으로 합리적으로 판단해요',
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
            <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }}>라운지 이용 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6 }}>
              라운딩 모집이 어떻게 진행되는지 알려드려요.
            </Text>
          </View>
          <ScrollView style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}>
            {SECTIONS.map(s => (
              <View key={s.title} style={{ marginBottom: 18 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <Text style={{ fontSize: fs(15) }}>{s.icon}</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>{s.title}</Text>
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, lineHeight: 20 }}>{s.body}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} activeOpacity={0.85}
            style={{ marginHorizontal: 20, marginTop: 4, backgroundColor: C.charcoal, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
