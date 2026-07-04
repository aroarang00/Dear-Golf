import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { obS } from '../styles/obS';
import { TripleStripe } from './common/TripleStripe';
import { getUid } from '../utils/firebase';
import { saveReferredBy, validateRefCode } from '../utils/referral';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller'; // 안드 키보드 입력칸 가림 방지

// 준비시간(집에서 나갈 때까지)·도착여유(구장 도착~티오프) 칩 선택지(분) — 개인차가 커 한 번만 정해두면 평생 적용
const PREP_OPTS = [5, 15, 30, 60];
const ARRIVE_OPTS = [30, 60, 90]; // 최소 30분(기본 에티켓), 90분=오후티 등 여유. '바로' 제외
const arriveLabel = (m) => `${m}분`;

// 프로필 입력 온보딩 — 인트로·카카오·약관 동의 단계 다음.
// seed: 카카오 로그인으로 받은 prefill 값 ({ nickname, avatarUri, kakaoLinked, kakaoId })
// consent: 약관 동의 데이터 ({ agreedTos·agreedPrivacy·agreedPenalty·agreedAge·agreedMarketing·legalVersion·agreedAt })
export function OnboardingScreen({ seed = {}, consent = null, onComplete }) {
  const [nickname, setNickname] = useState(seed.nickname || '');
  // 재방문자는 seed에 실린 기존 값으로 prefill(빈 폼→기본값이 실제 스탯 덮어쓰는 것 방지). 신규는 빈칸.
  const [realName, setRealName] = useState(seed.realName || '');
  const [avgScore, setAvgScore] = useState(seed.avgScore > 0 ? String(seed.avgScore) : '');
  const [lifeBest, setLifeBest] = useState(seed.lifeBest > 0 ? String(seed.lifeBest) : '');
  const [refCodeInput, setRefCodeInput] = useState(''); // 추천인 코드(선택) — 신규 가입만 노출
  // 코드 오타 피드백 — 혜택을 약속한 이상(골드 박스) 잘못된 코드를 조용히 버리면 안 됨(2026-07-04).
  //   2단계 '다음'에서 단건 조회로 확인, 못 찾으면 머물며 안내. 네트워크 실패는 비차단(그대로 진행).
  const [refCodeError, setRefCodeError] = useState(null);
  const [refCodeChecking, setRefCodeChecking] = useState(false);
  const goStep3 = async () => {
    const raw = refCodeInput.trim();
    if (!raw || seed.isReturning || refCodeChecking) { if (!refCodeChecking) setStep(3); return; }
    setRefCodeChecking(true);
    try {
      const v = await validateRefCode(raw, null);
      if (!v.ok && (v.reason === 'format' || v.reason === 'notfound')) {
        setRefCodeError('코드를 찾지 못했어요 — 오타를 확인하거나, 비우고 진행해 주세요');
        setRefCodeChecking(false);
        return;
      }
    } catch (e) { /* 오프라인 등 — 확인 못 하면 막지 않는다(최종 판정은 서버) */ }
    setRefCodeChecking(false);
    setStep(3);
  };
  const [step, setStep] = useState(1);
  // 3단계 · 알림 — 한 번 정해두면 매 라운드 자동 적용(팝업 없음)
  const [prepMin, setPrepMin] = useState(30);          // 집에서 나갈 준비시간(화장·짐 등)
  const [arriveBufferMin, setArriveBufferMin] = useState(30); // 구장 도착여유
  const [wakeOn, setWakeOn] = useState(true);          // 기상 알림(새벽 티 자동)
  const [departOn, setDepartOn] = useState(true);      // 출발 알림

  const handleComplete = () => {
    const nick = nickname.trim() || '';
    if (!nick) return;
    // 추천인 코드 기록 — 잠복 배포([[referral-reward-implementation-plan]]): 유효하면 users.referredBy에
    //   1회 기록만(set-once). 보상 지급·최종 검증은 추후 CF가 소급 처리하므로 온보딩을 막지 않는 best-effort.
    if (refCodeInput.trim() && !seed.isReturning) {
      getUid().then((uid) => uid && saveReferredBy(uid, refCodeInput)).catch(() => {});
    }
    const best = parseInt(lifeBest) || 99;
    onComplete({
      nickname: nick,
      realName: realName || '',
      avgScore: parseInt(avgScore) || 90,
      lifeBest: best,
      totalRounds: 0,
      hasFirstSingle: best <= 79,
      onboardingDone: true,
      // 알림 기본값 — 여기서 한 번 정한 대로 매 라운드 자동 적용(팝업 없음). 마이페이지에서 변경 가능.
      alarmDefaults: { d3: true, d1: true, teeoff: true, wake: wakeOn, depart: departOn },
      alarmPromptDisabled: true, // 자동 적용(라운드마다 직접 설정은 마이페이지에서 켤 수 있음)
      prepMin,
      arriveBufferMin,
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
      {/* 안드 edge-to-edge(app.config edgeToEdgeEnabled)에선 adjustResize가 무효 — 키보드가 하단 입력칸(추천인 코드 등)을
          덮는데 스크롤도 안 됐음 → keyboard-controller KAV로 키보드 높이만큼 패딩(맛집저장·크루작성 모달과 동일 패턴). */}
      <KeyboardProvider>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 28, paddingBottom: 60 }}>
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
            <AppTextInput style={obS.input} placeholder="민지 / Jessica" placeholderTextColor={C.warmGrayLight}
              value={nickname} onChangeText={(t) => setNickname(t.slice(0, 10))}
              autoCapitalize="none" autoCorrect={false} keyboardType="default" />{/* maxLength 금지 — 한글 조합 충돌 [[project_textinput_maxlength_hangul_bug]] */}
            <Text style={obS.label}>본명 (선택)</Text>
            <AppTextInput style={obS.input} placeholder="김골프" placeholderTextColor={C.warmGrayLight}
              value={realName} onChangeText={setRealName} />
            {/* 본명 장려 + 마스킹 노출 고지 ([[realname-policy]] 항목 1) */}
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 19, marginTop: 6 }}>
              • 닉네임은 동명이인이 많아 친구·동반자 찾기가 부정확해요{'\n'}• 본명을 넣으면 더 정확하게 매칭돼요{'\n'}• 검색 화면엔 이름 일부만 가려서 보여요 — 예: 김*프
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGrayLight, marginTop: 5, marginBottom: 4 }}>
              본명은 나중에 입력해도 돼요
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
            <AppTextInput style={obS.input} placeholder="92" placeholderTextColor={C.warmGrayLight}
              value={avgScore} onChangeText={setAvgScore} keyboardType="numeric" />
            <Text style={obS.label}>라이프 베스트 스코어</Text>
            <AppTextInput style={obS.input} placeholder="88" placeholderTextColor={C.warmGrayLight}
              value={lifeBest} onChangeText={setLifeBest} keyboardType="numeric" />
            {lifeBest !== '' && (
              <View style={{ marginTop: 12, padding: 12, backgroundColor: parseInt(lifeBest) <= 79 ? '#F5F0E4' : C.bgSecondary, borderRadius: 10, borderWidth: 1, borderColor: parseInt(lifeBest) <= 79 ? '#C9A84C' : C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: parseInt(lifeBest) <= 79 ? '#8B6914' : C.warmGrayLight }}>
                  {parseInt(lifeBest) <= 79 ? '싱글 골퍼이시네요!' : `싱글까지 ${parseInt(lifeBest) - 79}타 남았어요`}
                </Text>
              </View>
            )}
            {/* 추천인 코드(선택) — 신규 가입만. 초대 문구(shareInvite)에 동봉된 코드와 짝 ([[referral-reward-implementation-plan]]) */}
            {!seed.isReturning && (
              <View>
                <Text style={obS.label}>추천인 코드 (선택)</Text>
                <AppTextInput style={obS.input} placeholder="예: AB23CD" placeholderTextColor={C.warmGrayLight}
                  value={refCodeInput} onChangeText={(t) => { setRefCodeInput(t.slice(0, 10)); setRefCodeError(null); }}
                  autoCapitalize="characters" autoCorrect={false} />
                {refCodeError && (
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: '#B23B3B', marginTop: 5 }}>
                    {refCodeError}
                  </Text>
                )}
                {/* 혜택 안내 — 라이프베스트 힌트와 같은 골드 박스(회색 캡션은 안 보인다는 피드백, 2026-07-04).
                    숫자는 쿼터 UI 나오는 첫 업데이트 발표에서(invite.js와 같은 수위) */}
                <View style={{ marginTop: 10, padding: 12, backgroundColor: '#F5F0E4', borderRadius: 10, borderWidth: 1, borderColor: '#C9A84C' }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: '#8B6914', lineHeight: 19 }}>
                    🎁 초대해 준 친구의 코드를 입력하면{'\n'}두 분 모두 사진·영상 보관 공간이 늘어나요
                  </Text>
                </View>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <TouchableOpacity style={[obS.nextBtn, { flex: 0, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.hairline }]}
                onPress={() => setStep(1)}>
                <Text style={[obS.nextBtnTxt, { color: C.warmGray }]}>이전</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[obS.nextBtn, { flex: 1 }]} onPress={goStep3}>
                <Text style={obS.nextBtnTxt}>{refCodeChecking ? '코드 확인 중…' : '다음 →'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={obS.stepLabel}>3단계 · 알림</Text>

            {/* ── 강한 어필: 혼자 써도 강력한 이유 ── */}
            <View style={{ backgroundColor: '#F5F0E4', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C', padding: 16, marginBottom: 18 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, lineHeight: 25 }}>
                골프 가는 날,{'\n'}몇 시에 일어날지 계산해 깨워드려요 ⛳
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#6B5A2E', lineHeight: 20, marginTop: 10 }}>
                티오프 시간에 <Text style={{ fontFamily: F.sysSb }}>실시간 교통(이동시간)</Text>과{'\n'}
                <Text style={{ fontFamily: F.sysSb }}>나만의 준비 습관</Text>까지 더해서,{'\n'}
                <Text style={{ fontFamily: F.sysSb, color: C.charcoal }}>기상 시각 · 출발 시각</Text>을 자동으로 알려드려요.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#D8C384' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#8B6914', lineHeight: 18 }}>
                  🔔 04:42 기상   ·   🚗 05:42 출발   ·   🏌️ 07:12 티오프{'\n'}
                  새벽 라운드, 더는 늦잠·지각 걱정 없이.
                </Text>
              </View>
            </View>

            {/* 준비시간 — 개인차가 큰 핵심 값 */}
            <Text style={obS.label}>집에서 나갈 준비, 보통 얼마나 걸려요?</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 8, lineHeight: 16 }}>
              화장·짐 챙기는 시간이요. 사람마다 달라서 한 번만 정해두면 평생 적용돼요.
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
              {PREP_OPTS.map(m => {
                const on = prepMin === m;
                return (
                  <TouchableOpacity key={m} activeOpacity={0.8} onPress={() => setPrepMin(m)}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgSecondary }}>
                    <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(13), color: on ? C.burgundy : C.warmGray }}>{m}분</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 도착여유 */}
            <Text style={obS.label}>구장엔 티오프 몇 분 전에 도착하나요?</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 18 }}>
              {ARRIVE_OPTS.map(m => {
                const on = arriveBufferMin === m;
                return (
                  <TouchableOpacity key={m} activeOpacity={0.8} onPress={() => setArriveBufferMin(m)}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgSecondary }}>
                    <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(13), color: on ? C.burgundy : C.warmGray }}>{arriveLabel(m)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 어떤 알림을 자동으로 받을지 */}
            <Text style={obS.label}>자동으로 받을 알림</Text>
            {[
              { key: 'wake', on: wakeOn, set: setWakeOn, icon: '🔔', title: '기상 알림', sub: '새벽 라운드, 일어날 시각에' },
              { key: 'depart', on: departOn, set: setDepartOn, icon: '🚗', title: '출발 알림', sub: '출발지에서 나설 시각에' },
            ].map(it => (
              <TouchableOpacity key={it.key} activeOpacity={0.7} onPress={() => it.set(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: it.on ? C.burgundy : C.hairline, backgroundColor: it.on ? '#F5EAEC' : C.bgSecondary }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: it.on ? C.burgundy : C.warmGrayLight, backgroundColor: it.on ? C.burgundy : 'transparent' }}>
                  {it.on && <Text style={{ color: C.butter, fontSize: fs(13), fontWeight: '700' }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{it.icon} {it.title}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{it.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17, marginTop: 12 }}>
              💡 <Text style={{ fontFamily: F.sysSb }}>마이페이지에 자주 가는 출발지</Text>만 저장하면 이동시간을 계산해 자동으로 챙겨드려요.{'\n'}
              D-3 · D-1 · 당일 알림도 함께 받아요. 모두 마이페이지에서 바꿀 수 있어요.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <TouchableOpacity style={[obS.nextBtn, { flex: 0, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.hairline }]}
                onPress={() => setStep(2)}>
                <Text style={[obS.nextBtnTxt, { color: C.warmGray }]}>이전</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[obS.nextBtn, { flex: 1 }]} onPress={handleComplete}>
                <Text style={obS.nextBtnTxt}>시작하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </SafeAreaView>
  );
}
