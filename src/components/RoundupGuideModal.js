import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { mS } from '../styles/mS';

// 라운지 이용 안내 — 헤더 ℹ️ 버튼으로 열림. 친구모집/친구지정/맞춤모집 중심 ([[roundup-friend-redesign]]).
// 전체공개·신뢰등급·매너평가·노쇼제재 등은 친구모집 비대상이라 제외.
// 줄바꿈은 구절 단위로 직접 정리(자동 줄바꿈 의존 X, [[feedback_copy_line_breaks]]).
// accent — 섹션별 아이콘 칩 배경(라운지 시그니처 파스텔). 카드형 레이아웃으로 가독성·완성도↑.
const SECTIONS = [
  {
    icon: '🤝', accent: '#D6E0EC', title: '신뢰로 모이는 라운지',
    body: '라운지의 모든 모집은\n서로 아는 사이에서 시작돼요.\n\n모집 주최자는 언제나 내 친구예요.\n모르는 사람의 모집은 보이지 않아요.\n\n따로 검증할 필요 없이,\n친구라는 신뢰로 모임이 운영돼요.\nDear Golf는 모임의 장(場) 역할만 해요.',
  },
  {
    icon: '📋', accent: '#D8E5C8', title: '모집 종류 · 공개 범위',
    body: '— 종류 —\n확정형 : 코스·날짜·시간이 정해진 모집\n오픈형 : 장소·날짜를 함께 정해가는 모집\n\n— 공개 범위 —\n친구공개 : 내 친구 모두에게 보여요\n친구지정 : 특정 친구만 지정(또는 제외)\n지정된 친구에게만 보이고,\n다른 사람은 알 수 없어요.\n\n친구 그룹(가까운 친구·라운딩 멤버 등)으로\n한 번에 지정할 수도 있어요.\n그룹·별명은 나만 보여요.',
  },
  {
    icon: '✋', accent: '#F3E8C0', title: '참여 · 확정',
    body: '친구 모집은 참여하면 바로 확정돼요\n(별도 수락 절차 없이).\n\n주최자가 [확정]을 누르는 순간,\n참여자 모두의 일정에 자동 등록돼요.\n확정 전까지는 등록되지 않으니,\n인원이 모이면 확정해주세요.\n\n오픈형은 댓글로 장소·시간을 맞춘 뒤\n확정하면 돼요.\n\n정원이 차면 대기 신청할 수 있고,\n자리가 나면 알림을 받아요.\n\n단체(여러 팀) 모집은 조를 나누지 않고\n참여자 전원을 명단으로 보여드려요.\n조 편성은 댓글로 자유롭게 정해요.',
  },
  {
    icon: '⛳', accent: '#D5E3D8', title: '핸디 표시',
    body: '참여자·주최자 이름 옆 \'핸디\'는\n그 사람의 평소 스코어를 보여줘요.\n\n핸디 = 최근 20라운드 중 베스트 5개 평균\n전체 평균이 아니라 최근 20라운드에서\n가장 잘 친 5개로 계산해요.\n그래서 안 좋은 날을 기록해도\n핸디가 잘 오르지 않아요.\n\n라운딩 기록이 5개 이하면\n본인이 입력한 평균타로 표시돼요.\n기록도 입력값도 없으면\n핸디는 보이지 않아요.\n\n실력을 겨루기 위한 게 아니라,\n비슷한 페이스의 동반자를\n가늠하는 참고예요.',
  },
  {
    icon: '💌', accent: '#EBD3D9', title: '친구 초대장',
    body: '친구를 지정해 모집하면\n초대장 카드로 전해져요.\n\n격식 : 클래식한 다크 카드\n편안 : 보딩패스 느낌의 가벼운 카드\n\n초대받은 친구가 카드에서\n[함께해요]를 누르면 참여로 이어져요.',
  },
  {
    icon: '💬', accent: '#C8D9E6', title: '댓글',
    body: '모집 댓글은\n참여가 확정된 동반자만\n쓰고 볼 수 있어요.\n\n라운딩 전 장소·시간·준비물을\n편하게 맞춰보세요.\n\n라운딩이 끝날 무렵까지 소통할 수 있고,\n이후에는 읽기만 가능해요.',
  },
  {
    icon: '🎯', accent: '#D9C8E0', title: '맞춤 모집 알림',
    body: '🎯 버튼으로 시간대\n(주중·주말 × 1·2·3부)와 기간을 저장하면,\n조건에 맞는 친구 모집을\n라운지에서 모아 보여드려요.\n\n직접 주최가 부담스럽다면,\n마음 맞는 모집을 찾아 참여하는\n방식이 잘 맞아요.',
  },
  {
    icon: '🔄', accent: '#CFE6DA', title: '라운지 활용 팁',
    body: '• 당겨서 새로고침\n  화면을 아래로 당기면\n  새 모집을 불러와요.\n\n• 관심 저장\n  카드의 ☆를 누르면\n  관심 목록에 모아둘 수 있어요.\n\n• 카드 가리기\n  안 보고 싶은 모집은\n  카드를 길게 눌러 숨길 수 있어요.\n  한 번 가리면 복구되지 않으니\n  신중히 눌러주세요.',
  },
  {
    icon: '✨', accent: '#F6EBC8', title: '함께하면 더 편한 기능',
    body: '라운지로 모인 라운딩은\n기록까지 편하게 이어져요.\n\n• 동반자 자동 입력\n  확정된 동반자가\n  라운딩 기록에 자동으로 채워져요.\n\n• 스코어 한 번에\n  라운딩 후 동반자 한 명이\n  스코어카드를 공유하면,\n  그중 내 점수만 골라\n  내 기록으로 바로 등록할 수 있어요.',
  },
  {
    icon: '🤝', accent: '#ECD9C5', title: '취소 · 노쇼는 배려로',
    body: '친구끼리의 약속이라\n시스템 패널티는 없어요.\n대신 서로의 시간을 아끼는\n마음이 중요해요.\n\n• 사정이 생기면\n  댓글로 미리 알려주세요.\n• 골프장 위약금은 본인 부담이에요.\n  (Dear Golf는 정산에 관여하지 않아요.)\n• 약속 없이 안 나타나는 노쇼는\n  친구 사이 신뢰를 해쳐요.\n  부득이하면 꼭 미리 연락 주세요.',
  },
  {
    icon: '🚫', accent: '#F0D9DD', title: '차단',
    body: '불편한 사람은 차단할 수 있어요.\n친구가 아닌 사람\n(같이 참여한 주최자의 친구 등)은\n라운지에서 이름을 탭해\n바로 차단할 수 있어요.\n\n차단하면\n서로의 모집글이 보이지 않고,\n진행 중인 참여·신청도 자동 정리돼요.\n친구였다면 친구 관계도 해지돼요.\n\n차단은 마이페이지에서\n언제든 해제할 수 있어요.\n(해지된 친구 관계는\n자동으로 복원되지 않아요.)\n\n차단 사실은 상대에게 알리지 않아요.',
  },
  {
    icon: '🛡️', accent: '#E2DED4', title: '책임 안내',
    body: 'Dear Golf는 동반자 매칭을 돕는\n장(場) 역할만 해요.\n\n라운딩 중 사고·금전 분쟁·약속 위반에는\n직접 관여할 수 없으니,\n약속은 충분히 살펴보고 결정해주세요.\n\n• 비용 정산(그린피·캐디피·위약금)은\n  동반자끼리 직접 처리해요.\n• 불편하거나 부적절한 행동은\n  마이페이지 → 신고하기로\n  알려주실 수 있어요.',
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

          {/* 헤더 — 네이비 미니 히어로 (고정) */}
          <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: C.navy, borderRadius: 16,
            paddingHorizontal: 18, paddingVertical: 16 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: 'rgba(245,230,168,0.7)', letterSpacing: 2, marginBottom: 7 }}>
              DEAR GOLF · 라운지
            </Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.butter }}>라운지 이용 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(250,246,236,0.82)', marginTop: 6, lineHeight: 18 }}>
              친구와 함께하는 라운딩 모집,{'\n'}이렇게 진행돼요.
            </Text>
          </View>

          <ScrollView style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}>
            {SECTIONS.map(s => (
              <View key={s.title} style={{ backgroundColor: C.bgSecondary, borderRadius: 16,
                borderWidth: 0.5, borderColor: C.hairline, padding: 16, marginBottom: 11 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: s.accent,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: fs(17) }}>{s.icon}</Text>
                  </View>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, flex: 1 }}>{s.title}</Text>
                </View>
                {/* 줄 단위 Text — 긴 멀티라인에서 iOS가 마지막 줄을 못 그리는 문제 회피 */}
                {s.body.split('\n').map((line, i) => (
                  <Text key={i} style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 21 }}>
                    {line || ' '}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={onClose} activeOpacity={0.85}
            style={{ marginHorizontal: 16, marginTop: 6, backgroundColor: C.charcoal, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
