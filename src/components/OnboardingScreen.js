import React, { useState, useRef } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { obS } from '../styles/obS';
import { Icon } from './common/Icon'; // 아이콘 — 유니코드 이모지 금지, 커스텀 SVG만
import { TripleStripe } from './common/TripleStripe';
import { getUid } from '../utils/firebase';
import { saveReferredBy, validateRefCode } from '../utils/referral';
import { searchPlaces } from '../utils/kakao';                 // 출발지 주소 검색(마이페이지와 동일)
import { savePrivateDeparture } from '../utils/privateProfile'; // 출발지 비공개 저장(기기 간 유지)
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller'; // 안드 키보드 입력칸 가림 방지

// 준비시간(집에서 나갈 때까지)·도착여유(구장 도착~티오프) 칩 선택지(분) — 개인차가 커 한 번만 정해두면 평생 적용
const PREP_OPTS = [15, 30, 45, 60];
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
  // 출발지(선택) — 넣으면 교통 소요·출발 시간 안내에 바로 쓰인다. 마이페이지 '자주 가는 출발지'와 동일 방식(카카오 검색).
  const [departure, setDeparture] = useState(seed.departure || '');
  const [departureCoord, setDepartureCoord] = useState(seed.departureCoord || null);
  const [depResults, setDepResults] = useState([]);
  const [depSearching, setDepSearching] = useState(false);
  const depTimerRef = useRef(null);
  const handleDepartureChange = (t) => {
    setDeparture(t); setDepartureCoord(null);   // 직접 수정하면 이전 좌표 무효
    if (depTimerRef.current) clearTimeout(depTimerRef.current);
    const q = t.trim();
    if (q.length < 2) { setDepResults([]); setDepSearching(false); return; }
    setDepSearching(true);
    depTimerRef.current = setTimeout(async () => {
      const results = await searchPlaces(q);
      setDepResults(results || []); setDepSearching(false);
    }, 350);
  };
  const handleSelectDeparture = (r) => {
    if (depTimerRef.current) clearTimeout(depTimerRef.current);
    setDeparture(r.name); setDepartureCoord({ x: r.x, y: r.y }); setDepResults([]); setDepSearching(false);
  };
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

  // 카카오 로그인 유저만 '카카오 친구 찾기' 단계 노출(애플·비카카오는 카카오 세션 없음)
  const isKakao = !!seed.kakaoLinked && !seed.appleLinked;
  const handleComplete = (openKakaoFriends = false) => {
    const nick = nickname.trim() || '';
    if (!nick) return;
    // 추천인 코드 기록 — 잠복 배포([[referral-reward-implementation-plan]]): 유효하면 users.referredBy에
    //   1회 기록만(set-once). 보상 지급·최종 검증은 추후 CF가 소급 처리하므로 온보딩을 막지 않는 best-effort.
    if (refCodeInput.trim() && !seed.isReturning) {
      getUid().then((uid) => uid && saveReferredBy(uid, refCodeInput)).catch(() => {});
    }
    // 출발지 — 비공개 서브컬렉션에도 저장(기기 간·재설치 후 유지). 좌표 없이 텍스트만 있어도 교통 화면이 지오코딩해 씀.
    if (departure.trim()) {
      getUid().then((uid) => uid && savePrivateDeparture(uid, departure.trim(), departureCoord)).catch(() => {});
    }
    const best = parseInt(lifeBest) || 99;
    onComplete({
      nickname: nick,
      realName: realName || '',
      departure: departure.trim(),
      departureCoord: departureCoord || null,
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
      appleLinked: !!seed.appleLinked,   // Apple 로그인 유저 — 카카오 전용 문구·기능 분기용
      kakaoId: seed.kakaoId || null,
      // 약관 동의 데이터 — 변경 시 재동의 트리거용 legalVersion 보존
      consent: consent || null,
      // 가입 직후 카카오 친구 찾기 자동 열기 신호(App.js가 소비) — 4단계 CTA에서만 true
      openKakaoFriends: !!openKakaoFriends,
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
        <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, marginBottom: 20 }}>나만의 골프 캐디를 시작해요</Text>
        {/* 진행 표시 — 3구간 세그먼트, 현재 단계까지 버건디로 채움(시각 리듬 + 위치 안내) */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 30 }}>
          {Array.from({ length: isKakao ? 4 : 3 }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: (i + 1) <= step ? C.burgundy : C.hairline }} />
          ))}
        </View>

        {step === 1 && (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(107,30,42,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name="person" size={28} color={C.burgundy} strokeWidth={1.8} />
              </View>
              <Text style={obS.stepLabel}>1단계 · 프로필</Text>
              <Text style={obS.stepTitle}>어떻게 부를까요?</Text>
              <Text style={obS.stepSub}>닉네임과 출발지를 알려주세요</Text>
            </View>
            {seed.kakaoLinked && !seed.appleLinked && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                <Icon name="chat" size={fs(11)} color="#8B6914" strokeWidth={1.8} />
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11), color: '#8B6914' }}>
                  카카오 닉네임을 가져왔어요 — 그대로 쓰거나 수정할 수 있어요
                </Text>
              </View>
            )}
            {seed.appleLinked && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#8B6914', marginBottom: 10 }}>
                 Apple 계정으로 로그인했어요 — 사용할 닉네임을 정해주세요
              </Text>
            )}
            <Text style={obS.label}>닉네임</Text>
            <AppTextInput style={obS.input} placeholder="민지 / Jessica" placeholderTextColor={C.warmGrayLight}
              value={nickname} onChangeText={(t) => setNickname(t.slice(0, 10))}
              autoCapitalize="none" autoCorrect={false} keyboardType="default" />{/* maxLength 금지 — 한글 조합 충돌 [[project_textinput_maxlength_hangul_bug]] */}
            <Text style={obS.label}>본명 (선택)</Text>
            <AppTextInput style={obS.input} placeholder="김골프" placeholderTextColor={C.warmGrayLight}
              value={realName} onChangeText={setRealName} />
            {/* 본명 장려 — 한 줄로(마스킹 고지 포함, [[realname-policy]]·[[feedback_concise_scannable_copy]]) */}
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18, marginTop: 6, marginBottom: 4 }}>
              친구·동반자 찾기가 정확해져요 · 검색엔 '김*프'처럼 일부만 보여요
            </Text>

            <Text style={obS.label}>출발지 (선택)</Text>
            <AppTextInput style={obS.input} placeholder="동·아파트·건물명으로 검색"
              placeholderTextColor={C.warmGrayLight} value={departure}
              onChangeText={handleDepartureChange} autoCapitalize="none" autoCorrect={false} />
            {depSearching && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>검색 중…</Text>
            )}
            {!depSearching && depResults.length > 0 && (
              <View style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', backgroundColor: C.bgSecondary }}>
                {depResults.map((r, i) => (
                  <TouchableOpacity key={r.kakaoId || i} activeOpacity={0.7} onPress={() => handleSelectDeparture(r)}
                    style={{ paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }} numberOfLines={1}>{r.name}</Text>
                    {!!r.loc && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 1 }} numberOfLines={1}>{r.loc}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: departureCoord ? '#3C7D4F' : C.warmGray, lineHeight: 18, marginTop: 6, marginBottom: 4 }}>
              {departureCoord
                ? '✓ 라운딩 날 교통 소요·출발 시간을 알려드려요'
                : '라운딩 날 교통 소요·출발 시간 안내에 써요 · 나중에 입력해도 돼요'}
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
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(94,126,66,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name="flag" size={28} color="#5E7E42" strokeWidth={1.8} />
              </View>
              <Text style={obS.stepLabel}>2단계 · 골프 정보</Text>
              <Text style={obS.stepTitle}>실력을 알려주세요</Text>
              <Text style={obS.stepSub}>딱 맞는 기록·통계로 도와드려요</Text>
            </View>
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
            {/* 추천인 코드(선택) — 신규 가입만. 초대 문구(shareInvite)에 동봉된 코드와 짝 ([[referral-reward-implementation-plan]])
            ★Apple 가입자 제외 — 보상 CF(referral.js)가 kakaoId 필수(원장 키=kakaoSub)라 입력해도 영구 미지급.
            입력란·혜택문구를 보여주면 빈 약속이 됨 → 원장 키 uid 일반화 전까지 숨김(2026-07-11 감사 ③). */}
            {!seed.isReturning && !seed.appleLinked && (
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
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <View style={{ marginTop: 1 }}><Icon name="gem" size={fs(13)} color="#8B6914" strokeWidth={1.8} /></View>
                    <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(12.5), color: '#8B6914', lineHeight: 19 }}>
                      초대해 준 친구의 코드를 입력하면{'\n'}두 분 모두 사진 +20장, 영상 +1개 보관 공간이 늘어나요
                    </Text>
                  </View>
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
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(107,30,42,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name="bell" size={28} color={C.burgundy} strokeWidth={1.8} />
              </View>
              <Text style={obS.stepLabel}>3단계 · 알림</Text>
              <Text style={obS.stepTitle}>제때 챙겨드릴게요</Text>
              <Text style={obS.stepSub}>라운딩 준비, 알아서 알려드려요</Text>
            </View>

            {/* ── 강한 어필: 혼자 써도 강력한 이유 ── */}
            <View style={{ backgroundColor: '#F5F0E4', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C', padding: 16, marginBottom: 18 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, lineHeight: 25 }}>
                골프 가는 날,{'\n'}몇 시에 일어날지 계산해 깨워드려요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#6B5A2E', lineHeight: 20, marginTop: 10 }}>
                티오프 시간에 <Text style={{ fontFamily: F.sysSb }}>실시간 교통(이동시간)</Text>과{'\n'}
                <Text style={{ fontFamily: F.sysSb }}>나만의 준비 습관</Text>까지 더해서,{'\n'}
                <Text style={{ fontFamily: F.sysSb, color: C.charcoal }}>기상 시각 · 출발 시각</Text>을 자동으로 알려드려요.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#D8C384' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#8B6914', lineHeight: 18 }}>
                  04:42 기상   ·   05:42 출발   ·   07:12 티오프{'\n'}
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
                    <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(13), color: on ? C.burgundy : C.warmGray }}>{m === 60 ? '1시간' : `${m}분`}</Text>
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
              { key: 'wake', on: wakeOn, set: setWakeOn, icon: 'bell', title: '기상 알림', sub: '새벽 라운드, 일어날 시각에' },
              { key: 'depart', on: departOn, set: setDepartOn, icon: 'car', title: '출발 알림', sub: '출발지에서 나설 시각에' },
            ].map(it => (
              <TouchableOpacity key={it.key} activeOpacity={0.7} onPress={() => it.set(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: it.on ? C.burgundy : C.hairline, backgroundColor: it.on ? '#F5EAEC' : C.bgSecondary }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: it.on ? C.burgundy : C.warmGrayLight, backgroundColor: it.on ? C.burgundy : 'transparent' }}>
                  {it.on && <Text style={{ color: C.butter, fontSize: fs(13), fontWeight: '700' }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name={it.icon} size={fs(15)} color={it.on ? C.burgundy : C.charcoal} strokeWidth={1.9} />
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{it.title}</Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{it.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 12 }}>
              <View style={{ marginTop: 1 }}><Icon name="bulb" size={fs(11)} color={C.warmGray} strokeWidth={1.8} /></View>
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                <Text style={{ fontFamily: F.sysSb }}>마이페이지에 자주 가는 출발지</Text>만 저장하면 이동시간을 계산해 자동으로 챙겨드려요.{'\n'}
                D-3 · D-1 · 당일 알림도 함께 받아요. 모두 마이페이지에서 바꿀 수 있어요.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <TouchableOpacity style={[obS.nextBtn, { flex: 0, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.hairline }]}
                onPress={() => setStep(2)}>
                <Text style={[obS.nextBtnTxt, { color: C.warmGray }]}>이전</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[obS.nextBtn, { flex: 1 }]} onPress={() => (isKakao ? setStep(4) : handleComplete(false))}>
                <Text style={obS.nextBtnTxt}>{isKakao ? '다음 →' : '시작하기'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 4 && isKakao && (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(94,126,66,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name="people" size={28} color="#5E7E42" strokeWidth={1.8} />
              </View>
              <Text style={obS.stepLabel}>4단계 · 친구</Text>
              <Text style={obS.stepTitle}>같이 하면 더 재밌어요</Text>
              <Text style={obS.stepSub}>카카오 친구 중 디어골프 쓰는 분을 찾아드려요</Text>
            </View>

            {/* 혜택 카드 — 골드 톤(다른 단계 강조 카드와 통일) */}
            <View style={{ backgroundColor: '#F5F0E4', borderRadius: 14, padding: 16, marginBottom: 8 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, lineHeight: 23 }}>
                친구와 함께면 기록도, 라운딩 약속도 훨씬 편해요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: '#6B5A2E', lineHeight: 19, marginTop: 8 }}>
                친구를 초대하면 사진·영상 보관 공간도 늘어나요 · 카카오 친구목록은 이 단계에서만 봐요(따로 저장 안 함)
              </Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, lineHeight: 17, marginTop: 4, marginBottom: 4 }}>
              누르면 카카오 친구목록 동의 후, 디어골프를 쓰는 친구만 보여드려요
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={[obS.nextBtn, { flex: 0, backgroundColor: C.bgSecondary, borderWidth: 1, borderColor: C.hairline }]}
                onPress={() => handleComplete(false)}>
                <Text style={[obS.nextBtnTxt, { color: C.warmGray }]}>나중에</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[obS.nextBtn, { flex: 1 }]} onPress={() => handleComplete(true)}>
                <Text style={obS.nextBtnTxt}>카카오 친구 찾기</Text>
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
