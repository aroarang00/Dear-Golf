import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView,
  TouchableOpacity, SafeAreaView, StatusBar,
  Modal, Dimensions, Image, FlatList,
  TextInput, KeyboardAvoidingView, Platform,
  PanResponder, Animated, Linking, Share, Alert,
  ActivityIndicator,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';
import { C, F } from './src/constants/colors';
import {
  SCHEDULES_INIT, HALL_OF_FAME, DIARY_DATA, COURSE_LOG, FAVORITES_INIT,
  MEMO_MAP, MY_RESTAURANTS, USER_RESTAURANTS, GOLF_DB, RECOMMENDED_COURSES,
  OVERSEAS_COURSE_LOG, TOP_100_COURSES, FRIENDS_DATA, USER_PROFILE_INIT,
  COURSE_TAGS, COURSE_TAG_COLORS,
} from './src/constants/data';
import { STORAGE_KEYS, storage } from './src/utils/storage';
import { normalizeSchedules, getTagColor } from './src/utils/helpers';
import { cmn } from './src/styles/cmn';
import { homeS } from './src/styles/homeS';
import { wxS } from './src/styles/wxS';
import { trS } from './src/styles/trS';
import { sheetS } from './src/styles/sheetS';
import { dS } from './src/styles/dS';
import { gS } from './src/styles/gS';
import { tabS } from './src/styles/tabS';
import { mS } from './src/styles/mS';
import { myS } from './src/styles/myS';
import { obS } from './src/styles/obS';

const Tab = createBottomTabNavigator();
const { width: SW } = Dimensions.get('window');

// ── 공통 컴포넌트 ──────────────────────────────────────
const TripleStripe = ({ height = 2 }) => (
  <View style={{ flexDirection: 'row', height }}>
    <View style={{ flex: 1, backgroundColor: C.butter }} />
    <View style={{ flex: 1, backgroundColor: C.paleSky }} />
    <View style={{ flex: 1, backgroundColor: C.burgundy }} />
  </View>
);

const LightHeader = ({ sub, title, right }) => (
  <View style={cmn.hdr}>
    <View>
      <Text style={cmn.hdrSub}>{sub}</Text>
      <Text style={cmn.hdrTitle}>{title}</Text>
    </View>
    {right}
  </View>
);

const CirclePlus = ({ onPress }) => (
  <TouchableOpacity onPress={onPress} style={cmn.circleBtn} activeOpacity={0.7}>
    <Text style={cmn.circleBtnIcon}>+</Text>
  </TouchableOpacity>
);


let USER_PROFILE = { ...USER_PROFILE_INIT };
let _setUserProfile = null;
const UserContext = React.createContext({ userProfile: USER_PROFILE_INIT, setUserProfile: () => {} });

import { createNavigationContainerRef } from '@react-navigation/native';
export const navigationRef = createNavigationContainerRef();

