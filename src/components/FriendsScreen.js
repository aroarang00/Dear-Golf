import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { shareInvite } from '../utils/invite';
import { ShareMomentModal } from './ShareMomentModal';

// 친구 화면 — 내 프로필·설정은 MY 탭으로 이관, 친구 목록 전용.
export function FriendsScreen({ navigation }) {
  // 친구 첫 진입 1회 안내는 FriendsTab 상단 인라인 카드로 이관(접이식, friendCoachDone 재사용) ([[friend_groups]])
  const openFinderRef = useRef(null); // FriendsTab의 친구 찾기(finder)를 헤더 버튼에서 열기 위한 핸들

  // 친구 초대 — 비사용자에게 나가는 cold-acquisition 카드(랜딩 톤·올인원 차별화). 평문 링크는 카드 모달의 '링크 공유'로 유지 ([[invite-deeplink-system]])
  const [inviteOpen, setInviteOpen] = useState(false);
  const handleInvite = () => setInviteOpen(true);

  // DM(메시지) 진입점은 홈 우상단 💬로 이관·일원화(테스터 '친구 탭은 불편' 피드백, 2026-06-17). HomeScreen 참조.

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — Friends 타이틀(+우상단 💬 메시지) + 친구 찾기·초대 */}
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(26,61,82,0.72)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 파트너</Text>
          <Text style={{ fontFamily: F.en, fontSize: fs(28), color: C.navy }}>Friends</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 3 }}>
          <TouchableOpacity onPress={() => openFinderRef.current?.('kakao')} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.bgPrimary }}>🔍 친구 찾기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleInvite} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.butter,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>📩 초대</Text>
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
