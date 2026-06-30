import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, Linking, AppState } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { requestLocationPermission, hasLocationPermission } from '../utils/location';
import { requestNotificationPermission, hasNotificationPermission } from '../utils/notifications';

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

// 9장 스와이프 인트로 — 인트로·라운딩 준비·기록·명예의 전당·라운지(메인 키)·코스·위치 권한·알림 권한·시작. 완료(시작하기) 시 프로필 입력 온보딩으로 연결
export function OnboardingIntro({ onDone }) {
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);
  const [locStatus, setLocStatus] = useState('idle'); // idle | granted | denied
  const [notifStatus, setNotifStatus] = useState('idle'); // idle | granted | denied

  // 위치 권한 요청 — OS 팝업만 띄우고 결과 반영(좌표 수집 X). 실제 위치 사용은 LBS 약관 동의 이후 기능에서.
  async function handleLocation() {
    const granted = await requestLocationPermission();
    setLocStatus(granted ? 'granted' : 'denied');
  }

  // 알림 권한 요청 — 안드13+/iOS는 옵트인이라 미리 받아두면 첫 알람 설정 때 막히지 않음(priming).
  async function handleNotif() {
    const granted = await requestNotificationPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
  }

  // 거부 후 OS 설정에서 허용하고 돌아오면 상태 자동 갱신(위치·알림 공용)
  useEffect(() => {
    if (locStatus !== 'denied' && notifStatus !== 'denied') return;
    const sub = AppState.addEventListener('change', async s => {
      if (s !== 'active') return;
      if (locStatus === 'denied' && (await hasLocationPermission())) setLocStatus('granted');
      if (notifStatus === 'denied' && (await hasNotificationPermission())) setNotifStatus('granted');
    });
    return () => sub.remove();
  }, [locStatus, notifStatus]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 네이티브 페이저 — 안드 ScrollView paging이 슬라이드 내부 세로 스크롤과 겹쳐 뚝뚝 끊기던 것 해소 ([[onboarding-pager-rebuild]]) */}
      <PagerView
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={e => setIdx(e.nativeEvent.position)}>

        {/* 1 — Dear Golf 인트로 (팔레스카이 배경) */}
        <View key="ob1" style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          {/* SplashOverlay와 동일 패턴 — adjustsFontSizeToFit + numberOfLines 1 + lineHeight 미명시
              안드로이드 italic Lora 'f'·'G' 디센더 잘림 방지(메모리: feedback_cross_platform_check) */}
          <View style={{ width: '88%', maxWidth: 420, alignItems: 'center', paddingVertical: 8 }}>
            <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
              style={{
                fontFamily: F.brand, fontSize: fs(44), color: '#1A1A1A', textAlign: 'center',
                textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0,
              }}>
              Dear Golf
            </Text>
          </View>
          <View style={{ width: 52, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginVertical: 20 }} />
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: '#1A3D52', letterSpacing: 0.5, textAlign: 'center', lineHeight: 24 }}>
            라운딩의 모든 순간을{'\n'}더 특별하게
          </Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(26,61,82,0.6)', marginTop: 12, textAlign: 'center', lineHeight: 20 }}>
            좋은 동반자, 그날의 기록까지
          </Text>
        </View>

        {/* 2 — 라운딩 준비 (새 스타일: 데모 앱 화면 + 한 줄 설명) */}
        {/* ⚠️ 데모 — 닉네임·구장·일정 전부 가짜 샘플 데이터 (실제 사용자 정보 아님) */}
        <View key="ob2" style={{ width: SW, backgroundColor: C.navy }}>
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
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.55)', letterSpacing: 0.3, marginBottom: 4 }}>라운딩의 모든 순간을 더 특별하게</Text>
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
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  <View style={{ backgroundColor: 'rgba(200,217,230,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: '#C8D9E6' }}>☀ 22°</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.7)' }}>🚗 1시간 20분</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(245,230,168,0.16)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.butter }}>🔔 기상 4:50</Text>
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
          {/* 아래쪽 — 한 줄 설명 패널 (+ 알람 가치 한 줄: 라운드 준비 페이지라 기상·출발 알람이 결이 맞음) */}
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 32, paddingTop: 20, paddingBottom: 28 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              일정·날씨·교통을 한눈에
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.72)', textAlign: 'center', marginTop: 9, lineHeight: 19 }}>
              이동시간을 계산해 기상·출발 시각까지 알려드려요
            </Text>
          </View>
        </View>

        {/* 3 — 기록·통계 (새 스타일: 데모 화면 + 한 줄 설명 / 전부 가짜 샘플) */}
        <View key="ob3" style={{ width: SW, backgroundColor: C.burgundy }}>
          <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top + 12 }}>
            <View style={{ flexDirection: 'row', height: 3 }}>
              <View style={{ flex: 1, backgroundColor: C.butter }} />
              <View style={{ flex: 1, backgroundColor: C.paleSky }} />
              <View style={{ flex: 1, backgroundColor: C.burgundy }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 14 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, letterSpacing: 2, marginBottom: 2 }}>나의 라운딩 기록</Text>
              <Text style={{ fontFamily: F.en, fontSize: fs(26), color: C.charcoal }}>MY</Text>
            </View>
            {/* 내 스코어 배너 — 실제 MY 탭의 ScoreBanner(navy) 모양 반영(옛 3칸 통계박스 → ScoreBanner 대체).
                평균·베스트·핸디 + 흐름 힌트 + 통계 진입 CTA. */}
            <View style={{ marginHorizontal: 24, marginTop: 12, backgroundColor: C.navy, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>내 스코어</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {[['평균', '92'], ['베스트', '78'], ['핸디', '18']].map(([l, v]) => (
                    <View key={l} style={{ alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: l === '베스트' ? C.butter : '#fff' }}>{v}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(9.5), color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>{l}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: 'rgba(255,255,255,0.72)' }}>최근 좋아지는 중 ↗</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: C.butter }}>통계 자세히 보기 →</Text>
              </View>
            </View>
            <View style={{ marginHorizontal: 24, marginTop: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline, padding: 11 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>2026.05.24 토 · 제이드팰리스 GC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(24), color: C.burgundy }}>88</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>타 · +16</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.burgundy, paddingLeft: 8, marginTop: 4 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>드라이버가 잘 맞은 날 ⛳</Text>
              </View>
            </View>
            <View style={{ marginHorizontal: 24, marginTop: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline, padding: 11 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>2026.04.18 토 · 안성베네스트 CC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(24), color: C.charcoal }}>91</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>타 · +19</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.hairline, paddingLeft: 8, marginTop: 4 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>퍼팅 감이 좋았던 하루 ⛳</Text>
              </View>
            </View>
            <View style={{ marginHorizontal: 24, marginTop: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline, padding: 11 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>2026.03.22 일 · 남서울 CC</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(24), color: C.charcoal }}>85</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>타 · +13</Text>
              </View>
              <View style={{ borderLeftWidth: 2, borderLeftColor: C.hairline, paddingLeft: 8, marginTop: 4 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>아이언이 살아난 라운드 ⛳</Text>
              </View>
            </View>
          </View>
          <View style={{ backgroundColor: C.burgundy, paddingHorizontal: 32, paddingTop: 20, paddingBottom: 28 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              나만의 골프 기록을 모아서
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.78)', textAlign: 'center', marginTop: 9, lineHeight: 19 }}>
              스코어판 사진 한 장이면 자동으로 입력돼요
            </Text>
          </View>
        </View>

        {/* 4 — 명예의 전당 (새 스타일: 데모 화면 + 한 줄 설명 / 전부 가짜 샘플) */}
        <View key="ob4" style={{ width: SW, backgroundColor: C.charcoal }}>
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
              <Text style={{ fontFamily: F.en, fontSize: fs(38), color: '#C8D9E6' }}>79</Text>
            </View>
            {/* 이글 카드 */}
            <View style={{ marginHorizontal: 24, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(168,197,137,0.5)', padding: 18, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(17), color: '#A8C589', letterSpacing: 2 }}>EAGLE</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginTop: 4 }}>14번홀 파5 · 이글</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>2025.09.07 · 블랙스톤 제주</Text>
              </View>
              <Text style={{ fontFamily: F.en, fontSize: fs(36), color: '#A8C589' }}>−2</Text>
            </View>
          </View>
          <View style={{ backgroundColor: C.charcoal, paddingHorizontal: 32, paddingTop: 20, paddingBottom: 28 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              특별한 순간은 명예의 전당에
            </Text>
          </View>
        </View>

        {/* 5 — 라운지 (메인 키 기능): 워드마크 + 핵심 헤드라인 + 4가지 모집 방식 1열 카드 + 하단 한 줄 요약
            위쪽(어두운 navy) ↔ 아래쪽(navy) 시각 분리 — 다른 페이지(2·3·4)와 동일 패턴 */}
        <View key="ob5" style={{ width: SW, backgroundColor: '#0F2638' }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 18, paddingBottom: 12, paddingHorizontal: 24 }}>
            {/* 상단 — 라벨 + 라운지 워드마크 (다른 페이지 헤더와 발란스) */}
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: 'rgba(245,230,168,0.75)', letterSpacing: 3, marginBottom: 6 }}>
              DEAR GOLF
            </Text>
            <Text style={{ fontFamily: F.serifKR, fontSize: fs(28), color: C.bgPrimary, lineHeight: fs(34), marginBottom: 6 }}>
              라운지
            </Text>
            <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginBottom: 14 }} />

            {/* 메인 헤드라인 — 핵심 메시지 */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: '#fff', lineHeight: 28, marginBottom: 18 }}>
              골프 약속,{'\n'}이제 여기서 만들어요
            </Text>

            {/* 크루 + 4가지 모집 방식 1열 카드 — 가로 레이아웃 (아이콘 + 타이틀·설명) */}
            <View style={{ gap: 10 }}>
              {/* 크루 — 자주 치는 멤버와 약속을 한곳에. 콜드스타트 네트워크 단위라 모집보다 위에 강조(버터 테두리) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: 'rgba(245,230,168,0.14)', borderWidth: 1, borderColor: 'rgba(245,230,168,0.55)',
                borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(245,230,168,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: fs(20) }}>🤝</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff', marginBottom: 2 }}>자주 치는 멤버는 '크루'로</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.7)', lineHeight: 16 }}>우리 모임 일정·앨범·약속을 한곳에</Text>
                </View>
              </View>
              {[
                ['👥', '친구공개로 모집', '내 친구들에게'],
                ['🎯', '친구지정으로 모집', '고른 친구에게만'],
                ['📅', '일정 정해서 모집', '확정형 — 날짜·구장 정해서'],
                ['💬', '친구랑 상의해서 모집', '오픈형 — 함께 정하기'],
              ].map(([icon, title, sub]) => (
                <View key={title} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)',
                  borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
                }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 10,
                    backgroundColor: 'rgba(245,230,168,0.12)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: fs(20) }}>{icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff', marginBottom: 2 }}>
                      {title}
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.65)', lineHeight: 16 }}>
                      {sub}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          {/* 하단 한 줄 요약 — 다른 페이지(2·3·4)와 동일 패턴 */}
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 32, paddingTop: 20, paddingBottom: 28 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              함께하는 라운딩, 라운지에서
            </Text>
          </View>
        </View>

        {/* 6 — 코스 (메인 키 기능): 워드마크 + 핵심 헤드라인 + 4가지 1열 카드 + 하단 한 줄 요약
            위쪽(어두운 그린) ↔ 아래쪽(그린) 시각 분리 */}
        <View key="ob6" style={{ width: SW, backgroundColor: '#1E3528' }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 18, paddingBottom: 12, paddingHorizontal: 24 }}>
            {/* 상단 — 라벨 + 코스 워드마크 (라운지와 동일 발란스) */}
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: 'rgba(245,230,168,0.75)', letterSpacing: 3, marginBottom: 6 }}>
              DEAR GOLF
            </Text>
            <Text style={{ fontFamily: F.serifKR, fontSize: fs(28), color: C.bgPrimary, lineHeight: fs(34), marginBottom: 6 }}>
              코스
            </Text>
            <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: C.burgundy, marginBottom: 14 }} />

            {/* 메인 헤드라인 — 사용자 페인 포인트 직격 */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: '#fff', lineHeight: 28, marginBottom: 18 }}>
              맛집·구장 정보,{'\n'}머릿속 대신 여기에
            </Text>

            {/* 4가지 핵심 기능 1열 카드 — 라운지와 동일 패턴 */}
            <View style={{ gap: 10 }}>
              {[
                ['🍴', '골프장 근처 맛집', '어디 저장했는지 잊지 않게 한 곳에'],
                ['⭐', '다녀온 코스에 평점·후기 남기기', '관리·진행·가성비를 평가해 위키를 함께 채워요'],
                ['🌤️', '날씨·교통 한눈에', '전국 골프장을 한 페이지에서'],
                ['⛳', '방문 골프장 리마인드', '한줄 메모로 기억을 남겨두기'],
              ].map(([icon, title, sub]) => (
                <View key={title} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)',
                  borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
                }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 10,
                    backgroundColor: 'rgba(245,230,168,0.12)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: fs(20) }}>{icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff', marginBottom: 2 }}>
                      {title}
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.65)', lineHeight: 16 }}>
                      {sub}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          {/* 하단 한 줄 요약 — 다른 페이지(2·3·4)와 동일 패턴 */}
          <View style={{ backgroundColor: '#2E4A3A', paddingHorizontal: 32, paddingTop: 20, paddingBottom: 28 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: '#fff', textAlign: 'center', lineHeight: 30 }}>
              골프장 정보는 코스 한 곳에
            </Text>
          </View>
        </View>

        {/* 8 — 위치 권한 안내 */}
        <View key="ob7" style={{ width: SW, backgroundColor: C.bgPrimary }}>
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

        {/* 8 — 알림 권한 안내 (위치 페이지와 동일 priming 패턴) */}
        <View key="ob7b" style={{ width: SW, backgroundColor: C.bgPrimary }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 36, paddingTop: insets.top + 36, paddingBottom: 28, justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(38), marginBottom: 14 }}>🔔</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal, marginBottom: 10 }}>알림 권한</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, lineHeight: 21, marginBottom: 24 }}>
              라운딩을 잊지 않도록 제때 알려드려요.{'\n'}허용은 선택이고, 언제든 바꿀 수 있어요.
            </Text>
            {/* 알림으로 받는 것 */}
            <View style={{ gap: 16 }}>
              <Feature icon="⛳" title="기상·출발 알람" sub="라운드 당일, 늦지 않게 깨워드려요" />
              <Feature icon="📅" title="D-3 · D-1 리마인드" sub="다가오는 라운딩을 미리 알림" />
              <Feature icon="💬" title="라운지·친구 소식" sub="댓글·확정·초대를 바로 확인" />
            </View>
            {/* 권한 요청 버튼 */}
            <TouchableOpacity onPress={handleNotif} activeOpacity={0.85}
              disabled={notifStatus === 'granted'}
              style={{
                marginTop: 28, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                backgroundColor: notifStatus === 'granted' ? C.hairline : C.charcoal,
              }}>
              <Text style={{
                fontFamily: F.sysSb, fontSize: fs(14),
                color: notifStatus === 'granted' ? C.warmGray : C.butter,
              }}>
                {notifStatus === 'granted' ? '✓ 알림 권한 허용됨' : '알림 권한 허용하기'}
              </Text>
            </TouchableOpacity>
            {notifStatus === 'denied' && (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.burgundy, textAlign: 'center', lineHeight: 17 }}>
                  권한이 거부됐어요. 라운딩 알람을 받으려면{'\n'}휴대폰 설정에서 다시 허용할 수 있어요.
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
        <View key="ob8" style={{ width: SW, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontSize: fs(44), marginBottom: 14 }}>⛳</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(21), color: C.charcoal }}>지금 시작해보세요</Text>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(14), color: C.navy, marginTop: 12, textAlign: 'center', lineHeight: 22 }}>
            간단한 프로필만 입력하면{'\n'}바로 사용할 수 있어요
          </Text>
          <TouchableOpacity onPress={onDone} activeOpacity={0.85}
            style={{ marginTop: 30, backgroundColor: C.charcoal, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 52 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter, letterSpacing: 1 }}>시작하기</Text>
          </TouchableOpacity>
        </View>

      </PagerView>

      {/* 건너뛰기 — 인트로를 빠르게 지나가고 싶은 사용자용. onDone=시작하기와 동일(다음 온보딩 단계로).
          마지막 시작 페이지(idx 8)엔 '시작하기' 버튼이 있어 숨김. 페이지마다 배경색이 달라 반투명 펄로 가독성 확보. */}
      {idx < 8 && (
        <TouchableOpacity onPress={onDone} activeOpacity={0.7}
          style={{ position: 'absolute', top: insets.top + 8, right: 14, zIndex: 10,
            backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 13 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: '#fff' }}>건너뛰기</Text>
        </TouchableOpacity>
      )}

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
