import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView,
  TouchableOpacity, SafeAreaView, StatusBar,
  Modal, Dimensions, Image, FlatList,
  TextInput, KeyboardAvoidingView, Platform,
  PanResponder, Animated, Linking, Share, Alert,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Video } from 'expo-av';

const Tab = createBottomTabNavigator();
const { width: SW } = Dimensions.get('window');

// ── 컬러/폰트 ──────────────────────────────────────────
const C = {
  bgPrimary:    '#FAF6EC',
  bgSecondary:  '#FFFFFF',
  charcoal:     '#3D3935',
  charcoalDeep: '#2A2622',
  burgundy:     '#6B1E2A',
  butter:       '#F5E6A8',
  paleSky:      '#C8D9E6',
  warmGray:     '#8B8680',
  warmGrayLight:'#B8B3AB',
  hairline:     '#E8E2D0',
  textPrimary:  '#3D3935',
  textSecondary:'#6B6660',
};
const F = { en: 'Georgia', sys: '-apple-system' };

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

const cmn = StyleSheet.create({
  hdr: {
    backgroundColor: C.bgPrimary,
    paddingHorizontal: 20, paddingVertical: 13,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  hdrSub:   { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 2, marginBottom: 2 },
  hdrTitle: { fontFamily: F.en,  fontSize: 24, color: C.charcoal, fontStyle: 'italic' },
  circleBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.charcoal, alignItems: 'center', justifyContent: 'center' },
  circleBtnIcon: { fontFamily: F.en, fontSize: 18, color: C.charcoal, lineHeight: 22 },
});

// ── 데이터 ─────────────────────────────────────────────
const SCHEDULES_INIT = [
  { id: '1', course: '제이드팰리스 골프클럽', date: '2026.05.15', day: '금', time: '07:30', members: 4, dDay: 10, weather: '맑음 18°', wind: '북동 3m/s', duration: '1시간 23분', courseLogId: '1' },
  { id: '2', course: '안성베네스트 CC',       date: '2026.05.22', day: '금', time: '08:00', members: 3, dDay: 17, weather: '구름 15°', wind: '서 2m/s',   duration: '1시간 45분', courseLogId: '2' },
  { id: '3', course: '사우스링스 CC',         date: '2026.05.28', day: '목', time: '07:00', members: 4, dDay: 23, weather: '맑음 20°', wind: '남 1m/s',   duration: '2시간 10분', courseLogId: '3' },
];

const HALL_OF_FAME = [
  { id: 'h1', type: 'HOLE IN ONE', date: '2024.09.15', course: '제이드팰리스 골프클럽', hole: 7, par: 3, distance: '156m', ball: 'Titleist Pro V1', companions: ['김민준', '이수연'], memo: '믿을 수가 없었다. 볼이 그냥 들어갔어' },
  { id: 'h2', type: 'EAGLE', date: '2025.03.30', course: '남촌 골프클럽', hole: 12, par: 5, distance: '490m', ball: 'Titleist Pro V1', companions: ['오세훈'], memo: '세컨샷이 핀에 딱 붙었다' },
];

const DIARY_DATA = [
  { id: '1', date: '2025.03.30', day: '일', course: '남촌 골프클럽', score: 76, par: 72,
    memo: '베스트 갱신! 아이언이 살아났다', badge: '베스트', weather: '맑음',
    special: 'EAGLE', specialHole: 12,
    companions: [{ name: '지현', isMe: true }, { name: '김민준' }, { name: '이수연' }],
    photos: ['https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800','https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800','https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800'] },
  { id: '2', date: '2025.04.28', day: '월', course: '제이드팰리스 골프클럽', score: 92, par: 72,
    memo: '드라이버 컨디션 최고였던 날', badge: null, weather: '흐림',
    special: null,
    companions: [{ name: '지현', isMe: true }, { name: '박정호' }],
    photos: [] },
  { id: '3', date: '2025.02.14', day: '금', course: '블랙스톤 컨트리클럽', score: 88, par: 72,
    memo: '퍼팅이 아쉬웠지만 즐거웠음', badge: '버디', weather: '맑음',
    special: 'HOLE IN ONE', specialHole: 7,
    companions: [{ name: '지현', isMe: true }, { name: '최다은' }, { name: '오세훈' }],
    photos: ['https://images.unsplash.com/photo-1592919505780-303950717480?w=800','https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=800'] },
  { id: '4', date: '2025.01.20', day: '월', course: '파인크리크 골프장', score: 105, par: 72,
    memo: '바람 때문에 고생... 그래도 즐거웠음', badge: null, weather: '바람',
    special: null,
    companions: [{ name: '지현', isMe: true }],
    photos: [] },
];

const COURSE_LOG = [
  { id: '1', name: '제이드팰리스 골프클럽', loc: '경기 용인',   visits: 3, best: 89, avg: 94, memo: '7번홀 OB 조심, 된장찌개 맛있음', tags: ['★★★★', '넓은 페어웨이', '그린 빠름'] },
  { id: '2', name: '남촌 골프클럽',         loc: '경기 남양주', visits: 2, best: 76, avg: 88, memo: '18번홀 파3 어려움', tags: ['★★★★★', '베스트코스'] },
  { id: '3', name: '블랙스톤 컨트리클럽',  loc: '충북 음성',   visits: 4, best: 88, avg: 95, memo: '퍼팅 그린 관리 최고', tags: ['★★★', '관리 최상'] },
];

const FAVORITES_INIT = ['2'];

const MEMO_MAP = {
  '1': { text: '7번홀 OB 조심, 클럽하우스 된장찌개 맛있음', date: '2025.10.03', courseId: '1' },
};

const MY_RESTAURANTS  = [{ id: '1', name: '천안 한우명가', type: '한우구이', dist: '500m', memo: '라운딩 후 꼭 가기. 1++ 등심 추천' }];
const USER_RESTAURANTS = [
  { id: '2', name: '미락 숯불갈비', type: '갈비', dist: '1.2km', rating: '4.8' },
  { id: '3', name: '순두부마을', type: '순두부찌개', dist: '800m', rating: '4.5' },
];

const GOLF_DB = [
  { id: 'g1', name: '제이드팰리스 골프클럽', loc: '경기 용인' },
  { id: 'g2', name: '남촌 골프클럽', loc: '경기 남양주' },
  { id: 'g3', name: '블랙스톤 컨트리클럽', loc: '충북 음성' },
  { id: 'g4', name: '파인크리크 골프장', loc: '경기 평택' },
  { id: 'g5', name: '안성베네스트 CC', loc: '경기 안성' },
  { id: 'g6', name: '사우스링스 CC', loc: '경기 안성' },
  { id: 'g7', name: '클럽나인브릿지', loc: '제주' },
  { id: 'g8', name: '핀크스 골프클럽', loc: '제주' },
  { id: 'g9', name: '레이크사이드CC', loc: '경기 고양' },
  { id: 'g10', name: '해슬리나인브릿지', loc: '경기 여주' },
  { id: 'g11', name: '가평베네스트 CC', loc: '경기 가평' },
  { id: 'g12', name: '스카이72 골프앤리조트', loc: '인천 영종도' },
  { id: 'g13', name: '오크밸리CC', loc: '강원 원주' },
  { id: 'g14', name: '골든비치CC', loc: '강원 강릉' },
  { id: 'g15', name: '웰링턴CC', loc: '경기 여주' },
];

const RECOMMENDED_COURSES = [
  { id: 'r1', name: '클럽나인브릿지', loc: '제주', tags: ['★★★★★', '국내 TOP'] },
  { id: 'r2', name: '핀크스 골프클럽', loc: '제주', tags: ['★★★★★', '오션뷰'] },
  { id: 'r3', name: '레이크사이드CC', loc: '경기 고양', tags: ['★★★★', '접근 편리'] },
  { id: 'r4', name: '해슬리나인브릿지', loc: '경기 여주', tags: ['★★★★★', '명문 코스'] },
];

const OVERSEAS_COURSE_LOG = [
  { id: 'o1', name: '나루토 골프클럽', loc: '일본 오사카', country: '일본', flag: '🇯🇵', visits: 2, best: 88, avg: 94, memo: '코스 관리 최고, 뷰가 아름다움', tags: ['★★★★★', '오션뷰'] },
  { id: 'o2', name: '블랙마운틴 CC', loc: '태국 후아힌', country: '태국', flag: '🇹🇭', visits: 1, best: 92, avg: 92, memo: '열대 코스, 캐디 서비스 훌륭', tags: ['★★★★', '리조트형'] },
  { id: 'o3', name: '발리 국립 GC', loc: '인도네시아 발리', country: '인도네시아', flag: '🇮🇩', visits: 1, best: 95, avg: 95, memo: '발리 여행 중 라운딩, 뷰 최고', tags: ['★★★★', '열대우림'] },
];

const TOP_100_COURSES = [
  { rank: 1,  name: '클럽나인브릿지',    loc: '제주', visited: false },
  { rank: 2,  name: '핀크스 골프클럽',   loc: '제주', visited: false },
  { rank: 3,  name: '해슬리나인브릿지',  loc: '경기 여주', visited: false },
  { rank: 4,  name: '레이크사이드CC',    loc: '경기 고양', visited: false },
  { rank: 5,  name: '남촌 골프클럽',     loc: '경기 남양주', visited: true },
  { rank: 6,  name: '블랙스톤 컨트리클럽', loc: '충북 음성', visited: true },
  { rank: 7,  name: '제이드팰리스 골프클럽', loc: '경기 용인', visited: true },
  { rank: 8,  name: '스카이72 골프앤리조트', loc: '인천 영종도', visited: false },
  { rank: 9,  name: '오크밸리CC',        loc: '강원 원주', visited: false },
  { rank: 10, name: '가평베네스트 CC',   loc: '경기 가평', visited: false },
  { rank: 11, name: '골든비치CC',        loc: '강원 강릉', visited: false },
  { rank: 12, name: '웰링턴CC',          loc: '경기 여주', visited: false },
  { rank: 13, name: '안성베네스트 CC',   loc: '경기 안성', visited: false },
  { rank: 14, name: '사우스링스 CC',     loc: '경기 안성', visited: false },
  { rank: 15, name: '파인크리크 골프장', loc: '경기 평택', visited: false },
  { rank: 16, name: '트리니티클럽',      loc: '경기 용인', visited: false },
  { rank: 17, name: '베어크리크 GC',     loc: '경기 용인', visited: false },
  { rank: 18, name: '88CC',             loc: '경기 여주', visited: false },
  { rank: 19, name: '아시아나CC',        loc: '전남 영광', visited: false },
  { rank: 20, name: '엘리시안 제주',     loc: '제주', visited: false },
];

