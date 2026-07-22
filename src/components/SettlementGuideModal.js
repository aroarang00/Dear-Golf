import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { mS } from '../styles/mS';

// 모임 정산(걷기) 이용 안내 — 헤더 ? 버튼으로 열림. 라운지 안내(RoundupGuideModal)와 같은 패턴.
// ★총무는 이걸 카톡으로 하던 사람이다. "앱으로 옮기면 뭐가 달라지는지"를 모르면 만들다 만다.
//   그래서 기능 나열이 아니라 지금 겪는 불편 → 앱에서 어떻게 되는지 순서로 적는다.
// 줄바꿈은 구절 단위로 직접 정리(자동 줄바꿈 의존 X, [[feedback_copy_line_breaks]]).
const SECTIONS = [
  {
    icon: '🧾', accent: '#F3E8C0', title: "'걷기'는 한 번에 하나씩",
    body: '한 라운딩에 걷을 돈이 여러 번 생겨요.\n\n선입금 : 라운딩 전에 미리\n  캐디피·참가비를 걷는 것\n식사 정산 : 라운딩 후에\n  먹은 값을 나누는 것\n\n각각 따로 만들어두면\n무엇을 걷는 중인지 헷갈리지 않아요.\n\n그린피·카트비는 각자 결제하니\n여기서는 다루지 않아요.',
  },
  {
    icon: '✍️', accent: '#D8E5C8', title: '걷기 만들기',
    body: '라운딩을 고르면\n구장·날짜·명단이 따라와요.\n\n얼마를 어떻게 걷을지\n말하듯 적으면 돼요.\n\n"1차 복돌이식당 21만, 2차 탑호프 7만"\n"김이사는 술 안 마셔서 빼줘"\n"점심은 3명, 저녁은 전원"\n\n카드 문자나 영수증을 같이 넣으면\n어디서 얼마 썼는지까지 정리해드려요.\n계좌번호가 있으면 계좌칸도 채워져요.\n\n[걷기 시작]을 누르면\n그때 한 번에 계산해요.\n\n★동반자가 앱을 안 써도 괜찮아요.\n  이름만 적으면 끝까지 쓸 수 있어요.',
  },
  {
    icon: '📩', accent: '#C8D9E6', title: '카톡으로 정산서 보내기',
    body: '금액·계좌와 함께\n정산서 링크가 하나 나가요.\n\n앱이 없어도 열리는 링크라\n단톡방에 그대로 올리면 돼요.\n\n건별 내역(어디서 얼마)은\n넣을지 뺄지 고를 수 있어요.\n\n보내기 전에 미리보기로\n실제 문구를 확인할 수 있어요.',
  },
  {
    icon: '✅', accent: '#D5E3D8', title: '참가자가 직접 체크해요',
    body: '지금은 각자 "입금완료"라고 쓰고\n방을 나가야 누가 냈는지 알 수 있죠.\n그 글도 스크롤에 묻히고요.\n\n링크를 열면 자기 이름 옆에\n[보냈어요] 버튼이 있어요.\n누르면 총무 화면에\n바로 \'확인대기\'로 떠요.\n\n총무는 입금이 들어온 사람의\n이름을 탭해 \'✓ 확인\'으로 바꿔요.\n\n앱을 안 깐 사람도 누를 수 있어요.',
  },
  {
    icon: '🔔', accent: '#EBD3D9', title: '독촉은 앱이 대신해요',
    body: '돈 얘기를 먼저 꺼내는 건\n총무가 제일 하기 싫은 일이에요.\n\n[독촉]을 고르면\n아직 안 낸 사람만 골라\n문구를 만들어드려요.\n그대로 보내기만 하면 돼요.\n\n이미 [보냈어요]를 누른 사람은\n독촉에서 빠져요.\n\n"이미 보내셨으면 눌러주세요"\n한 줄이 같이 나가서,\n엇갈린 입금도 링크에서 정리돼요.',
  },
  {
    icon: '🧮', accent: '#F6EBC8', title: '금액은 100원 단위로 올려요',
    body: '따로 적지 않으면\n인원수대로 나눈 뒤\n100원 단위로 올림해요.\n\n버리면 모자란 돈을\n총무가 떠안게 되거든요.\n\n올림으로 남는 잔돈은\n정산서에 그대로 표시돼요.\n(실비 281,072원 · 528원 남음)\n\n버리고 싶으면\n"100원 절사"라고 적으면 돼요.\n\n만든 뒤에도 [수정]에서\n내역·사람별 금액을 고칠 수 있어요.',
  },
  {
    icon: '📦', accent: '#E2DED4', title: '끝나면 보관',
    body: '다 걷은 걷기는 [보관]으로\n목록에서 치울 수 있어요.\n\n지우는 게 아니라 넣어두는 거예요.\n"작년에 얼마 걷었지"를\n나중에 다시 볼 수 있어요.\n\n[삭제]도 있지만\n한 번 지우면 되살릴 수 없어요.',
  },
];

export function SettlementGuideModal({ visible, onClose }) {
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
              DEAR GOLF · 모임 정산
            </Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.butter }}>모임 정산 안내</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(250,246,236,0.82)', marginTop: 6, lineHeight: 18 }}>
              총무가 걷고,{'\n'}참가자가 스스로 체크해요.
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
