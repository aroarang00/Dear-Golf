import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { UserContext } from '../contexts/UserContext';
import { FriendsTab } from './FriendsTab';
import { RoundupTab } from './RoundupTab';
import { MyPageModal } from './MyPageModal';

// 동그란(pill) 서브 탭 — 친구 / 라운딩모집
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

  // 하단 탭 재탭 시 — 친구 탭 + 설정 닫힘 상태로 복귀
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener('tabPress', () => {
      setTab('friends');
      setShowMyPage(false);
    });
    return unsub;
  }, [navigation]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — 기존 MY 헤더 디자인 유지 */}
      <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(250,246,236,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 라이프</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 28, color: C.bgPrimary }}>My</Text>
            <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
              style={{
                width: 30, height: 30, borderRadius: 15,
                backgroundColor: '#6B1E2A',
                borderWidth: 1.5, borderColor: '#F5E6A8',
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Text style={{ fontFamily: F.en, fontSize: 14, color: '#F5E6A8', lineHeight: 18 }}>
                {userProfile.nickname?.charAt(0).toUpperCase() || 'G'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* MY 설정 — 헤더 우측 버튼 */}
        <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
          style={{
            borderWidth: 1, borderColor: 'rgba(200,217,230,0.45)',
            borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
          }}>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C8D9E6', fontWeight: '600' }}>⚙️ 설정</Text>
        </TouchableOpacity>
      </View>

      {/* 동그란 서브 탭 — 친구 / 라운딩모집 */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        {SUB_TABS.map(([k, l]) => {
          const on = tab === k;
          return (
            <TouchableOpacity key={k} onPress={() => setTab(k)} activeOpacity={0.8}
              style={{
                paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
                backgroundColor: on ? C.charcoal : C.bgSecondary,
                borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline,
              }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.butter : C.warmGray }}>{l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'friends' ? <FriendsTab /> : <RoundupTab />}

      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
    </SafeAreaView>
  );
}
