// 크루(친구 소수 그룹 공유 앨범) 소개 — 크루 목록 헤더의 책(가이드) 버튼으로 진입 + 첫 진입 1회 자동.
//   라운지 소개(RoundupIntroModal)와 같은 풀스크린 스크롤 패턴. 아이콘은 공용 Icon(우리 아이콘)으로 통일.
import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';

const SAGE_DEEP = '#5E7E42';                  // 크루 아이덴티티(진한 세이지) — 홈/목록 진입 아이콘과 동색
const SAGE_SOFT = 'rgba(143,176,107,0.12)';   // 아이콘 칩·강조 카드 배경
const SAGE_BORDER = 'rgba(94,126,66,0.25)';

// 핵심 흐름 — 만들기 → 초대 → 올리기 → 반응 → 새 글 신호
const STEPS = [
  { icon: 'crew',       title: '크루 만들기',  desc: '이름을 정하고 함께할 친구를 초대해요.' },
  { icon: 'personAdd',  title: '초대',         desc: '친구 목록에서 멤버를 골라요. 초대받은 친구가 수락하면 합류해요.' },
  { icon: 'camera',     title: '함께 올리기',  desc: '라운딩 사진·영상·이야기를 공유 앨범에 남겨요.' },
  { icon: 'heartFilled', title: '반응',        desc: '좋아요와 댓글로 서로의 글에 반응해요.' },
  { icon: 'bell',       title: '새 글 신호',   desc: '새 글이 올라오면 홈 크루 아이콘에 표시돼요.' },
];

// 소소한 편의 — 순서는 기기 로컬, 이름·음소거는 크루 설정에서
const TIPS = [
  { icon: 'swipe',   title: '순서 바꾸기',    desc: '목록을 길게 눌러 드래그로 정렬해요.' },
  { icon: 'pen',     title: '나만 보는 이름', desc: '크루 설정에서 멤버를 내게만 보이는 이름으로 바꿔요.' },
  { icon: 'bellOff', title: '음소거',         desc: '크루 설정에서 크루별 새 글 알림을 꺼요.' },
];

function IconRow({ icon, title, desc, last }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingVertical: 11,
      borderBottomWidth: last ? 0 : 0.5, borderBottomColor: C.hairline }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: SAGE_SOFT,
        alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={fs(20)} color={SAGE_DEEP} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>{title}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, lineHeight: 18, marginTop: 2 }}>{desc}</Text>
      </View>
    </View>
  );
}

export function CrewIntroModal({ visible, onClose, onCreatePress }) {
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
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginLeft: 12 }}>크루 소개</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* 1. 훅 헤더 — 세이지 */}
            <View style={{ backgroundColor: SAGE_DEEP, paddingHorizontal: 24, paddingVertical: 34, alignItems: 'center' }}>
              <Icon name="crew" size={fs(42)} color="#fff" strokeWidth={1.8} />
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.72)', letterSpacing: 2, marginTop: 12, marginBottom: 10 }}>
                DEAR GOLF · 크루
              </Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(21), color: '#fff', lineHeight: 31, textAlign: 'center' }}>
                마음 맞는 친구들과{'\n'}우리만의 골프 공간
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.82)', lineHeight: 20, textAlign: 'center', marginTop: 12 }}>
                사진도, 이야기도 한곳에.{'\n'}초대한 멤버만 볼 수 있어요.
              </Text>
            </View>

            {/* 2. 크루가 뭐예요? */}
            <View style={{ paddingHorizontal: 20, paddingTop: 26 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginBottom: 8 }}>크루가 뭐예요?</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13.5), color: C.textSecondary, lineHeight: 21 }}>
                크루는 친한 친구 몇 명과 함께 쓰는 비공개 골프 앨범이에요. 라운딩 사진·영상·이야기를 우리끼리만 나눠요.
              </Text>
            </View>

            {/* 3. 이렇게 써요 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginBottom: 12 }}>이렇게 써요</Text>
              {STEPS.map((s, i) => <IconRow key={s.title} {...s} last={i === STEPS.length - 1} />)}
            </View>

            {/* 4. 비공개 강조 카드 */}
            <View style={{ marginHorizontal: 20, marginTop: 28, backgroundColor: SAGE_SOFT, borderRadius: 14,
              borderWidth: 0.5, borderColor: SAGE_BORDER, padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <Icon name="lock" size={fs(19)} color={SAGE_DEEP} strokeWidth={1.8} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>우리끼리만</Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 19 }}>
                크루는 초대된 멤버에게만 보여요.{'\n'}친구라도 초대 전엔 볼 수 없어요.
              </Text>
            </View>

            {/* 5. 소소한 편의 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 30 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginBottom: 12 }}>소소한 편의</Text>
              {TIPS.map((s, i) => <IconRow key={s.title} {...s} last={i === TIPS.length - 1} />)}
            </View>

            {/* 6. 역할 */}
            <View style={{ marginHorizontal: 20, marginTop: 28, backgroundColor: C.bgSecondary, borderRadius: 14,
              borderWidth: 0.5, borderColor: C.hairline, padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <Icon name="people" size={fs(19)} color={C.charcoal} strokeWidth={1.8} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>크루 리더 · 서브 리더</Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 19 }}>
                만든 사람이 리더예요. 함께 관리할 서브 리더를 둘 수 있어요.
              </Text>
            </View>

            {/* 7. 하단 CTA */}
            <View style={{ paddingHorizontal: 20, paddingTop: 34 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', marginBottom: 12, lineHeight: 17 }}>
                함께한 라운딩,{'\n'}오래 꺼내 보도록
              </Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { onClose(); onCreatePress?.(); }}
                style={{ backgroundColor: SAGE_DEEP, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>＋ 크루 만들기</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={{ paddingVertical: 14, alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.warmGray }}>나중에</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
