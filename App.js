import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { C, F } from './src/constants/colors';
import { USER_PROFILE_INIT } from './src/constants/data';
import { STORAGE_KEYS, storage } from './src/utils/storage';
import { UserContext } from './src/contexts/UserContext';
import { SchedulesProvider } from './src/contexts/SchedulesContext';
import { OnboardingScreen } from './src/components/OnboardingScreen';
import { OnboardingIntro } from './src/components/OnboardingIntro';
import { HomeScreen } from './src/components/HomeScreen';
import { ScheduleScreen } from './src/components/ScheduleScreen';
import { DiaryScreen } from './src/components/DiaryScreen';
import { GuideScreen } from './src/components/GuideScreen';
import { MyScreen } from './src/components/MyScreen';
import { TabBar } from './src/components/TabBar';

const Tab = createBottomTabNavigator();
export const navigationRef = createNavigationContainerRef();

export default function App() {
  const [userProfile, setUserProfile] = useState(USER_PROFILE_INIT);
  const [showOnboarding, setShowOnboarding] = useState(!USER_PROFILE_INIT.onboardingDone);
  const [introDone, setIntroDone] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [firstSingleAlert, setFirstSingleAlert] = useState(false);
  const [bestAlert, setBestAlert] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.profile, null);
      if (loaded) {
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

  if (!profileLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
        <ActivityIndicator size="large" color={C.burgundy} />
      </View>
    );
  }

  if (showOnboarding) {
    // 4장 기능 소개 인트로 → 프로필 입력 온보딩
    // SafeAreaProvider 안에서 렌더해야 함 — OnboardingIntro가 useSafeAreaInsets 사용
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          {!introDone
            ? <OnboardingIntro onDone={() => setIntroDone(true)} />
            : <OnboardingScreen onComplete={handleOnboardingComplete} />}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
    <UserContext.Provider value={{ userProfile, setUserProfile }}>
    <SchedulesProvider>
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tab.Screen name="홈" component={HomeScreen} />
        <Tab.Screen name="일정" component={ScheduleScreen} />
        <Tab.Screen name="다이어리" component={DiaryScreen} />
        <Tab.Screen name="코스" component={GuideScreen} />
        <Tab.Screen name="MY" component={MyScreen} />
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
    </SchedulesProvider>
    </UserContext.Provider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
