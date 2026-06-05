import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { shareInvite } from '../utils/invite';

// 친구 화면 — 내 프로필·설정은 MY 탭으로 이관, 친구 목록 전용.
export function FriendsScreen({ navigation }) {
  const insets = useSafeAreaInsets();   // 코치마크 위치 계산용 (노치/홈바)
  const [showCoach, setShowCoach] = useState(false);   // 친구 탭 첫 진입 툴팁 (1회)

  // 첫 진입 시 1회 툴팁
  useEffect(() => {
    storage.load(STORAGE_KEYS.friendCoachDone, false).then(done => { if (!done) setShowCoach(true); });
  }, []);

  const dismissCoach = () => {
    setShowCoach(false);
    storage.save(STORAGE_KEYS.friendCoachDone, true);
  };
  useAndroidBack(showCoach, dismissCoach); // 코치마크 떠 있을 때 뒤로가기 → 닫기

  const openFinderRef = useRef(null); // FriendsTab의 친구 찾기(finder)를 헤더 버튼에서 열기 위한 핸들

  // 친구 초대 — 공용 헬퍼(모임 단톡방용 문구). 라운지 빈 상태와 동일 문구 공유 ([[lounge-positioning]])
  const handleInvite = shareInvite;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — Friends 타이틀 + 친구 초대 */}
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

      {/* 친구 탭 첫 진입 코치마크 — 1회만. 화면 중앙 안내 (레이아웃 변경에 안전) */}
      {showCoach && (
        <TouchableOpacity activeOpacity={1} onPress={dismissCoach}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' }}>
          {/* 친구 카드 안내 — 화면 중앙 */}
          <View style={{ marginHorizontal: 30, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 20 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, textAlign: 'center', lineHeight: 21 }}>
              👆 친구 카드를 탭하면 프로필이 열려요{'\n'}우상단 ⋯ 에서 알림·숨기기·삭제 가능
            </Text>
          </View>
          {/* 닫기 — 화면 하단 고정 */}
          <View style={{ position: 'absolute', bottom: insets.bottom + 90, left: 0, right: 0, alignItems: 'center' }}>
            <View style={{ backgroundColor: C.butter, borderRadius: 22, paddingHorizontal: 34, paddingVertical: 12 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>알겠어요</Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
              화면을 탭하면 닫혀요
            </Text>
          </View>
        </TouchableOpacity>
      )}

    </SafeAreaView>
  );
}
