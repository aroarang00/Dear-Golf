import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { STORAGE_KEYS, storage } from '../utils/storage';

// 친구 화면 — 내 프로필·설정은 MY 탭으로 이관, 친구 목록 전용.
export function FriendsScreen() {
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — Friends 타이틀만 (내 프로필·설정은 MY 탭) */}
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(26,61,82,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 라이프</Text>
        <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 28, color: C.navy }}>Friends</Text>
      </View>

      <FriendsTab />

      {/* 친구 탭 첫 진입 코치마크 — 1회만. 화면 중앙 안내 (레이아웃 변경에 안전) */}
      {showCoach && (
        <TouchableOpacity activeOpacity={1} onPress={dismissCoach}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' }}>
          {/* 친구 카드 안내 — 화면 중앙 */}
          <View style={{ marginHorizontal: 30, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 20 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600', textAlign: 'center', lineHeight: 21 }}>
              👆 친구 카드를 탭하면 프로필이 열려요{'\n'}우상단 ⋯ 에서 알림·숨기기·삭제 가능
            </Text>
          </View>
          {/* 닫기 — 화면 하단 고정 */}
          <View style={{ position: 'absolute', bottom: insets.bottom + 90, left: 0, right: 0, alignItems: 'center' }}>
            <View style={{ backgroundColor: C.butter, borderRadius: 22, paddingHorizontal: 34, paddingVertical: 12 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '700' }}>알겠어요</Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
              화면을 탭하면 닫혀요
            </Text>
          </View>
        </TouchableOpacity>
      )}

    </SafeAreaView>
  );
}
