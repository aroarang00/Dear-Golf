import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, Linking, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { getCurrentLocation, hasLocationPermission } from '../utils/location';

const { width: SW } = Dimensions.get('window');

// 카드 하단 기능 하이라이트 한 줄 (아이콘 + 제목 + 설명)
function Feature({ icon, title, sub }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
        alignItems: 'center', justifyContent: 'center', marginRight: 12,
      }}>
        <Text style={{ fontSize: 17 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{title}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

// 6장 스와이프 인트로 — 기능 소개 + 명예의 전당 + 위치 권한 안내. 완료(시작하기) 시 프로필 입력 온보딩으로 연결
export function OnboardingIntro({ onDone }) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);
  const [locStatus, setLocStatus] = useState('idle'); // idle | granted | denied

  // 위치 권한 요청 — OS 팝업을 띄우고 결과를 반영
  async function handleLocation() {
    const loc = await getCurrentLocation();
    setLocStatus(loc ? 'granted' : 'denied');
  }

  // 거부 후 OS 설정에서 허용하고 돌아오면 상태 자동 갱신
  useEffect(() => {
    if (locStatus !== 'denied') return;
    const sub = AppState.addEventListener('change', async s => {
      if (s === 'active' && (await hasLocationPermission())) setLocStatus('granted');
    });
    return () => sub.remove();
  }, [locStatus]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <ScrollView
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}>

        {/* 1 — Dear Golf 인트로 (팔레스카이 배경) */}
        <View style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 44, color: C.charcoal }}>Dear Golf</Text>
          <View style={{ width: 52, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginVertical: 20 }} />
          <Text style={{ fontFamily: F.sys, fontSize: 16, color: '#1A3D52', fontWeight: '600', letterSpacing: 1 }}>나만의 골프 캐디</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: 'rgba(26,61,82,0.6)', marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
            일정부터 기록까지,{'\n'}골프 라이프를 한 곳에서
          </Text>
        </View>

        {/* 2 — 라운딩 준비 (새 스타일: 데모 앱 화면 + 한 줄 설명) */}
        {/* ⚠️ 데모 — 닉네임·구장·일정 전부 가짜 샘플 데이터 (실제 사용자 정보 아님) */}
        <View style={{ width: SW, backgroundColor: C.navy }}>
          {/* 위쪽 — 실제 홈 화면 모양의 데모 화면 */}
          <View style={{ flex: 1, backgroundColor: '#0a1e10', paddingTop: insets.top + 12 }}>
            {/* 삼색 스트라이프 */}
            <View style={{ flexDirection: 'row', height: 3 }}>
              <View style={{ flex: 1, backgroundColor: C.butter }} />
              <View style={{ flex: 1, backgroundColor: C.paleSky }} />
              <View style={{ flex: 1, backgroundColor: C.burgundy }} />
            </View>
            {/* 헤더 */}
            <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 2, marginBottom: 4 }}>나만의 골프 캐디</Text>
              <Text style={{ fontFamily: F.en, fontSize: 32, color: '#fff', fontStyle: 'italic' }}>Dear Golf</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 5 }}>
                안녕하세요, <Text style={{ color: C.butter, fontWeight: '600' }}>민지</Text>님
              </Text>
            </View>
            {/* 예정 라운딩 카드 */}
            <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, paddingHorizontal: 22, marginTop: 26, marginBottom: 10 }}>예정 라운딩</Text>
            <View style={{ paddingHorizontal: 22, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: '#fff', marginBottom: 4 }}>제이드팰리스 GC</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>5월 24일 토 · 07:30</Text>
                <Text style={{ fontFamily: F.en, fontSize: 52, color: C.butter, marginTop: 6 }}>D-7</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <View style={{ backgroundColor: 'rgba(200,217,230,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#C8D9E6' }}>☀ 22°</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>🚗 1시간 20분</Text>
                  </View>
                </View>
              </View>
              <View style={{ width: 92, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12, justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff' }}>로얄CC</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>06.03 수</Text>
                </View>
                <Text style={{ fontFamily: F.en, fontSize: 24, color: 'rgba(245,230,168,0.8)' }}>D-17</Text>
              </View>
            </View>
            {/* 골퍼 코멘트 카드 */}
            <View style={{ marginHorizontal: 22, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 9, color: '#F5E6A8', letterSpacing: 1, marginBottom: 6 }}>골퍼 코멘트</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.8)', borderLeftWidth: 2, borderLeftColor: 'rgba(200,217,230,0.35)', paddingLeft: 8, lineHeight: 18 }}>
                페어웨이 상태가 정말 좋았어요. 그늘집 추천!
              </Text>
            </View>
          </View>
          {/* 아래쪽 — 한 줄 설명 패널 */}
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 30 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              일정·날씨·교통을 한 곳에서
            </Text>
          </View>
        </View>

        {/* 3 — 기록·통계 (워밍그레이 상단 배너) */}
        <View style={{ width: SW, backgroundColor: C.bgPrimary }}>
          <View style={{ backgroundColor: C.warmGray, paddingTop: insets.top + 28, paddingBottom: 26, paddingHorizontal: 36 }}>
            <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: 2 }}>02</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 21, color: '#fff', fontWeight: '700', marginTop: 4 }}>기록 · 통계</Text>
          </View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingVertical: 24, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, lineHeight: 21, marginBottom: 18 }}>
              스코어·메모부터 사진·가계부·해외 기록까지,{'\n'}100대 코스 도전하기 현황도 한눈에 모아봐요.
            </Text>
            {/* 미니 라운딩 기록 카드 예시 */}
            <View style={{ backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 16 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>2026.05.24 토</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '600', marginTop: 3 }}>제이드팰리스 GC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <Text style={{ fontFamily: F.en, fontSize: 30, color: C.charcoal, fontWeight: '700' }}>88</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray }}>타 · +16</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.burgundy, paddingLeft: 8, marginTop: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary }}>드라이버가 잘 맞은 날 ⛳</Text>
              </View>
            </View>
            {/* 기능 하이라이트 */}
            <View style={{ marginTop: 24, gap: 16 }}>
              <Feature icon="🏆" title="코스별 베스트·평균" sub="어느 코스가 잘 맞는지 한눈에" />
              <Feature icon="✍️" title="한줄 다이어리" sub="그날의 감각을 짧게 남기기" />
              <Feature icon="📊" title="라운딩 통계 요약" sub="평균타·베스트·라운딩 수를 한눈에" />
              <Feature icon="📷" title="라운딩 사진 기록" sub="그날의 코스·순간을 사진으로 함께" />
              <Feature icon="💰" title="골프 가계부" sub="그린피·식대 등 라운딩 지출 관리" />
              <Feature icon="🌏" title="해외 라운딩 기록" sub="해외 골프장 기록도 저장해 한눈에" />
              <Feature icon="⛳" title="100대 코스 도전하기" sub="국내 100대 코스, 몇 곳이나 갔는지 확인" />
            </View>
          </ScrollView>
        </View>

        {/* 4 — 명예의 전당 (버건디 상단 배너) */}
        <View style={{ width: SW, backgroundColor: C.bgPrimary }}>
          <View style={{ backgroundColor: C.burgundy, paddingTop: insets.top + 28, paddingBottom: 26, paddingHorizontal: 36 }}>
            <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 14, color: C.butter, letterSpacing: 2 }}>03</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 21, color: '#fff', fontWeight: '700', marginTop: 4 }}>명예의 전당</Text>
          </View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingVertical: 24, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, lineHeight: 21, marginBottom: 18 }}>
              홀인원·알바트로스·이글 같은 특별한 순간은{'\n'}자동으로 기념 카드가 만들어져 따로 보관돼요.
            </Text>
            {/* 미니 명예의 전당 카드 예시 */}
            <View style={{ backgroundColor: '#2A2622', borderRadius: 14, borderWidth: 0.5, borderColor: '#C9A84C44', padding: 16 }}>
              <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 17, color: '#C9A84C', letterSpacing: 3 }}>HOLE IN ONE</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>2024.09.15 · 제이드팰리스 GC</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: 9 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 7, color: '#C9A84CAA', letterSpacing: 2 }}>HOLE</Text>
                  <Text style={{ fontFamily: F.en, fontSize: 19, color: '#C9A84C', marginTop: 2 }}>7번홀</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, padding: 9 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 7, color: '#C9A84CAA', letterSpacing: 2 }}>PAR · DIST</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 5 }}>파3 · 156m</Text>
                </View>
              </View>
            </View>
            {/* 기능 하이라이트 */}
            <View style={{ marginTop: 24, gap: 16 }}>
              <Feature icon="🏆" title="홀인원·알바트로스·이글" sub="특별한 한 샷이 자동으로 기념 카드로" />
              <Feature icon="⛳" title="퍼스트 싱글·라이프 베스트" sub="기록 경신의 순간도 명예의 전당에" />
              <Feature icon="📇" title="그 순간 그대로" sub="홀·파·거리·볼·동반자까지 카드에 새겨서" />
              <Feature icon="📖" title="따로 모아보기" sub="다이어리 상단에서 특별한 순간만 펼쳐보기" />
            </View>
          </ScrollView>
        </View>

        {/* 5 — 위치 권한 안내 (팔레스카이 배너) */}
        <View style={{ width: SW, backgroundColor: C.bgPrimary }}>
          <View style={{ backgroundColor: C.paleSky, paddingTop: insets.top + 28, paddingBottom: 26, paddingHorizontal: 36 }}>
            <Text style={{ fontFamily: F.en, fontStyle: 'italic', fontSize: 14, color: '#1A3D52', letterSpacing: 2 }}>04</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 21, color: C.charcoal, fontWeight: '700', marginTop: 4 }}>위치 권한</Text>
          </View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingVertical: 24, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, lineHeight: 21, marginBottom: 20 }}>
              현재 위치를 알려주시면 더 편하게 쓸 수 있어요.{'\n'}허용은 선택이고, 언제든 바꿀 수 있어요.
            </Text>
            {/* 위치로 가능한 것 */}
            <View style={{ gap: 16 }}>
              <Feature icon="📍" title="출발지 자동 설정" sub="라운딩 가는 길, 출발지를 알아서 채워요" />
              <Feature icon="☀️" title="현재 위치 날씨" sub="지금 있는 곳의 날씨를 바로 확인" />
              <Feature icon="⛳" title="주변 골프 시설" sub="가까운 연습장·스크린골프를 추천" />
            </View>
            {/* 권한 요청 버튼 */}
            <TouchableOpacity onPress={handleLocation} activeOpacity={0.85}
              disabled={locStatus === 'granted'}
              style={{
                marginTop: 28, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                backgroundColor: locStatus === 'granted' ? C.hairline : C.charcoal,
              }}>
              <Text style={{
                fontFamily: F.sys, fontSize: 14, fontWeight: '600',
                color: locStatus === 'granted' ? C.warmGray : C.butter,
              }}>
                {locStatus === 'granted' ? '✓ 위치 권한 허용됨' : '위치 권한 허용하기'}
              </Text>
            </TouchableOpacity>
            {locStatus === 'denied' && (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy, textAlign: 'center', lineHeight: 17 }}>
                  권한이 거부됐어요. 실수로 거부했다면{'\n'}휴대폰 설정에서 다시 허용할 수 있어요.
                </Text>
                <TouchableOpacity onPress={() => Linking.openSettings()} activeOpacity={0.85}
                  style={{ marginTop: 10, borderWidth: 1, borderColor: C.charcoal, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 22 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>설정 열기</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 14, textAlign: 'center' }}>
              건너뛰고 나중에 설정해도 괜찮아요
            </Text>
          </ScrollView>
        </View>

        {/* 6 — 시작 (팔레스카이 배경) */}
        <View style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 44, marginBottom: 14 }}>⛳</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 21, color: C.charcoal, fontWeight: '700' }}>지금 시작해보세요</Text>
          <Text style={{ fontFamily: F.sys, fontSize: 13, color: 'rgba(26,61,82,0.65)', marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
            간단한 프로필만 입력하면{'\n'}바로 사용할 수 있어요
          </Text>
          <TouchableOpacity onPress={onDone} activeOpacity={0.85}
            style={{ marginTop: 30, backgroundColor: C.charcoal, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 52 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.butter, fontWeight: '600', letterSpacing: 1 }}>시작하기</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* 하단 스와이프 인디케이터 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 14, paddingBottom: insets.bottom + 14 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <View key={i} style={{
            width: idx === i ? 22 : 7, height: 7, borderRadius: 4,
            backgroundColor: idx === i ? C.burgundy : C.hairline,
          }} />
        ))}
      </View>
    </View>
  );
}