const FRIENDS_DATA = [
  { id: 'f1', nickname: '김민준', realName: '김민준', rounds: 28, best: 82, lastCourse: '남촌 골프클럽', lastDate: '2025.05.01', photos: ['https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400'] },
  { id: 'f2', nickname: '이수연', realName: '이수연', rounds: 15, best: 91, lastCourse: '블랙스톤 CC', lastDate: '2025.04.28', photos: ['https://images.unsplash.com/photo-1592919505780-303950717480?w=400'] },
  { id: 'f3', nickname: '오세훈', realName: '오세훈', rounds: 42, best: 78, lastCourse: '제이드팰리스', lastDate: '2025.04.20', photos: [] },
];

// ── 유저 프로필 ─────────────────────────────────────────
const USER_PROFILE_INIT = {
  realName: '황지현',
  nickname: '지현',   // 버그수정: Golfer → Jessica
  avgScore: 92,
  lifeBest: 76,
  totalRounds: 24,
  hasFirstSingle: true,
  onboardingDone: true,  // 온보딩 완료 상태로 시작
};

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

// ── 선물하기 모달 ──────────────────────────────────────
const GIFT_MESSAGES = [
  '라운딩의 기쁨을 함께해주셔서 감사합니다',
  '오늘의 동반을 소중히 기억하겠습니다',
  '좋은 라운딩, 좋은 인연에 감사드립니다',
];

