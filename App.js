import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Image } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useFonts, Lora_500Medium_Italic } from '@expo-google-fonts/lora';
import { C, F, fs } from './src/constants/colors';
import { USER_PROFILE_INIT } from './src/constants/data';
import { STORAGE_KEYS, storage } from './src/utils/storage';
import './src/utils/firebase'; // 앱 시작 시 Firebase 초기화 + 익명 로그인
import { UserContext } from './src/contexts/UserContext';
import { SchedulesProvider } from './src/contexts/SchedulesContext';
import { DiariesProvider } from './src/contexts/DiariesContext';
import { OnboardingScreen } from './src/components/OnboardingScreen';
import { OnboardingIntro } from './src/components/OnboardingIntro';
import { OnboardingKakao } from './src/components/OnboardingKakao';
import { HomeScreen } from './src/components/HomeScreen';
import { ScheduleScreen } from './src/components/ScheduleScreen';
import { LoungeScreen } from './src/components/LoungeScreen';
import { DiaryScreen } from './src/components/DiaryScreen';
import { GuideScreen } from './src/components/GuideScreen';
import { FriendsScreen } from './src/components/FriendsScreen';
import { TabBar } from './src/components/TabBar';
import { AppAlertHost } from './src/components/AppAlert';
import { SplashOverlay, SplashContent } from './src/components/SplashOverlay';

const Tab = createBottomTabNavigator();
export const navigationRef = createNavigationContainerRef();

