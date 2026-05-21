import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, Image } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as Notifications from 'expo-notifications';
import { useFonts, Lora_500Medium_Italic } from '@expo-google-fonts/lora';
import { C, F } from './src/constants/colors';
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

// 시스템 글꼴 크기 설정(안드로이드 '글꼴 크기'/iOS 동적 타입)이 앱 레이아웃을
// 깨지 않도록 — 모든 Text·TextInput의 글꼴 스케일링을 꺼서 텍스트 크기를 고정.
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = false;
Text.defaultProps.maxFontSizeMultiplier = 1;
if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = false;
TextInput.defaultProps.maxFontSizeMultiplier = 1;

const Tab = createBottomTabNavigator();
export const navigationRef = createNavigationContainerRef();

export default function App() {
  const [userProfile, setUserProfile] = useState(USER_PROFILE_INIT);
  const [showOnboarding, setShowOnboarding] = useState(!USER_PROFILE_INIT.onboardingDone);
  const [introDone, setIntroDone] = useState(false);
  const [kakaoDone, setKakaoDone] = useState(false);   // 온보딩 카카오 단계 완료/건너뜀
  const [kakaoSeed, setKakaoSeed] = useState({});      // 카카오에서 받은 닉네임·사진 — 프로필 입력 화면에 prefill
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [firstSingleAlert, setFirstSingleAlert] = useState(false);
  const [bestAlert, setBestAlert] = useState(false);

  // 번들 폰트 — Pretendard(한글 본문, iOS·Android 통일) + Lora Italic("Dear Golf" 워드마크)
  const [fontsLoaded, fontError] = useFonts({
    Lora_500Medium_Italic,
    Pretendard: require('./assets/fonts/PretendardVariable.ttf'),
  });

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.profile, null);
      if (loaded) {
        setUserProfile(loaded);
        setShowOnboarding(!loaded.onboardingDone);
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

  // 폰트 로드 실패해도(fontError) 시스템 폰트로 폴백하며 진행 — 앱이 멈추지 않게
  if (!profileLoaded || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A3D52' }}>
        <Image source={require('./assets/splash-icon.png')}
          style={{ width: 150, height: 150, resizeMode: 'contain' }} />
        <ActivityIndicator size="small" color={C.butter} style={{ marginTop: 28 }} />
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
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <KeyboardProvider>
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

      <AppAlertHost />
    </NavigationContainer>
    </DiariesProvider>
    </SchedulesProvider>
    </UserContext.Provider>
    </SafeAreaProvider>
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
