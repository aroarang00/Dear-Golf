import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { RoundupTab } from './RoundupTab';
import { MyPageModal } from './MyPageModal';
import { MyProfile } from './MyProfile';
import { UserContext } from '../contexts/UserContext';

// 친구 화면 — 기존 MY 자리. 라운딩 모집은 별도 풀스크린으로 열린다.
export function FriendsScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);
  const [showRoundup, setShowRoundup] = useState(false);

  // 하단 탭 재탭 시 — 모든 풀스크린 닫고 친구 화면으로 복귀
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener('tabPress', () => {
      setShowMyPage(false);
      setShowMyProfile(false);
      setShowRoundup(false);
    });
    return unsub;
  }, [navigation]);

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

      {/* 라운딩 모집 진입 배너 — 탭하면 풀스크린으로 열림 */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        <TouchableOpacity onPress={() => setShowRoundup(true)} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.paleSky,
            borderWidth: 1, borderColor: 'rgba(26,61,82,0.18)',
            borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ fontSize: 22 }}>⛳</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.navy, fontWeight: '700' }}>라운딩 모집</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(26,61,82,0.7)', marginTop: 2 }}>
              함께 칠 동반자를 찾아보세요
            </Text>
          </View>
          <Text style={{ fontSize: 18, color: C.navy }}>›</Text>
        </TouchableOpacity>
      </View>

      <FriendsTab />

      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
      <MyProfile visible={showMyProfile} onClose={() => setShowMyProfile(false)} />
      <RoundupTab visible={showRoundup} onClose={() => setShowRoundup(false)} />
    </SafeAreaView>
  );
}
