import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { TripleStripe } from './common/TripleStripe';
import { TermsViewerModal } from './TermsViewerModal';
import {
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  COMMUNITY_GUIDELINES,
  PENALTY_CONSENT,
  LOCATION_BASED_SERVICE_TERMS,
  LEGAL_VERSION,
} from '../constants/legalTexts';

// 온보딩 약관 동의 화면 — 카카오 로그인 직후, 프로필 입력 전.
// 필수 5개(이용약관·개인정보처리방침·자동패널티·위치기반서비스·만19세) 모두 동의해야 다음 진행.
// 마케팅 푸시는 선택. 각 항목별 [전문 보기] 진입점 제공.
export function OnboardingConsent({ onAgree }) {
  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeTos, setAgreeTos] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreePenalty, setAgreePenalty] = useState(false);
  const [agreeLbs, setAgreeLbs] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

  const [viewer, setViewer] = useState({ visible: false, title: '', body: '' });

  const openViewer = (title, body) => setViewer({ visible: true, title, body });
  const closeViewer = () => setViewer(v => ({ ...v, visible: false }));

  const allRequired = agreeTos && agreePrivacy && agreePenalty && agreeLbs && agreeAge;

  const toggleAll = () => {
    const next = !agreeAll;
    setAgreeAll(next);
    setAgreeTos(next);
    setAgreePrivacy(next);
    setAgreePenalty(next);
    setAgreeLbs(next);
    setAgreeAge(next);
    setAgreeMarketing(next);
  };

  // 개별 토글 시 전체 동의도 동기화
  const syncAll = (nextTos, nextPrivacy, nextPenalty, nextLbs, nextAge, nextMarketing) => {
    setAgreeAll(nextTos && nextPrivacy && nextPenalty && nextLbs && nextAge && nextMarketing);
  };

  const handleNext = () => {
    if (!allRequired) return;
    onAgree({
      agreedTos: true,
      agreedPrivacy: true,
      agreedPenalty: true,
      agreedLbs: true,
      agreedAge: true,
      agreedMarketing: agreeMarketing,
      legalVersion: LEGAL_VERSION,
      agreedAt: Date.now(),
    });
  };

  const renderRow = ({ required, label, value, onToggle, onView }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
      borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
      <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
          borderColor: value ? C.burgundy : C.warmGrayLight,
          backgroundColor: value ? C.burgundy : 'transparent',
          alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        {value && <Text style={{ fontSize: fs(12), color: '#fff', fontWeight: '700', lineHeight: 14 }}>✓</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={onToggle} style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }}>
          <Text style={{ fontFamily: F.sysB, color: required ? C.burgundy : C.warmGray }}>
            [{required ? '필수' : '선택'}]
          </Text>
          {' '}{label}
        </Text>
      </TouchableOpacity>
      {onView && (
        <TouchableOpacity onPress={onView} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>
            전문 보기
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <TripleStripe />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 28, paddingBottom: 40 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal, marginBottom: 8 }}>
          약관 동의
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, lineHeight: 20, marginBottom: 18 }}>
          Dear Golf를 시작하기 전에{'\n'}아래 약관을 확인해주세요.
        </Text>

        {/* 연령 확인 안내 — 만 19세 자가 확인 ([[age-policy]]) */}
        <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
          borderRadius: 12, padding: 16, marginBottom: 22 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy, marginBottom: 8 }}>
            연령 확인 안내
          </Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, lineHeight: 20 }}>
            Dear Golf는 만 19세 이상 성인만{'\n'}이용할 수 있는 서비스예요.{'\n'}
            아래 [필수] 만 19세 이상 동의로{'\n'}연령을 확인하며,{'\n'}
            사실과 다를 경우 이용이 제한될 수 있어요.
          </Text>
        </View>

        {/* 전체 동의 */}
        <TouchableOpacity onPress={toggleAll}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16,
            backgroundColor: C.bgSecondary, borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
            borderColor: agreeAll ? C.burgundy : C.warmGrayLight,
            backgroundColor: agreeAll ? C.burgundy : 'transparent',
            alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            {agreeAll && <Text style={{ fontSize: fs(13), color: '#fff', fontWeight: '700', lineHeight: 16 }}>✓</Text>}
          </View>
          <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>
            전체 동의
          </Text>
        </TouchableOpacity>

        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginBottom: 6, marginLeft: 4 }}>
          전체 동의는 선택 항목까지 포함합니다.
        </Text>

        {/* 개별 항목들 */}
        {renderRow({
          required: true,
          label: '이용약관에 동의합니다',
          value: agreeTos,
          onToggle: () => {
            const next = !agreeTos;
            setAgreeTos(next);
            syncAll(next, agreePrivacy, agreePenalty, agreeLbs, agreeAge, agreeMarketing);
          },
          onView: () => openViewer('이용약관', TERMS_OF_SERVICE),
        })}

        {renderRow({
          required: true,
          label: '개인정보처리방침에 동의합니다',
          value: agreePrivacy,
          onToggle: () => {
            const next = !agreePrivacy;
            setAgreePrivacy(next);
            syncAll(agreeTos, next, agreePenalty, agreeLbs, agreeAge, agreeMarketing);
          },
          onView: () => openViewer('개인정보처리방침', PRIVACY_POLICY),
        })}

        {renderRow({
          required: true,
          label: '위치기반서비스 약관에 동의합니다',
          value: agreeLbs,
          onToggle: () => {
            const next = !agreeLbs;
            setAgreeLbs(next);
            syncAll(agreeTos, agreePrivacy, agreePenalty, next, agreeAge, agreeMarketing);
          },
          onView: () => openViewer('위치기반서비스 약관', LOCATION_BASED_SERVICE_TERMS),
        })}

        {renderRow({
          required: true,
          label: '자동 패널티 시스템에 동의합니다',
          value: agreePenalty,
          onToggle: () => {
            const next = !agreePenalty;
            setAgreePenalty(next);
            syncAll(agreeTos, agreePrivacy, next, agreeLbs, agreeAge, agreeMarketing);
          },
          onView: () => openViewer('자동 패널티 시스템', PENALTY_CONSENT),
        })}

        {renderRow({
          required: true,
          label: '만 19세 이상입니다',
          value: agreeAge,
          onToggle: () => {
            const next = !agreeAge;
            setAgreeAge(next);
            syncAll(agreeTos, agreePrivacy, agreePenalty, agreeLbs, next, agreeMarketing);
          },
        })}

        {renderRow({
          required: false,
          label: '마케팅 푸시 알림을 받겠습니다',
          value: agreeMarketing,
          onToggle: () => {
            const next = !agreeMarketing;
            setAgreeMarketing(next);
            syncAll(agreeTos, agreePrivacy, agreePenalty, agreeLbs, agreeAge, next);
          },
        })}

        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginTop: 14, lineHeight: 17 }}>
          • 필수 항목은 서비스 이용을 위해 반드시 동의가 필요합니다.{'\n'}
          • 마케팅 푸시는 동의하지 않아도 서비스 이용에 영향이 없으며, 동의 후 앱 설정에서 언제든 철회할 수 있어요.{'\n'}
          • 만 19세 미만은 가입할 수 없으며, 연령은 위 [필수] 동의로 확인합니다.
        </Text>

        {/* 다음 버튼 — 필수 4개 모두 동의해야 활성 */}
        <TouchableOpacity onPress={handleNext} disabled={!allRequired} activeOpacity={0.85}
          style={{ marginTop: 28, backgroundColor: allRequired ? C.burgundy : C.warmGrayLight,
            borderRadius: 12, paddingVertical: 16, alignItems: 'center', opacity: allRequired ? 1 : 0.6 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>
            동의하고 계속하기
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <TermsViewerModal
        visible={viewer.visible}
        onClose={closeViewer}
        title={viewer.title}
        body={viewer.body}
      />
    </SafeAreaView>
  );
}
