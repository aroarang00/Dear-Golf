import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, Linking, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
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
        <Text style={{ fontSize: fs(17) }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{title}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

// 9장 스와이프 인트로 — 기능 소개 + 명예의 전당 + 골프 친구 + 라운지 + 코스 + 위치 권한 안내. 완료(시작하기) 시 프로필 입력 온보딩으로 연결
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
        <View style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          {/* italic Lora 'f' 디센더 잘림 방지 — lineHeight 명시 + allowFontScaling false + 가로 여유 */}
          <Text allowFontScaling={false}
            style={{ fontFamily: F.brand, fontSize: fs(44), lineHeight: fs(56), color: C.charcoal, paddingHorizontal: 6 }}>
            Dear Golf
          </Text>
          <View style={{ width: 52, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginVertical: 20 }} />
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: '#1A3D52', letterSpacing: 1 }}>나만의 골프 캐디</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(26,61,82,0.6)', marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
            혼자서도, 함께서도{'\n'}골프 라이프를 한 곳에서
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
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.55)', letterSpacing: 2, marginBottom: 4 }}>나만의 골프 캐디</Text>
              <Text style={{ fontFamily: F.brand, fontSize: fs(32), color: '#fff' }}>Dear Golf</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.7)', marginTop: 5 }}>
                안녕하세요, <Text style={{ fontFamily: F.sysSb, color: C.butter }}>민지</Text>님
              </Text>
            </View>
            {/* 예정 라운딩 카드 */}
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.5)', letterSpacing: 2, paddingHorizontal: 22, marginTop: 26, marginBottom: 10 }}>예정 라운딩</Text>
            <View style={{ paddingHorizontal: 22, flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: '#fff', marginBottom: 4 }}>제이드팰리스 GC</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.5)' }}>5월 24일 토 · 07:30</Text>
                <Text style={{ fontFamily: F.en, fontSize: fs(52), color: C.butter, marginTop: 6 }}>D-7</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <View style={{ backgroundColor: 'rgba(200,217,230,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: '#C8D9E6' }}>☀ 22°</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.7)' }}>🚗 1시간 20분</Text>
                  </View>
                </View>
              </View>
              <View style={{ width: 92, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12, justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#fff' }}>로얄CC</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(9), color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>06.03 수</Text>
                </View>
                <Text style={{ fontFamily: F.en, fontSize: fs(24), color: 'rgba(245,230,168,0.8)' }}>D-17</Text>
              </View>
            </View>
            {/* 골퍼 코멘트 카드 */}
            <View style={{ marginHorizontal: 22, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(9), color: '#F5E6A8', letterSpacing: 1, marginBottom: 6 }}>골퍼 코멘트</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.8)', borderLeftWidth: 2, borderLeftColor: 'rgba(200,217,230,0.35)', paddingLeft: 8, lineHeight: 18 }}>
                페어웨이 상태가 정말 좋았어요. 그늘집 추천!
              </Text>
            </View>
          </View>
          {/* 아래쪽 — 한 줄 설명 패널 */}
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 30 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              일정·날씨·교통을 한눈에
            </Text>
          </View>
        </View>

        {/* 3 — 기록·통계 (새 스타일: 데모 화면 + 한 줄 설명 / 전부 가짜 샘플) */}
        <View style={{ width: SW, backgroundColor: C.burgundy }}>
          <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top + 12 }}>
            <View style={{ flexDirection: 'row', height: 3 }}>
              <View style={{ flex: 1, backgroundColor: C.butter }} />
              <View style={{ flex: 1, backgroundColor: C.paleSky }} />
              <View style={{ flex: 1, backgroundColor: C.burgundy }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, letterSpacing: 2, marginBottom: 3 }}>나의 라운딩 기록</Text>
              <Text style={{ fontFamily: F.en, fontSize: fs(30), color: C.charcoal }}>MY</Text>
            </View>
            <View style={{ flexDirection: 'row', paddingHorizontal: 24, gap: 10, marginTop: 18 }}>
              {[['라운딩', '24'], ['평균타', '92'], ['베스트', '78']].map(([l, v]) => (
                <View key={l} style={{ flex: 1, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.en, fontSize: fs(24), color: C.charcoal, fontWeight: '700' }}>{v}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>{l}</Text>
                </View>
              ))}
            </View>
            <View style={{ marginHorizontal: 24, marginTop: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>2026.05.24 토 · 제이드팰리스 GC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(30), color: C.burgundy, fontWeight: '700' }}>88</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>타 · +16</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.burgundy, paddingLeft: 8, marginTop: 6 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>드라이버가 잘 맞은 날 ⛳</Text>
              </View>
            </View>
            <View style={{ marginHorizontal: 24, marginTop: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>2026.04.18 토 · 안성베네스트 CC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(30), color: C.charcoal, fontWeight: '700' }}>91</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>타 · +19</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.hairline, paddingLeft: 8, marginTop: 6 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>퍼팅 감이 좋았던 하루 ⛳</Text>
              </View>
            </View>
            <View style={{ marginHorizontal: 24, marginTop: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>2026.03.22 일 · 남서울 CC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(30), color: C.charcoal, fontWeight: '700' }}>85</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>타 · +13</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.hairline, paddingLeft: 8, marginTop: 6 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>아이언이 살아난 라운드 ⛳</Text>
              </View>
            </View>
          </View>
          <View style={{ backgroundColor: C.burgundy, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 30 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              나만의 골프 기록을 모아서
            </Text>
          </View>
        </View>

        {/* 4 — 명예의 전당 (새 스타일: 데모 화면 + 한 줄 설명 / 전부 가짜 샘플) */}
        <View style={{ width: SW, backgroundColor: C.charcoal }}>
          <View style={{ flex: 1, backgroundColor: '#2A2622', paddingTop: insets.top + 12 }}>
            <View style={{ flexDirection: 'row', height: 3 }}>
              <View style={{ flex: 1, backgroundColor: C.butter }} />
              <View style={{ flex: 1, backgroundColor: C.paleSky }} />
              <View style={{ flex: 1, backgroundColor: C.burgundy }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 18 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(201,168,76,0.7)', letterSpacing: 3, marginBottom: 4 }}>HALL OF FAME</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.butter }}>명예의 전당</Text>
            </View>
            <View style={{ marginHorizontal: 24, marginTop: 18, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.5)', padding: 18 }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(21), color: '#C9A84C', letterSpacing: 3 }}>HOLE IN ONE</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>2024.09.15 · 제이드팰리스 GC</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 11 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(8), color: 'rgba(201,168,76,0.75)', letterSpacing: 2 }}>HOLE</Text>
                  <Text style={{ fontFamily: F.en, fontSize: fs(20), color: '#C9A84C', marginTop: 4 }}>7번홀</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 11 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(8), color: 'rgba(201,168,76,0.75)', letterSpacing: 2 }}>PAR · DIST</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.85)', marginTop: 7 }}>파3 · 156m</Text>
                </View>
              </View>
            </View>
            {/* 첫 싱글 카드 */}
            <View style={{ marginHorizontal: 24, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(200,217,230,0.45)', padding: 18, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(17), color: '#C8D9E6', letterSpacing: 2 }}>FIRST SINGLE</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginTop: 4 }}>퍼스트 싱글 달성</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>2025.06.20 · 우정힐스 CC</Text>
              </View>
              <Text style={{ fontFamily: F.en, fontSize: fs(38), color: '#C8D9E6', fontWeight: '700' }}>79</Text>
            </View>
            {/* 이글 카드 */}
            <View style={{ marginHorizontal: 24, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(168,197,137,0.5)', padding: 18, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(17), color: '#A8C589', letterSpacing: 2 }}>EAGLE</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginTop: 4 }}>14번홀 파5 · 이글</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>2025.09.07 · 블랙스톤 제주</Text>
              </View>
              <Text style={{ fontFamily: F.en, fontSize: fs(36), color: '#A8C589', fontWeight: '700' }}>−2</Text>
            </View>
          </View>
          <View style={{ backgroundColor: C.charcoal, paddingHorizontal: 32, paddingTop: 32, paddingBottom: 30 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              특별한 순간은 명예의 전당에
            </Text>
          </View>
        </View>

        {/* 5 — 골프 친구 (네이비 배경) */}
        <View style={{ width: SW, backgroundColor: '#2C4A5E' }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingTop: insets.top + 36, paddingBottom: 28, justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(38), marginBottom: 14 }}>👥</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: '#fff', marginBottom: 10 }}>골프 친구</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.72)', lineHeight: 21, marginBottom: 26 }}>
              함께 칠 골프 친구를 찾아보세요{'\n'}라운딩 모집부터 친구 기록 공유까지
            </Text>
            <View style={{ gap: 16 }}>
              {[
                ['👥', '카카오 친구 중 Dear Golf 유저 찾기'],
                ['🏆', '친구 라운딩 기록 피드 보기'],
                ['👍', '특별한 순간 공유하기'],
              ].map(([icon, txt]) => (
                <View key={txt} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                  }}>
                    <Text style={{ fontSize: fs(17) }}>{icon}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14), color: '#fff' }}>{txt}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 6 — 라운지 (광고성 톤, RoundupIntroModal과 일관) */}
        <View style={{ width: SW, backgroundColor: C.navy }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingTop: insets.top + 36, paddingBottom: 28, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: 'rgba(245,230,168,0.7)', letterSpacing: 2, marginBottom: 10 }}>
              DEAR GOLF · 라운지
            </Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', lineHeight: 32, marginBottom: 10 }}>
              4명 채우기,{'\n'}매번 일일이 연락하세요?
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.72)', lineHeight: 21, marginBottom: 26 }}>
              모집글 한 번에 친구가 알아서 와요.{'\n'}라운지가 도와드릴게요.
            </Text>
            <View style={{ gap: 14 }}>
              {[
                ['👥', '친구공개·친구지정으로 가까운 사람부터'],
                ['💬', '카톡 링크 공유 → 친구가 누르면 자동 확정'],
                ['🛡️', '신뢰·매너 등급으로 안전한 매칭'],
                ['🔔', '관심 모집 알림 — 주최 부담 없이 참여'],
              ].map(([icon, txt]) => (
                <View key={txt} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                  }}>
                    <Text style={{ fontSize: fs(17) }}>{icon}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14), color: '#fff' }}>{txt}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 7 — 코스 */}
        <View style={{ width: SW, backgroundColor: '#2E4A3A' }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingTop: insets.top + 36, paddingBottom: 28, justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(38), marginBottom: 14 }}>🗺️</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: '#fff', marginBottom: 10 }}>코스</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.72)', lineHeight: 21, marginBottom: 26 }}>
              전국 골프장을 찾아보세요{'\n'}100대 코스와 골퍼들의 생생한 평가까지
            </Text>
            <View style={{ gap: 16 }}>
              {[
                ['🔍', '전국 골프장 검색'],
                ['🏆', '100대 코스 한눈에 보기'],
                ['💬', '골퍼들이 남긴 코스 코멘트'],
                ['🍴', '골프장 근처 맛집 정보'],
              ].map(([icon, txt]) => (
                <View key={txt} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                  }}>
                    <Text style={{ fontSize: fs(17) }}>{icon}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14), color: '#fff' }}>{txt}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 8 — 위치 권한 안내 */}
        <View style={{ width: SW, backgroundColor: C.bgPrimary }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingTop: insets.top + 36, paddingBottom: 28, justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(38), marginBottom: 14 }}>📍</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal, marginBottom: 10 }}>위치 권한</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, lineHeight: 21, marginBottom: 24 }}>
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
                fontFamily: F.sysSb, fontSize: fs(14),
                color: locStatus === 'granted' ? C.warmGray : C.butter,
              }}>
                {locStatus === 'granted' ? '✓ 위치 권한 허용됨' : '위치 권한 허용하기'}
              </Text>
            </TouchableOpacity>
            {locStatus === 'idle' && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginTop: 10, lineHeight: 16 }}>
                팝업에서 '앱을 사용하는 동안 허용'을 선택하면{'\n'}앱을 켤 때마다 다시 묻지 않아요
              </Text>
            )}
            {locStatus === 'denied' && (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.burgundy, textAlign: 'center', lineHeight: 17 }}>
                  권한이 거부됐어요. 실수로 거부했다면{'\n'}휴대폰 설정에서 다시 허용할 수 있어요.
                </Text>
                <TouchableOpacity onPress={() => Linking.openSettings()} activeOpacity={0.85}
                  style={{ marginTop: 10, borderWidth: 1, borderColor: C.charcoal, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 22 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>설정 열기</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 14, textAlign: 'center' }}>
              건너뛰고 나중에 설정해도 괜찮아요
            </Text>
          </ScrollView>
        </View>

        {/* 9 — 시작 (팔레스카이 배경) */}
        <View style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: fs(44), marginBottom: 14 }}>⛳</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(21), color: C.charcoal }}>지금 시작해보세요</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(26,61,82,0.65)', marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
            간단한 프로필만 입력하면{'\n'}바로 사용할 수 있어요
          </Text>
          <TouchableOpacity onPress={onDone} activeOpacity={0.85}
            style={{ marginTop: 30, backgroundColor: C.charcoal, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 52 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter, letterSpacing: 1 }}>시작하기</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* 하단 스와이프 인디케이터 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 14, paddingBottom: insets.bottom + 14 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <View key={i} style={{
            width: idx === i ? 22 : 7, height: 7, borderRadius: 4,
            backgroundColor: idx === i ? C.burgundy : C.hairline,
          }} />
        ))}
      </View>
    </View>
  );
}
