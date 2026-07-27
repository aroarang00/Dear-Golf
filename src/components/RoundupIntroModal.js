// 라운지 모집 기능 소개 — 초기 사용자를 위한 광고성 안내 (풀스크린 스크롤 모달).
// 라운지 헤더의 ✨ 버튼으로 진입. 친구공개·친구지정 모집의 가치를 부각해서 초기 활성화 유도.
import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon'; // 아이콘 — 유니코드 이모지 금지, 커스텀 SVG만

const COMPARE_ROWS = [
  ['phone', '전화 돌리기·약속 잡기', '모집글 한 번에'],
  ['chat', '카톡으로 일정 조율', '링크 공유 → 자동 확정'],
  ['calendar', '인원·코스 정하기까지 며칠', '오픈형 모집으로 함께 결정'],
];

const SCOPES = [
  {
    icon: 'people', iconColor: '#3E6E8E', title: '친구공개', tag: '추천',
    desc: '내 친구 목록에만 보여요. 친구가 [참여하기] 누르면 바로 확정.',
  },
  {
    icon: 'target', iconColor: '#7A5A9E', title: '친구지정',
    desc: '원하는 멤버만 골라 초대(또는 제외). 가까운 친구·라운딩 멤버 같은 친구 그룹으로 한 번에 지정할 수도 있어요. 지정한 친구에게만 보여요.',
  },
];

const FEATURES = [
  ['sun', '날씨', '라운딩 날 시간별 날씨', '#D4853A'],
  ['car', '교통', '출발 시각 자동 계산', '#3E6E8E'],
  ['calendar', '일정', '확정되면 자동 등록', '#5E7B51'],
  ['camera', '사진', '라운딩 사진·메모 보관', '#9B3A4A'],
  ['flag', '기록', '스코어·핸디 자동 계산', '#5E8B60'],
  ['green', '코스', '골퍼 코멘트 + 맛집', '#6E8B60'],
];

export function RoundupIntroModal({ visible, onClose, onCreatePress }) {
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
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginLeft: 12 }}>라운지 소개</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* 1. 훅 헤더 — 짙은 네이비 배경 */}
            <View style={{ backgroundColor: C.navy, paddingHorizontal: 24, paddingVertical: 36, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: 'rgba(245,230,168,0.7)', letterSpacing: 2, marginBottom: 12 }}>
                DEAR GOLF · 라운지
              </Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.butter, lineHeight: 32, textAlign: 'center' }}>
                4명 채우기,{'\n'}매번 일일이 연락하세요?
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(250,246,236,0.78)', lineHeight: 20, textAlign: 'center', marginTop: 14 }}>
                모집글 한 번 올리면 친구가 알아서 와요.{'\n'}디어골프 라운지가 도와드릴게요.
              </Text>
            </View>

            {/* 2. 비교 카드 — 기존 vs Dear Golf */}
            <View style={{ paddingHorizontal: 20, paddingTop: 28 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginBottom: 14 }}>
                이렇게 바뀌어요
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                <View style={{ flex: 1, paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.hairline }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1 }}>기존</Text>
                </View>
                <View style={{ flex: 1, paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: C.burgundy }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.burgundy, letterSpacing: 1 }}>Dear Golf</Text>
                </View>
              </View>
              {COMPARE_ROWS.map(([icon, before, after], i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
                  borderBottomWidth: i === COMPARE_ROWS.length - 1 ? 0 : 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ width: 28, alignItems: 'center' }}><Icon name={icon} size={fs(17)} color={C.warmGray} strokeWidth={1.8} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 17, textDecorationLine: 'line-through' }}>
                      {before}
                    </Text>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, lineHeight: 19, marginTop: 2 }}>
                      {after}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* 3. 모집 유형 3가지 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>
                모집은 2가지 방식
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4, marginBottom: 14 }}>
                상황에 맞춰 골라요
              </Text>
              {SCOPES.map((s, i) => (
                <View key={i} style={{ backgroundColor: C.bgSecondary, borderRadius: 14,
                  padding: 14, marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Icon name={s.icon} size={fs(18)} color={s.iconColor} strokeWidth={1.9} />
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>{s.title}</Text>
                    {s.tag && (
                      <View style={{ backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>{s.tag}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 19 }}>
                    {s.desc}
                  </Text>
                  {s.note && (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 16, marginTop: 8,
                      paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                      {s.note}
                    </Text>
                  )}
                </View>
              ))}
            </View>

            {/* 4. 카톡 공유 하이라이트 */}
            <View style={{ marginHorizontal: 20, marginTop: 32, backgroundColor: '#FEE500', borderRadius: 14, padding: 18 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#3C1E1E' }}>
                카톡 링크 하나면 끝
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#3C1E1E', marginTop: 8, lineHeight: 19 }}>
                모집글 올리고 카카오톡으로 공유하면{'\n'}친구들이 링크 한 번 누르고 수락해요.{'\n'}일정 조율로 며칠 보낼 필요 없어요.
              </Text>
            </View>

            {/* 5. 편의기능 그리드 — 2 x 3 */}
            <View style={{ paddingHorizontal: 20, paddingTop: 32 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>
                라운딩 준비까지 한 번에
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4, marginBottom: 14 }}>
                모집 확정 후 자동으로 챙겨드려요
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {FEATURES.map(([icon, title, desc, color], i) => (
                  <View key={i} style={{ width: '47%', backgroundColor: C.bgSecondary, borderRadius: 12,
                    padding: 12 }}>
                    <View style={{ marginBottom: 6 }}><Icon name={icon} size={fs(20)} color={color} strokeWidth={1.9} /></View>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>{title}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3, lineHeight: 15 }}>
                      {desc}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 6. 관심 모집 알림 */}
            <View style={{ marginHorizontal: 20, marginTop: 32, backgroundColor: C.bgSecondary,
              borderRadius: 14, padding: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Icon name="bell" size={fs(18)} color={C.burgundy} strokeWidth={1.9} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>
                  주최가 부담스럽다면
                </Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 19 }}>
                시간대(주중·주말 1·2·3부)와 기간을 저장해두면{'\n'}맞는 모집이 올라올 때 알려드려요.{'\n'}편하게 참여만 하셔도 돼요.
              </Text>
            </View>

            {/* 7. 하단 CTA */}
            <View style={{ paddingHorizontal: 20, paddingTop: 36 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', marginBottom: 12, lineHeight: 17 }}>
                함께하는 골프,{'\n'}서로의 시간을 존중해요
              </Text>
              <TouchableOpacity activeOpacity={0.85}
                onPress={() => { onClose(); onCreatePress?.(); }}
                style={{ backgroundColor: C.burgundy, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>
                  + 첫 모집글 작성하기
                </Text>
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
