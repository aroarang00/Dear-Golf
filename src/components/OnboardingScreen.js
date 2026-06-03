import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { obS } from '../styles/obS';
import { TripleStripe } from './common/TripleStripe';

// 프로필 입력 온보딩 — 인트로·카카오·약관 동의 단계 다음.
// seed: 카카오 로그인으로 받은 prefill 값 ({ nickname, avatarUri, kakaoLinked, kakaoId })
// consent: 약관 동의 데이터 ({ agreedTos·agreedPrivacy·agreedPenalty·agreedAge·agreedMarketing·legalVersion·agreedAt })
export function OnboardingScreen({ seed = {}, consent = null, onComplete }) {
  const [nickname, setNickname] = useState(seed.nickname || '');
  const [realName, setRealName] = useState('');
  const [avgScore, setAvgScore] = useState('');
  const [lifeBest, setLifeBest] = useState('');
  const [step, setStep] = useState(1);

  const handleComplete = () => {
    const nick = nickname.trim() || '';
    if (!nick) return;
    const best = parseInt(lifeBest) || 99;
    onComplete({
      nickname: nick,
      realName: realName || '',
      avgScore: parseInt(avgScore) || 90,
      lifeBest: best,
      totalRounds: 0,
      hasFirstSingle: best <= 79,
      onboardingDone: true,
      alarmDefaults: { d3: true, d1: true, teeoff: true },
      alarmPromptDisabled: false,
      // 카카오 단계에서 받은 값
      avatarUri: seed.avatarUri || null,
      kakaoLinked: !!seed.kakaoLinked,
      kakaoId: seed.kakaoId || null,
      // 약관 동의 데이터 — 변경 시 재동의 트리거용 legalVersion 보존
      consent: consent || null,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <TripleStripe />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 28, paddingBottom: 60 }}>
        <Text style={{ fontFamily: F.brand, fontSize: fs(32), color: C.charcoal, marginBottom: 6 }}>Dear Golf</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, marginBottom: 40 }}>나만의 골프 캐디를 시작해요</Text>

        {step === 1 && (
          <View>
            <Text style={obS.stepLabel}>1단계 · 프로필</Text>
            {seed.kakaoLinked && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#8B6914', marginBottom: 10 }}>
                💬 카카오 닉네임을 가져왔어요 — 그대로 쓰거나 수정할 수 있어요
              </Text>
            )}
            <Text style={obS.label}>닉네임</Text>
            <TextInput style={obS.input} placeholder="민지 / Jessica" placeholderTextColor={C.warmGrayLight}
              value={nickname} onChangeText={setNickname}
              autoCapitalize="none" autoCorrect={false} keyboardType="default"
              maxLength={10} />
            <Text style={obS.label}>본명 (선택)</Text>
            <TextInput style={obS.input} placeholder="황지현" placeholderTextColor={C.warmGrayLight}
              value={realName} onChangeText={setRealName} />
            {/* 본명 장려 + 마스킹 노출 고지 ([[realname-policy]] 항목 1) */}
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18, marginTop: 6, marginBottom: 4 }}>
              닉네임은 같은 이름이 많아 친구·동반자 찾기가 부정확해요.{'\n'}본명을 넣으면 더 정확하게 매칭돼요. (나중에 마이페이지에서 입력해도 돼요){'\n'}검색 화면엔 이름 일부만 가려서 보여요 — 예: 황*현
            </Text>
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
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: parseInt(lifeBest) <= 79 ? '#8B6914' : C.warmGrayLight }}>
                  {parseInt(lifeBest) <= 79 ? '싱글 골퍼이시네요!' : `싱글까지 ${parseInt(lifeBest) - 79}타 남았어요`}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <TouchableOpacity style={[obS.nextBtn, { flex: 0, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.hairline }]}
                onPress={() => setStep(1)}>
                <Text style={[obS.nextBtnTxt, { color: C.warmGray }]}>이전</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[obS.nextBtn, { flex: 1 }]} onPress={handleComplete}>
                <Text style={obS.nextBtnTxt}>시작하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
