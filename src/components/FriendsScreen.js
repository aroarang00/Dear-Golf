import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { useAndroidBack } from '../hooks/useAndroidBack';

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

  // 친구 초대 — 미설치 친구에게 카카오 등으로 공유 (RN 공유 시트)
  const handleInvite = async () => {
    const link = 'https://deargolf.app'; // TODO: 출시 시 실제 스토어/랜딩 링크로 교체
    const message =
      '골프 갈 때마다\n' +
      '날씨·교통·맛집 따로 찾고,\n' +
      '일정도 가끔 깜빡하고,\n' +
      '약속은 일일이 연락하고,\n' +
      '기록은 사진첩에 잠들어 있다면?\n\n' +
      'Dear Golf 어떠세요? ⛳\n' +
      '한 번에 해결됩니다.\n' +
      '👉 ' + link;
    try {
      await Share.share({ message });
    } catch (e) { /* 사용자 취소 — 무시 */ }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — Friends 타이틀 + 친구 초대 */}
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(26,61,82,0.72)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 파트너</Text>
          <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: fs(28), fontWeight: '500', color: C.navy }}>Friends</Text>
        </View>
        <TouchableOpacity onPress={handleInvite} activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingBottom: 3 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.navy }}>📩 친구 초대</Text>
        </TouchableOpacity>
      </View>

      <FriendsTab navigation={navigation} />

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
