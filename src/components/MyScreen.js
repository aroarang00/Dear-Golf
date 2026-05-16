import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Alert, DevSettings } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { DIARY_DATA, USER_PROFILE_INIT } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { dS } from '../styles/dS';
import { UserContext } from '../contexts/UserContext';
import { CourseLogTab } from './CourseLogTab';
import { FriendsTab } from './FriendsTab';
import { MyPageModal } from './MyPageModal';
import { GolfLedgerModal } from './GolfLedgerModal';

const SUB_TABS = [
  ['course', '내 코스기록', C.butter],
  ['friends', '친구', C.burgundy],
];

const STATS_HEIGHT = 80;

export function MyScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [tab, setTab] = useState('course');
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [showMyPage, setShowMyPage] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  // 라운딩 기록 로드 — 통계 박스용. 탭 진입 시마다 최신값 반영
  useEffect(() => {
    const load = async () => {
      const d = await storage.load(STORAGE_KEYS.diaries, DIARY_DATA);
      setDiaries(d || DIARY_DATA);
    };
    load();
    if (!navigation) return;
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation]);

  // 하단 MY 탭 재탭 시 — 처음 화면(내 코스기록 · 모달 닫힘)으로 복귀
  useEffect(() => {
    if (!navigation) return;
    const unsub = navigation.addListener('tabPress', () => {
      setTab('course');
      setShowMyPage(false);
      setShowLedger(false);
    });
    return unsub;
  }, [navigation]);

  const avg = userProfile.avgScore || (diaries.length > 0 ? Math.round(diaries.reduce((s, d) => s + d.score, 0) / diaries.length) : 0);
  const best = userProfile.lifeBest || (diaries.length > 0 ? Math.min(...diaries.map(d => d.score)) : 0);
  const totalRounds = userProfile.totalRounds || diaries.length;

  // 토글 통계 박스 — 진입 시 잠깐 보였다 접힘, 요약 줄을 탭하면 다시 펼침
  const statsAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  const showStatsTemporary = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.timing(statsAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    timerRef.current = setTimeout(() => {
      Animated.timing(statsAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    }, 1500);
  };

  useEffect(() => {
    showStatsTemporary();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // [DEV] 개발자용 초기화 — 'demo'(더미 데이터) / 'fresh'(신규 가입 유저) 상태로 전환 후 앱 재시작
  const applyDevReset = async (mode) => {
    await storage.clear();
    if (mode === 'fresh') {
      // 신규 유저 — 더미 폴백 차단(빈 배열 명시) + 온보딩 재노출
      await storage.save(STORAGE_KEYS.diaries, []);
      await storage.save(STORAGE_KEYS.schedules, []);
      await storage.save(STORAGE_KEYS.hof, []);
      await storage.save(STORAGE_KEYS.profile, { ...USER_PROFILE_INIT, onboardingDone: false });
    }
    // 'demo' — 스토리지를 비우기만 하면 각 로더가 더미 데이터로 자동 폴백됨
    DevSettings.reload();
  };

  const handleDevReset = () => {
    Alert.alert(
      '개발자용 초기화',
      '앱 상태를 초기화합니다. 현재 입력한 데이터는 모두 삭제됩니다.\n\n· 데모 데이터 — 기본 더미 데이터 상태\n· 신규 유저 — 온보딩부터 시작, 빈 상태',
      [
        { text: '취소', style: 'cancel' },
        { text: '데모 데이터로', onPress: () => applyDevReset('demo') },
        { text: '신규 유저로', style: 'destructive', onPress: () => applyDevReset('fresh') },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(250,246,236,0.6)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 라이프</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{
              fontFamily: 'Georgia',
              fontStyle: 'italic',
              fontSize: 28,
              color: C.bgPrimary,
            }}>My</Text>
            <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
              style={{
                width: 30, height: 30, borderRadius: 15,
                backgroundColor: '#6B1E2A',
                borderWidth: 1.5, borderColor: '#F5E6A8',
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Text style={{ fontFamily: F.en, fontSize: 14, color: '#F5E6A8', lineHeight: 18 }}>
                {userProfile.nickname?.charAt(0).toUpperCase() || 'G'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowLedger(true)} activeOpacity={0.7}
          style={{
            borderWidth: 1, borderColor: 'rgba(200,217,230,0.45)',
            borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
          }}>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#C8D9E6', fontWeight: '600' }}>📒 골프 가계부</Text>
        </TouchableOpacity>
      </View>

      {/* 토글 통계 박스 — 다이어리에서 이동 */}
      <TouchableOpacity onPress={showStatsTemporary} activeOpacity={1}>
        <Animated.View style={{
          height: statsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, STATS_HEIGHT] }),
          opacity: statsAnim,
          overflow: 'hidden',
        }}>
          <View style={dS.statsRow}>
            {[
              { label: '라운딩', value: totalRounds },
              { label: '평균타', value: avg, hi: true },
              { label: '베스트', value: best },
            ].map((st, i) => (
              <View key={i} style={[dS.statBox, st.hi && dS.statBoxHi]}>
                <Text style={[dS.statVal, st.hi && { color: C.burgundy }]}>{st.value}</Text>
                <Text style={dS.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
        <View style={{ paddingVertical: 7, alignItems: 'center', backgroundColor: C.bgPrimary }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1 }}>
            라운딩 {totalRounds} · 평균 {avg}타 · 베스트 {best}타  ∨
          </Text>
        </View>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        {SUB_TABS.map(([k, l, color]) => {
          const on = tab === k;
          return (
            <TouchableOpacity key={k}
              onPress={() => setTab(k)}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: on ? 3 : 0, borderBottomColor: color }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: on ? C.charcoal : C.warmGrayLight, fontWeight: on ? '600' : '400' }}>{l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'course' ? (
        <CourseLogTab navigation={navigation} />
      ) : (
        <FriendsTab />
      )}

      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
      <GolfLedgerModal visible={showLedger} onClose={() => setShowLedger(false)} diaries={diaries} />

      {/* DEV ONLY — 신규 유저 테스트용 초기화 버튼. __DEV__ 라서 출시 빌드에선 자동 숨김 */}
      {__DEV__ && (
        <TouchableOpacity
          onPress={handleDevReset}
          activeOpacity={0.8}
          style={{
            position: 'absolute', bottom: 16, right: 14,
            backgroundColor: 'rgba(61,57,53,0.88)',
            borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8,
            borderWidth: 1, borderColor: 'rgba(245,230,168,0.4)',
          }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.butter, fontWeight: '600' }}>🔧 개발자 초기화</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}