// ── 온보딩 화면 ───────────────────────────────────────
function OnboardingScreen({ onComplete }) {
  const [nickname, setNickname] = useState('');
  const [realName, setRealName] = useState('');
  const [avgScore, setAvgScore] = useState('');
  const [lifeBest, setLifeBest] = useState('');
  const [step, setStep] = useState(1);

  const handleComplete = () => {
    const nick = nickname.trim() || '';
    if (!nick) return; // 닉네임 필수
    const best = parseInt(lifeBest) || 99;
    const hasFirstSingle = best <= 79;
    onComplete({
      nickname: nick,
      realName: realName || '',
      avgScore: parseInt(avgScore) || 90,
      lifeBest: best,
      totalRounds: 0,
      hasFirstSingle,
      onboardingDone: true,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <TripleStripe />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 28, paddingBottom: 60 }}>
        <Text style={{ fontFamily: F.en, fontSize: 32, color: C.charcoal, fontStyle: 'italic', marginBottom: 6 }}>Dear Golf</Text>
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
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


// ── 홈 배경 슬라이드쇼 ────────────────────────────────
const BG_IMAGES = [
  'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800',
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800',
  'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800',
  'https://images.unsplash.com/photo-1592919505780-303950717480?w=800',
];

function HomeBgSlider() {
  const [bgIdx, setBgIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]).start();
      setBgIdx(i => (i + 1) % BG_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Animated.View style={{ ...StyleSheet.absoluteFillObject, opacity: fadeAnim }}>
      <Image source={{ uri: BG_IMAGES[bgIdx] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,30,16,0.72)' }} />
    </Animated.View>
  );
}

// ── 날씨/교통 팝업 (분리 컴포넌트) ───────────────────
function WeatherTransportPopup({ visible, initialTab, onClose, schedule }) {
  // ★ 핵심: 팝업 열릴 때마다 initialTab으로 초기화
  const [popupTab, setPopupTab] = useState(initialTab || 'wx');

  useEffect(() => {
    if (visible) {
      setPopupTab(initialTab || 'wx');
    }
  }, [visible, initialTab]);

  if (!schedule) return null;

  const golfScore = 78;
  const pm10 = 23;

  // 출발시간별 소요시간 (더미)
  const DEPARTURE_TIMES = [
    { time: '05:30', duration: '1시간 10분', traffic: '원활' },
    { time: '06:00', duration: '1시간 20분', traffic: '원활' },
    { time: '06:30', duration: '1시간 35분', traffic: '보통' },
    { time: '07:00', duration: '2시간 05분', traffic: '혼잡' },
    { time: '07:30', duration: '2시간 30분', traffic: '혼잡' },
  ];

  // 10일 예보 (하드코딩)
  const FORECAST = [
    { day: '오늘', dateStr: schedule.date.slice(5), icon: '☀️', sky: '맑음',     wind: '남 3m/s',   prob: 10, tmin: 12, tmax: 22 },
    { day: '내일', dateStr: '',                     icon: '🌤️', sky: '구름조금', wind: '동 2m/s',   prob: 20, tmin: 13, tmax: 21 },
    { day: '모레', dateStr: '',                     icon: '☀️', sky: '맑음',     wind: '남 2m/s',   prob: 10, tmin: 14, tmax: 22 },
    { day: '목',   dateStr: '',                     icon: '☁️', sky: '흐림',     wind: '서 4m/s',   prob: 40, tmin: 14, tmax: 19 },
    { day: '금',   dateStr: '',                     icon: '🌧️', sky: '비',       wind: '북서 5m/s', prob: 80, tmin: 13, tmax: 17 },
    { day: '토',   dateStr: '',                     icon: '🌦️', sky: '소나기',   wind: '서 3m/s',   prob: 60, tmin: 12, tmax: 18 },
    { day: '일',   dateStr: '',                     icon: '⛅',  sky: '구름많음', wind: '남서 2m/s', prob: 20, tmin: 13, tmax: 20 },
    { day: '월',   dateStr: '',                     icon: '☀️', sky: '맑음',     wind: '동 1m/s',   prob: 0,  tmin: 14, tmax: 23 },
    { day: '화',   dateStr: '',                     icon: '☀️', sky: '맑음',     wind: '동 2m/s',   prob: 0,  tmin: 15, tmax: 24 },
    { day: '수',   dateStr: '',                     icon: '🌤️', sky: '구름조금', wind: '남 2m/s',   prob: 10, tmin: 14, tmax: 22 },
  ];
  const roundIdx = Math.min(Math.max(0, schedule.dDay || 0), FORECAST.length - 1);

  // 24시간 기온 (하드코딩)
  const HOURLY24 = [
    11, 10, 10, 9, 9, 9, 10, 12, 15, 17, 19, 21,
    22, 22, 22, 21, 20, 18, 16, 14, 13, 12, 11, 11,
  ].map((t, i) => ({ h: i, t }));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: popupTab === 'wx' ? C.charcoal : C.bgPrimary }}>
        <TripleStripe height={3} />

        <View style={[wxS.shellRow, popupTab === 'wx' ? wxS.shellRowDark : wxS.shellRowLight]}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={popupTab === 'wx' ? wxS.closeLight : wxS.closeDark}>← 닫기</Text>
          </TouchableOpacity>
          <View style={wxS.pillTabs}>
            <TouchableOpacity onPress={() => setPopupTab('wx')} activeOpacity={0.7}
              style={[wxS.pillTab, popupTab === 'wx' && wxS.pillTabOn]}>
              <Text style={
                popupTab === 'wx' ? wxS.pillTxtOn
                : (popupTab === 'wx' ? wxS.pillTxtLight : wxS.pillTxtDark)
              }>날씨</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPopupTab('tr')} activeOpacity={0.7}
              style={[wxS.pillTab, popupTab === 'tr' && wxS.pillTabOn]}>
              <Text style={
                popupTab === 'tr' ? wxS.pillTxtOn
                : (popupTab === 'wx' ? wxS.pillTxtLight : wxS.pillTxtDark)
              }>교통</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: popupTab === 'wx' ? C.charcoal : C.bgPrimary }}
          contentContainerStyle={{ paddingBottom: 0 }}
          showsVerticalScrollIndicator={false}>

          {popupTab === 'wx' && (
            <>
              {/* 헤더 (charcoal) */}
              <View style={wxS.wxHeader}>
                <Text style={wxS.wxCourse}>{schedule.course}</Text>
                <Text style={wxS.wxDate}>{schedule.date} · D-{schedule.dDay}</Text>
              </View>

              {/* 기온 영역 */}
              <View style={wxS.tempRow}>
                <Text style={wxS.tempEmoji}>☀️</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={wxS.tempBig}>18°</Text>
                  <Text style={wxS.tempSky}>맑음 · 어제보다 +2°</Text>
                  <Text style={wxS.tempSub}>체감 17° · 최저 12° / 최고 22°</Text>
                </View>
              </View>

              {/* 4칸 그리드 */}
              <View style={wxS.gridWrap}>
                <View style={[wxS.gridCell, { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.hairline }]}>
                  <Text style={wxS.gridLabel}>바람</Text>
                  <Text style={wxS.gridValue}>2.2m/s</Text>
                  <Text style={wxS.gridSubOK}>라운딩 최적</Text>
                </View>
                <View style={[wxS.gridCell, { borderBottomWidth: 0.5, borderColor: C.hairline }]}>
                  <Text style={wxS.gridLabel}>습도</Text>
                  <Text style={wxS.gridValue}>30%</Text>
                  <Text style={wxS.gridSubOK}>건조함</Text>
                </View>
                <View style={[wxS.gridCell, { borderRightWidth: 0.5, borderColor: C.hairline }]}>
                  <Text style={wxS.gridLabel}>미세먼지</Text>
                  <Text style={wxS.gridValue}>좋음</Text>
                  <Text style={wxS.gridSubOK}>PM10 {pm10}㎍/㎥</Text>
                </View>
                <View style={wxS.gridCell}>
                  <Text style={wxS.gridLabel}>자외선</Text>
                  <Text style={wxS.gridValue}>보통</Text>
                  <Text style={wxS.gridSubWarn}>차단제 권장</Text>
                </View>
              </View>

              {/* 24시간 기온 차트 */}
              <View style={wxS.chartCard}>
                <Text style={wxS.cardLabel}>시간별 기온 · 24시간</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={wxS.barRow}>
                    {HOURLY24.map((x, i) => {
                      const bh = 20 + ((x.t - 8) / 18) * 70;
                      const isWarm = x.t >= 18;
                      return (
                        <View key={i} style={wxS.barCol}>
                          <Text style={wxS.barTemp}>{x.t}°</Text>
                          <View style={[wxS.bar, { height: bh, backgroundColor: isWarm ? '#C9A84C' : C.burgundy, opacity: 0.7 }]} />
                          <Text style={wxS.barHour}>{x.h}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* 골프 지수 */}
              <View style={wxS.gIdxCard}>
                <Text style={wxS.cardLabel}>골프 지수</Text>
                <Text style={wxS.gIdxBig}>Good</Text>
                <Text style={wxS.gIdxScore}>{golfScore} / 100</Text>
                <View style={wxS.gIdxBar}>
                  <View style={[wxS.gIdxBarFill, { width: `${golfScore}%` }]} />
                </View>
                <View style={wxS.badgeRow}>
                  <View style={[wxS.badge, { backgroundColor: '#C8D9E6' }]}>
                    <Text style={[wxS.badgeTxt, { color: '#1A3D52' }]}>바람 약함</Text>
                  </View>
                  <View style={[wxS.badge, { backgroundColor: C.charcoal }]}>
                    <Text style={[wxS.badgeTxt, { color: C.butter }]}>강수 없음</Text>
                  </View>
                  <View style={[wxS.badge, { backgroundColor: C.burgundy }]}>
                    <Text style={[wxS.badgeTxt, { color: C.butter }]}>기온 적정</Text>
                  </View>
                </View>
              </View>

              {/* 10일 예보 */}
              <View style={wxS.fcCard}>
                <Text style={wxS.cardLabel}>10일 예보</Text>
                {FORECAST.map((w, i) => {
                  const isRound = i === roundIdx;
                  return (
                    <View key={i} style={[wxS.fcRow, i < FORECAST.length - 1 && wxS.fcRowBorder, isRound && wxS.fcRowRound]}>
                      <View style={{ width: 56 }}>
                        <Text style={wxS.fcDay}>{w.day}</Text>
                        {!!w.dateStr && <Text style={wxS.fcDate}>{w.dateStr}</Text>}
                      </View>
                      <Text style={wxS.fcIcon}>{w.icon}</Text>
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Text style={[wxS.fcSky, isRound && wxS.fcSkyRound]}>{w.sky}</Text>
                          {isRound && (
                            <View style={wxS.roundBadge}>
                              <Text style={wxS.roundBadgeTxt}>라운딩</Text>
                            </View>
                          )}
                        </View>
                        <Text style={wxS.fcSub}>{w.wind} · 강수 {w.prob}%</Text>
                      </View>
                      <Text style={wxS.fcTemp}>{w.tmin}° / <Text style={{ color: C.charcoal }}>{w.tmax}°</Text></Text>
                    </View>
                  );
                })}
              </View>

              {/* 기상청 더보기 */}
              <TouchableOpacity style={wxS.kmaBtn}
                onPress={() => Linking.openURL('https://www.kma.go.kr/')}
                activeOpacity={0.7}>
                <Text style={wxS.kmaBtnTxt}>기상청에서 더 자세히 보기</Text>
              </TouchableOpacity>
            </>
          )}

          {popupTab === 'tr' && (() => {
            const [teeH, teeM] = schedule.time.split(':').map(Number);
            const teeMin = teeH * 60 + teeM;
            const toHHMM = (m) => {
              m = (m + 24 * 60) % (24 * 60);
              return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            };
            const recoDriveMin = 80;
            const recommended = toHHMM(teeMin - 30 - recoDriveMin);
            const baseTen = Math.floor((teeMin - 30 - recoDriveMin) / 10) * 10;
            const rows = [-30, -20, -10, 0, 10].map((off, i) => {
              const t = toHHMM(baseTen + off);
              const dMin = recoDriveMin + [-8, -4, -2, 0, 6][i];
              const dStr = `${Math.floor(dMin / 60)}시간 ${dMin % 60}분`;
              const cong = i <= 1 ? '원활' : i === 2 ? '보통' : '혼잡';
              return { t, dStr, cong, isReco: off === 0 };
            });

            const handleShareDaeri = () => {
              const msg = `[ Dear Golf ] 같이 대리 부르실 분?\n\n${schedule.course}\n${schedule.date} ${schedule.day}요일 라운딩\n티오프 ${schedule.time}\n\n카카오T 대리: https://www.kakaomobility.com/\n티맵 대리: https://tmap.life\n아이대리: https://www.idaeri.co.kr`;
              Share.share({ message: msg });
            };

            return (
              <>
                {/* 크림 영역 — 헤더부터 경로 카드까지 */}
                <View style={trS.creamSection}>
                  {/* 골프장명 + 날짜 */}
                  <Text style={trS.trCourse}>{schedule.course}</Text>
                  <Text style={trS.trDate}>{schedule.date} · 티오프 {schedule.time}</Text>

                  {/* 추천 출발 박스 (charcoal 카드) */}
                  <View style={trS.recoBox}>
                    <Text style={trS.recoLabel}>추천 출발</Text>
                    <Text style={trS.recoTime}>{recommended}</Text>
                    <Text style={trS.recoSub}>티오프 {schedule.time} · 여유 30분 포함</Text>
                  </View>

                  {/* 출발시간별 소요시간 테이블 (흰 카드) */}
                  <View style={trS.tblCard}>
                    <View style={trS.tblHdr}>
                      <Text style={[trS.tblHdrCell, { flex: 1 }]}>출발</Text>
                      <Text style={[trS.tblHdrCell, { flex: 1.2, textAlign: 'center' }]}>소요</Text>
                      <Text style={[trS.tblHdrCell, { flex: 1, textAlign: 'center' }]}>상태</Text>
                      <Text style={[trS.tblHdrCell, { flex: 0.8, textAlign: 'right' }]}>추천</Text>
                    </View>
                    {rows.map((r, i) => {
                      const congColors = r.cong === '원활' ? { bg: '#C8D9E6', txt: '#1A3D52' }
                        : r.cong === '보통' ? { bg: '#F5E6A8', txt: '#5A4500' }
                        : { bg: '#6B1E2A', txt: '#fff' };
                      return (
                        <View key={i} style={[trS.tblRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                          <Text style={[trS.tblTime, { flex: 1 }]}>{r.t}</Text>
                          <Text style={[trS.tblDur, { flex: 1.2, textAlign: 'center' }]}>{r.dStr}</Text>
                          <View style={{ flex: 1, alignItems: 'center' }}>
                            <View style={[trS.congBadge, { backgroundColor: congColors.bg }]}>
                              <Text style={[trS.congBadgeTxt, { color: congColors.txt }]}>{r.cong}</Text>
                            </View>
                          </View>
                          <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                            {r.isReco && (
                              <View style={trS.recoTagBadge}>
                                <Text style={trS.recoTagTxt}>추천</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* 골프장 이동경로 카드 (흰 카드) */}
                  <View style={trS.routeCard}>
                    <View style={trS.routeFlow}>
                      <Text style={trS.routeOrigin}>서울 강남구</Text>
                      <Text style={trS.routeArrow}>→</Text>
                      <Text style={trS.routeDest} numberOfLines={1}>{schedule.course}</Text>
                    </View>
                    <Text style={trS.routeMidTxt}>약 78.4km · 경부고속도로</Text>
                    <View style={trS.routeBtnRow}>
                      <TouchableOpacity style={[trS.routeBtn, { backgroundColor: '#03C75A' }]}
                        onPress={() => Linking.openURL(`nmap://route/car?dlat=37.0&dlon=127.0&dname=${encodeURIComponent(schedule.course)}&appname=deargolf`)
                          .catch(() => Linking.openURL('https://map.naver.com/'))}
                        activeOpacity={0.85}>
                        <Text style={[trS.routeBtnTxt, { color: '#fff' }]}>네이버 경로</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[trS.routeBtn, { backgroundColor: C.charcoal }]}
                        onPress={() => Linking.openURL(`tmap://route?goalname=${encodeURIComponent(schedule.course)}`)
                          .catch(() => Linking.openURL('https://tmap.life'))}
                        activeOpacity={0.85}>
                        <Text style={[trS.routeBtnTxt, { color: C.butter }]}>티맵 경로</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* 챠콜 영역 — 대리운전 + 공유 */}
                <View style={trS.charcoalSection}>
                  <Text style={trS.darkLabel}>대리운전</Text>
                  <View style={trS.daeriRow}>
                    <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#FEE500' }]}
                      onPress={() => Linking.openURL('kakaotalk://chauffeur').catch(() => Linking.openURL('https://www.kakaomobility.com/'))}
                      activeOpacity={0.85}>
                      <Text style={[trS.daeriBtnTxt, { color: '#3A2000' }]}>카카오T</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#C8D9E6' }]}
                      onPress={() => Linking.openURL('tmap://daeri').catch(() => Linking.openURL('https://tmap.life'))}
                      activeOpacity={0.85}>
                      <Text style={[trS.daeriBtnTxt, { color: '#1A3D52' }]}>티맵대리</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#8B8680' }]}
                      onPress={() => Linking.openURL('idaeri://').catch(() => Linking.openURL('https://www.idaeri.co.kr/'))}
                      activeOpacity={0.85}>
                      <Text style={[trS.daeriBtnTxt, { color: '#fff' }]}>아이대리</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={trS.shareBtn} onPress={handleShareDaeri} activeOpacity={0.85}>
                    <Text style={trS.shareBtnTxt}>동반자에게 공유</Text>
                  </TouchableOpacity>
                </View>
              </>
            );
          })()}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── D-Day 카드 바텀시트 메뉴 ─────────────────────────
function ScheduleSheetModal({ visible, schedule, onClose, onCourseTap, onWeather, onTraffic, onShare, onEdit, onDelete }) {
  if (!schedule) return null;
  const items = [
    { key: 'wx', emoji: '☀️', label: '날씨 확인', onPress: onWeather },
    { key: 'tr', emoji: '🚗', label: '교통 · 출발시간', onPress: onTraffic },
    { key: 'sh', emoji: '📩', label: '동반자에게 공유', onPress: onShare },
    { key: 'ed', emoji: '✏️', label: '일정 수정', onPress: onEdit },
    { key: 'rm', emoji: '🗑️', label: '일정 삭제', onPress: onDelete, danger: true },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={sheetS.sheet}>
          <View style={sheetS.handle} />
          <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14 }}>
            <TouchableOpacity onPress={onCourseTap} activeOpacity={schedule.courseLogId ? 0.6 : 1}>
              <Text style={sheetS.course}>{schedule.course}
                {schedule.courseLogId ? <Text style={sheetS.courseArrow}> ›</Text> : null}
              </Text>
            </TouchableOpacity>
            <Text style={sheetS.meta}>{schedule.date} {schedule.day} · {schedule.time} · {schedule.members}명</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
              <Text style={sheetS.dday}>D-{schedule.dDay}</Text>
              <Text style={sheetS.ddayLabel}>{schedule.dDay}일 후 라운딩이에요 🏌️</Text>
            </View>
          </View>
          <TripleStripe height={2} />
          {items.map((it, i) => (
            <TouchableOpacity
              key={it.key}
              style={[sheetS.row, i < items.length - 1 && sheetS.rowBorder]}
              onPress={it.onPress}
              activeOpacity={0.6}>
              <Text style={sheetS.rowEmoji}>{it.emoji}</Text>
              <Text style={[sheetS.rowText, it.danger && sheetS.rowDanger]}>{it.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 8 }} />
        </View>
      </View>
    </Modal>
  );
}


// ── 홈 상단 날씨 미니바 ──────────────────────────────
function WeatherMiniBar({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 }}>
      <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#fff' }}>☀️ 18° 맑음</Text>
    </TouchableOpacity>
  );
}

// ── 홈 화면 ───────────────────────────────────────────
function HomeScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [schedules, setSchedules] = useState(SCHEDULES_INIT);
  const [schedulesHydrated, setSchedulesHydrated] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showWeatherFull, setShowWeatherFull] = useState(false);
  const [showTrafficFull, setShowTrafficFull] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);
  const [cardIndex, setCardIndex] = useState(0);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -40) setCardIndex(1);
      else if (g.dx > 40) setCardIndex(0);
    },
  })).current;

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.schedules, SCHEDULES_INIT);
      setSchedules(normalizeSchedules(loaded));
      setSchedulesHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!schedulesHydrated) return;
    storage.save(STORAGE_KEYS.schedules, schedules);
  }, [schedules, schedulesHydrated]);

  const next = schedules.length > 0 ? schedules[0] : null;

  const memoEntry = next ? Object.values(MEMO_MAP).find(m => {
    const course = COURSE_LOG.find(c => c.id === m.courseId);
    return course && course.name === next.course;
  }) : null;

  const handleMemoPress = () => {
    if (!memoEntry) return;
    const diaryItem = DIARY_DATA.find(d => d.course === next.course);
    if (diaryItem) navigation.navigate('다이어리', { openDiaryId: diaryItem.id });
  };

  const handleCardCoursePress = (schedule) => {
    if (schedule.courseLogId) {
      navigation.navigate('가이드', { openCourseId: schedule.courseLogId });
    }
  };

  const openScheduleSheet = (schedule) => {
    setSelectedSchedule(schedule);
    setShowScheduleModal(true);
  };

  const openWeatherFor = (schedule) => {
    setSelectedSchedule(schedule);
    setShowWeatherFull(true);
  };

  const openTrafficFor = (schedule) => {
    setSelectedSchedule(schedule);
    setShowTrafficFull(true);
  };

  const openCurrentWeather = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
    const target = next || {
      course: '내 위치', date: dateStr, day: '', time: '--:--',
      members: 0, dDay: 0, weather: '맑음 18°', wind: '', duration: '',
    };
    setSelectedSchedule(target);
    setShowWeatherFull(true);
  };

  const handleShareSchedule = (s) => {
    if (!s) return;
    const msg = `[ Dear Golf ]\n\n${s.course}\n${s.date} ${s.day}요일  ${s.time}\n${s.members}명 동반 · D-${s.dDay}\n\n예상 날씨  ${s.weather}\n권장 출발  ${s.duration} 전 출발\n         (티오프 30분 전 도착 기준)\n\n나만의 골프 캐디, Dear Golf와\n함께하는 라운딩입니다\n\ndeargolf.app`;
    Share.share({ message: msg });
  };

  const handleEditSchedule = (s) => {
    setShowScheduleModal(false);
    setEditSchedule(s);
  };

  const handleDeleteSchedule = (s) => {
    if (!s) return;
    Alert.alert(
      '일정 삭제',
      `${s.course}\n${s.date} ${s.day} · ${s.time}\n\n이 일정을 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            setSchedules(prev => prev.filter(x => x.id !== s.id));
            setShowScheduleModal(false);
            setSelectedSchedule(null);
          },
        },
      ],
    );
  };

  const handleScheduleSave = (type, data) => {
    if (type === 'schedule') {
      const newS = {
        id: String(Date.now()),
        course: data.course, date: data.date, day: data.day || '토',
        time: data.time || '08:00', members: data.members || 4,
        dDay: data.dDay || 30, weather: '맑음 20°', wind: '남 2m/s',
        duration: '1시간 30분', courseLogId: null,
      };
      setSchedules(prev => normalizeSchedules([...prev, newS]));
    } else if (type === 'schedule-edit') {
      setSchedules(prev => normalizeSchedules(prev.map(s => s.id === data.id
        ? { ...s, course: data.course, date: data.date, day: data.day,
            time: data.time, members: data.members, dDay: data.dDay }
        : s)));
    }
  };

  if (!next) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
        <StatusBar barStyle="light-content" />
        <HomeBgSlider />
        <SafeAreaView style={{ flex: 1 }}>
          <TripleStripe />
          <View style={homeS.hdr}>
            <Text style={homeS.hdrSub}>나만의 골프 캐디</Text>
            <Text style={homeS.hdrTitle}>Dear Golf</Text>
            <Text style={homeS.hdrGreeting}>
              안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
            </Text>
            <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>
              <WeatherMiniBar onPress={openCurrentWeather} />
            </View>
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 40 }}>
            <View style={{ marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 24 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 12 }}>예정 라운딩</Text>
              <Text style={{ fontFamily: F.en, fontSize: 22, color: '#fff', fontStyle: 'italic', marginBottom: 8, lineHeight: 30 }}>
                Dear Golf에서{'\n'}첫 라운딩을 시작해보세요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18, marginBottom: 20 }}>
                날씨 · 교통 · 코스 정보를{'\n'}한눈에 확인할 수 있어요
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
                activeOpacity={0.8}
                onPress={() => setShowAddModal(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, letterSpacing: 0.5 }}>+ 라운딩 추가하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
        <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
      <StatusBar barStyle="light-content" />
      <HomeBgSlider />
      <SafeAreaView style={{ flex: 1 }}>
        <TripleStripe />
        <View style={homeS.hdr}>
          <Text style={homeS.hdrSub}>나만의 골프 캐디</Text>
          <Text style={homeS.hdrTitle}>Dear Golf</Text>
          <Text style={homeS.hdrGreeting}>
            안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
          </Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>
            <WeatherMiniBar onPress={openCurrentWeather} />
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <View style={homeS.bottomArea}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, marginBottom: 8 }}>
            <Text style={[homeS.secLabel, { paddingHorizontal: 0, marginBottom: 0 }]}>예정 라운딩</Text>
            {schedules.length < 10 && (
              <TouchableOpacity onPress={() => setShowAddModal(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>+ 추가</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {/* 메인 카드 */}
            <TouchableOpacity
              style={homeS.mainCard}
              activeOpacity={0.85}
              onPress={() => openScheduleSheet(next)}
              onLongPress={() => openScheduleSheet(next)}
              delayLongPress={350}>
              <TouchableOpacity
                onPress={() => next.courseLogId ? handleCardCoursePress(next) : openScheduleSheet(next)}
                activeOpacity={next.courseLogId ? 0.7 : 0.85}
                style={{ marginBottom: 4 }}>
                <Text style={homeS.cardCourse}>{next.course}
                  {next.courseLogId ? <Text style={{ fontSize: 11, color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                </Text>
                <Text style={homeS.cardDate}>{next.date} {next.day} · {next.time} · {next.members}명</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Text style={homeS.cardDDay}>D-{next.dDay}</Text>
                <Text style={{ fontSize: 26, marginBottom: 6 }}>☀️  🚗</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>탭하여 확인하기 →</Text>
              </View>
            </TouchableOpacity>

            {/* 서브 카드 — 최대 5개까지 표시 (메인 1 + 서브 4) */}
            {schedules.slice(1, 5).map(s => (
              <TouchableOpacity key={s.id} style={homeS.subCard}
                activeOpacity={0.85}
                onPress={() => openScheduleSheet(s)}
                onLongPress={() => openScheduleSheet(s)}
                delayLongPress={350}>
                <TouchableOpacity
                  onPress={() => s.courseLogId ? handleCardCoursePress(s) : openScheduleSheet(s)}
                  activeOpacity={s.courseLogId ? 0.7 : 0.85}>
                  <Text style={homeS.subCourse} numberOfLines={2}>{s.course}
                    {s.courseLogId ? <Text style={{ fontSize: 8, color: 'rgba(200,217,230,0.55)' }}> ›</Text> : null}
                  </Text>
                  <Text style={homeS.subDate}>{s.date.slice(5)} {s.day}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <Text style={homeS.subDDay}>D-{s.dDay}</Text>
                  <Text style={homeS.subDDayLabel}>일</Text>
                </View>
              </TouchableOpacity>
            ))}

          </ScrollView>

          <View style={{ marginHorizontal: 20, marginVertical: 12 }}>
            <TripleStripe height={1.5} />
          </View>

          {(() => {
            const visitCount = COURSE_LOG.find(c => c.name === next?.course)?.visits || 0;
            const courseComment = {
              txt: '그린이 정말 빠릅니다. 퍼팅 연습 충분히 하고 가세요',
              who: 'J***',
            };
            return (
              <View {...panResponder.panHandlers}>
                {cardIndex === 0 ? (
                  visitCount === 0 ? (
                    <View style={[homeS.memoCard, homeS.memoCardFirst]}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeFirst}>
                          <Text style={homeS.memoBadgeTxt}>첫 방문</Text>
                        </View>
                        <Text style={homeS.memoCardCourse}>{next?.course}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.memoMain}>처음 가는 코스예요</Text>
                        <Text style={homeS.memoSub}>오늘이 첫 기록이 될 거예요</Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity style={homeS.memoCard} onPress={handleMemoPress} activeOpacity={0.8}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeVisit}>
                          <Text style={homeS.memoBadgeTxt}>{visitCount + 1}번째 방문</Text>
                        </View>
                        <Text style={homeS.memoCardCourse}>{next?.course}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.memoScore}>
                          지난 방문 · 베스트 {COURSE_LOG.find(c => c.name === next?.course)?.best}타
                        </Text>
                        <Text style={homeS.memoTxt}>"{memoEntry?.text || '메모가 없어요'}"</Text>
                      </View>
                    </TouchableOpacity>
                  )
                ) : (
                  <View style={homeS.commentCard}>
                    <View style={homeS.memoCardTop}>
                      <View style={homeS.memoBadgeComment}>
                        <Text style={[homeS.memoBadgeTxt, { color: '#C8D9E6' }]}>코스 한마디</Text>
                      </View>
                      <Text style={[homeS.memoCardCourse, { color: 'rgba(255,255,255,0.6)' }]}>{next?.course}</Text>
                    </View>
                    <View style={homeS.memoCardBottom}>
                      <Text style={homeS.commentTxt}>"{courseComment.txt}"</Text>
                      <Text style={homeS.commentWho}>{courseComment.who}</Text>
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                  {[0, 1].map(i => (
                    <View key={i} style={{
                      width: cardIndex === i ? 14 : 5,
                      height: 5, borderRadius: 3,
                      backgroundColor: cardIndex === i ? (i === 0 ? '#F5E6A8' : '#C8D9E6') : 'rgba(255,255,255,0.15)',
                    }} />
                  ))}
                </View>
              </View>
            );
          })()}
          <View style={{ height: 20 }} />
        </View>
      </SafeAreaView>

      {/* D-Day 바텀시트 메뉴 */}
      <ScheduleSheetModal
        visible={showScheduleModal}
        schedule={selectedSchedule}
        onClose={() => setShowScheduleModal(false)}
        onCourseTap={() => {
          setShowScheduleModal(false);
          if (selectedSchedule?.courseLogId) {
            navigation.navigate('가이드', { openCourseId: selectedSchedule.courseLogId });
          }
        }}
        onWeather={() => { setShowScheduleModal(false); setShowWeatherFull(true); }}
        onTraffic={() => { setShowScheduleModal(false); setShowTrafficFull(true); }}
        onShare={() => handleShareSchedule(selectedSchedule)}
        onEdit={() => handleEditSchedule(selectedSchedule)}
        onDelete={() => handleDeleteSchedule(selectedSchedule)}
      />

      {/* 날씨/교통 통합 팝업 */}
      <WeatherTransportPopup
        visible={showWeatherFull || showTrafficFull}
        initialTab={showWeatherFull ? 'wx' : 'tr'}
        schedule={selectedSchedule || next}
        onClose={() => { setShowWeatherFull(false); setShowTrafficFull(false); }}
      />

      <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      <ScheduleModal
        visible={!!editSchedule}
        initial={editSchedule}
        onClose={() => setEditSchedule(null)}
        onSave={handleScheduleSave}
      />
    </View>
  );
}

// ── 사진/영상 크게보기 ────────────────────────────────
function PhotoViewer({ photos, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const videoRef = useRef(null);
  const current = photos[idx];
  const isVideo = current?.type === 'video';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10 }} onPress={onClose}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 28, lineHeight: 32 }}>✕</Text>
        </TouchableOpacity>
        <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            {idx + 1} / {photos.length} {isVideo ? '· 영상' : ''}
          </Text>
        </View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          contentOffset={{ x: idx * SW, y: 0 }}
          onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}>
          {photos.map((item, i) => (
            <View key={i} style={{ width: SW, justifyContent: 'center', alignItems: 'center' }}>
              {item.type === 'video' ? (
                <Video ref={i === idx ? videoRef : null} source={{ uri: item.uri }}
                  style={{ width: SW, height: SW * 1.2 }} useNativeControls resizeMode="contain" shouldPlay={i === idx} />
              ) : (
                <Image source={{ uri: item.uri || item }} style={{ width: SW, height: SW * 1.2 }} resizeMode="contain" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── 명예의 전당 카드 ──────────────────────────────────
function HallOfFameCard({ item }) {
  const isHIO = item.type === 'HOLE IN ONE';
  const isAlba = item.type === 'ALBATROSS';
  const isEagle = item.type === 'EAGLE';
  const isFirstSingle = item.type === '퍼스트 싱글';
  const isLifeBest = item.type === '라이프 베스트';
  const bgColor = isHIO ? '#2A2622' : isAlba ? C.burgundy : isFirstSingle ? '#4A7A8A' : isLifeBest ? '#2A5A3A' : '#6B6660';
  const accentColor = isFirstSingle ? '#C8D9E6' : isLifeBest ? '#A8D4B4' : '#C9A84C';

  return (
    <View style={[dS.hofCard, { backgroundColor: bgColor }]}>
      <View style={{ height: 1, backgroundColor: accentColor + '44' }} />
      <View style={dS.hofHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[dS.hofType, { color: accentColor, fontSize: 22, letterSpacing: 6 }]}>{item.type}</Text>
          <Text style={[dS.hofDate, { color: 'rgba(255,255,255,0.4)' }]}>{item.date} · {item.course}</Text>
        </View>
        <View style={[dS.hofGoldDot, { backgroundColor: accentColor }]} />
      </View>
      <View style={dS.hofGrid}>
        {[
          { label: 'HOLE', value: `${item.hole}번홀`, big: true },
          { label: 'PAR · DIST', value: `파${item.par} · ${item.distance}` },
          { label: 'BALL', value: item.ball },
          { label: 'WITH', value: item.companions.join(', ') },
        ].map((cell, i) => (
          <View key={i} style={[dS.hofCell, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: accentColor + '22' }]}>
            <Text style={[dS.hofCellLabel, { color: accentColor + 'AA' }]}>{cell.label}</Text>
            {cell.big
              ? <Text style={[dS.hofCellBig, { color: accentColor }]}>{cell.value}</Text>
              : <Text style={[dS.hofCellVal, { color: 'rgba(255,255,255,0.85)' }]}>{cell.value}</Text>
            }
          </View>
        ))}
      </View>
      <View style={[dS.hofDivider, { backgroundColor: accentColor + '22' }]} />
      <Text style={[dS.hofMemo, { color: 'rgba(255,255,255,0.65)' }]}>"{item.memo}"</Text>
      <View style={{ height: 1, backgroundColor: accentColor + '44' }} />
    </View>
  );
}

// ── 예정라운딩 입력 모달 ──────────────────────────────
function ScheduleModal({ visible, onClose, onSave, initial }) {
  const isEdit = !!initial;
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [members, setMembers] = useState('4');

  const DAYS = ['일','월','화','수','목','금','토'];
  const formatDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const formatDay = (d) => DAYS[d.getDay()];
  const formatTime = (t) => `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;

  useEffect(() => {
    if (visible && initial) {
      setCourseSearch(initial.course || '');
      setSelectedCourse(initial.course || '');
      const dParts = (initial.date || '').split('.').map(Number);
      if (dParts.length === 3 && !isNaN(dParts[0])) {
        setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
      }
      const tParts = (initial.time || '').split(':').map(Number);
      if (tParts.length === 2 && !isNaN(tParts[0])) {
        const t = new Date(); t.setHours(tParts[0], tParts[1], 0, 0);
        setTime(t);
      }
      setMembers(String(initial.members || '4'));
    }
  }, [visible, initial]);

  const searchResults = courseSearch.length > 0 && courseSearch !== selectedCourse
    ? GOLF_DB.filter(g => g.name.includes(courseSearch) || g.loc.includes(courseSearch)).slice(0, 5)
    : [];

  const reset = () => {
    setCourseSearch(''); setSelectedCourse('');
    setDate(new Date()); setTime(new Date()); setMembers('4');
  };

  const handleSave = () => {
    const finalCourse = selectedCourse || courseSearch.trim();
    if (!finalCourse) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const dDay = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    const payload = {
      course: finalCourse,
      date: formatDate(date),
      day: formatDay(date),
      time: formatTime(time),
      members: parseInt(members) || 4,
      dDay: Math.max(0, dDay),
    };
    if (isEdit) {
      onSave('schedule-edit', { id: initial.id, ...payload });
    } else {
      onSave('schedule', payload);
    }
    reset(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={mS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={mS.sheet}>
            <View style={mS.handle} />
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={mS.title}>{isEdit ? '예정 라운딩 수정' : '예정 라운딩 추가'}</Text>
              <Text style={mS.label}>골프장</Text>
              <TextInput style={mS.input} placeholder="골프장 이름 검색..."
                placeholderTextColor={C.warmGrayLight} value={courseSearch}
                onChangeText={t => { setCourseSearch(t); setSelectedCourse(''); }} />
              {searchResults.length > 0 && (
                <View style={mS.searchDrop}>
                  {searchResults.map(g => (
                    <TouchableOpacity key={g.id} style={mS.searchItem}
                      onPress={() => { setSelectedCourse(g.name); setCourseSearch(g.name); }}>
                      <Text style={mS.searchName}>{g.name}</Text>
                      <Text style={mS.searchLoc}>{g.loc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={mS.label}>날짜</Text>
              <TouchableOpacity style={mS.input} onPress={() => setShowDatePicker(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}>
                  {formatDate(date)} ({formatDay(date)})
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker value={date} mode="date" display="spinner"
                  onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                  minimumDate={new Date()} locale="ko" />
              )}
              <Text style={mS.label}>티오프 시간</Text>
              <TouchableOpacity style={mS.input} onPress={() => setShowTimePicker(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}>{formatTime(time)}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker value={time} mode="time" display="spinner" is24Hour
                  onChange={(e, t) => { setShowTimePicker(false); if (t) setTime(t); }} />
              )}
              <Text style={mS.label}>인원</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['2','3','4'].map(n => (
                  <TouchableOpacity key={n} style={[mS.chip, members === n && mS.chipOn]} onPress={() => setMembers(n)}>
                    <Text style={[mS.chipTxt, members === n && mS.chipTxtOn]}>{n}명</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={mS.saveBtn} onPress={handleSave}>
                <Text style={mS.saveBtnTxt}>{isEdit ? '수정 완료' : '저장하기'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 라운딩기록 입력 모달 ──────────────────────────────
function DiaryAddModal({ visible, onClose, onSave, initial, isEdit }) {
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [date, setDate] = useState(new Date());
  const [score, setScore] = useState('');
  const [scoreCardOption, setScoreCardOption] = useState('later');
  const [holeScores, setHoleScores] = useState({});
  const [weather, setWeather] = useState('맑음');
  const [memo, setMemo] = useState('');
  const [birdieCount, setBirdieCount] = useState(0);
  const [privacy, setPrivacy] = useState('friends');
  const [starRating, setStarRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [detailMemo, setDetailMemo] = useState('');

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  const [special, setSpecial] = useState(null);
  const [specialHole, setSpecialHole] = useState('');
  const [specialPar, setSpecialPar] = useState('3');
  const [specialDist, setSpecialDist] = useState('');
  const [specialBall, setSpecialBall] = useState('');
  const [specialMemo, setSpecialMemo] = useState('');
  const [addPhotos, setAddPhotos] = useState([]);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setAddPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const DAYS = ['일','월','화','수','목','금','토'];
  const formatDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const formatDay = (d) => DAYS[d.getDay()];

  const searchResults = courseSearch.length > 0 && courseSearch !== selectedCourse
    ? GOLF_DB.filter(g => g.name.includes(courseSearch) || g.loc.includes(courseSearch)).slice(0, 5)
    : [];

  const reset = () => {
    setCourseSearch(''); setSelectedCourse(''); setDate(new Date());
    setScore(''); setWeather('맑음'); setMemo(''); setBirdieCount(0);
    setSpecial(null); setSpecialHole(''); setSpecialPar('3');
    setSpecialDist(''); setSpecialBall(''); setSpecialMemo('');
    setScoreCardOption('later'); setHoleScores({});
    setAddPhotos([]);
    setStarRating(0); setSelectedTags([]);
    setDetailMemo('');
    setPrivacy('friends');
  };

  useEffect(() => {
    if (!visible) return;
    if (isEdit && initial) {
      setCourseSearch(initial.course || '');
      setSelectedCourse(initial.course || '');
      const dParts = (initial.date || '').split('.').map(Number);
      if (dParts.length === 3 && dParts.every(Number.isFinite)) {
        setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
      }
      setScore(String(initial.score || ''));
      setWeather(initial.weather || '맑음');
      setMemo(initial.memo || '');
      setDetailMemo(initial.detailMemo || '');
      setBirdieCount(initial.birdieCount || 0);
      setSpecial(initial.special || null);
      setSpecialHole(String(initial.specialHole || ''));
      setSpecialDist(initial.specialDist || '');
      setSpecialBall(initial.specialBall || '');
      setSpecialMemo(initial.specialMemo || '');
      setStarRating(initial.starRating || 0);
      setSelectedTags(initial.tags || []);
      setAddPhotos(initial.photos || []);
      setPrivacy(initial.privacy || 'friends');
    } else {
      reset();
    }
  }, [visible, isEdit, initial]);

  const [saveError, setSaveError] = useState('');

  const finalCourseLive = selectedCourse || courseSearch.trim();
  const canSave = !!finalCourseLive && !!score && !isNaN(parseInt(score)) && parseInt(score) > 0 && !!memo.trim();

  const handleSave = () => {
    const finalCourse = selectedCourse || courseSearch.trim();
    if (!finalCourse) {
      setSaveError('골프장을 입력해주세요');
      return;
    }
    if (!score || isNaN(parseInt(score)) || parseInt(score) <= 0) {
      setSaveError('스코어를 입력해주세요');
      return;
    }
    if (!memo.trim()) {
      setSaveError('한줄 메모를 입력해주세요');
      return;
    }
    setSaveError('');
    const payload = {
      course: finalCourse, date: formatDate(date), day: formatDay(date),
      score: parseInt(score) || 0, weather, memo, birdieCount, privacy,
      special, specialHole: parseInt(specialHole),
      specialDist, specialBall, specialMemo,
      photos: addPhotos,
      starRating,
      tags: selectedTags,
      detailMemo,
      courseId: GOLF_DB.find(g => g.name === finalCourse)?.id || (initial && initial.courseId) || null,
    };
    if (isEdit) {
      onSave('diary-edit', { id: initial.id, ...payload });
    } else {
      onSave('diary', payload);
    }
    reset(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={mS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={mS.sheet}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} activeOpacity={0.7}
              style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={mS.handle} />
            </TouchableOpacity>
            <ScrollView style={{ padding: 20, paddingTop: 0 }} showsVerticalScrollIndicator={false}>
              <Text style={mS.title}>{isEdit ? '라운딩 기록 수정' : '라운딩 기록 추가'}</Text>
              <Text style={mS.label}>골프장 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={mS.input} placeholder="골프장 이름 검색 또는 직접 입력..."
                placeholderTextColor={C.warmGrayLight} value={courseSearch}
                onChangeText={t => { setCourseSearch(t); setSelectedCourse(''); }} />
              {courseSearch.length > 0 && courseSearch !== selectedCourse && (
                <View style={mS.searchDrop}>
                  {searchResults.map(g => (
                    <TouchableOpacity key={g.id} style={mS.searchItem}
                      onPress={() => { setSelectedCourse(g.name); setCourseSearch(g.name); }}>
                      <Text style={mS.searchName}>{g.name}</Text>
                      <Text style={mS.searchLoc}>{g.loc}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[mS.searchItem, { borderBottomWidth: 0, backgroundColor: C.butter + '33' }]}
                    onPress={() => { setSelectedCourse(courseSearch.trim()); }}>
                    <Text style={[mS.searchName, { color: C.burgundy }]}>+ "{courseSearch.trim()}" 직접 입력</Text>
                    <Text style={mS.searchLoc}>목록에 없는 골프장도 등록 가능</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={mS.label}>날짜</Text>
              <TouchableOpacity style={mS.input} onPress={() => setShowDatePicker(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}>
                  {formatDate(date)} ({formatDay(date)})
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker value={date} mode="date" display="spinner"
                  onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                  maximumDate={new Date()} locale="ko" />
              )}
              <Text style={mS.label}>스코어 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={mS.input} placeholder="타수 입력"
                placeholderTextColor={C.warmGrayLight} value={score}
                onChangeText={setScore} keyboardType="numeric" />

              {/* 스코어카드 등록 선택 */}
              {score !== '' && (
                <View style={{ marginTop: 14 }}>
                  <Text style={mS.label}>스코어카드 등록할까요?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { key: 'manual', label: '홀별 직접 입력' },
                      { key: 'photo', label: '사진으로 등록' },
                      { key: 'later', label: '나중에' },
                    ].map(opt => (
                      <TouchableOpacity key={opt.key}
                        style={[mS.chip, scoreCardOption === opt.key && mS.chipOn]}
                        onPress={() => setScoreCardOption(opt.key)}>
                        <Text style={[mS.chipTxt, scoreCardOption === opt.key && mS.chipTxtOn]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {scoreCardOption === 'photo' && (
                    <View style={{ marginTop: 8, padding: 12, backgroundColor: C.paleSky + '22', borderRadius: 10, borderWidth: 0.5, borderColor: C.paleSky + '60' }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, lineHeight: 18 }}>사진 자동입력 기능은 준비중이에요. 나중에 추가할 수 있어요.</Text>
                    </View>
                  )}
                  {scoreCardOption === 'manual' && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 }}>홀별 타수 입력</Text>
                      {[{ label: '전반 (1~9홀)', holes: Array.from({length:9}, (_,i)=>i+1) }, { label: '후반 (10~18홀)', holes: Array.from({length:9}, (_,i)=>i+10) }].map((half, hi) => (
                        <View key={hi} style={{ marginBottom: 12 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginBottom: 6 }}>{half.label}</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {half.holes.map(h => (
                              <View key={h} style={{ alignItems: 'center', gap: 3 }}>
                                <Text style={{ fontFamily: F.sys, fontSize: 9, color: C.warmGrayLight }}>{h}H</Text>
                                <TextInput
                                  style={{ width: 32, height: 36, backgroundColor: C.bgSecondary, borderRadius: 8, borderWidth: 0.5, borderColor: C.hairline, textAlign: 'center', fontFamily: F.sys, fontSize: 13, color: C.textPrimary }}
                                  keyboardType="numeric" maxLength={2}
                                  value={holeScores[h] || ''}
                                  onChangeText={v => setHoleScores(prev => ({ ...prev, [h]: v }))}
                                />
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
              <Text style={mS.label}>한줄 메모 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={mS.input} placeholder="오늘 라운딩은..." placeholderTextColor={C.warmGrayLight}
                value={memo} onChangeText={setMemo} />
              <Text style={mS.label}>날씨</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['맑음','흐림','바람','비'].map(w => (
                  <TouchableOpacity key={w} style={[mS.chip, weather === w && mS.chipOn]} onPress={() => setWeather(w)}>
                    <Text style={[mS.chipTxt, weather === w && mS.chipTxtOn]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={mS.label}>버디</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => setBirdieCount(Math.max(0, birdieCount - 1))} style={mS.countBtn}>
                  <Text style={mS.countBtnTxt}>−</Text>
                </TouchableOpacity>
                <Text style={mS.countVal}>{birdieCount}개</Text>
                <TouchableOpacity onPress={() => setBirdieCount(Math.min(18, birdieCount + 1))} style={mS.countBtn}>
                  <Text style={mS.countBtnTxt}>+</Text>
                </TouchableOpacity>
                {birdieCount === 0 && <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>버디 없음</Text>}
              </View>
              <Text style={mS.label}>특별한 순간</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['HOLE IN ONE','EAGLE','ALBATROSS','없음'].map(s => (
                  <TouchableOpacity key={s}
                    style={[mS.chip, (special === s || (s === '없음' && !special)) && mS.chipOn]}
                    onPress={() => setSpecial(s === '없음' ? null : s)}>
                    <Text style={[mS.chipTxt, (special === s || (s === '없음' && !special)) && mS.chipTxtOn]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {special && (
                <View style={mS.specialBox}>
                  <Text style={mS.specialBoxTitle}>{special} 기록</Text>
                  <Text style={mS.label}>몇번 홀?</Text>
                  <TextInput style={mS.input} placeholder="7" placeholderTextColor={C.warmGrayLight}
                    value={specialHole} onChangeText={setSpecialHole} keyboardType="numeric" />
                  <Text style={mS.label}>파(Par)?</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['3','4','5'].map(p => (
                      <TouchableOpacity key={p} style={[mS.chip, specialPar === p && mS.chipOn]} onPress={() => setSpecialPar(p)}>
                        <Text style={[mS.chipTxt, specialPar === p && mS.chipTxtOn]}>파{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={mS.label}>거리</Text>
                  <TextInput style={mS.input} placeholder="156m" placeholderTextColor={C.warmGrayLight}
                    value={specialDist} onChangeText={setSpecialDist} />
                  <Text style={mS.label}>사용한 볼</Text>
                  <TextInput style={mS.input} placeholder="Titleist Pro V1" placeholderTextColor={C.warmGrayLight}
                    value={specialBall} onChangeText={setSpecialBall} />
                  <Text style={mS.label}>한마디</Text>
                  <TextInput style={mS.input} placeholder="그 순간을 기억하며..." placeholderTextColor={C.warmGrayLight}
                    value={specialMemo} onChangeText={setSpecialMemo} />
                </View>
              )}
              <Text style={mS.label}>코스 별점 <Text style={{ color: '#8B8680', fontSize: 10 }}> (이 골프장이 얼마나 좋았나요?)</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <TouchableOpacity key={i} onPress={() => setStarRating(i)} activeOpacity={0.6}>
                    <Text style={{ fontSize: 28, color: i <= starRating ? '#C9A84C' : '#E8E2D0' }}>★</Text>
                  </TouchableOpacity>
                ))}
                {starRating > 0 && <Text style={{ fontSize: 12, color: '#8B8680' }}>{starRating}점</Text>}
              </View>

              <Text style={mS.label}>코스 태그 <Text style={{ color: '#8B8680', fontSize: 10 }}> (선택 · 중복 가능)</Text></Text>
              {Object.entries(COURSE_TAGS).map(([category, tags]) => {
                const catColor = COURSE_TAG_COLORS[category];
                return (
                  <View key={category} style={{ marginBottom: 10 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#8B8680', marginBottom: 6, letterSpacing: 1 }}>{category}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {tags.map(tag => {
                        const on = selectedTags.includes(tag);
                        return (
                          <TouchableOpacity key={tag} activeOpacity={0.7}
                            style={{
                              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                              backgroundColor: on ? catColor.bg : C.bgSecondary,
                              borderWidth: 0.5,
                              borderColor: on ? catColor.bg : C.hairline,
                            }}
                            onPress={() => toggleTag(tag)}>
                            <Text style={{ fontFamily: F.sys, fontSize: 12, color: on ? catColor.text : C.warmGrayLight }}>{tag}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={{ marginTop: 6 }}>
                <Text style={mS.label}>
                  더 기록하기
                  <Text style={{ color: '#8B8680', fontSize: 10 }}> (선택 · 최대 1000자)</Text>
                </Text>
                <View style={{
                  backgroundColor: C.bgSecondary,
                  borderWidth: 0.5, borderColor: C.hairline,
                  borderRadius: 12, padding: 14,
                  minHeight: 140,
                }}>
                  <TextInput
                    style={{
                      fontFamily: F.sys, fontSize: 13,
                      color: C.textPrimary, lineHeight: 22,
                      minHeight: 100, textAlignVertical: 'top',
                    }}
                    placeholder={'MVP 샷은? · 어려웠던 홀은?\n코스·잔디 상태는? · 동반자 소감은?\n다음에 오면 꼭 기억할 것은?'}
                    placeholderTextColor={C.warmGrayLight}
                    value={detailMemo}
                    onChangeText={(t) => { if (t.length <= 1000) setDetailMemo(t); }}
                    multiline
                    maxLength={1000}
                  />
                  <Text style={{ fontSize: 10, color: C.warmGrayLight, textAlign: 'right', marginTop: 8 }}>
                    {detailMemo.length} / 1000
                  </Text>
                </View>
              </View>
              <Text style={mS.label}>공개 범위</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[mS.chip, privacy === 'friends' && mS.chipOn]} onPress={() => setPrivacy('friends')}>
                  <Text style={[mS.chipTxt, privacy === 'friends' && mS.chipTxtOn]}>친구공개</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[mS.chip, privacy === 'private' && mS.chipOn]} onPress={() => setPrivacy('private')}>
                  <Text style={[mS.chipTxt, privacy === 'private' && mS.chipTxtOn]}>나만보기</Text>
                </TouchableOpacity>
              </View>
              <View style={{ marginTop: 16, marginBottom: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, marginBottom: 8 }}>
                  사진 · 영상 (선택)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {addPhotos.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8, marginRight: 8 }} />
                  ))}
                  <TouchableOpacity onPress={pickPhoto}
                    style={{ width: 80, height: 80, borderRadius: 8, backgroundColor: C.bgSecondary,
                      borderWidth: 0.5, borderColor: C.hairline,
                      alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24, color: C.warmGrayLight }}>+</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
              {saveError ? (
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#6B1E2A', textAlign: 'center', marginTop: 8, fontWeight: '500' }}>{saveError}</Text>
              ) : null}
              <TouchableOpacity
                style={[mS.saveBtn, { backgroundColor: canSave ? '#3D3935' : '#B8B3AB' }]}
                onPress={handleSave}
                disabled={!canSave}>
                <Text style={mS.saveBtnTxt}>{isEdit ? '수정 완료' : '저장하기'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 다이어리 카드 ─────────────────────────────────────
function DiaryCard({ item, onPress, avgScore }) {
  const [expanded, setExpanded] = useState(false);
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const hasBest = item.badge === '베스트';
  const hasPhoto = item.photos && item.photos.length > 0;
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';

  // 점수 기준 라인 색상
  let lineColor;
  if (hasBest) lineColor = '#6B1E2A';
  else if (avgScore != null && item.score < avgScore) lineColor = '#F5E6A8';
  else if (avgScore != null && item.score === avgScore) lineColor = '#C8D9E6';
  else lineColor = '#8B8680';
  const memoBorderColor = isSpecial ? '#C9A84C' : lineColor;

  const body = (
    <View style={dS.cardBody}>
      {/* 1행: 날짜 */}
      <Text style={dS.cardDate}>{item.date} {item.day}</Text>

      {/* 2행: 골프장명 */}
      <Text style={[dS.cardCourse, isSpecial && { color: '#8B6914' }]}>{item.course}</Text>

      {/* 3행: 타수 + par + 뱃지들 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <Text style={[dS.cardScore, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
        <Text style={[dS.cardScoreUnit, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
        <Text style={dS.cardPar}>{diffLabel} · par {item.par}</Text>
        {item.special && (
          <View style={{
            backgroundColor: item.special === 'HOLE IN ONE' ? '#2A2622' : '#6B1E2A',
            borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
            alignSelf: 'center',
          }}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: item.special === 'HOLE IN ONE' ? '#C9A84C' : '#F5E6A8', fontWeight: '600' }}>{item.special}</Text>
          </View>
        )}
        {item.birdieCount > 0 && (
          <View style={{
            backgroundColor: '#3D3935',
            borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
            alignSelf: 'center',
          }}>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#F5E6A8', fontWeight: '600' }}>버디 ×{item.birdieCount}</Text>
          </View>
        )}
      </View>

      {/* 4행: 한줄메모 단독 */}
      {item.memo ? (
        <View style={{ borderLeftWidth: 2, borderLeftColor: memoBorderColor, paddingLeft: 8, marginBottom: 8 }}>
          <Text style={{ fontFamily: F.en, fontSize: 12, color: C.textSecondary, fontStyle: 'italic', lineHeight: 18 }}>"{item.memo}"</Text>
        </View>
      ) : null}

      {/* 5행: 태그 가로 스크롤 */}
      {item.tags && item.tags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {item.tags.slice(0, 4).map((tag, i) => {
              const c = getTagColor(tag);
              return (
                <View key={i} style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: c.text, fontWeight: '600' }}>{tag}</Text>
                </View>
              );
            })}
            {item.tags.length > 4 && (
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, alignSelf: 'center', marginLeft: 4 }}>+{item.tags.length - 4}</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );

  if (hasPhoto) {
    return (
      <TouchableOpacity
        style={[dS.card, isSpecial && dS.cardSpecial]}
        activeOpacity={0.88} onPress={() => onPress(item)}>
        {isSpecial && <View style={dS.cardSpecialLine} />}
        <View style={dS.photoHero43}>
          <Image source={{ uri: item.photos[0] }} style={dS.photoImg} resizeMode="cover" />
          <View style={dS.photoBottomOverlay}>
            <Text style={dS.overlayCourse} numberOfLines={1}>{item.course}</Text>
            <Text style={dS.overlayDate}>{item.date} {item.day}</Text>
          </View>
          {isSpecial && (
            <View style={dS.specialBadge}>
              <Text style={dS.specialBadgeTxt}>{item.special}</Text>
            </View>
          )}
          <View style={dS.photoCount}>
            <Text style={dS.photoCountTxt}>{item.photos.length}장</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7} style={dS.toggleBtn}>
          <Text style={dS.toggleBtnTxt}>{expanded ? '접기 ∧' : '기록 보기 ∨'}</Text>
        </TouchableOpacity>
        {expanded && body}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[dS.card, isSpecial ? dS.cardSpecial : { borderLeftWidth: 3, borderLeftColor: lineColor }]}
      activeOpacity={0.88} onPress={() => onPress(item)}>
      {isSpecial && <View style={dS.cardSpecialLine} />}
      {isSpecial && (
        <View style={dS.specialNoPhoto}>
          <Text style={dS.specialNoPhotoTxt}>{item.special}</Text>
          {item.specialHole && <Text style={dS.specialNoPhotoSub}>{item.specialHole}번홀</Text>}
        </View>
      )}
      {body}
    </TouchableOpacity>
  );
}

// ── 다이어리 상세 ─────────────────────────────────────
function DiaryDetail({ item, onClose, onUpdate }) {
  const { userProfile } = React.useContext(UserContext);
  const [photoViewer, setPhotoViewer] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const hasBest = item.badge === '베스트';
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const companionsToShow = item.companions || [];

  const COMP_PALETTE = [
    { bg: '#C8D9E6', fg: '#1A3D52' },
    { bg: '#F5E6A8', fg: '#5A4500' },
    { bg: '#3D3935', fg: '#F5E6A8' },
    { bg: '#8B8680', fg: '#fff' },
  ];

  const photosToShow = item.photos || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isSpecial ? '#F5F0E4' : C.bgPrimary }}>
      <View style={[dS.detailHdr, isSpecial && { borderBottomColor: '#C9A84C44' }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={dS.backBtn}>← Diary</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[dS.detailHdrNickname, isSpecial && { backgroundColor: '#8B6914' }]}>
            <Text style={dS.detailHdrNicknameTxt}>{userProfile.nickname}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowEditModal(true)}>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>수정</Text>
          </TouchableOpacity>
        </View>
      </View>
      {isSpecial
        ? <View style={{ flexDirection: 'row', height: 3 }}>
            <View style={{ flex: 1, backgroundColor: '#C9A84C' }} />
            <View style={{ flex: 1, backgroundColor: '#E8D9A0' }} />
            <View style={{ flex: 1, backgroundColor: '#8B6914' }} />
          </View>
        : <TripleStripe />
      }
      <ScrollView showsVerticalScrollIndicator={false}>
        {isSpecial && (
          <View style={[dS.specialBanner,
            item.special === 'HOLE IN ONE' && { backgroundColor: '#2A2622' },
            item.special === 'EAGLE' && { backgroundColor: '#6B6660' },
            item.special === 'ALBATROSS' && { backgroundColor: C.burgundy },
          ]}>
            <Text style={dS.specialBannerSub}>달성</Text>
            <Text style={dS.specialBannerTitle}>{item.special}</Text>
            <Text style={dS.specialBannerSub}>{item.specialHole}번홀 기록</Text>
          </View>
        )}
        <View style={[dS.detailInfoArea, isSpecial && { borderBottomColor: '#C9A84C33' }]}>
          <View style={dS.detailScoreRow}>
            <Text style={[dS.detailScore, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
            <Text style={[dS.detailScoreUnit, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
            <Text style={dS.detailScoreSub}>{diffLabel} · par {item.par}</Text>
            {item.special && (
              <View style={{
                backgroundColor: item.special === 'HOLE IN ONE' ? '#2A2622' : '#6B1E2A',
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
                alignSelf: 'center',
              }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: item.special === 'HOLE IN ONE' ? '#C9A84C' : '#F5E6A8', fontWeight: '600' }}>{item.special}</Text>
              </View>
            )}
            {item.birdieCount > 0 && (
              <View style={{
                backgroundColor: '#3D3935',
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
                alignSelf: 'center',
              }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#F5E6A8', fontWeight: '600' }}>버디 ×{item.birdieCount}</Text>
              </View>
            )}
          </View>
          <Text style={dS.detailCourseTxt}>{item.course} · {item.date} {item.day} · {item.weather}</Text>
          <View style={[dS.detailMemoBox, isSpecial && { borderLeftColor: '#C9A84C' }]}>
            <Text style={dS.detailMemoTxt}>"{item.memo}"</Text>
          </View>
          {item.detailMemo ? (
            <View style={{
              marginTop: 12, marginBottom: 14,
              backgroundColor: C.bgSecondary,
              borderRadius: 10, padding: 14,
              borderWidth: 0.5, borderColor: C.hairline,
            }}>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 }}>더 기록하기</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary, lineHeight: 22 }}>{item.detailMemo}</Text>
            </View>
          ) : null}
          <View style={dS.companionArea}>
            <Text style={dS.companionLabel}>동반자</Text>
            <View style={{ flex: 1 }}>
              <View style={dS.avatarLine}>
                <View style={dS.avatarRow}>
                  {companionsToShow.map((c, i) => {
                    const others = companionsToShow.filter(x => !x.isMe);
                    const colorIdx = others.indexOf(c);
                    const palette = c.isMe
                      ? { bg: '#6B1E2A', fg: '#F5E6A8' }
                      : COMP_PALETTE[colorIdx % COMP_PALETTE.length];
                    return (
                      <View key={i} style={[dS.avatar, { backgroundColor: palette.bg, marginLeft: i === 0 ? 0 : -8 }]}>
                        <Text style={[dS.avatarTxt, { color: palette.fg }]}>{(c.name || '?').charAt(0)}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={dS.compNames} numberOfLines={1}>
                  {companionsToShow.map(c => c.name).join(' · ')}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={dS.photosArea}>
          <View style={{ marginBottom: 10 }}>
            <Text style={dS.photosLabel}>사진 · 영상</Text>
          </View>
          <View style={dS.photosGrid}>
            {photosToShow.map((uri, i) => {
              const src = typeof uri === 'object' ? uri.uri : uri;
              return (
                <TouchableOpacity key={i} onPress={() => { setViewerStart(i); setPhotoViewer(true); }} style={dS.photoGridItem}>
                  <Image source={{ uri: src }} style={dS.photoGridImg} resizeMode="cover" />
                  {i === 0 && (
                    <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: C.burgundy, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 8, color: '#fff' }}>대표</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
      {photoViewer && <PhotoViewer photos={photosToShow} startIndex={viewerStart} onClose={() => setPhotoViewer(false)} />}
      <DiaryAddModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        initial={item}
        isEdit
        onSave={(type, data) => {
          if (type === 'diary-edit') {
            onUpdate && onUpdate({ ...item, ...data });
            setShowEditModal(false);
          }
        }}
      />
    </SafeAreaView>
  );
}

// ── Course Log 탭 ─────────────────────────────────────
function CourseLogTab({ avgRating }) {
  const [region, setRegion] = useState('domestic');
  const [show100, setShow100] = useState(false);
  const [countryFilter, setCountryFilter] = useState('전체');
  const [top100Filter, setTop100Filter] = useState('전체');

  const visitedCount = TOP_100_COURSES.filter(c => c.visited).length;
  const countries = ['전체', ...new Set(OVERSEAS_COURSE_LOG.map(c => c.country))];
  const filteredOverseas = countryFilter === '전체' ? OVERSEAS_COURSE_LOG : OVERSEAS_COURSE_LOG.filter(c => c.country === countryFilter);
  const filteredTop100 = top100Filter === '전체' ? TOP_100_COURSES : top100Filter === '방문' ? TOP_100_COURSES.filter(c => c.visited) : TOP_100_COURSES.filter(c => !c.visited);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={[dS.banner, { borderColor: '#C9A84C' }]} onPress={() => setShow100(!show100)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={dS.bannerTitle}>100대 코스 도전하기</Text>
            <Text style={dS.bannerSub}>{visitedCount}/100 달성 · {visitedCount}%</Text>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy }}>{show100 ? '접기' : '보기'}</Text>
        </View>
        <View style={{ marginTop: 10, height: 4, backgroundColor: C.hairline, borderRadius: 2 }}>
          <View style={{ width: `${visitedCount}%`, height: '100%', backgroundColor: '#C9A84C', borderRadius: 2 }} />
        </View>
      </TouchableOpacity>
      {show100 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
            {['전체', '방문', '미방문'].map(f => (
              <TouchableOpacity key={f} style={[dS.tag, top100Filter === f && { backgroundColor: C.charcoal }]} onPress={() => setTop100Filter(f)}>
                <Text style={[dS.tagTxt, top100Filter === f && { color: C.butter }]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {filteredTop100.map(c => (
            <View key={c.rank} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              <Text style={{ fontFamily: F.en, fontSize: 13, color: c.visited ? C.burgundy : C.warmGrayLight, width: 30 }}>{c.rank}</Text>
              <Text style={{ fontSize: 14, marginRight: 8 }}>{c.visited ? '✓' : '○'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: c.visited ? C.textPrimary : C.warmGrayLight }}>{c.name}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{c.loc}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 8 }} />
        </View>
      )}
      <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 3, borderWidth: 0.5, borderColor: C.hairline }}>
        {[['domestic', '국내'], ['overseas', '해외']].map(([k, l]) => (
          <TouchableOpacity key={k} style={[{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' }, region === k && { backgroundColor: C.charcoal }]} onPress={() => setRegion(k)}>
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: region === k ? C.butter : C.warmGrayLight }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {region === 'domestic' && (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 10 }}>방문한 골프장 · {COURSE_LOG.length}곳</Text>
          {COURSE_LOG.map(c => (
            <TouchableOpacity key={c.id} style={dS.courseCard} activeOpacity={0.85}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 14, color: C.burgundy, marginTop: 1 }}>✓</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={dS.courseName}>{c.name}</Text>
                    {avgRating && avgRating(c.id) > 0 && (
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C' }}>★ {avgRating(c.id)}</Text>
                    )}
                  </View>
                  <Text style={dS.courseLoc}>{c.loc} · {c.visits}회 방문</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {c.tags.map((t, i) => <View key={i} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
              </View>
              <View style={dS.recordRow}>
                <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
                <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
                <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg}</Text><Text style={dS.recLblButter}>평균</Text></View>
              </View>
              <Text style={dS.courseMemo}>"{c.memo}"</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {region === 'overseas' && (
        <View style={{ paddingHorizontal: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {countries.map(country => (
                <TouchableOpacity key={country} style={[dS.tag, countryFilter === country && { backgroundColor: C.charcoal }]} onPress={() => setCountryFilter(country)}>
                  <Text style={[dS.tagTxt, countryFilter === country && { color: C.butter }]}>
                    {country === '전체' ? '전체' : `${OVERSEAS_COURSE_LOG.find(c => c.country === country)?.flag} ${country}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {filteredOverseas.map(c => (
            <TouchableOpacity key={c.id} style={dS.courseCard} activeOpacity={0.85}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 20 }}>{c.flag}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={dS.courseName}>{c.name}</Text>
                    {avgRating && avgRating(c.id) > 0 && (
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C' }}>★ {avgRating(c.id)}</Text>
                    )}
                  </View>
                  <Text style={dS.courseLoc}>{c.loc} · {c.visits}회 방문</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                {c.tags.map((t, i) => <View key={i} style={dS.tag}><Text style={dS.tagTxt}>{t}</Text></View>)}
              </View>
              <View style={dS.recordRow}>
                <View style={dS.recVisit}><Text style={dS.recValDark}>{c.visits}</Text><Text style={dS.recLblDark}>방문</Text></View>
                <View style={dS.recBest}><Text style={dS.recValWhite}>{c.best}</Text><Text style={dS.recLblWhite}>베스트</Text></View>
                <View style={dS.recAvg}><Text style={dS.recValButter}>{c.avg}</Text><Text style={dS.recLblButter}>평균</Text></View>
              </View>
              <Text style={dS.courseMemo}>"{c.memo}"</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── Friends 탭 — 검색창 상단 고정 ────────────────────
function FriendsTab() {
  const [searchNick, setSearchNick] = useState('');
  const [showFriends, setShowFriends] = useState(false);

  const confirmedFriends = FRIENDS_DATA;
  const pendingFriends = [{ id: 'p1', nickname: '박정호', status: 'pending' }];

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 검색창 — 상단 고정 */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
        backgroundColor: C.bgPrimary,
      }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={{
              flex: 1, backgroundColor: C.bgSecondary,
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
              fontFamily: F.sys, fontSize: 13, color: C.textPrimary,
              borderWidth: 0.5, borderColor: C.hairline,
            }}
            placeholder="닉네임으로 친구 찾기..."
            placeholderTextColor={C.warmGrayLight}
            value={searchNick}
            onChangeText={setSearchNick}
          />
          <TouchableOpacity style={{
            backgroundColor: C.charcoal, borderRadius: 10,
            paddingHorizontal: 16, justifyContent: 'center',
          }}>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter }}>검색</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {/* 친구 목록 헤더 */}
          <TouchableOpacity
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}
            onPress={() => setShowFriends(!showFriends)}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5 }}>
              친구 {confirmedFriends.length}명{pendingFriends.length > 0 ? ` · 신청중 ${pendingFriends.length}명` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: C.burgundy, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>+ 친구 추가</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>{showFriends ? '∧' : '∨'}</Text>
            </View>
          </TouchableOpacity>

          {showFriends && (
            <View style={{ marginBottom: 16 }}>
              {confirmedFriends.map(f => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.en, fontSize: 16, color: C.charcoal, fontStyle: 'italic' }}>{f.nickname.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary }}>{f.nickname}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{f.lastCourse} · {f.lastDate}</Text>
                  </View>
                </View>
              ))}
              {pendingFriends.map(f => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.hairline, opacity: 0.5 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.warmGrayLight, borderStyle: 'dashed' }}>
                    <Text style={{ fontFamily: F.en, fontSize: 16, color: C.warmGrayLight, fontStyle: 'italic' }}>{f.nickname.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight }}>{f.nickname}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>친구 신청중...</Text>
                  </View>
                  <TouchableOpacity style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>취소</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TripleStripe height={1} />

          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginTop: 14, marginBottom: 10 }}>최근 라운딩</Text>
          {confirmedFriends.map(f => (
            <View key={f.id} style={{ backgroundColor: C.bgSecondary, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 0.5, borderColor: C.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.en, fontSize: 16, color: C.charcoal, fontStyle: 'italic' }}>{f.nickname.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary }}>{f.nickname}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{f.lastCourse} · {f.lastDate}</Text>
                </View>
              </View>
              {f.photos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {f.photos.map((uri, i) => (
                      <Image key={i} source={{ uri }} style={{ width: 120, height: 90, borderRadius: 8 }} resizeMode="cover" />
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 8, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>공유된 사진이 없어요</Text>
                </View>
              )}
            </View>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── 다이어리 화면 ─────────────────────────────────────
function DiaryScreen({ route, navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [tab, setTab] = useState('round');
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [hofExpanded, setHofExpanded] = useState(false);
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [hallOfFame, setHallOfFame] = useState(HALL_OF_FAME);
  const [diariesHydrated, setDiariesHydrated] = useState(false);
  const [search, setSearch] = useState('');
  const [filterKey, setFilterKey] = useState('전체');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    (async () => {
      const [d, h] = await Promise.all([
        storage.load(STORAGE_KEYS.diaries, DIARY_DATA),
        storage.load(STORAGE_KEYS.hof, HALL_OF_FAME),
      ]);
      setDiaries(d);
      setHallOfFame(h);
      setDiariesHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!diariesHydrated) return;
    storage.save(STORAGE_KEYS.diaries, diaries);
  }, [diaries, diariesHydrated]);

  useEffect(() => {
    if (!diariesHydrated) return;
    storage.save(STORAGE_KEYS.hof, hallOfFame);
  }, [hallOfFame, diariesHydrated]);

  // 통계박스: 처음엔 열려있다가 3초 후 자동 닫힘, 터치로 토글
  const [showStats, setShowStats] = useState(true);
  const [showMyPage, setShowMyPage] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateStats = (show) => {
    Animated.timing(fadeAnim, {
      toValue: show ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    setShowStats(true);
    animateStats(true);
    const timer = setTimeout(() => {
      animateStats(false);
      setTimeout(() => setShowStats(false), 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [tab]);

  const TAB_DIARY = [['round', '내 라운딩'], ['log', '코스 기록'], ['friends', '친구']];
  const TAB_DIARY_COLORS = [C.butter, C.paleSky, C.burgundy];

  useEffect(() => {
    if (route?.params?.openDiaryId) {
      const target = diaries.find(d => d.id === route.params.openDiaryId);
      if (target) setSelected(target);
    }
  }, [route?.params?.openDiaryId]);

  const handleSave = (type, data) => {
    if (type === 'diary') {
      const newD = {
        id: String(Date.now()),
        date: data.date, day: data.day, course: data.course,
        score: data.score, par: 72, memo: data.memo || '',
        badge: null, weather: data.weather,
        special: data.special || null,
        specialHole: data.specialHole || null,
        companions: [{ name: USER_PROFILE.nickname, isMe: true }],
        photos: data.photos || [],
        starRating: data.starRating || 0,
        tags: data.tags || [],
        detailMemo: data.detailMemo || '',
        courseId: data.courseId || null,
      };
      setDiaries(prev => [newD, ...prev]);
      if (data.special) {
        const newHof = {
          id: String(Date.now()),
          type: data.special, date: data.date,
          course: data.course, hole: data.specialHole,
          par: 3, distance: data.specialDist || '',
          ball: data.specialBall || '', companions: [],
          memo: data.specialMemo || '',
        };
        setHallOfFame(prev => [newHof, ...prev]);
      }
    } else if (type === 'diary-edit') {
      setDiaries(prev => prev.map(d => d.id === data.id ? { ...d, ...data } : d));
    }
  };

  const avg = userProfile.avgScore || (diaries.length > 0 ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length) : 0);
  const best = userProfile.lifeBest || (diaries.length > 0 ? Math.min(...diaries.map(d => d.score)) : 0);
  const totalRounds = userProfile.totalRounds || diaries.length;
  const tabIdx = TAB_DIARY.findIndex(([k]) => k === tab);

  const courseRatings = {};
  diaries.forEach(d => {
    if (d.courseId && d.starRating > 0) {
      (courseRatings[d.courseId] = courseRatings[d.courseId] || []).push(d.starRating);
    }
  });
  const avgRating = (courseId) => {
    const r = courseRatings[courseId];
    if (!r || r.length === 0) return 0;
    return (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1);
  };

  if (selected) return <DiaryDetail item={selected} onClose={() => setSelected(null)}
    onUpdate={(updated) => {
      setDiaries(prev => prev.map(d => d.id === updated.id ? updated : d));
      setSelected(updated);
    }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 헤더 */}
      <View style={{ backgroundColor: '#6B6660', paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 2 }}>나의 골프 이야기</Text>
          <Text style={{ fontFamily: F.en, fontSize: 32, color: C.butter, fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>Diary</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
            style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: '#6B1E2A',
              borderWidth: 1.5, borderColor: '#F5E6A8',
              alignItems: 'center', justifyContent: 'center',
            }}>
            <Text style={{ fontFamily: F.en, fontSize: 14, color: '#F5E6A8', fontStyle: 'italic', lineHeight: 18 }}>
              {userProfile.nickname?.charAt(0).toUpperCase() || 'G'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowModal(true)} activeOpacity={0.7}
            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#F5E6A8', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.en, fontSize: 20, color: '#3D3935', lineHeight: 24, fontWeight: '700' }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 통계박스 — 터치로 토글, 자동 숨김 */}
      <TouchableOpacity
        onPress={() => {
          const next = !showStats;
          animateStats(next);
          if (!next) setTimeout(() => setShowStats(false), 300);
          else setShowStats(true);
        }}
        activeOpacity={0.9}>
        {showStats ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={dS.statsRow}>
              {[
                { label: '라운딩', value: totalRounds },
                { label: '평균타', value: avg, hi: true },
                { label: '베스트', value: best }
              ].map((st, i) => (
                <View key={i} style={[dS.statBox, st.hi && dS.statBoxHi]}>
                  <Text style={[dS.statVal, st.hi && { color: C.burgundy }]}>{st.value}</Text>
                  <Text style={dS.statLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        ) : (
          <View style={{ paddingVertical: 7, alignItems: 'center', backgroundColor: C.bgPrimary }}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1 }}>
              라운딩 {totalRounds} · 평균 {avg}타 · 베스트 {best}타  ∨
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* 삼색바 탭 */}
      <View style={dS.tabStripeRow}>
        {TAB_DIARY_COLORS.map((color, i) => (
          <View key={i} style={[dS.tabStripeSegment, { backgroundColor: color }, tabIdx === i && dS.tabStripeSegmentOn]} />
        ))}
      </View>
      <View style={dS.tabRow}>
        {TAB_DIARY.map(([k, l]) => (
          <TouchableOpacity key={k} style={dS.tabBtn} onPress={() => setTab(k)}>
            <Text style={[dS.tabTxt, tab === k && dS.tabTxtOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'round' && (() => {
        const FILTERS = ['전체', '올해', '최근 3개월', '베스트순', '특별한 순간'];

        const filtered = (() => {
          let list = diaries;
          const q = search.trim().toLowerCase();
          if (q) {
            list = list.filter(d => {
              if ((d.course || '').toLowerCase().includes(q)) return true;
              return (d.companions || []).some(c => (c.name || '').toLowerCase().includes(q));
            });
          }
          const now = new Date();
          if (filterKey === '올해') {
            list = list.filter(d => (d.date || '').startsWith(String(now.getFullYear())));
          } else if (filterKey === '최근 3개월') {
            const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);
            list = list.filter(d => {
              const [y, m, day] = (d.date || '').split('.').map(Number);
              return y ? new Date(y, m - 1, day) >= cutoff : false;
            });
          } else if (filterKey === '특별한 순간') {
            list = list.filter(d => d.special != null);
          }
          if (filterKey === '베스트순') {
            list = [...list].sort((a, b) => a.score - b.score);
          }
          return list;
        })();

        const avgScore = diaries.length > 0
          ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length)
          : null;

        return (
          <>
            {/* 필터탭 + 검색버튼 한 줄 */}
            <View style={dS.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }} contentContainerStyle={dS.filterTabRow}>
                {FILTERS.map(f => {
                  const on = filterKey === f;
                  return (
                    <TouchableOpacity key={f} activeOpacity={0.7}
                      style={[dS.filterTab, on && dS.filterTabOn]}
                      onPress={() => setFilterKey(on ? '전체' : f)}>
                      <Text style={[dS.filterTabTxt, on && dS.filterTabTxtOn]}>{f}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity activeOpacity={0.6}
                style={dS.searchToggleBtn}
                onPress={() => {
                  if (showSearch) { setShowSearch(false); setSearch(''); }
                  else setShowSearch(true);
                }}>
                <Text style={[dS.searchToggleTxt, showSearch && { color: '#6B1E2A' }]}>🔍</Text>
              </TouchableOpacity>
            </View>

            {/* 검색바 (토글) */}
            {showSearch && (
              <View style={dS.searchWrap}>
                <Text style={dS.searchIcon}>🔍</Text>
                <TextInput
                  style={dS.searchInput}
                  placeholder="골프장 또는 동반자 이름"
                  placeholderTextColor={C.warmGrayLight}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
                <TouchableOpacity activeOpacity={0.6}
                  onPress={() => { setShowSearch(false); setSearch(''); }}>
                  <Text style={dS.searchCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
              {hallOfFame.length > 0 && (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <TouchableOpacity style={dS.hofToggle} onPress={() => setHofExpanded(!hofExpanded)}>
                    <Text style={dS.hofSectionLabel}>특별한 순간 · {hallOfFame.length}개</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C9A84C' }}>{hofExpanded ? '접기' : '펼치기'}</Text>
                  </TouchableOpacity>
                  {hofExpanded && hallOfFame.map(item => <HallOfFameCard key={item.id} item={item} />)}
                  <View style={{ height: 8 }} />
                </View>
              )}

              {filtered.length === 0 ? (
                <View style={dS.emptyWrap}>
                  <Text style={dS.emptyMsg}>검색 결과가 없어요</Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                  {filtered.map((item, idx) => (
                    <View key={item.id} style={dS.tlNode}>
                      {idx < filtered.length - 1 && <View style={dS.tlLine} />}
                      <View style={[dS.tlDot, item.badge === '베스트' && dS.tlDotBest, item.badge === '버디' && dS.tlDotBirdie, item.special && dS.tlDotSpecial]} />
                      <DiaryCard item={item} avgScore={avgScore} onPress={(it) => setSelected(it)} />
                    </View>
                  ))}
                </View>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>
          </>
        );
      })()}
      {tab === 'log' && <CourseLogTab avgRating={avgRating} />}
      {tab === 'friends' && <FriendsTab />}

      <DiaryAddModal visible={showModal} onClose={() => setShowModal(false)} onSave={handleSave} />
      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
    </SafeAreaView>
  );
}

// ── 가이드 화면 ───────────────────────────────────────
function GuideScreen({ route }) {
  const [selected, setSelected] = useState(null);
  const [innerTab, setInnerTab] = useState('course');
  const [favorites, setFavorites] = useState(FAVORITES_INIT);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [showAllRest, setShowAllRest] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.favorites, FAVORITES_INIT);
      setFavorites(loaded);
      setFavoritesHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!favoritesHydrated) return;
    storage.save(STORAGE_KEYS.favorites, favorites);
  }, [favorites, favoritesHydrated]);

  useEffect(() => {
    if (route?.params?.openCourseId) {
      setSelected(route.params.openCourseId);
      setInnerTab('course');
    }
  }, [route?.params?.openCourseId]);

  const toggleFavorite = (id) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const scheduleCourseIds = SCHEDULES_INIT.map(s => s.courseLogId).filter(Boolean);
  const favoriteCourses = COURSE_LOG.filter(c => favorites.includes(c.id) && !scheduleCourseIds.includes(c.id));
  const otherCourses = COURSE_LOG.filter(c => !scheduleCourseIds.includes(c.id) && !favorites.includes(c.id));
  const chipCourses = [
    ...SCHEDULES_INIT.filter(s => s.courseLogId).map(s => ({ ...COURSE_LOG.find(c => c.id === s.courseLogId), isScheduled: true })),
    ...favoriteCourses.map(c => ({ ...c, isFavorite: true })),
    ...otherCourses,
  ].filter(Boolean);

  if (selected) {
    const c = COURSE_LOG.find(x => x.id === selected);
    const isFav = favorites.includes(selected);
    const guideTabIdx = innerTab === 'course' ? 0 : 1;

    const ALL_RESTAURANTS = [
      ...USER_RESTAURANTS,
      { id: '4', name: '장작구이 참숯갈비', type: '갈비', dist: '2.1km', rating: '4.6' },
      { id: '5', name: '황태해장국', type: '해장국', dist: '1.5km', rating: '4.3' },
      { id: '6', name: '청국장마을', type: '청국장', dist: '3.2km', rating: '4.4' },
    ];
    const visibleRest = showAllRest ? ALL_RESTAURANTS : ALL_RESTAURANTS.slice(0, 2);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
        {/* 헤더 */}
        <View style={gS.detailHdr}>
          <TouchableOpacity onPress={() => { setSelected(null); setInnerTab('course'); }}>
            <Text style={gS.backBtn}>← 가이드</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={gS.detailName}>{c.name}</Text>
              <Text style={gS.detailLoc}>{c.loc} · 18홀 · Par 72</Text>
            </View>
            <TouchableOpacity onPress={() => toggleFavorite(selected)} style={[gS.favBtn, isFav && gS.favBtnOn]}>
              <Text style={[gS.favBtnTxt, isFav && gS.favBtnTxtOn]}>{isFav ? '저장됨' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 히어로 이미지 영역 */}
        <View style={{ height: 150, backgroundColor: '#0D1F0D', position: 'relative', justifyContent: 'flex-end' }}>
          <View style={{ position: 'absolute', inset: 0, opacity: 0.15, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 1, borderColor: C.butter }} />
          </View>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: 'rgba(5,15,5,0.6)' }} />
          <View style={{ padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {c.tags.map((t, i) => (
                <View key={i} style={[
                  { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
                  i === 0 && { backgroundColor: 'rgba(245,230,168,0.92)' },
                  i === 1 && { backgroundColor: 'rgba(200,217,230,0.92)' },
                  i === 2 && { backgroundColor: 'rgba(107,30,42,0.9)' },
                ]}>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: i === 2 ? '#FAF6EC' : i === 0 ? '#5A4A00' : '#1A4060' }}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 탭 */}
        <View style={{ backgroundColor: C.bgPrimary }}>
          <View style={{ flexDirection: 'row' }}>
            {[['course', '코스 & 코멘트'], ['food', '맛집 & 주변']].map(([k, l]) => (
              <TouchableOpacity key={k} style={gS.innerTab} onPress={() => setInnerTab(k)}>
                <Text style={[gS.innerTabTxt, innerTab === k && gS.innerTabTxtOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', height: 3 }}>
            <View style={{ flex: 1, backgroundColor: C.paleSky, opacity: guideTabIdx === 0 ? 1 : 0.25, height: guideTabIdx === 0 ? 4 : 2, marginTop: guideTabIdx === 0 ? 0 : 1 }} />
            <View style={{ flex: 1, backgroundColor: C.burgundy, opacity: guideTabIdx === 1 ? 1 : 0.25, height: guideTabIdx === 1 ? 4 : 2, marginTop: guideTabIdx === 1 ? 0 : 1 }} />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {innerTab === 'course' && (
            <View style={{ padding: 16 }}>
              <Text style={gS.secLabel}>코스 정보</Text>
              <View style={gS.infoCard}>
                {[['위치', c.loc], ['홀 수', '18홀'], ['Par', '72']].map(([k, v], i) => (
                  <View key={i} style={[gS.infoRow, i === 2 && { borderBottomWidth: 0 }]}>
                    <Text style={gS.infoKey}>{k}</Text>
                    <Text style={gS.infoVal}>{v}</Text>
                  </View>
                ))}
              </View>

              {/* 코스 한마디 — 있을 때만 표시 */}
              {c.memo ? (
                <>
                  <Text style={[gS.secLabel, { marginTop: 4 }]}>코스 한마디</Text>
                  <View style={gS.memoBox}>
                    <Text style={gS.memoTxt}>"{c.memo}"</Text>
                  </View>
                </>
              ) : (
                <View style={{ backgroundColor: C.paleSky + '22', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 0.5, borderColor: C.paleSky + '60' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, lineHeight: 18 }}>
                    아직 방문 전이에요. 아래 골퍼들의 코멘트를 참고해보세요
                  </Text>
                </View>
              )}

              {/* 예약 버튼들 */}
              <TouchableOpacity style={{ backgroundColor: '#3A1C00', borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginBottom: 8 }}
                onPress={() => Linking.openURL(`https://golf.kakao.com/search?query=${encodeURIComponent(c.name)}`)}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#FEE500', letterSpacing: 0.3 }}>카카오골프 예약하기</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#03C75A', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                  onPress={() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff' }}>네이버 골프장 정보</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#FEE500', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                  onPress={() => Linking.openURL(`kakaomap://search?q=${encodeURIComponent(c.name)}`)
                    .catch(() => Linking.openURL(`https://map.kakao.com/link/search/${encodeURIComponent(c.name)}`))}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#3A1C00', fontWeight: '500' }}>카카오맵 보기</Text>
                </TouchableOpacity>
              </View>

              {/* 골퍼 코멘트 — 좋아요 순 3개 */}
              <Text style={gS.secLabel}>골퍼 코멘트 · 좋아요 순</Text>
              {[
                { txt: '그린이 정말 빠릅니다. 퍼팅 연습 충분히 하고 가세요', who: 'J***', date: '2025.04', likes: 24 },
                { txt: '7번홀 왼쪽 OB 많이 납니다. 아이언 공략 추천', who: 'K***', date: '2025.03', likes: 18 },
                { txt: '클럽하우스 식당 된장찌개 강추. 라운딩 후 꼭 드세요', who: 'P***', date: '2025.02', likes: 11 },
              ].map((cm, i) => (
                <View key={i} style={gS.commentCard}>
                  <Text style={gS.commentTxt}>"{cm.txt}"</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={gS.commentWho}>{cm.who} · {cm.date}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: C.burgundy + '60', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.burgundy }}>♥ {cm.likes}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={gS.commentAddBtn}>
                <Text style={gS.commentAddTxt}>+ 코멘트 남기기</Text>
              </TouchableOpacity>
            </View>
          )}
          {innerTab === 'food' && (
            <View style={{ padding: 16 }}>
              <Text style={gS.secLabel}>내가 저장한 맛집</Text>
              {MY_RESTAURANTS.map(r => (
                <View key={r.id} style={[gS.restItem, { borderColor: C.butter }]}>
                  <View style={[gS.restIcon, { backgroundColor: '#FFF8E7' }]}><Text style={{ fontSize: 20 }}>•</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={gS.mineBadge}><Text style={gS.mineBadgeTxt}>내 기록</Text></View>
                    <Text style={gS.restName}>{r.name}</Text>
                    <Text style={gS.restType}>{r.type} · {r.dist}</Text>
                    <Text style={gS.restMemo}>"{r.memo}"</Text>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
                <Text style={gS.secLabel}>골퍼 추천 맛집</Text>
                <TouchableOpacity onPress={() => setShowAllRest(!showAllRest)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>
                    {showAllRest ? '접기' : `더보기 (${ALL_RESTAURANTS.length - 2}개 더)`}
                  </Text>
                </TouchableOpacity>
              </View>
              {visibleRest.map(r => (
                <TouchableOpacity key={r.id} style={gS.restItem}
                  onPress={() => Linking.openURL(`nmap://search?query=${encodeURIComponent(r.name)}`)
                    .catch(() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(r.name)}`))}>
                  <View style={[gS.restIcon, { backgroundColor: '#F0F4F8' }]}><Text style={{ fontSize: 20 }}>•</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={[gS.mineBadge, { backgroundColor: C.paleSky }]}><Text style={[gS.mineBadgeTxt, { color: C.charcoalDeep }]}>추천</Text></View>
                    <Text style={gS.restName}>{r.name}</Text>
                    <Text style={gS.restType}>{r.type} · {r.dist}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={gS.ratingBox}><Text style={gS.ratingTxt}>★ {r.rating}</Text></View>
                    <Text style={{ fontFamily: F.sys, fontSize: 9, color: C.paleSky }}>지도 →</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={[gS.secLabel, { marginTop: 24 }]}>근처 골프장</Text>
              {[
                { name: '안성베네스트 CC', dist: '8.2km', loc: '경기 안성', visited: false },
                { name: '사우스링스 CC', dist: '12.4km', loc: '경기 안성', visited: false },
                { name: '파인크리크 골프장', dist: '24.1km', loc: '경기 평택', visited: true },
              ].map((n, i) => (
                <View key={i} style={gS.nearbyCard}>
                  <View style={gS.nearbyIconWrap}><Text style={{ fontSize: 16 }}>⛳</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={gS.nearbyName}>{n.name}</Text>
                      {n.visited && <View style={gS.visitedBadge}><Text style={gS.visitedBadgeTxt}>방문</Text></View>}
                    </View>
                    <Text style={gS.nearbyLoc}>{n.loc}</Text>
                  </View>
                  <Text style={gS.nearbyDist}>{n.dist}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const hasCourses = chipCourses.length > 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <LightHeader sub="나만의 골프 캐디" title="가이드" right={<Text style={gS.searchTxt}>검색</Text>} />
      <TripleStripe />
      {hasCourses ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}
            style={{ maxHeight: 50 }}>
            {chipCourses.map((c, i) => (
              <TouchableOpacity key={c.id} style={[gS.chip, i === 0 && gS.chipOn]}
                onPress={() => { setSelected(c.id); setInnerTab('course'); }}>
                <Text style={[gS.chipTxt, i === 0 && gS.chipTxtOn]}>
                  {c.isScheduled ? '예정 ' : c.isFavorite ? '저장 ' : ''}{c.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {chipCourses.map(c => {
                const isFav = favorites.includes(c.id);
                return (
                  <TouchableOpacity key={c.id} style={gS.courseCard}
                    onPress={() => { setSelected(c.id); setInnerTab('course'); }} activeOpacity={0.85}>
                    <View style={gS.courseCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={gS.courseCardName}>{c.name}</Text>
                        <Text style={gS.courseCardLoc}>{c.loc} · 18홀</Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleFavorite(c.id)} style={[gS.favBtn, isFav && gS.favBtnOn]}>
                        <Text style={[gS.favBtnTxt, isFav && gS.favBtnTxtOn]}>{isFav ? '저장됨' : '저장'}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
                      {c.tags.slice(0, 2).map((t, i) => (
                        <View key={i} style={[gS.pill, i === 0 && { backgroundColor: C.butter }, i === 1 && { backgroundColor: C.paleSky }]}>
                          <Text style={gS.pillTxt}>{t}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={gS.courseCardScore}>내 베스트 {c.best}타</Text>
                      <Text style={gS.courseCardArrow}>›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ height: 32 }} />
          </ScrollView>
        </>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={gS.emptyBanner}>
            <Text style={gS.emptyTitle}>방문한 코스가 없어요</Text>
            <Text style={gS.emptySub}>관심 있는 골프장을 검색하거나{'\n'}추천 코스를 둘러보세요</Text>
          </View>
          <Text style={[gS.secLabel, { marginHorizontal: 16, marginTop: 8 }]}>추천 골프장</Text>
          <View style={{ paddingHorizontal: 16 }}>
            {RECOMMENDED_COURSES.map(c => (
              <TouchableOpacity key={c.id} style={[gS.courseCard, { borderColor: C.paleSky + '80' }]} activeOpacity={0.85}>
                <View style={gS.courseCardTop}>
                  <Text style={gS.courseCardName}>{c.name}</Text>
                  <TouchableOpacity onPress={() => toggleFavorite(c.id)} style={[gS.favBtn, favorites.includes(c.id) && gS.favBtnOn]}>
                    <Text style={[gS.favBtnTxt, favorites.includes(c.id) && gS.favBtnTxtOn]}>{favorites.includes(c.id) ? '저장됨' : '저장'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={gS.courseCardLoc}>{c.loc}</Text>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {c.tags.map((t, i) => (
                    <View key={i} style={[gS.pill, { backgroundColor: i === 0 ? C.butter : C.paleSky }]}>
                      <Text style={gS.pillTxt}>{t}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── 마이페이지 모달 ────────────────────────────────────
function MyPageModal({ visible, onClose }) {
  const { setUserProfile } = React.useContext(UserContext);
  const [nickname, setNickname] = useState(USER_PROFILE.nickname);
  const [editingNick, setEditingNick] = useState(false);
  const [departure, setDeparture] = useState(USER_PROFILE.departure || '');
  const [phone, setPhone] = useState(USER_PROFILE.phone || '');
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingStats, setEditingStats] = useState(false);
  const [avgScore, setAvgScore] = useState(String(USER_PROFILE.avgScore || ''));
  const [lifeBest, setLifeBest] = useState(String(USER_PROFILE.lifeBest || ''));
  const [totalRounds, setTotalRounds] = useState(String(USER_PROFILE.totalRounds || ''));

  const handleSaveStats = () => {
    const updated = {
      ...USER_PROFILE,
      avgScore: Number(avgScore) || 0,
      lifeBest: Number(lifeBest) || 0,
      totalRounds: Number(totalRounds) || 0,
    };
    USER_PROFILE = { ...updated };
    setUserProfile({ ...updated });
    if (_setUserProfile) _setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setEditingStats(false);
    Alert.alert('완료', '통계가 저장되었어요 ✓');
  };

  useEffect(() => {
    if (visible) {
      setNickname(USER_PROFILE.nickname);
      setDeparture(USER_PROFILE.departure || '');
      setPhone(USER_PROFILE.phone || '');
      setEditingInfo(false);
    }
  }, [visible]);

  const handleSaveInfo = () => {
    const updated = { ...USER_PROFILE, departure, phone };
    USER_PROFILE = { ...updated };
    setUserProfile({ ...updated });
    if (_setUserProfile) _setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setEditingInfo(false);
    Alert.alert('완료', '내 정보가 저장되었어요 ✓');
  };

  const handleCancelInfo = () => {
    setDeparture(USER_PROFILE.departure || '');
    setPhone(USER_PROFILE.phone || '');
    setEditingInfo(false);
  };

  const formatPhone = (t) => {
    const numbers = (t || '').replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return numbers.slice(0, 3) + '-' + numbers.slice(3);
    return numbers.slice(0, 3) + '-' + numbers.slice(3, 7) + '-' + numbers.slice(7, 11);
  };

  const handleSaveNickname = () => {
    const trimmed = (nickname || '').trim();
    if (!trimmed) {
      setNickname(USER_PROFILE.nickname);
      setEditingNick(false);
      return;
    }
    if (trimmed === USER_PROFILE.nickname) {
      setEditingNick(false);
      return;
    }
    const updated = { ...USER_PROFILE, nickname: trimmed };
    USER_PROFILE = { ...updated };
    if (_setUserProfile) _setUserProfile({ ...updated });
    setNickname(trimmed);
    setEditingNick(false);
    Alert.alert('완료', '닉네임이 변경되었어요');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={myS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={myS.sheet}>
            <View style={myS.handle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={myS.profileArea}>
                <View style={myS.avatar}>
                  <Text style={myS.avatarTxt}>{nickname.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {editingNick ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={[myS.nickInput, { flex: 1 }]}
                        value={nickname} onChangeText={setNickname}
                        onSubmitEditing={handleSaveNickname}
                        returnKeyType="done"
                        autoFocus maxLength={10}
                        autoCapitalize="none" autoCorrect={false} keyboardType="default" />
                      <TouchableOpacity onPress={handleSaveNickname}
                        style={{ backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                        activeOpacity={0.7}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        setNickname(USER_PROFILE.nickname);
                        setEditingNick(false);
                      }} activeOpacity={0.6}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={myS.nickname}>{nickname}</Text>
                      <TouchableOpacity
                        onPress={() => setEditingNick(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 10 }}
                        activeOpacity={0.6}>
                        <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: 12 }}>닉네임 수정</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={myS.realName}>{USER_PROFILE.realName}</Text>
                </View>
              </View>
              <TripleStripe height={1.5} />
              <View style={myS.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={myS.sectionLabel}>나의 통계</Text>
                  <View style={{ flex: 1 }} />
                  {editingStats ? (
                    <>
                      <TouchableOpacity onPress={() => {
                        setAvgScore(String(USER_PROFILE.avgScore || ''));
                        setLifeBest(String(USER_PROFILE.lifeBest || ''));
                        setTotalRounds(String(USER_PROFILE.totalRounds || ''));
                        setEditingStats(false);
                      }}>
                        <Text style={{ color: '#8B8680', marginRight: 12, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveStats}
                        style={{ backgroundColor: '#6B1E2A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ color: '#F5E6A8', fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingStats(true)}>
                      <Text style={{ color: '#6B1E2A', fontSize: 13 }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingStats ? (
                  <View>
                    {[
                      { label: '평균 타수', value: avgScore, set: setAvgScore, ph: '92' },
                      { label: '베스트 스코어', value: lifeBest, set: setLifeBest, ph: '78' },
                      { label: '총 라운딩 수', value: totalRounds, set: setTotalRounds, ph: '0' },
                    ].map((field, i) => (
                      <View key={i} style={{ marginBottom: 10 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 4 }}>
                          {field.label}
                        </Text>
                        <TextInput
                          style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                            borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                            fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}
                          value={field.value}
                          onChangeText={field.set}
                          keyboardType="numeric"
                          placeholder={field.ph}
                          placeholderTextColor={C.warmGrayLight}
                          maxLength={4}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={myS.statsRow}>
                    {[
                      { label: '총 라운딩', value: USER_PROFILE.totalRounds || DIARY_DATA.length },
                      { label: '평균타', value: USER_PROFILE.avgScore || Math.round(DIARY_DATA.reduce((s,d) => s+d.score, 0) / DIARY_DATA.length) },
                      { label: '베스트', value: USER_PROFILE.lifeBest || Math.min(...DIARY_DATA.map(d => d.score)) },
                    ].map((st, i) => (
                      <View key={i} style={myS.statBox}>
                        <Text style={myS.statVal}>{st.value}</Text>
                        <Text style={myS.statLabel}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={myS.sectionLabel}>내 정보</Text>
                  <View style={{ flex: 1 }} />
                  {editingInfo ? (
                    <>
                      <TouchableOpacity onPress={handleCancelInfo}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, marginRight: 12, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveInfo}
                        style={{ backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingInfo(true)}>
                      <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: 13 }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>자주 가는 출발지</Text>
                    {editingInfo ? (
                      <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={departure} onChangeText={setDeparture} autoFocus
                        placeholder="서울 강남구 역삼동" placeholderTextColor={C.warmGrayLight} />
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: departure ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {departure || '입력하기 →'}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📱</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>전화번호 (선택)</Text>
                    {editingInfo ? (
                      <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={phone} onChangeText={(t) => setPhone(formatPhone(t))} maxLength={13}
                        placeholder="010-0000-0000" placeholderTextColor={C.warmGrayLight} keyboardType="phone-pad" />
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: phone ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {phone || '입력하기 →'}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>설정</Text>
                {[{ icon: '✏️', label: '닉네임 변경' }, { icon: '🔔', label: '알림 설정' }, { icon: '📷', label: '앱 권한 (사진·위치)' }].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>정보</Text>
                {[{ icon: '⭐', label: '앱 평가하기' }, { icon: '📋', label: 'v1.0.0' }].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>Dear Golf v1.0.0</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 탭바 ──────────────────────────────────────────────
const TAB_COLORS = [C.butter, C.paleSky, C.burgundy];
function TabBar({ state, navigation }) {
  const labels = ['홈', '다이어리', '가이드'];
  return (
    <View style={tabS.bar}>
      <View style={tabS.stripeRow}>
        {[0,1,2].map(i => (
          <View key={i} style={[tabS.stripeSegment, { backgroundColor: TAB_COLORS[i] }, state.index === i && tabS.stripeSegmentOn]} />
        ))}
      </View>
      <View style={tabS.tabRow}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          return (
            <TouchableOpacity key={route.key} style={tabS.tab}
              onPress={() => navigation.navigate(route.name)} activeOpacity={0.7}>
              <Text style={[tabS.label, focused ? tabS.labelOn : tabS.labelOff]}>{labels[i]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────────────

// 날씨 탭 (새 디자인) 스타일

// 교통 탭 (새 디자인) 스타일

// D-Day 바텀시트 메뉴 스타일







// ── 앱 루트 ───────────────────────────────────────────
export default function App() {
  const [userProfile, setUserProfile] = useState(USER_PROFILE_INIT);
  const [showOnboarding, setShowOnboarding] = useState(!USER_PROFILE_INIT.onboardingDone);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [firstSingleAlert, setFirstSingleAlert] = useState(false);
  const [bestAlert, setBestAlert] = useState(false);

  _setUserProfile = setUserProfile;

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.profile, null);
      if (loaded) {
        USER_PROFILE = { ...loaded };
        setUserProfile(loaded);
        setShowOnboarding(!loaded.onboardingDone);
      }
      setProfileLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!profileLoaded) return;
    storage.save(STORAGE_KEYS.profile, userProfile);
  }, [userProfile, profileLoaded]);

  const handleOnboardingComplete = (data) => {
    USER_PROFILE = { ...data };
    setUserProfile({ ...data });
    setShowOnboarding(false);
  };

  if (!profileLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
        <ActivityIndicator size="large" color={C.burgundy} />
      </View>
    );
  }

  if (showOnboarding) return <OnboardingScreen onComplete={handleOnboardingComplete} />;

  return (
    <UserContext.Provider value={{ userProfile, setUserProfile }}>
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tab.Screen name="홈" component={HomeScreen} />
        <Tab.Screen name="다이어리" component={DiaryScreen} />
        <Tab.Screen name="가이드" component={GuideScreen} />
      </Tab.Navigator>

      <Modal visible={firstSingleAlert} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#4A7A8A', borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#C8D9E6' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(200,217,230,0.6)', letterSpacing: 4, marginBottom: 8 }}>달성</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 26, color: '#C8D9E6', fontWeight: '600', letterSpacing: 3, marginBottom: 8 }}>퍼스트 싱글</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: 'rgba(200,217,230,0.8)', marginBottom: 20 }}>싱글 달성을 축하해요!</Text>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: '#C8D9E6', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 }}
              onPress={() => setFirstSingleAlert(false)}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#C8D9E6' }}>감사해요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={bestAlert} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: C.burgundy, borderRadius: 20, padding: 28, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(245,230,168,0.6)', letterSpacing: 4, marginBottom: 8 }}>신기록</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 26, color: C.butter, fontWeight: '600', letterSpacing: 2, marginBottom: 8 }}>라이프 베스트!</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 20 }}>라이프 베스트 갱신!</Text>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: C.butter, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 }}
              onPress={() => setBestAlert(false)}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.butter }}>감사해요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </NavigationContainer>
    </UserContext.Provider>
  );
}
