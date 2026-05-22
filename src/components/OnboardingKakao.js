import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { TripleStripe } from './common/TripleStripe';
import { loginWithKakao, linkOrSignInWithKakao } from '../utils/kakaoAuth';
import { ensureUserDoc } from '../utils/userDoc';

// 온보딩 — 인트로 다음 / 프로필 입력 전 단계.
// 카카오 로그인 → Firebase Auth 연동(익명 계정 승격) → users 문서 보장 → 프로필 prefill.
// '나중에 하기'로 건너뛰면 익명 계정 그대로 사용.
export function OnboardingKakao({ onKakaoSuccess, onSkip }) {
  const [loading, setLoading] = useState(false);

  const handleKakao = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // 1. 카카오 네이티브 로그인
      const result = await loginWithKakao();
      if (!result || result.ok === false) {
        Alert.alert('카카오 로그인 실패', `단계: ${result?.step}\n에러: ${result?.error}`);
        return;
      }

      // 2. Firebase Auth 연동 — 익명 계정을 카카오 신원으로 승격(또는 기존 계정 로그인)
      const link = await linkOrSignInWithKakao(result.idToken);
      if (!link.ok) {
        Alert.alert(
          '카카오 연동 실패',
          `Firebase 연동 중 오류가 발생했어요.\n(${link.error})\n\n잠시 후 다시 시도하거나 '나중에 하기'를 눌러주세요.`,
        );
        return;
      }

      // 3. users/{uid} 문서 보장 — 신규는 생성, 기존은 로드
      const userDoc = await ensureUserDoc(link.uid, {
        kakaoId: result.kakaoId,
        nickname: result.nickname,
        profileImageUrl: result.profileImageUrl,
      });

      // 4. 온보딩 다음 단계로 — 재설치·기기변경(기존 계정)이면 Firestore 프로필로 prefill
      const isReturning = link.mode === 'existing' && !userDoc.created;
      onKakaoSuccess({
        nickname: (isReturning ? userDoc.data.displayName : result.nickname) || '',
        avatarUri: (isReturning ? userDoc.data.avatarUrl : result.profileImageUrl) || null,
        kakaoLinked: true,
        kakaoId: result.kakaoId || null,
        isReturning,            // App.js에서 재방문자 온보딩 단축 처리 시 사용
      });
    } catch (e) {
      Alert.alert('오류', e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <TripleStripe />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 28, paddingTop: 50, paddingBottom: 60, flexGrow: 1 }}>
        <Text style={{ fontSize: fs(56), marginBottom: 14 }}>💬</Text>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal, marginBottom: 10 }}>
          카카오로 시작하기
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, lineHeight: 20, marginBottom: 26 }}>
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
              <Text style={{ fontSize: fs(17) }}>{icon}</Text>
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }}>{txt}</Text>
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
            : <Text style={{ fontSize: fs(17) }}>💬</Text>}
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#191600' }}>
            {loading ? '로그인 중…' : '카카오로 시작'}
          </Text>
        </TouchableOpacity>

        {/* 건너뛰기 */}
        <TouchableOpacity onPress={onSkip} activeOpacity={0.7} disabled={loading}
          style={{ marginTop: 14, alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>
            나중에 하기
          </Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, textAlign: 'center', marginTop: 4 }}>
          카카오 없이도 사용할 수 있어요
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
