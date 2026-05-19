import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { RoundupTab } from './RoundupTab';
import { MyPageModal } from './MyPageModal';
import { MyProfile } from './MyProfile';
import { UserContext } from '../contexts/UserContext';

// 세그먼트 서브 탭 — 친구 / 라운딩모집
const SUB_TABS = [
  ['friends', '친구'],
  ['roundup', '라운딩모집'],
];

// 친구 화면 — 기존 MY 자리. 헤더 디자인은 MY 그대로 유지하고
// 골프 가계부는 다이어리, 내 코스기록은 코스 탭으로 이동했다.
export function FriendsScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [tab, setTab] = useState('friends');
  const [showMyPage, setShowMyPage] = useState(false);
  const [showMyProfile, setShowMyProfile] = useState(false);

  // 하단 탭 재탭 시 — 친구 탭 + 설정 닫힘 상태로 복귀
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener('tabPress', () => {
      setTab('friends');
      setShowMyPage(false);
      setShowMyProfile(false);
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

      {/* 세그먼트 서브 탭 — 친구 / 라운딩모집 */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 3 }}>
          {SUB_TABS.map(([k, l]) => {
            const on = tab === k;
            return (
              <TouchableOpacity key={k} onPress={() => setTab(k)} activeOpacity={0.8}
                style={{
                  flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
                  backgroundColor: on ? C.charcoal : 'transparent',
                }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.butter : C.warmGray }}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {tab === 'friends' ? <FriendsTab /> : <RoundupTab />}

      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
      <MyProfile visible={showMyProfile} onClose={() => setShowMyProfile(false)} />
    </SafeAreaView>
  );
}
