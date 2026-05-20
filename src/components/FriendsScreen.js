import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { MyPageModal } from './MyPageModal';
import { MyProfile } from './MyProfile';
import { UserContext } from '../contexts/UserContext';
import { STORAGE_KEYS, storage } from '../utils/storage';

// 친구 화면 — 기존 MY 자리. 라운딩 모집은 별도 풀스크린으로 열린다.
export function FriendsScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const insets = useSafeAreaInsets();   // 코치마크 위치 계산용 (노치/홈바)
  const [showMyPage, setShowMyPage] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [showCoach, setShowCoach] = useState(false);   // 친구 탭 첫 진입 툴팁 (1회)

  // 하단 탭 재탭 시 — 모든 풀스크린 닫고 친구 화면으로 복귀
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener('tabPress', () => {
      setShowMyPage(false);
      setShowMyProfile(false);
    });
    return unsub;
  }, [navigation]);

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
      {/* 헤더 — 기존 MY 헤더 디자인 유지 */}
      <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(250,246,236,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 라이프</Text>
            <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 28, color: C.bgPrimary }}>Friends</Text>
          </View>
          {/* 내 프로필 — 탭하면 풀화면으로 열림 */}
          <TouchableOpacity onPress={() => setShowMyProfile(true)} activeOpacity={0.7}
            style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(245,230,168,0.7)',
              backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {userProfile.avatarUri ? (
              <Image source={{ uri: userProfile.avatarUri }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={{ fontFamily: F.en, fontSize: 17, color: '#fff' }}>
                {(userProfile.nickname || '나').charAt(0)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {/* MY 설정 — 헤더 우측 투명 버튼 */}
        <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
          style={{
            backgroundColor: 'transparent',
            borderWidth: 1, borderColor: 'rgba(250,246,236,0.35)',
            borderRadius: 16, paddingHorizontal: 13, paddingVertical: 7,
          }}>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(250,246,236,0.85)', fontWeight: '600' }}>⚙️ 설정</Text>
        </TouchableOpacity>
      </View>

      <FriendsTab />

      {/* 친구 탭 첫 진입 코치마크 — 1회만. 헤더(76) + 배너(79)·검색(60)·카운트(40) 기준 위치. */}
      {showCoach && (
        <TouchableOpacity activeOpacity={1} onPress={dismissCoach}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.62)' }}>
          {/* 친구 카드 안내 — 검색·카운트 지나 첫 카드 바로 위 (헤더 76 + 검색 60 + 카운트 40 ≈ 176) */}
          <View style={{ position: 'absolute', top: insets.top + 180, left: 30, right: 30, alignItems: 'center' }}>
            <View style={{ width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 9,
              borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#fff' }} />
            <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600', textAlign: 'center', lineHeight: 19 }}>
                👆 친구 카드를 길게 누르면{'\n'}옵션(알림 끄기·숨기기)이 열려요
              </Text>
            </View>
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

      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
      <MyProfile visible={showMyProfile} onClose={() => setShowMyProfile(false)} />
    </SafeAreaView>
  );
}