export default function App() {
  const [userProfile, setUserProfile] = useState(USER_PROFILE_INIT);
  const [showOnboarding, setShowOnboarding] = useState(!USER_PROFILE_INIT.onboardingDone);
  const [introDone, setIntroDone] = useState(false);
  const [kakaoDone, setKakaoDone] = useState(false);   // 온보딩 카카오 단계 완료/건너뜀
  const [kakaoSeed, setKakaoSeed] = useState({});      // 카카오에서 받은 닉네임·사진 — 프로필 입력 화면에 prefill
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [minSplashDone, setMinSplashDone] = useState(false); // 로딩 화면 최소 표시 시간
  const [firstSingleAlert, setFirstSingleAlert] = useState(false);
  const [bestAlert, setBestAlert] = useState(false);

  // 번들 폰트 — Pretendard 정적 굵기 4종(한글 본문) + Lora Italic("Dear Golf" 워드마크)
  // RN은 가변 폰트의 fontWeight를 못 살리므로 굵기별 파일을 각각 패밀리로 로드한다
  // (사용은 constants/colors.js의 F.sys / F.sysM / F.sysSb / F.sysB 참고)
  const [fontsLoaded, fontError] = useFonts({
    Lora_500Medium_Italic,
    'Pretendard-Regular':  require('./assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium':   require('./assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('./assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold':     require('./assets/fonts/Pretendard-Bold.otf'),
  });

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.profile, null);
      if (loaded) {
        // 데이터 마이그레이션 — 옛 profile에 없는 새 필드(예: falseReportCount)를 default로 채움.
        // USER_PROFILE_INIT에 새 필드를 추가하면 자동으로 옛 사용자에게도 적용됨.
        // 폐기된 필드(예: cancelImminentCount, cancelDayCount)는 spread에서 자연 유지되지만 신규 코드에서 사용 X.
        const migrated = { ...USER_PROFILE_INIT, ...loaded };
        setUserProfile(migrated);
        // 새 필드가 추가됐으면 storage에 다시 저장해서 옛 데이터를 새 구조로 업그레이드
        if (JSON.stringify(migrated) !== JSON.stringify(loaded)) {
          await storage.save(STORAGE_KEYS.profile, migrated);
        }
        setShowOnboarding(!migrated.onboardingDone);
      } else {
        // 신규 설치 — 데모 데이터 폴백을 막고 빈 상태로 시작 (온보딩 노출)
        await storage.save(STORAGE_KEYS.schedules, []);
        await storage.save(STORAGE_KEYS.diaries, []);
        await storage.save(STORAGE_KEYS.hof, []);
        setShowOnboarding(true);
      }
      setProfileLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!profileLoaded) return;
    storage.save(STORAGE_KEYS.profile, userProfile);
  }, [userProfile, profileLoaded]);

  // 로딩 화면이 너무 빨리 사라지지 않게 — 최소 1.6초는 브랜드 화면을 보여준다
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 1600);
    return () => clearTimeout(t);
  }, []);

  // 라운딩 알람을 탭하면 홈 탭(D-day 카드)으로 이동
  useEffect(() => {
    const goHome = () => {
      if (navigationRef.isReady()) {
        try { navigationRef.navigate('홈'); } catch (e) { /* 네비게이션 미준비 */ }
      }
    };
    // 앱이 종료된 상태에서 알림 탭으로 실행된 경우
    Notifications.getLastNotificationResponseAsync().then(resp => {
      if (resp) setTimeout(goHome, 400);
    });
    // 앱 실행 중 알림 탭
    const sub = Notifications.addNotificationResponseReceivedListener(() => goHome());
    return () => sub.remove();
  }, []);

  const handleOnboardingComplete = (data) => {
    setUserProfile({ ...data });
    setShowOnboarding(false);
  };

  // 계정 탈퇴 완료 — 프로필 초기화 후 온보딩 화면으로
  const handleAccountDeleted = () => {
    setUserProfile(USER_PROFILE_INIT);
    setIntroDone(false);
    setKakaoDone(false);
    setKakaoSeed({});
    setShowOnboarding(true);
  };

  // 개발용 — 데이터 보존한 채 온보딩만 미리보기 (앱을 리로드하면 원래 화면으로 복귀)
  const previewOnboarding = () => {
    setIntroDone(false);
    setKakaoDone(false);
    setKakaoSeed({});
    setShowOnboarding(true);
  };

  // 폰트 로드 실패해도(fontError) 시스템 폰트로 폴백하며 진행 — 앱이 멈추지 않게.
  // 콘텐츠(프로필·폰트) 준비 전엔 정적 로딩 화면, 준비된 뒤엔 SplashOverlay가 페이드아웃.
  const appReady = profileLoaded && (fontsLoaded || fontError) && minSplashDone;
  if (!profileLoaded || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paleSky }}>
        <SplashContent />
      </View>
    );
  }

  if (showOnboarding) {
    // 인트로(7장) → 카카오 로그인(선택) → 프로필 입력 → 홈
    // SafeAreaProvider 안에서 렌더해야 함 — OnboardingIntro가 useSafeAreaInsets 사용
    let screen;
    if (!introDone) {
      screen = <OnboardingIntro onDone={() => setIntroDone(true)} />;
    } else if (!kakaoDone) {
      screen = <OnboardingKakao
        onKakaoSuccess={(seed) => { setKakaoSeed(seed); setKakaoDone(true); }}
        onSkip={() => setKakaoDone(true)} />;
    } else {
      screen = <OnboardingScreen seed={kakaoSeed} onComplete={handleOnboardingComplete} />;
    }
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>{screen}</SafeAreaProvider>
        <SplashOverlay appReady={appReady} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
    <UserContext.Provider value={{ userProfile, setUserProfile, onAccountDeleted: handleAccountDeleted, previewOnboarding }}>
    <SchedulesProvider>
    <DiariesProvider>
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }} backBehavior="history">
        <Tab.Screen name="홈" component={HomeScreen} />
        <Tab.Screen name="라운지" component={LoungeScreen} />
        <Tab.Screen name="MY" component={DiaryScreen} />
        <Tab.Screen name="친구" component={FriendsScreen} />
        <Tab.Screen name="코스" component={GuideScreen} />
      </Tab.Navigator>

      <Modal visible={firstSingleAlert} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#4A7A8A', borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#C8D9E6' }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(200,217,230,0.6)', letterSpacing: 4, marginBottom: 8 }}>달성</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(26), color: '#C8D9E6', fontWeight: '600', letterSpacing: 3, marginBottom: 8 }}>퍼스트 싱글</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: 'rgba(200,217,230,0.8)', marginBottom: 20 }}>싱글 달성을 축하해요!</Text>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: '#C8D9E6', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 }}
              onPress={() => setFirstSingleAlert(false)}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#C8D9E6' }}>감사해요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={bestAlert} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: C.burgundy, borderRadius: 20, padding: 28, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(245,230,168,0.6)', letterSpacing: 4, marginBottom: 8 }}>신기록</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(26), color: C.butter, fontWeight: '600', letterSpacing: 2, marginBottom: 8 }}>라이프 베스트!</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: 'rgba(255,255,255,0.8)', marginBottom: 20 }}>라이프 베스트 갱신!</Text>
            <TouchableOpacity style={{ borderWidth: 1, borderColor: C.butter, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 }}
              onPress={() => setBestAlert(false)}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.butter }}>감사해요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AppAlertHost />
    </NavigationContainer>
    </DiariesProvider>
    </SchedulesProvider>
    </UserContext.Provider>
    </SafeAreaProvider>
    <SplashOverlay appReady={appReady} />
    </GestureHandlerRootView>
  );
}
