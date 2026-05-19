import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { obS } from '../styles/obS';
import { TripleStripe } from './common/TripleStripe';
import { loginWithKakao } from '../utils/kakaoAuth';

export function OnboardingScreen({ onComplete }) {
  const [nickname, setNickname] = useState('');
  const [realName, setRealName] = useState('');
  const [avgScore, setAvgScore] = useState('');
  const [lifeBest, setLifeBest] = useState('');
  const [step, setStep] = useState(1);
  const [kakaoLoading, setKakaoLoading] = useState(false);

  // 입력값으로 프로필 객체 구성 (수동 입력 / 카카오 공통)
  const buildProfile = (extra) => {
    const best = parseInt(lifeBest) || 99;
    return {
      nickname: '',
      realName: realName || '',
      avgScore: parseInt(avgScore) || 90,
      lifeBest: best,
      totalRounds: 0,
      hasFirstSingle: best <= 79,
      onboardingDone: true,
      alarmDefaults: { d3: true, d1: true, teeoff: true },
      alarmPromptDisabled: false,
      ...extra,
    };
  };

  const handleComplete = () => {
    const nick = nickname.trim() || '';
    if (!nick) return;
    onComplete(buildProfile({ nickname: nick }));
  };

  // 카카오로 시작 — 닉네임·프로필 사진을 가져와 적용. Firebase는 익명 로그인을 그대로 유지.
  const handleKakao = async () => {
    if (kakaoLoading) return;
    setKakaoLoading(true);
    const result = await loginWithKakao();
    setKakaoLoading(false);
    if (!result) return;   // 취소 또는 실패
    onComplete(buildProfile({
      nickname: result.nickname || nickname.trim() || '골퍼',
      avatarUri: result.profileImageUrl || null,
      kakaoLinked: true,
      kakaoId: result.kakaoId || null,
    }));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <TripleStripe />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 28, paddingBottom: 60 }}>
        <Text style={{ fontFamily: F.brand, fontSize: 32, color: C.charcoal, marginBottom: 6 }}>Dear Golf</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.warmGrayLight, marginBottom: 40 }}>나만의 골프 캐디를 시작해요</Text>

        {step === 1 && (
          <View>
            <Text style={obS.stepLabel}>1단계 · 프로필</Text>
            <Text style={obS.label}>닉네임</Text>
            <TextInput style={obS.input} placeholder="민지 / Jessica" placeholderTextColor={C.warmGrayLight}
              value={nickname} onChangeText={setNickname}
              autoCapitalize="none" autoCorrect={false} keyboardType="default"
              maxLength={10} />
            <Text style={obS.label}>본명 (선택)</Text>
            <TextInput style={obS.input} placeholder="황지현" placeholderTextColor={C.warmGrayLight}
              value={realName} onChangeText={setRealName} />
            <TouchableOpacity style={obS.nextBtn} onPress={() => {
              if (!nickname.trim()) return;
              setStep(2);
            }}>
              <Text style={obS.nextBtnTxt}>다음 →</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={obS.stepLabel}>2단계 · 골프 정보</Text>
            <Text style={obS.label}>평균 타수</Text>
            <TextInput style={obS.input} placeholder="92" placeholderTextColor={C.warmGrayLight}
              value={avgScore} onChangeText={setAvgScore} keyboardType="numeric" />
            <Text style={obS.label}>라이프 베스트 스코어</Text>
            <TextInput style={obS.input} placeholder="88" placeholderTextColor={C.warmGrayLight}
              value={lifeBest} onChangeText={setLifeBest} keyboardType="numeric" />
            {lifeBest !== '' && (
              <View style={{ marginTop: 12, padding: 12, backgroundColor: parseInt(lifeBest) <= 79 ? '#F5F0E4' : C.bgSecondary, borderRadius: 10, borderWidth: 1, borderColor: parseInt(lifeBest) <= 79 ? '#C9A84C' : C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: parseInt(lifeBest) <= 79 ? '#8B6914' : C.warmGrayLight }}>
                  {parseInt(lifeBest) <= 79 ? '싱글 골퍼이시네요!' : `싱글까지 ${parseInt(lifeBest) - 79}타 남았어요`}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <TouchableOpacity style={[obS.nextBtn, { flex: 0, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.hairline }]}
                onPress={() => setStep(1)}>
                <Text style={[obS.nextBtnTxt, { color: C.warmGrayLight }]}>이전</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[obS.nextBtn, { flex: 1 }]} onPress={handleComplete}>
                <Text style={obS.nextBtnTxt}>시작하기</Text>
              </TouchableOpacity>
            </View>

            {/* 카카오로 시작 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 }}>
              <View style={{ flex: 1, height: 0.5, backgroundColor: C.hairline }} />
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>또는</Text>
              <View style={{ flex: 1, height: 0.5, backgroundColor: C.hairline }} />
            </View>
            <TouchableOpacity onPress={handleKakao} activeOpacity={0.85} disabled={kakaoLoading}
              style={{ marginTop: 14, backgroundColor: '#FEE500', borderRadius: 12, paddingVertical: 15,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                opacity: kakaoLoading ? 0.6 : 1 }}>
              <Text style={{ fontSize: 16 }}>💬</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 14, color: '#191600', fontWeight: '700' }}>
                {kakaoLoading ? '카카오 로그인 중…' : '카카오로 시작하기'}
              </Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, textAlign: 'center', marginTop: 8, lineHeight: 16 }}>
              카카오 닉네임·프로필 사진을 가져와 적용해요
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
