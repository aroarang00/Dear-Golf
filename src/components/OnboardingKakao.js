import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { TripleStripe } from './common/TripleStripe';
import { loginWithKakao } from '../utils/kakaoAuth';

// 온보딩 — 인트로 다음 / 프로필 입력 전 단계.
// 카카오 로그인을 먼저 받아 닉네임·프로필 사진을 미리 채워준다.
// '나중에 하기'로 건너뛸 수도 있다.
export function OnboardingKakao({ onKakaoSuccess, onSkip }) {
  const [loading, setLoading] = useState(false);

  const handleKakao = async () => {
    if (loading) return;
    setLoading(true);
    const result = await loginWithKakao();
    setLoading(false);
    if (!result) return;
    if (result.ok === false) {
      Alert.alert('카카오 로그인 실패', `단계: ${result.step}\n에러: ${result.error}`);
      return;
    }
    onKakaoSuccess({
      nickname: result.nickname || '',
      avatarUri: result.profileImageUrl || null,
      kakaoLinked: true,
      kakaoId: result.kakaoId || null,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <TripleStripe />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 28, paddingTop: 50, paddingBottom: 60, flexGrow: 1 }}>
        <Text style={{ fontSize: 56, marginBottom: 14 }}>💬</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 24, color: C.charcoal, fontWeight: '700', marginBottom: 10 }}>
          카카오로 시작하기
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, lineHeight: 20, marginBottom: 26 }}>
          닉네임과 프로필 사진을 자동으로 가져와{'\n'}더 빠르게 시작할 수 있어요
        </Text>

        {/* 카카오로 받는 것 */}
        <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
          borderRadius: 12, padding: 16, gap: 12 }}>
          {[
            ['👤', '카카오 닉네임 · 프로필 사진 자동 적용'],
            ['🤝', '카카오 친구 중 Dear Golf 유저 찾기 (예정)'],
            ['🔒', '카카오 계정으로 안전한 로그인'],
          ].map(([icon, txt]) => (
            <View key={txt} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 17 }}>{icon}</Text>
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: 13, color: C.charcoal }}>{txt}</Text>
            </View>
          ))}
        </View>

        {/* 카카오 로그인 버튼 */}
        <TouchableOpacity onPress={handleKakao} activeOpacity={0.85} disabled={loading}
          style={{ marginTop: 30, backgroundColor: '#FEE500', borderRadius: 12, paddingVertical: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loading ? 0.7 : 1 }}>
          {loading
            ? <ActivityIndicator size="small" color="#191600" />
            : <Text style={{ fontSize: 17 }}>💬</Text>}
          <Text style={{ fontFamily: F.sys, fontSize: 15, color: '#191600', fontWeight: '700' }}>
            {loading ? '로그인 중…' : '카카오로 시작'}
          </Text>
        </TouchableOpacity>

        {/* 건너뛰기 */}
        <TouchableOpacity onPress={onSkip} activeOpacity={0.7} disabled={loading}
          style={{ marginTop: 14, alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, fontWeight: '500' }}>
            나중에 하기
          </Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, textAlign: 'center', marginTop: 4 }}>
          카카오 없이도 사용할 수 있어요
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
