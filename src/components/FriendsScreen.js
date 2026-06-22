import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { Icon } from './common/Icon'; // 친구찾기 돋보기·초대 사람+ 커스텀 아이콘
import { shareInvite } from '../utils/invite';
import { ShareMomentModal } from './ShareMomentModal';
import { showAppAlert } from './AppAlert';   // 헤더 안내(!) 팝업

// 친구 화면 — 내 프로필·설정은 MY 탭으로 이관, 친구 목록 전용.
export function FriendsScreen({ navigation }) {
  const _and = Platform.OS === 'android'; // 헤더 안드 컴팩트 보정 — 다른 탭 헤더(코스·라운지)와 동일 규격
  // 친구 첫 진입 1회 안내는 FriendsTab 상단 인라인 카드로 이관(접이식, friendCoachDone 재사용) ([[friend_groups]])
  const openFinderRef = useRef(null); // FriendsTab의 친구 찾기(finder)를 헤더 버튼에서 열기 위한 핸들

  // 친구 초대 — 비사용자에게 나가는 cold-acquisition 카드(랜딩 톤·올인원 차별화). 평문 링크는 카드 모달의 '링크 공유'로 유지 ([[invite-deeplink-system]])
  const [inviteOpen, setInviteOpen] = useState(false);
  const handleInvite = () => setInviteOpen(true);

  // DM(메시지) 진입점은 홈 우상단 💬로 이관·일원화(테스터 '친구 탭은 불편' 피드백, 2026-06-17). HomeScreen 참조.

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — Friends 타이틀(+우상단 💬 메시지) + 친구 찾기·초대 */}
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 7,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(26,61,82,0.72)', letterSpacing: 2, marginBottom: _and ? 2 : 4 }}>나의 골프 파트너</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(_and ? 24 : 28), color: C.navy }}>Friends</Text>
            {/* 안내(!) — 코스 헤더와 동일 패턴. 그룹·별명·친구찾기(카카오)·NEW·스와이프·끊기/차단 안내(사용자 2026-06-20) */}
            <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              onPress={() => showAppAlert('친구 화면 안내',
                '👥 친구를 그룹으로 나누고\n그룹명·친구 별명도 바꿀 수 있어요.\n(그룹 지정은 카드 길게 누르기)\n\n🤝 받은 친구 신청은 수락·거절할 수 있어요.\n\n🔍 "친구 찾기"는 카카오 동의 후\n디어골프 쓰는 카카오 친구가 보여요.\n\n📖 친구 카드를 탭하면 그 친구의\n라운딩·일상 글을 볼 수 있어요.\n\n🆕 친구 카드에 새 글이 올라오면\nNEW가 떠요.\n\n👈 친구 카드를 옆으로 밀면 숨기기·즐겨찾기.\n\n🚫 친구 프로필 상세에서 친구 끊기·차단.',
                [{ text: '확인' }])}
              style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.navy, lineHeight: 17 }}>!</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 3 }}>
          <TouchableOpacity onPress={() => openFinderRef.current?.('kakao')} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.navy,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Icon name="search" size={fs(15)} color={C.bgPrimary} strokeWidth={1.8} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.bgPrimary }}>친구 찾기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleInvite} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.butter,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Icon name="personAdd" size={fs(17)} color={C.charcoalDeep} strokeWidth={2.1} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>초대</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FriendsTab navigation={navigation} onInvite={handleInvite} openFinderRef={openFinderRef} />

      {/* 친구 초대 카드 — 이미지(바로공유/저장) + 평문 링크(설치 동선) */}
      <ShareMomentModal
        moment={inviteOpen ? { shareKind: 'invite' } : null}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onShareLink={() => { setInviteOpen(false); setTimeout(() => shareInvite(), 350); }}
      />
    </SafeAreaView>
  );
}
