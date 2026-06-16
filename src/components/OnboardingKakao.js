import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { TripleStripe } from './common/TripleStripe';
import { loginWithKakao, linkOrSignInWithKakao } from '../utils/kakaoAuth';
import { ensureUserDoc } from '../utils/userDoc';
import { checkBannedByKakaoSub } from '../utils/account';
import { calculateAgeFromKakao, ADULT_AGE } from '../utils/age';

// 온보딩 — 인트로 다음 / 프로필 입력 전 단계.
// 카카오 로그인 → Firebase Auth 연동(익명 계정 승격) → users 문서 보장 → 프로필 prefill.
// '나중에 하기'로 건너뛰면 익명 계정 그대로 사용.
export function OnboardingKakao({ onKakaoSuccess, onSkip }) {
  const [loading, setLoading] = useState(false);

  // "나중에 하기" 정책 ([[anonymous-user-policy]] 2026-06-06 확정):
  //  - prod: 익명 진입 허용(혼자 기능 OK). ★출시 전 여기에 '면책 동의 모달'(①)을 붙여
  //    "기록은 이 기기에만 저장·복구 불가 / 소셜은 연동 후" 고지 후 진행하도록 교체할 것.
  //  - dev: uid 안정화 테스트 중 익명 드리프트를 막기 위해 카카오 강제(건너뛰기 차단).
  const handleSkip = () => {
    if (__DEV__) {
      Alert.alert(
        '개발 빌드 안내',
        'uid 안정화 테스트 중이라\n개발 빌드에서는 카카오 로그인이 필요해요.\n(출시 빌드는 익명 진입을 허용해요)',
      );
      return;
    }
    onSkip();
  };

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

      // 1-A. 만 19세 확인 ([[age-policy]]) — 1차는 약관 동의의 '[필수] 만 19세 이상' 자가 확인.
      // 카카오 출생연도는 동의항목이 아니라 받지 못하는 경우가 많음([[kakao-birthdate-blocker]]).
      // → 출생연도를 '받을 수 있을 때만' 미성년 차단 안전망으로 사용하고, 없으면 막지 않고 진행한다.
      //   (출생연도 동의항목은 필수 아님 — 없어도 로그인 가능하도록 prod 차단 제거)
      if (result.birthyear && result.birthday) {
        // 명확히 만 19세 미만일 때만 차단. 형식 불일치 등으로 나이 계산이 안 되면(null)
        // 차단하지 않고 약관 '[필수] 만 19세 이상' 자가확인에 위임 — 성인 오차단 방지.
        const age = calculateAgeFromKakao(result.birthyear, result.birthday);
        if (age !== null && age < ADULT_AGE) {
          Alert.alert(
            '가입할 수 없어요',
            'Dear Golf는 만 19세 이상 성인만 이용할 수 있어요.\n양해 부탁드립니다.',
          );
          return;
        }
      }

      // 1-B. 정지 기록 매칭 차단 ([[account-deletion]] §3) — 재가입 차단
      if (result.kakaoId) {
        const ban = await checkBannedByKakaoSub(result.kakaoId);
        if (ban.banned) {
          const tail = ban.permanent
            ? '영구 정지된 계정이에요.'
            : `정지 종료일: ${String(ban.unblockAt).slice(0, 10)}`;
          Alert.alert(
            '이용이 제한된 계정이에요',
            `이 카카오 계정은 Dear Golf 이용이 제한되었어요.\n${tail}`,
          );
          return;
        }
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

        {/* 건너뛰기 — dev는 차단(handleSkip), prod는 익명 허용 (출시 전 면책 동의 모달로 교체 예정) */}
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} disabled={loading}
          style={{ marginTop: 14, alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>
            나중에 하기
          </Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginTop: 4 }}>
          카카오 없이도 사용할 수 있어요
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