function GiftModal({ visible, onClose, occasion, companions = [] }) {
  const giftItems = ['골프공 각인', '골프공', '볼마커', '골프 티 세트', '캐디백 태그'];
  const [selectedGift, setSelectedGift] = useState(0);
  const [selectedPersons, setSelectedPersons] = useState([]);
  const [selectedMsg, setSelectedMsg] = useState(0);

  // 선물 항목별 카카오/네이버 검색어
  const giftSearchTerms = ['골프공각인', '골프공선물', '볼마커골프', '골프티세트', '캐디백태그'];

  const togglePerson = (name) => {
    setSelectedPersons(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  };

  const autoMsg = occasion
    ? `${occasion.date}\n${occasion.course}\n\n${GIFT_MESSAGES[selectedMsg]}\n- ${USER_PROFILE.nickname}`
    : GIFT_MESSAGES[selectedMsg];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
            <View style={{ width: 32, height: 3, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', margin: 12 }} />
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontFamily: F.sys, fontSize: 18, color: C.charcoal, fontWeight: '600', marginBottom: 4 }}>선물</Text>
              {occasion && <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 16, letterSpacing: 1 }}>{occasion.type} · {occasion.course}</Text>}
              {companions.filter(c => !c.isMe).length > 0 && (
                <>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 }}>받는 분 (여러명 선택 가능)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {companions.filter(c => !c.isMe).map((c, i) => {
                      const isSelected = selectedPersons.includes(c.name);
                      return (
                        <TouchableOpacity key={i}
                          style={{ borderWidth: 1, borderColor: isSelected ? C.charcoal : C.hairline, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: isSelected ? C.charcoal : C.bgSecondary }}
                          onPress={() => togglePerson(c.name)}>
                          <Text style={{ fontFamily: F.sys, fontSize: 12, color: isSelected ? C.butter : C.warmGrayLight }}>
                            {isSelected ? '✓  ' : ''}{c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 }}>선물 추천</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                {giftItems.map((g, i) => (
                  <TouchableOpacity key={i}
                    style={{ borderWidth: 1, borderColor: selectedGift === i ? C.charcoal : C.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: selectedGift === i ? C.charcoal : C.bgSecondary, minWidth: 80 }}
                    onPress={() => setSelectedGift(i)}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: selectedGift === i ? C.butter : C.warmGrayLight, textAlign: 'center' }}>{g}</Text>
                  </TouchableOpacity>
                ))}
                </View>
              </ScrollView>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 }}>각인 문구 추천</Text>
              <View style={{ gap: 6, marginBottom: 12 }}>
                {GIFT_MESSAGES.map((msg, i) => (
                  <TouchableOpacity key={i}
                    style={{ borderWidth: 1, borderColor: selectedMsg === i ? C.charcoal : C.hairline, borderRadius: 10, padding: 12, backgroundColor: selectedMsg === i ? '#F5F2ED' : C.bgSecondary }}
                    onPress={() => setSelectedMsg(i)}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: selectedMsg === i ? C.charcoal : C.warmGrayLight, lineHeight: 18 }}>{msg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, padding: 14, borderWidth: 0.5, borderColor: C.hairline, marginBottom: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 }}>각인 미리보기</Text>
                <Text style={{ fontFamily: F.en, fontSize: 12, color: C.textSecondary, fontStyle: 'italic', lineHeight: 22 }}>{autoMsg}</Text>
              </View>
              <TouchableOpacity style={{ alignSelf: 'flex-end', marginBottom: 16 }}
                onPress={() => Share.share({ message: autoMsg })}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>문구 복사 →</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ backgroundColor: C.charcoal, borderRadius: 12, padding: 15, alignItems: 'center', marginBottom: 10 }}
                onPress={() => { Linking.openURL(`https://gift.kakao.com/search?query=${giftSearchTerms[selectedGift]}`); onClose(); }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.butter, letterSpacing: 0.5 }}>카카오 선물하기로 보기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ backgroundColor: C.bgSecondary, borderRadius: 12, padding: 15, alignItems: 'center', borderWidth: 1, borderColor: C.hairline, marginBottom: 24 }}
                onPress={() => { Linking.openURL(`https://shopping.naver.com/search/all?query=${giftSearchTerms[selectedGift]}`); onClose(); }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal }}>네이버 쇼핑에서 보기</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

  // 골프 지수 계산 (더미)
  const golfScore = 78; // 0~100
  const golfLabel = golfScore >= 80 ? 'PERFECT' : golfScore >= 60 ? 'GOOD' : golfScore >= 40 ? 'FAIR' : 'POOR';
  const golfDesc = golfScore >= 80 ? '오늘 라운딩에 최적인 날씨입니다' : golfScore >= 60 ? '라운딩에 적합한 날씨입니다' : golfScore >= 40 ? '라운딩 가능하나 주의가 필요합니다' : '라운딩이 어려운 날씨입니다';
  const golfBarColor = golfScore >= 80 ? C.butter : golfScore >= 60 ? C.paleSky : C.warmGray;

  // 미세먼지 (더미)
  const pm10 = 23;
  const pm10Label = pm10 <= 30 ? '좋음' : pm10 <= 80 ? '보통' : pm10 <= 150 ? '나쁨' : '매우나쁨';
  const pm10Color = pm10 <= 30 ? C.paleSky : pm10 <= 80 ? C.butter : C.burgundy;
  const pm25 = 12;
  const pm25Label = pm25 <= 15 ? '좋음' : pm25 <= 35 ? '보통' : pm25 <= 75 ? '나쁨' : '매우나쁨';
  const pm25Color = pm25 <= 15 ? C.paleSky : pm25 <= 35 ? C.butter : C.burgundy;

  // 출발시간별 소요시간 (더미)
  const DEPARTURE_TIMES = [
    { time: '05:30', duration: '1시간 10분', traffic: '원활' },
    { time: '06:00', duration: '1시간 20분', traffic: '원활' },
    { time: '06:30', duration: '1시간 35분', traffic: '보통' },
    { time: '07:00', duration: '2시간 05분', traffic: '혼잡' },
    { time: '07:30', duration: '2시간 30분', traffic: '혼잡' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={homeS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={homeS.sheet}>
          <View style={homeS.handle} />

          {/* 탭 */}
          <View style={homeS.popTabs}>
            {[['wx', '날씨'], ['tr', '교통 · 출발시간']].map(([k, l]) => (
              <TouchableOpacity key={k}
                style={[homeS.popTab, popupTab === k && homeS.popTabOn]}
                onPress={() => setPopupTab(k)}>
                <Text style={[homeS.popTabTxt, popupTab === k && homeS.popTabTxtOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 탭 내용 — flex:1로 남은 공간 전부 사용 */}
          <View style={{ flex: 1 }}>

          {/* ── 날씨 탭 ── */}
          {popupTab === 'wx' && (
            <ScrollView style={homeS.popBody} showsVerticalScrollIndicator={false}>
              {/* 골프장명 + 날짜 */}
              <Text style={homeS.popCourse}>{schedule.course} · {schedule.date.slice(5)} {schedule.day}</Text>

              {/* 기온 메인 */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 6 }}>
                <Text style={{ fontFamily: F.en, fontSize: 56, color: '#fff', lineHeight: 60, letterSpacing: -1 }}>18°</Text>
                <View style={{ paddingBottom: 6 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>맑음</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>체감 16°</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>최고 22° · 최저 12°</Text>
                </View>
              </View>

              {/* 시간별 기온 바 차트 */}
              <Text style={[homeS.popCourse, { marginBottom: 8, marginTop: 4 }]}>시간별 기온</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4, alignItems: 'flex-end' }}>
                  {[
                    { t: '06시', temp: 12, rain: 0 }, { t: '07시', temp: 13, rain: 0 },
                    { t: '08시', temp: 15, rain: 5 }, { t: '09시', temp: 17, rain: 0 },
                    { t: '10시', temp: 18, rain: 0 }, { t: '11시', temp: 20, rain: 0 },
                    { t: '12시', temp: 22, rain: 10 }, { t: '13시', temp: 21, rain: 0 },
                    { t: '14시', temp: 20, rain: 0 }, { t: '15시', temp: 19, rain: 0 },
                  ].map((h, i) => (
                    <View key={i} style={{ alignItems: 'center', width: 44 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>{h.temp}°</Text>
                      <View style={{ width: 24, height: Math.max(8, (h.temp - 10) * 5), backgroundColor: h.temp >= 18 ? C.butter : C.paleSky, borderRadius: 4, opacity: 0.85 }} />
                      {h.rain > 0
                        ? <Text style={{ fontFamily: F.sys, fontSize: 8, color: C.paleSky, marginTop: 3 }}>{h.rain}%</Text>
                        : <View style={{ height: 13 }} />
                      }
                      <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{h.t}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* 날씨 정보 그리드 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'WIND', value: '북동 3m/s', sub: '라운딩 적합' },
                  { label: 'HUMIDITY', value: '52%', sub: '쾌적함' },
                  { label: 'UV INDEX', value: '보통', sub: '선크림 권장' },
                  { label: 'RAIN', value: '10%', sub: '우산 불필요' },
                ].map((item, i) => (
                  <View key={i} style={homeS.wxCell}>
                    <Text style={homeS.wxLbl}>{item.label}</Text>
                    <Text style={homeS.wxVal}>{item.value}</Text>
                    <Text style={homeS.wxSub}>{item.sub}</Text>
                  </View>
                ))}
              </View>

              {/* 미세먼지 */}
              <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 10 }}>FINE DUST</Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>미세먼지 PM10</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={{ fontFamily: F.en, fontSize: 22, color: '#fff', lineHeight: 26 }}>{pm10}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>μg/m³</Text>
                      <View style={{ backgroundColor: pm10Color + '33', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 10, color: pm10Color }}>{pm10Label}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ width: 0.5, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>초미세먼지 PM2.5</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={{ fontFamily: F.en, fontSize: 22, color: '#fff', lineHeight: 26 }}>{pm25}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>μg/m³</Text>
                      <View style={{ backgroundColor: pm25Color + '33', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 10, color: pm25Color }}>{pm25Label}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* 골프 지수 */}
              <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 10 }}>GOLF INDEX</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.en, fontSize: 22, color: golfBarColor, letterSpacing: 1 }}>{golfLabel}</Text>
                  <View style={{ flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2 }}>
                    <View style={{ width: `${golfScore}%`, height: '100%', backgroundColor: golfBarColor, borderRadius: 2 }} />
                  </View>
                  <Text style={{ fontFamily: F.en, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{golfScore}</Text>
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 18 }}>{golfDesc}</Text>
              </View>

              {/* 네이버 날씨 더보기 */}
              <TouchableOpacity style={homeS.naverBtn}
                onPress={() => Linking.openURL(`https://weather.naver.com/today/${encodeURIComponent(schedule.course)}`)}>
                <Text style={homeS.naverBtnTxt}>네이버 날씨에서 더 자세히 보기</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

          {/* ── 교통 탭 ── */}
          {popupTab === 'tr' && (
            <ScrollView style={homeS.popBody} showsVerticalScrollIndicator={false}>
              <Text style={homeS.popCourse}>{schedule.course} · {schedule.date.slice(5)} {schedule.day} · 티오프 {schedule.time}</Text>

              {/* 권장 출발 시간 — 크게 */}
              <View style={homeS.trBox}>
                <Text style={homeS.trBoxLabel}>RECOMMENDED DEPARTURE</Text>
                <Text style={homeS.trBoxTime}>06:07</Text>
                <Text style={homeS.trBoxSub}>티오프 {schedule.time} 기준 · 여유 30분 포함</Text>
              </View>

              {/* 출발시간별 소요시간 표 */}
              <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 8 }}>출발시간별 예상 소요시간</Text>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', marginBottom: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' }}>
                {DEPARTURE_TIMES.map((d, i) => {
                  const trafficColor = d.traffic === '원활' ? C.paleSky : d.traffic === '보통' ? C.butter : C.burgundy;
                  const isRecommended = d.time === '06:00';
                  return (
                    <View key={i} style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 14, paddingVertical: 10,
                      borderBottomWidth: i < DEPARTURE_TIMES.length - 1 ? 0.5 : 0,
                      borderBottomColor: 'rgba(255,255,255,0.07)',
                      backgroundColor: isRecommended ? 'rgba(245,230,168,0.08)' : 'transparent',
                    }}>
                      <Text style={{ fontFamily: F.en, fontSize: 15, color: isRecommended ? C.butter : 'rgba(255,255,255,0.75)', width: 52 }}>{d.time}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.6)', flex: 1 }}>{d.duration}</Text>
                      <View style={{ backgroundColor: trafficColor + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 10, color: trafficColor }}>{d.traffic}</Text>
                      </View>
                      {isRecommended && (
                        <View style={{ marginLeft: 6, backgroundColor: 'rgba(245,230,168,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 9, color: C.butter }}>추천</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* 갈 때 */}
              <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 8 }}>갈 때</Text>
              <View style={homeS.trRow}>
                <View style={{ flex: 1 }}>
                  <Text style={homeS.trMain}>서울 강남구 → {schedule.course}</Text>
                  <Text style={homeS.trSub}>경부고속도로 · 78.4km · 약 {schedule.duration}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TouchableOpacity style={homeS.routeBtn}
                  onPress={() => Linking.openURL(`nmap://route/car?dlat=37.0&dlon=127.0&dname=${encodeURIComponent(schedule.course)}&appname=deargolf`)
                    .catch(() => Linking.openURL(`https://map.naver.com/v5/directions/-/-/-/car`))}>
                  <Text style={homeS.routeBtnTxt}>네이버 경로</Text>
                </TouchableOpacity>
                <TouchableOpacity style={homeS.routeBtn}
                  onPress={() => Linking.openURL(`tmap://route?goalname=${encodeURIComponent(schedule.course)}`)
                    .catch(() => Linking.openURL('https://tmap.life'))}>
                  <Text style={homeS.routeBtnTxt}>티맵 경로</Text>
                </TouchableOpacity>
              </View>

              {/* 올 때 */}
              <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 8 }}>올 때</Text>
              <View style={homeS.trRow}>
                <View style={{ flex: 1 }}>
                  <Text style={homeS.trMain}>{schedule.course} → 서울 강남구</Text>
                  <Text style={homeS.trSub}>약 {schedule.duration} 소요 예상</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TouchableOpacity style={homeS.routeBtn}
                  onPress={() => Linking.openURL(`nmap://route/car?slat=37.0&slon=127.0&sname=${encodeURIComponent(schedule.course)}&appname=deargolf`)
                    .catch(() => Linking.openURL(`https://map.naver.com/v5/directions/-/-/-/car`))}>
                  <Text style={homeS.routeBtnTxt}>네이버 경로</Text>
                </TouchableOpacity>
                <TouchableOpacity style={homeS.routeBtn}
                  onPress={() => Linking.openURL(`tmap://route?startname=${encodeURIComponent(schedule.course)}`)
                    .catch(() => Linking.openURL('https://tmap.life'))}>
                  <Text style={homeS.routeBtnTxt}>티맵 경로</Text>
                </TouchableOpacity>
              </View>

              {/* 대리운전 — 한 번만, 반투명 */}
              <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 10 }}>대리운전</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <TouchableOpacity style={[homeS.driverBtn, { backgroundColor: 'rgba(254,229,0,0.12)', borderWidth: 1, borderColor: 'rgba(254,229,0,0.3)' }]}
                  onPress={() => Linking.openURL('kakaot://').catch(() => Linking.openURL('https://t.kakao.com'))}>
                  <Text style={[homeS.driverBtnTxt, { color: '#FEE500' }]}>카카오T</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[homeS.driverBtn, { backgroundColor: 'rgba(0,104,195,0.15)', borderWidth: 1, borderColor: 'rgba(0,104,195,0.4)' }]}
                  onPress={() => Linking.openURL('tmap://').catch(() => Linking.openURL('https://tmap.life'))}>
                  <Text style={[homeS.driverBtnTxt, { color: '#5BA3E0' }]}>티맵</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[homeS.driverBtn, { backgroundColor: 'rgba(200,217,230,0.1)', borderWidth: 1, borderColor: 'rgba(200,217,230,0.3)' }]}
                  onPress={() => Linking.openURL('https://www.idaree.com')}>
                  <Text style={[homeS.driverBtnTxt, { color: C.paleSky }]}>아이대리</Text>
                </TouchableOpacity>
              </View>

              {/* 동반자 공유 */}
              <TouchableOpacity
                style={{ backgroundColor: C.burgundy + 'CC', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 20 }}
                onPress={() => {
                  const msg = `[ Dear Golf ]\n${schedule.course} · ${schedule.date} ${schedule.day}\n\n권장 출발 06:07 (티오프 ${schedule.time})\n\n대리운전\n카카오T: https://t.kakao.com\n티맵: https://tmap.life\n아이대리: https://www.idaree.com`;
                  Share.share({ message: msg });
                }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#fff' }}>동반자에게 공유</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          </View>{/* flex:1 끝 */}

          <TouchableOpacity onPress={onClose} style={homeS.closeBtn}>
            <Text style={homeS.closeTxt}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
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
          <View style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 14 }}>
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
          <View style={sheetS.divider} />
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

// ── 날씨 전체화면 ────────────────────────────────────
function WeatherFullModal({ visible, schedule, onClose }) {
  if (!schedule) return null;
  const WEEK = [
    { day: '오늘',  date: schedule.date.slice(5), icon: '☀️', sky: '맑음',   tmin: 12, tmax: 22, rain: 10 },
    { day: '내일',  date: '',                     icon: '🌤️', sky: '구름조금', tmin: 13, tmax: 21, rain: 20 },
    { day: '모레',  date: '',                     icon: '☁️', sky: '흐림',   tmin: 14, tmax: 19, rain: 40 },
    { day: '목',    date: '',                     icon: '🌧️', sky: '비',     tmin: 13, tmax: 17, rain: 80 },
    { day: '금',    date: '',                     icon: '🌦️', sky: '소나기', tmin: 12, tmax: 18, rain: 60 },
    { day: '토',    date: '',                     icon: '⛅',  sky: '구름많음', tmin: 13, tmax: 20, rain: 20 },
    { day: '일',    date: '',                     icon: '☀️', sky: '맑음',   tmin: 14, tmax: 23, rain: 0  },
  ];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={fullS.container}>
        <View style={fullS.header}>
          <TouchableOpacity onPress={onClose} style={fullS.backBtn} activeOpacity={0.6}>
            <Text style={fullS.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={fullS.headerTitle} numberOfLines={1}>{schedule.course}</Text>
            <Text style={fullS.headerSub}>{schedule.date} {schedule.day} · 티오프 {schedule.time}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={fullS.sectionLabel}>날씨 예보</Text>
          <View style={fullS.card}>
            {WEEK.map((w, i) => (
              <View key={i} style={[fullS.wxRow, i < WEEK.length - 1 && fullS.wxRowBorder]}>
                <View style={{ width: 56 }}>
                  <Text style={fullS.wxDay}>{w.day}</Text>
                  {!!w.date && <Text style={fullS.wxDate}>{w.date}</Text>}
                </View>
                <Text style={fullS.wxIcon}>{w.icon}</Text>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={fullS.wxSky}>{w.sky}</Text>
                  <Text style={fullS.wxRain}>강수 {w.rain}%</Text>
                </View>
                <Text style={fullS.wxTemp}>{w.tmin}° / <Text style={{ color: C.charcoal }}>{w.tmax}°</Text></Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={fullS.linkBtn}
            onPress={() => Linking.openURL(`https://weather.naver.com/today/${encodeURIComponent(schedule.course)}`)}
            activeOpacity={0.7}>
            <Text style={fullS.linkBtnTxt}>네이버 날씨에서 더 자세히 보기</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── 교통 전체화면 ────────────────────────────────────
function TrafficFullModal({ visible, schedule, onClose }) {
  if (!schedule) return null;
  const origin = '서울 강남구';
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={fullS.container}>
        <View style={fullS.header}>
          <TouchableOpacity onPress={onClose} style={fullS.backBtn} activeOpacity={0.6}>
            <Text style={fullS.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={fullS.headerTitle} numberOfLines={1}>{schedule.course}</Text>
            <Text style={fullS.headerSub}>{schedule.date} {schedule.day} · 티오프 {schedule.time}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <Text style={fullS.sectionLabel}>추천 출발 시간</Text>
          <View style={[fullS.card, { padding: 18, marginBottom: 22 }]}>
            <Text style={fullS.bigTime}>06:07</Text>
            <Text style={fullS.bigSub}>티오프 {schedule.time} 기준 · 여유 30분 포함</Text>
          </View>

          <Text style={fullS.sectionLabel}>경로</Text>
          <View style={[fullS.card, { padding: 16, marginBottom: 14 }]}>
            <View style={{ marginBottom: 14 }}>
              <Text style={fullS.routeLabel}>출발지</Text>
              <Text style={fullS.routeValue}>{origin}</Text>
            </View>
            <View style={fullS.routeArrowRow}>
              <View style={fullS.routeLineV} />
              <Text style={fullS.routeArrow}>↓ 약 78.4km · 경부고속도로</Text>
            </View>
            <View style={{ marginTop: 14, marginBottom: 14 }}>
              <Text style={fullS.routeLabel}>도착지</Text>
              <Text style={fullS.routeValue}>{schedule.course}</Text>
            </View>
            <View style={fullS.durationBox}>
              <Text style={fullS.durationLabel}>예상 소요시간</Text>
              <Text style={fullS.durationValue}>{schedule.duration}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 22 }}>
            <TouchableOpacity style={fullS.routeBtn}
              onPress={() => Linking.openURL(`nmap://route/car?dlat=37.0&dlon=127.0&dname=${encodeURIComponent(schedule.course)}&appname=deargolf`)
                .catch(() => Linking.openURL('https://map.naver.com/v5/directions/-/-/-/car'))}
              activeOpacity={0.7}>
              <Text style={fullS.routeBtnTxt}>네이버 경로</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fullS.routeBtn}
              onPress={() => Linking.openURL(`tmap://route?goalname=${encodeURIComponent(schedule.course)}`)
                .catch(() => Linking.openURL('https://tmap.life'))}
              activeOpacity={0.7}>
              <Text style={fullS.routeBtnTxt}>티맵 경로</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
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
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showWeatherFull, setShowWeatherFull] = useState(false);
  const [showTrafficFull, setShowTrafficFull] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);

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
      setSchedules(prev => [...prev, newS]);
    } else if (type === 'schedule-edit') {
      setSchedules(prev => prev.map(s => s.id === data.id
        ? { ...s, course: data.course, date: data.date, day: data.day,
            time: data.time, members: data.members, dDay: data.dDay }
        : s));
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
                <Text style={homeS.cardTapHint}>☀️  🚗   탭하여 확인하기 →</Text>
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

          {memoEntry ? (
            <TouchableOpacity style={homeS.memoCard} onPress={handleMemoPress} activeOpacity={0.8}>
              <Text style={homeS.memoEye}>지난 방문 메모  →</Text>
              <Text style={homeS.memoTxt}>"{memoEntry.text}"</Text>
              <Text style={homeS.memoDate}>{memoEntry.date} · {next.course}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[homeS.memoCard, homeS.memoCardFirst]}>
              <Text style={[homeS.memoEye, { color: 'rgba(200,217,230,0.5)' }]}>첫 방문</Text>
              <Text style={[homeS.memoTxt, { color: 'rgba(200,217,230,0.85)', fontStyle: 'normal' }]}>
                처음 가는 코스예요.{'\n'}오늘 라운딩이 첫 기록이 될 거예요
              </Text>
            </View>
          )}
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

      {/* 날씨 전체화면 */}
      <WeatherFullModal
        visible={showWeatherFull}
        schedule={selectedSchedule || next}
        onClose={() => setShowWeatherFull(false)}
      />

      {/* 교통 전체화면 */}
      <TrafficFullModal
        visible={showTrafficFull}
        schedule={selectedSchedule || next}
        onClose={() => setShowTrafficFull(false)}
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
    if (!selectedCourse) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const dDay = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    const payload = {
      course: selectedCourse,
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
function DiaryAddModal({ visible, onClose, onSave }) {
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
  const [special, setSpecial] = useState(null);
  const [specialHole, setSpecialHole] = useState('');
  const [specialPar, setSpecialPar] = useState('3');
  const [specialDist, setSpecialDist] = useState('');
  const [specialBall, setSpecialBall] = useState('');
  const [specialMemo, setSpecialMemo] = useState('');
  const [addPhotos, setAddPhotos] = useState([]);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
  };

  const [saveError, setSaveError] = useState('');

  const handleSave = () => {
    const finalCourse = selectedCourse || courseSearch.trim();
    if (!finalCourse) {
      setSaveError('골프장을 입력해주세요');
      return;
    }
    setSaveError('');
    onSave('diary', {
      course: finalCourse, date: formatDate(date), day: formatDay(date),
      score: parseInt(score) || 0, weather, memo, birdieCount, privacy,
      special, specialHole: parseInt(specialHole),
      specialDist, specialBall, specialMemo,
      photos: addPhotos,
    });
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
              <Text style={mS.title}>라운딩 기록 추가</Text>
              <Text style={mS.label}>골프장</Text>
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
              <Text style={mS.label}>스코어</Text>
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
              <Text style={mS.label}>한줄 메모</Text>
              <TextInput style={mS.input} placeholder="오늘 라운딩은..." placeholderTextColor={C.warmGrayLight}
                value={memo} onChangeText={setMemo} />
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
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, textAlign: 'center', marginTop: 12 }}>{saveError}</Text>
              ) : null}
              <TouchableOpacity style={mS.saveBtn} onPress={handleSave}>
                <Text style={mS.saveBtnTxt}>저장하기</Text>
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
function DiaryCard({ item, onPress }) {
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const hasBest = item.badge === '베스트';
  const hasBirdie = item.badge === '버디';
  const hasPhoto = item.photos && item.photos.length > 0;
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';

  return (
    <TouchableOpacity
      style={[dS.card, hasBest && dS.cardBest, hasBirdie && dS.cardBirdie, isSpecial && dS.cardSpecial]}
      activeOpacity={0.88} onPress={() => onPress(item)}>
      {isSpecial && <View style={dS.cardSpecialLine} />}
      {hasPhoto && (
        <View style={dS.photoHero}>
          <Image source={{ uri: item.photos[0] }} style={dS.photoImg} resizeMode="cover" />
          <View style={dS.photoDim} />
          {item.badge && !isSpecial && (
            <View style={[dS.badge, hasBest ? dS.badgeBest : dS.badgeBirdie]}>
              <Text style={[dS.badgeTxt, hasBirdie && { color: C.charcoal }]}>{item.badge}</Text>
            </View>
          )}
          {isSpecial && (
            <View style={dS.specialBadge}>
              <Text style={dS.specialBadgeTxt}>{item.special}</Text>
            </View>
          )}
          <View style={dS.photoCount}>
            <Text style={dS.photoCountTxt}>{item.photos.length}장</Text>
          </View>
        </View>
      )}
      {!hasPhoto && isSpecial && (
        <View style={dS.specialNoPhoto}>
          <Text style={dS.specialNoPhotoTxt}>{item.special}</Text>
          {item.specialHole && <Text style={dS.specialNoPhotoSub}>{item.specialHole}번홀</Text>}
        </View>
      )}
      <View style={dS.cardBody}>
        <Text style={dS.cardDate}>{item.date} {item.day}</Text>
        <Text style={[dS.cardCourse, isSpecial && { color: '#8B6914' }]}>{item.course}</Text>
        <View style={dS.cardRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <View>
              <Text style={[dS.cardScore, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}타</Text>
              <Text style={dS.cardPar}>{diffLabel} · par {item.par}</Text>
            </View>
            {item.birdieCount > 0 && (
              <View style={dS.birdieBadge}>
                <Text style={dS.birdieBadgeTxt}>Birdie ×{item.birdieCount}</Text>
              </View>
            )}
          </View>
          <Text style={[dS.cardMemo, hasBest && dS.cardMemoBest, isSpecial && { borderLeftColor: '#C9A84C' }]}>"{item.memo}"</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── 다이어리 상세 ─────────────────────────────────────
function DiaryDetail({ item, onClose, onUpdate }) {
  const [photoViewer, setPhotoViewer] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [showGift, setShowGift] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editScore, setEditScore] = useState(String(item.score || ''));
  const [editMemo, setEditMemo] = useState(item.memo || '');
  const [editPhotos, setEditPhotos] = useState(item.photos || []);
  const hasBest = item.badge === '베스트';
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const me = item.companions?.find(c => c.isMe);

  const pickEditPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setEditPhotos(prev => [...prev, ...result.assets.map(a => a.uri)]);
    }
  };

  const handleEditSave = () => {
    const updated = {
      ...item,
      score: Number(editScore) || item.score,
      memo: editMemo,
      photos: editPhotos,
    };
    onUpdate && onUpdate(updated);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditScore(String(item.score || ''));
    setEditMemo(item.memo || '');
    setEditPhotos(item.photos || []);
    setIsEditing(false);
  };

  const photosToShow = isEditing ? editPhotos : item.photos;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isSpecial ? '#F5F0E4' : C.bgPrimary }}>
      <View style={[dS.detailHdr, isSpecial && { borderBottomColor: '#C9A84C44' }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={dS.backBtn}>← Diary</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {me && (
            <View style={[dS.detailHdrNickname, isSpecial && { backgroundColor: '#8B6914' }]}>
              <Text style={dS.detailHdrNicknameTxt}>{me.name}</Text>
            </View>
          )}
          {isEditing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={handleEditCancel} style={{ marginRight: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.warmGray }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleEditSave}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy, fontWeight: '600' }}>저장</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>수정</Text>
            </TouchableOpacity>
          )}
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
            <TouchableOpacity
              style={{ marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 }}
              onPress={() => setShowGift(true)}>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>동반자에게 선물하기</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={[dS.detailInfoArea, isSpecial && { borderBottomColor: '#C9A84C33' }]}>
          <View style={dS.detailScoreRow}>
            {isEditing ? (
              <>
                <TextInput
                  style={[dS.detailScore, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' },
                    { borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingVertical: 0, minWidth: 80 }]}
                  value={editScore}
                  onChangeText={setEditScore}
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={[dS.detailScoreUnit, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
                <Text style={dS.detailScoreSub}>par {item.par}</Text>
              </>
            ) : (
              <>
                <Text style={[dS.detailScore, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
                <Text style={[dS.detailScoreUnit, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
                <Text style={dS.detailScoreSub}>{diffLabel} · par {item.par}</Text>
              </>
            )}
          </View>
          <Text style={dS.detailCourseTxt}>{item.course} · {item.date} {item.day} · {item.weather}</Text>
          <View style={[dS.detailMemoBox, isSpecial && { borderLeftColor: '#C9A84C' }]}>
            {isEditing ? (
              <TextInput
                style={[dS.detailMemoTxt, { padding: 0 }]}
                value={editMemo}
                onChangeText={setEditMemo}
                multiline
                placeholder="메모 입력..."
                placeholderTextColor={C.warmGrayLight}
              />
            ) : (
              <Text style={dS.detailMemoTxt}>"{item.memo}"</Text>
            )}
          </View>
          <View style={dS.companionArea}>
            <Text style={dS.companionLabel}>동반자</Text>
            <View style={dS.companionBadges}>
              {item.companions && item.companions.map((c, i) => (
                <View key={i} style={[dS.companionBadge, c.isMe && dS.companionBadgeMe, c.isMe && isSpecial && { backgroundColor: '#8B6914' }]}>
                  <Text style={[dS.companionBadgeTxt, c.isMe && dS.companionBadgeTxtMe]}>{c.name}</Text>
                </View>
              ))}
              <TouchableOpacity style={dS.companionAdd}>
                <Text style={dS.companionAddTxt}>+ 추가</Text>
              </TouchableOpacity>
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
            {isEditing && (
              <TouchableOpacity style={[dS.photoGridAdd, { width: (SW - 38) / 2, height: (SW - 38) / 2 }]} onPress={pickEditPhoto}>
                <Text style={dS.photoGridAddIcon}>+</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 4 }}>
                  사진 추가 ({editPhotos.length}장)
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
      {photoViewer && <PhotoViewer photos={photosToShow} startIndex={viewerStart} onClose={() => setPhotoViewer(false)} />}
      <GiftModal visible={showGift} onClose={() => setShowGift(false)}
        occasion={isSpecial ? { type: item.special, course: item.course, date: item.date, memo: item.memo } : null}
        companions={item.companions} />
    </SafeAreaView>
  );
}

// ── Course Log 탭 ─────────────────────────────────────
function CourseLogTab() {
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
                  <Text style={dS.courseName}>{c.name}</Text>
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
                  <Text style={dS.courseName}>{c.name}</Text>
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
  const [showMyPage, setShowMyPage] = useState(false);
  const [hofExpanded, setHofExpanded] = useState(false);
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [hallOfFame, setHallOfFame] = useState(HALL_OF_FAME);

  // 통계박스: 처음엔 열려있다가 3초 후 자동 닫힘, 터치로 토글
  const [showStats, setShowStats] = useState(true);
  useEffect(() => {
    setShowStats(true);
    const timer = setTimeout(() => setShowStats(false), 3000);
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
    }
  };

  const avg = diaries.length > 0 ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length) : 0;
  const best = diaries.length > 0 ? Math.min(...diaries.map(d => d.score)) : 0;
  const tabIdx = TAB_DIARY.findIndex(([k]) => k === tab);

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
          <Text style={{ fontFamily: F.en, fontSize: 28, color: C.butter, fontStyle: 'italic', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>Diary</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => setShowMyPage(true)}
            style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#fff' }}>{userProfile.nickname} ▾</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowModal(true)}
            style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.en, fontSize: 18, color: '#fff', lineHeight: 22 }}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 통계박스 — 터치로 토글, 자동 숨김 */}
      <TouchableOpacity onPress={() => setShowStats(!showStats)} activeOpacity={0.9}>
        {showStats ? (
          <View style={dS.statsRow}>
            {[
              { label: '라운딩', value: diaries.length },
              { label: '평균타', value: avg, hi: true },
              { label: '베스트', value: best }
            ].map((st, i) => (
              <View key={i} style={[dS.statBox, st.hi && dS.statBoxHi]}>
                <Text style={[dS.statVal, st.hi && { color: C.burgundy }]}>{st.value}</Text>
                <Text style={dS.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ paddingVertical: 7, alignItems: 'center', backgroundColor: C.bgPrimary }}>
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1 }}>
              라운딩 {diaries.length} · 평균 {avg}타 · 베스트 {best}타  ∨
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

      {tab === 'round' && (
        <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
          {hallOfFame.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <TouchableOpacity style={dS.hofToggle} onPress={() => setHofExpanded(!hofExpanded)}>
                <Text style={dS.hofSectionLabel}>명예의 전당 · {hallOfFame.length}개</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C9A84C' }}>{hofExpanded ? '접기' : '펼치기'}</Text>
              </TouchableOpacity>
              {hofExpanded && hallOfFame.map(item => <HallOfFameCard key={item.id} item={item} />)}
              <View style={{ height: 8 }} />
            </View>
          )}
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            {diaries.map((item, idx) => (
              <View key={item.id} style={dS.tlNode}>
                {idx < diaries.length - 1 && <View style={dS.tlLine} />}
                <View style={[dS.tlDot, item.badge === '베스트' && dS.tlDotBest, item.badge === '버디' && dS.tlDotBirdie, item.special && dS.tlDotSpecial]} />
                <DiaryCard item={item} onPress={(it) => setSelected(it)} />
              </View>
            ))}
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
      {tab === 'log' && <CourseLogTab />}
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
  const [showAllRest, setShowAllRest] = useState(false);

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
  const [nickname, setNickname] = useState(USER_PROFILE.nickname);
  const [editingNick, setEditingNick] = useState(false);
  const [departure, setDeparture] = useState('서울 강남구');
  const [editingDep, setEditingDep] = useState(false);
  const [phone, setPhone] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
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
    if (_setUserProfile) _setUserProfile({ ...updated });
    setEditingStats(false);
  };

  useEffect(() => {
    if (visible) setNickname(USER_PROFILE.nickname);
  }, [visible]);

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
                <Text style={myS.sectionLabel}>내 정보</Text>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>자주 가는 출발지</Text>
                    {editingDep ? (
                      <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={departure} onChangeText={setDeparture} onBlur={() => setEditingDep(false)} autoFocus
                        placeholder="서울 강남구" placeholderTextColor={C.warmGrayLight} />
                    ) : (
                      <TouchableOpacity onPress={() => setEditingDep(true)}>
                        <Text style={{ fontFamily: F.sys, fontSize: 12, color: departure ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                          {departure || '입력하기 →'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📱</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>전화번호 (선택)</Text>
                    {editingPhone ? (
                      <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={phone} onChangeText={setPhone} onBlur={() => setEditingPhone(false)} autoFocus
                        placeholder="010-0000-0000" placeholderTextColor={C.warmGrayLight} keyboardType="phone-pad" />
                    ) : (
                      <TouchableOpacity onPress={() => setEditingPhone(true)}>
                        <Text style={{ fontFamily: F.sys, fontSize: 12, color: phone ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                          {phone || '입력하기 →'}
                        </Text>
                      </TouchableOpacity>
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
const homeS = StyleSheet.create({
  hdr:             { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 10 },
  hdrSub:          { fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 4 },
  hdrTitle:        { fontFamily: F.en, fontSize: 40, color: '#fff', fontStyle: 'italic', marginBottom: 6, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  hdrGreeting:     { fontFamily: F.sys, fontSize: 14, color: 'rgba(255,255,255,0.75)' },
  hdrGreetingName: { color: C.butter, fontWeight: '600' },
  bottomArea:      { paddingBottom: 4 },
  secLabel:        { fontFamily: F.sys, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, paddingHorizontal: 22, marginBottom: 8 },
  mainCard:        { width: 232, height: 220, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 16 },
  cardCourse:      { fontFamily: F.sys, fontSize: 15, color: '#fff', marginBottom: 6, lineHeight: 20 },
  cardDate:        { fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  cardDDay:        { fontFamily: F.en, fontSize: 58, color: C.butter, lineHeight: 62, letterSpacing: -1 },
  cardDDayLabel:   { fontFamily: F.sys, fontSize: 8, color: 'rgba(245,230,168,0.45)', letterSpacing: 1.5, marginBottom: 4 },
  cardTapHint:     { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  pill:            { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 22, paddingHorizontal: 12, paddingVertical: 6 },
  pillTap:         { borderColor: 'rgba(200,217,230,0.5)' },
  pillTxt:         { fontFamily: F.sys, fontSize: 16, color: 'rgba(200,217,230,0.95)' },
  subCard:         { width: 114, height: 220, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12 },
  subCourse:       { fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 14, marginBottom: 4 },
  subDate:         { fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.32)' },
  subDDay:         { fontFamily: F.en, fontSize: 24, color: 'rgba(245,230,168,0.7)', lineHeight: 26 },
  subDDayLabel:    { fontFamily: F.sys, fontSize: 7, color: 'rgba(245,230,168,0.32)', letterSpacing: 1 },
  memoCard:        { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8 },
  memoCardFirst:   { borderColor: 'rgba(200,217,230,0.2)', backgroundColor: 'rgba(200,217,230,0.06)' },
  memoEye:         { fontFamily: F.sys, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5, marginBottom: 6 },
  memoTxt:         { fontFamily: F.sys, fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.95)', lineHeight: 21 },
  memoDate:        { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 },
  emptyAddBtn:     { marginTop: 20, borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.4)', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  emptyAddTxt:     { fontFamily: F.sys, fontSize: 13, color: 'rgba(245,230,168,0.7)' },
  // 팝업
  mask:            { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#0e1f16', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.12)', paddingBottom: 20, maxHeight: '95%', flex: 1 },
  handle:          { width: 32, height: 3, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', margin: 12 },
  popTabs:         { flexDirection: 'row', marginHorizontal: 18, marginBottom: 10, gap: 8 },
  popTab:          { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.06)' },
  popTabOn:        { backgroundColor: 'rgba(245,230,168,0.18)', borderColor: 'rgba(245,230,168,0.5)' },
  popTabTxt:       { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  popTabTxtOn:     { color: C.butter, fontWeight: '600' },
  popBody:         { paddingHorizontal: 18, flex: 1 },
  popCourse:       { fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10, letterSpacing: 0.5 },
  wxCell:          { width: '47%', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 10, padding: 10 },
  wxLbl:           { fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: 1 },
  wxVal:           { fontFamily: F.en, fontSize: 16, color: 'rgba(255,255,255,0.88)', lineHeight: 20 },
  wxSub:           { fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  trBox:           { backgroundColor: 'rgba(245,230,168,0.08)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.25)', borderRadius: 14, padding: 14, marginBottom: 14 },
  trBoxLabel:      { fontFamily: F.sys, fontSize: 9, color: 'rgba(245,230,168,0.5)', letterSpacing: 2, marginBottom: 6 },
  trBoxTime:       { fontFamily: F.en, fontSize: 44, color: C.butter, lineHeight: 48, letterSpacing: -0.5 },
  trBoxSub:        { fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  trRow:           { paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.07)', marginBottom: 8 },
  trMain:          { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.82)', marginBottom: 2 },
  trSub:           { fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.35)' },
  routeBtn:        { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  routeBtnTxt:     { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  naverBtn:        { alignItems: 'center', marginBottom: 8, backgroundColor: '#03C75A22', borderRadius: 10, paddingVertical: 13, borderWidth: 1, borderColor: '#03C75A66' },
  naverBtnTxt:     { fontFamily: F.sys, fontSize: 12, color: '#03C75A', letterSpacing: 0.5 },
  driverBtn:       { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  driverBtnTxt:    { fontFamily: F.sys, fontSize: 12 },
  closeBtn:        { alignItems: 'center', paddingVertical: 10 },
  closeTxt:        { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 },
});

// D-Day 바텀시트 메뉴 스타일
const sheetS = StyleSheet.create({
  mask:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 20 },
  handle:      { width: 36, height: 4, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  course:      { fontFamily: F.sys, fontSize: 17, color: C.charcoal, fontWeight: '600' },
  courseArrow: { fontSize: 14, color: C.warmGrayLight, fontWeight: '400' },
  meta:        { fontFamily: F.sys, fontSize: 12, color: C.textSecondary, marginTop: 6 },
  dday:        { fontFamily: F.en, fontSize: 32, color: C.burgundy, letterSpacing: -0.5, lineHeight: 34 },
  ddayLabel:   { fontFamily: F.sys, fontSize: 13, color: C.charcoal },
  divider:     { height: 6, backgroundColor: 'rgba(0,0,0,0.03)' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 22, gap: 14 },
  rowBorder:   { borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  rowEmoji:    { fontSize: 18, width: 22, textAlign: 'center' },
  rowText:     { fontFamily: F.sys, fontSize: 15, color: C.charcoal },
  rowDanger:   { color: '#D32F2F' },
});

// 날씨/교통 전체화면 모달 스타일
const fullS = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bgPrimary },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline, backgroundColor: C.bgPrimary },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow:    { fontSize: 22, color: C.charcoal, lineHeight: 24 },
  headerTitle:  { fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '600' },
  headerSub:    { fontFamily: F.sys, fontSize: 11, color: C.textSecondary, marginTop: 2 },
  sectionLabel: { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 2, marginBottom: 8 },
  card:         { backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline, overflow: 'hidden', marginBottom: 22 },
  wxRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  wxRowBorder:  { borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  wxDay:        { fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '500' },
  wxDate:       { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 1 },
  wxIcon:       { fontSize: 22, width: 32, textAlign: 'center' },
  wxSky:        { fontFamily: F.sys, fontSize: 13, color: C.charcoal },
  wxRain:       { fontFamily: F.sys, fontSize: 10, color: C.paleSky, marginTop: 2 },
  wxTemp:       { fontFamily: F.en, fontSize: 14, color: C.warmGrayLight },
  linkBtn:      { backgroundColor: '#03C75A11', borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#03C75A55' },
  linkBtnTxt:   { fontFamily: F.sys, fontSize: 13, color: '#03A452', letterSpacing: 0.3 },
  bigTime:      { fontFamily: F.en, fontSize: 42, color: C.burgundy, lineHeight: 46, letterSpacing: -0.5 },
  bigSub:       { fontFamily: F.sys, fontSize: 11, color: C.textSecondary, marginTop: 4 },
  routeLabel:   { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 4 },
  routeValue:   { fontFamily: F.sys, fontSize: 14, color: C.charcoal },
  routeArrowRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeLineV:   { width: 1, height: 16, backgroundColor: C.hairline, marginLeft: 6 },
  routeArrow:   { fontFamily: F.sys, fontSize: 11, color: C.textSecondary },
  durationBox:  { backgroundColor: '#F5E6A833', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  durationLabel:{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary },
  durationValue:{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '600' },
  routeBtn:     { flex: 1, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  routeBtnTxt:  { fontFamily: F.sys, fontSize: 13, color: C.charcoal },
});

const dS = StyleSheet.create({
  statsRow:    { flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, gap: 8 },
  statBox:     { flex: 1, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: C.hairline },
  statBoxHi:   { borderColor: C.burgundy },
  statVal:     { fontFamily: F.en, fontSize: 22, color: C.charcoal, lineHeight: 26 },
  statLabel:   { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 },
  tabStripeRow:       { flexDirection: 'row', height: 3, marginHorizontal: 16 },
  tabStripeSegment:   { flex: 1, opacity: 0.3, borderRadius: 2 },
  tabStripeSegmentOn: { opacity: 1, height: 5, marginTop: -1 },
  tabRow:      { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, marginTop: 2 },
  tabBtn:      { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabTxt:      { fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight },
  tabTxtOn:    { color: C.charcoal, fontWeight: '600' },
  tlNode:      { paddingLeft: 24, position: 'relative', marginBottom: 10 },
  tlLine:      { position: 'absolute', left: 7, top: 14, bottom: -10, width: 1, backgroundColor: C.hairline },
  tlDot:       { position: 'absolute', left: 2, top: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: C.bgPrimary, borderWidth: 1.5, borderColor: C.hairline },
  tlDotBest:   { backgroundColor: C.burgundy, borderColor: C.burgundy },
  tlDotBirdie: { backgroundColor: C.butter, borderColor: C.charcoal },
  tlDotSpecial:{ backgroundColor: '#C9A84C', borderColor: '#C9A84C', width: 12, height: 12, left: 1 },
  card:        { backgroundColor: C.bgSecondary, borderRadius: 12, overflow: 'hidden', borderWidth: 0.5, borderColor: C.hairline },
  cardBest:    { borderColor: C.burgundy, borderWidth: 1 },
  cardBirdie:  { borderColor: C.butter, borderWidth: 1 },
  cardSpecial:     { backgroundColor: '#F5F0E4', borderColor: '#C9A84C', borderWidth: 1 },
  cardSpecialLine: { height: 2, backgroundColor: '#C9A84C' },
  specialBadge:    { position: 'absolute', top: 9, left: 10, backgroundColor: 'rgba(201,168,76,0.9)', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  specialBadgeTxt: { fontFamily: F.sys, fontSize: 9, color: '#2A2622', letterSpacing: 0.5 },
  specialNoPhoto:  { backgroundColor: '#EDE8DC', padding: 16, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: '#C9A84C33' },
  specialNoPhotoTxt: { fontFamily: F.en, fontSize: 16, color: '#8B6914', fontStyle: 'italic', letterSpacing: 2 },
  specialNoPhotoSub: { fontFamily: F.sys, fontSize: 11, color: '#B8A878', marginTop: 4 },
  hofSectionLabel: { fontFamily: F.sys, fontSize: 10, color: '#C9A84C', letterSpacing: 3 },
  hofToggle:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingVertical: 4 },
  hofCard:     { backgroundColor: '#F5F0E4', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C', overflow: 'hidden', marginBottom: 12 },
  hofHeader:   { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#C9A84C33' },
  hofType:     { fontFamily: F.en, fontSize: 15, color: '#8B6914', fontStyle: 'italic', letterSpacing: 2 },
  hofDate:     { fontFamily: F.sys, fontSize: 10, color: '#B8A878', marginTop: 2 },
  hofGoldDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9A84C' },
  hofGrid:     { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 6 },
  hofCell:     { width: '47%', backgroundColor: '#EDE8DC', borderRadius: 8, padding: 10, borderWidth: 0.5, borderColor: '#C9A84C33' },
  hofCellLabel:{ fontFamily: F.sys, fontSize: 7, color: '#B8A878', letterSpacing: 2, marginBottom: 4 },
  hofCellVal:  { fontFamily: F.sys, fontSize: 10, color: '#3D3935', lineHeight: 15 },
  hofCellBig:  { fontFamily: F.en, fontSize: 24, color: '#C9A84C', lineHeight: 28 },
  hofDivider:  { height: 0.5, backgroundColor: '#C9A84C33', marginHorizontal: 14 },
  hofMemo:     { fontFamily: F.en, fontSize: 11, color: '#6B6660', fontStyle: 'italic', padding: 14, lineHeight: 18 },
  specialBanner:    { padding: 24, alignItems: 'center' },
  specialBannerTitle: { fontFamily: F.en, fontSize: 34, color: '#C9A84C', fontStyle: 'italic', letterSpacing: 5, marginVertical: 6 },
  specialBannerSub:   { fontFamily: F.sys, fontSize: 9, color: 'rgba(201,168,76,0.6)', letterSpacing: 4 },
  photoHero:   { width: '100%', height: 130, position: 'relative' },
  photoImg:    { width: '100%', height: '100%' },
  photoDim:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  badge:       { position: 'absolute', top: 9, left: 10, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  badgeBest:   { backgroundColor: C.burgundy },
  badgeBirdie: { backgroundColor: 'rgba(245,230,168,0.92)' },
  badgeTxt:    { fontFamily: F.sys, fontSize: 9, color: '#fff', letterSpacing: 0.5 },
  photoCount:  { position: 'absolute', bottom: 8, right: 10, backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  photoCountTxt: { fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.88)' },
  cardBody:    { padding: 12 },
  cardDate:    { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginBottom: 4 },
  cardCourse:  { fontFamily: F.sys, fontSize: 13, color: C.textPrimary, marginBottom: 8 },
  cardRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardScore:   { fontFamily: F.en, fontSize: 24, color: C.charcoal, lineHeight: 28 },
  cardPar:     { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 },
  cardMemo:    { fontFamily: F.en, fontSize: 11, color: C.textSecondary, fontStyle: 'italic', flex: 1, marginLeft: 10, lineHeight: 16, borderLeftWidth: 1.5, borderLeftColor: C.hairline, paddingLeft: 8 },
  cardMemoBest:{ borderLeftColor: C.burgundy },
  birdieBadge:    { borderWidth: 1, borderColor: C.burgundy, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  birdieBadgeTxt: { fontFamily: F.sys, fontSize: 9, color: C.burgundy, letterSpacing: 0.3 },
  detailHdr:      { backgroundColor: C.bgPrimary, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: C.hairline, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn:        { fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight },
  detailHdrNickname:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.charcoal, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  detailHdrNicknameTxt: { fontFamily: F.sys, fontSize: 11, color: C.butter },
  detailInfoArea:  { padding: 16, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  detailScoreRow:  { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  detailScore:     { fontFamily: F.en, fontSize: 48, color: C.charcoal, lineHeight: 54 },
  detailScoreUnit: { fontFamily: F.en, fontSize: 20, color: C.charcoal },
  detailScoreSub:  { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight },
  detailCourseTxt: { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, marginBottom: 12 },
  detailMemoBox:   { borderLeftWidth: 2, borderLeftColor: C.burgundy, paddingLeft: 10, marginBottom: 14 },
  detailMemoTxt:   { fontFamily: F.en, fontSize: 14, color: C.textPrimary, fontStyle: 'italic', lineHeight: 22 },
  companionArea:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  companionLabel:      { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1, marginTop: 5 },
  companionBadges:     { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  companionBadge:      { backgroundColor: C.charcoal, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  companionBadgeMe:    { backgroundColor: C.burgundy },
  companionBadgeTxt:   { fontFamily: F.sys, fontSize: 11, color: C.butter },
  companionBadgeTxtMe: { color: '#fff' },
  companionAdd:        { borderWidth: 0.5, borderColor: C.hairline, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.bgSecondary },
  companionAddTxt:     { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight },
  photosArea:      { padding: 16 },
  photosLabel:     { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5 },
  photosGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoGridItem:   { width: (SW - 38) / 2, height: (SW - 38) / 2, borderRadius: 10, overflow: 'hidden' },
  photoGridImg:    { width: '100%', height: '100%' },
  photoGridAdd:    { borderRadius: 10, backgroundColor: '#F0EDE6', borderWidth: 1, borderColor: C.hairline, alignItems: 'center', justifyContent: 'center' },
  photoGridAddIcon: { fontSize: 28, color: C.warmGrayLight },
  banner:      { marginHorizontal: 16, marginVertical: 10, backgroundColor: C.butter + '22', borderWidth: 0.5, borderColor: C.butter, borderRadius: 10, padding: 12 },
  bannerTitle: { fontFamily: F.sys, fontSize: 13, color: C.textPrimary, marginBottom: 2 },
  bannerSub:   { fontFamily: F.sys, fontSize: 11, color: C.burgundy },
  courseCard:  { marginHorizontal: 16, marginBottom: 10, backgroundColor: C.bgSecondary, borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: C.hairline },
  courseName:  { fontFamily: F.sys, fontSize: 13, color: C.textPrimary, flex: 1 },
  courseLoc:   { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 8 },
  tag:         { backgroundColor: C.butter + '44', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  tagTxt:      { fontFamily: F.sys, fontSize: 10, color: C.charcoal },
  recordRow:   { flexDirection: 'row', gap: 6, marginBottom: 10 },
  recVisit:    { flex: 1, backgroundColor: C.bgSecondary, borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 0.5, borderColor: C.hairline },
  recBest:     { flex: 1, backgroundColor: C.burgundy, borderRadius: 8, padding: 8, alignItems: 'center' },
  recAvg:      { flex: 1, backgroundColor: C.butter + '30', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 0.5, borderColor: C.butter },
  recValDark:  { fontFamily: F.en, fontSize: 20, color: C.charcoal, lineHeight: 24 },
  recValWhite: { fontFamily: F.en, fontSize: 20, color: '#fff', lineHeight: 24 },
  recValButter:{ fontFamily: F.en, fontSize: 20, color: '#6B5500', lineHeight: 24 },
  recLblDark:  { fontFamily: F.sys, fontSize: 9, color: C.warmGrayLight, marginTop: 2 },
  recLblWhite: { fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  recLblButter:{ fontFamily: F.sys, fontSize: 9, color: '#8B7000', marginTop: 2 },
  courseMemo:  { fontFamily: F.en, fontSize: 11, color: C.textSecondary, fontStyle: 'italic', borderLeftWidth: 1.5, borderLeftColor: C.burgundy, paddingLeft: 8 },
});

const gS = StyleSheet.create({
  searchTxt:       { fontFamily: F.en, fontSize: 15, color: C.charcoal, fontStyle: 'italic', borderBottomWidth: 0.5, borderBottomColor: C.charcoal, paddingBottom: 1 },
  chip:            { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, height: 32, justifyContent: 'center' },
  chipOn:          { backgroundColor: C.charcoal },
  chipTxt:         { fontFamily: F.sys, fontSize: 12, color: C.warmGray },
  chipTxtOn:       { color: C.butter },
  courseCard:      { backgroundColor: C.bgSecondary, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: C.hairline },
  courseCardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  courseCardName:  { fontFamily: F.sys, fontSize: 13, color: C.textPrimary, flex: 1 },
  courseCardLoc:   { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 8 },
  courseCardScore: { fontFamily: F.sys, fontSize: 11, color: C.burgundy },
  courseCardArrow: { fontFamily: F.en, fontSize: 18, color: C.warmGrayLight },
  detailHdr:       { backgroundColor: C.bgPrimary, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0 },
  backBtn:         { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 6 },
  detailName:      { fontFamily: F.en, fontSize: 18, color: C.charcoal, fontStyle: 'italic', marginBottom: 2 },
  detailLoc:       { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 10 },
  favBtn:          { borderWidth: 1, borderColor: C.burgundy, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, marginTop: 2, backgroundColor: C.burgundy },
  favBtnOn:        { backgroundColor: 'transparent', borderColor: C.warmGrayLight },
  favBtnTxt:       { fontFamily: F.sys, fontSize: 11, color: '#fff' },
  favBtnTxtOn:     { color: C.warmGrayLight },
  innerTab:        { flex: 1, alignItems: 'center', paddingBottom: 8 },
  innerTabTxt:     { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight },
  innerTabTxtOn:   { color: C.charcoal },
  secLabel:        { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 },
  infoCard:        { backgroundColor: C.bgSecondary, borderRadius: 10, padding: 14, borderWidth: 0.5, borderColor: C.hairline, marginBottom: 8 },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  infoKey:         { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight },
  infoVal:         { fontFamily: F.sys, fontSize: 12, color: C.textPrimary },
  pill:            { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt:         { fontFamily: F.sys, fontSize: 10, color: C.charcoal },
  naverPlaceBtn:   { marginTop: 14, backgroundColor: '#03C75A' + '15', borderWidth: 1, borderColor: '#03C75A' + '40', borderRadius: 10, padding: 12, alignItems: 'center' },
  naverPlaceBtnTxt:{ fontFamily: F.sys, fontSize: 12, color: '#03C75A' },
  memoBox:         { marginTop: 14, borderLeftWidth: 1.5, borderLeftColor: C.burgundy, paddingLeft: 10 },
  memoTxt:         { fontFamily: F.en, fontSize: 12, color: C.textSecondary, fontStyle: 'italic', lineHeight: 18 },
  restItem:        { backgroundColor: C.bgSecondary, borderRadius: 10, padding: 10, flexDirection: 'row', gap: 10, marginBottom: 8, borderWidth: 0.5, borderColor: C.hairline },
  restIcon:        { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mineBadge:       { backgroundColor: C.charcoal, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start', marginBottom: 3 },
  mineBadgeTxt:    { fontFamily: F.sys, fontSize: 8, color: C.butter },
  restName:        { fontFamily: F.sys, fontSize: 12, color: C.textPrimary, marginBottom: 1 },
  restType:        { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight },
  restMemo:        { fontFamily: F.en, fontSize: 10, color: C.textSecondary, fontStyle: 'italic', marginTop: 3 },
  ratingBox:       { backgroundColor: C.butter, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'center' },
  ratingTxt:       { fontFamily: F.sys, fontSize: 11, color: C.charcoal },
  commentCard:     { backgroundColor: C.bgSecondary, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 0.5, borderColor: C.hairline },
  commentTxt:      { fontFamily: F.en, fontSize: 12, color: C.textPrimary, fontStyle: 'italic', lineHeight: 18 },
  commentWho:      { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight },
  commentDate:     { fontFamily: F.sys, fontSize: 10, color: C.hairline },
  commentAddBtn:   { borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  commentAddTxt:   { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight },
  nearbyCard:      { backgroundColor: C.bgSecondary, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, borderWidth: 0.5, borderColor: C.hairline },
  nearbyIconWrap:  { width: 36, height: 36, borderRadius: 8, backgroundColor: C.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  nearbyName:      { fontFamily: F.sys, fontSize: 12, color: C.textPrimary },
  nearbyLoc:       { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 },
  nearbyDist:      { fontFamily: F.sys, fontSize: 11, color: C.burgundy },
  visitedBadge:    { backgroundColor: C.butter + '66', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  visitedBadgeTxt: { fontFamily: F.sys, fontSize: 8, color: C.charcoal },
  emptyBanner:     { margin: 16, backgroundColor: C.paleSky + '30', borderWidth: 0.5, borderColor: C.paleSky, borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyTitle:      { fontFamily: F.en, fontSize: 16, color: C.charcoal, fontStyle: 'italic', marginBottom: 8 },
  emptySub:        { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, textAlign: 'center', lineHeight: 18 },
});

const tabS = StyleSheet.create({
  bar:              { backgroundColor: C.bgPrimary, borderTopWidth: 0.5, borderTopColor: C.hairline, paddingBottom: 28 },
  stripeRow:        { flexDirection: 'row', height: 8, alignItems: 'flex-start' },
  stripeSegment:    { flex: 1, height: 2, opacity: 0.35 },
  stripeSegmentOn:  { opacity: 1, height: 8 },
  tabRow:           { flexDirection: 'row', paddingTop: 12, paddingBottom: 4 },
  tab:              { flex: 1, alignItems: 'center', paddingVertical: 6 },
  label:            { fontFamily: F.sys, fontSize: 15, marginTop: 2 },
  labelOn:          { color: C.charcoal, fontWeight: '700' },
  labelOff:         { color: C.warmGrayLight, fontWeight: '400' },
});

const mS = StyleSheet.create({
  mask:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: 20 },
  handle:      { width: 32, height: 3, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', margin: 12 },
  title:       { fontFamily: F.en, fontSize: 20, color: C.charcoal, fontStyle: 'italic', marginBottom: 4 },
  label:       { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginTop: 14, marginBottom: 6 },
  input:       { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.sys, fontSize: 14, color: C.textPrimary },
  searchDrop:  { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  searchItem:  { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  searchName:  { fontFamily: F.sys, fontSize: 13, color: C.textPrimary },
  searchLoc:   { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 },
  chip:        { borderWidth: 0.5, borderColor: C.hairline, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.bgSecondary },
  chipOn:      { backgroundColor: C.charcoal, borderColor: C.charcoal },
  chipTxt:     { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight },
  chipTxtOn:   { color: C.butter },
  specialBox:  { backgroundColor: '#F5F0E4', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#C9A84C44' },
  specialBoxTitle: { fontFamily: F.en, fontSize: 14, color: '#8B6914', fontStyle: 'italic', letterSpacing: 2, marginBottom: 4 },
  saveBtn:     { backgroundColor: C.charcoal, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  saveBtnTxt:  { fontFamily: F.sys, fontSize: 15, color: C.butter, letterSpacing: 1 },
  countBtn:    { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.hairline, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgSecondary },
  countBtnTxt: { fontFamily: F.sys, fontSize: 20, color: C.charcoal, lineHeight: 24 },
  countVal:    { fontFamily: F.en, fontSize: 20, color: C.charcoal, minWidth: 36, textAlign: 'center' },
});

const myS = StyleSheet.create({
  mask:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
  handle:       { width: 32, height: 3, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', margin: 12 },
  profileArea:  { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 16 },
  avatar:       { width: 56, height: 56, borderRadius: 28, backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.butter },
  avatarTxt:    { fontFamily: F.en, fontSize: 24, color: '#fff', fontStyle: 'italic' },
  nickname:     { fontFamily: F.en, fontSize: 20, color: C.charcoal, fontStyle: 'italic' },
  nicknameSub:  { fontFamily: F.sys, fontSize: 11, color: C.burgundy, marginTop: 2 },
  realName:     { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 },
  nickInput:    { fontFamily: F.en, fontSize: 20, color: C.charcoal, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2 },
  section:      { paddingHorizontal: 20, paddingVertical: 14 },
  sectionLabel: { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 2, marginBottom: 12 },
  statsRow:     { flexDirection: 'row', gap: 8 },
  statBox:      { flex: 1, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: C.hairline },
  statVal:      { fontFamily: F.en, fontSize: 22, color: C.charcoal, lineHeight: 26 },
  statLabel:    { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 },
  divider:      { height: 0.5, backgroundColor: C.hairline, marginHorizontal: 20 },
  menuRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  menuIcon:     { fontSize: 18, width: 32 },
  menuLabel:    { fontFamily: F.sys, fontSize: 13, color: C.textPrimary, flex: 1 },
  menuValue:    { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight },
});

const obS = StyleSheet.create({
  stepLabel:  { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 2, marginBottom: 20 },
  label:      { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginTop: 16, marginBottom: 6 },
  input:      { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: F.sys, fontSize: 16, color: C.textPrimary },
  nextBtn:    { flex: 1, backgroundColor: C.charcoal, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  nextBtnTxt: { fontFamily: F.sys, fontSize: 15, color: C.butter, letterSpacing: 1 },
});

// ── 앱 루트 ───────────────────────────────────────────
export default function App() {
  const [userProfile, setUserProfile] = useState(USER_PROFILE_INIT);
  const [showOnboarding, setShowOnboarding] = useState(!USER_PROFILE_INIT.onboardingDone);
  const [firstSingleAlert, setFirstSingleAlert] = useState(false);
  const [bestAlert, setBestAlert] = useState(false);

  _setUserProfile = setUserProfile;

  const handleOnboardingComplete = (data) => {
    USER_PROFILE = { ...data };
    setUserProfile({ ...data });
    setShowOnboarding(false);
  };

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