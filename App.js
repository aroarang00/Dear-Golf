import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Image } from 'react-native';

// 글로벌 default 폰트 — fontFamily를 명시하지 않은 모든 Text/TextInput에 Pretendard Regular 적용.
// 명시된 style 의 fontFamily 는 그대로 우선 (style 배열 머지 순서). Android 시스템 폰트 fallback 차단 목적.
// allowFontScaling 은 patch-package(Text/TextInput) 가 이미 false 로 설정.
const _withDefaultFont = (Comp) => {
  Comp.defaultProps = Comp.defaultProps || {};
  Comp.defaultProps.style = [{ fontFamily: 'Pretendard-Regular' }, Comp.defaultProps.style].filter(Boolean);
};
_withDefaultFont(Text);
_withDefaultFont(TextInput);
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';

// Sentry — 에러 모니터링. PII 비활성, react-navigation 화면 추적 통합.
// 정책: 개인을 식별할 수 있는 정보 미수집(IP·사용자 ID·이메일). 약관 [[legal-implementation-status]] 제1조 4호.
// Expo Go에선 native 모듈 부재로 init 실패 가능 → try-catch로 보호 ([[dev-build-workflow]])
let sentryNavigationIntegration = null;
try {
  sentryNavigationIntegration = Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: true,
  });
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN, // DSN 없으면 비활성 (dev·미설정 환경 안전)
    sendDefaultPii: false,                          // IP·기기 식별자 등 PII 미전송
    integrations: [sentryNavigationIntegration],
    tracesSampleRate: 1.0,                          // 출시 후 트래픽 보고 조정 (예: 0.1)
    beforeSend(event) {
      // 이중 안전망 — 혹시 모를 PII 필드 제거
      if (event.user) {
        delete event.user.ip_address;
        delete event.user.email;
      }
      return event;
    },
  });
} catch (e) {
  console.warn('[Sentry] init skipped:', e?.message);
}
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useFonts, Lora_500Medium_Italic } from '@expo-google-fonts/lora';
import { PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display';
import { C, F, fs } from './src/constants/colors';
import { USER_PROFILE_INIT } from './src/constants/data';
import { STORAGE_KEYS, storage } from './src/utils/storage';
import { loadMyBlockedUids } from './src/utils/friends';
import { syncFriendRequestLimitFromFirestore } from './src/utils/friendRequestLimit';
import { syncReportLimitFromFirestore } from './src/utils/reportLimit';
import { setupPushNotifications } from './src/utils/pushTokens';
import { db, getUid } from './src/utils/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import './src/utils/firebase'; // 앱 시작 시 Firebase 초기화 + 익명 로그인
import { UserContext } from './src/contexts/UserContext';
import { SchedulesProvider } from './src/contexts/SchedulesContext';
import { DiariesProvider } from './src/contexts/DiariesContext';
import { OnboardingScreen } from './src/components/OnboardingScreen';
import { OnboardingIntro } from './src/components/OnboardingIntro';
import { OnboardingKakao } from './src/components/OnboardingKakao';
import { OnboardingConsent } from './src/components/OnboardingConsent';
import { HomeScreen } from './src/components/HomeScreen';
import { ScheduleScreen } from './src/components/ScheduleScreen';
import { LoungeScreen } from './src/components/LoungeScreen';
import { DiaryScreen } from './src/components/DiaryScreen';
import { GuideScreen } from './src/components/GuideScreen';
import { FriendsScreen } from './src/components/FriendsScreen';
import { TabBar } from './src/components/TabBar';
import { AppAlertHost } from './src/components/AppAlert';
import { SplashOverlay, SplashContent } from './src/components/SplashOverlay';
import { ROUTES } from './src/constants/routes';

const Tab = createBottomTabNavigator();
export const navigationRef = createNavigationContainerRef();

function App() {
  const [userProfile, setUserProfile] = useState(USER_PROFILE_INIT);
  const [showOnboarding, setShowOnboarding] = useState(!USER_PROFILE_INIT.onboardingDone);
  const [introDone, setIntroDone] = useState(false);
  const [kakaoDone, setKakaoDone] = useState(false);   // 온보딩 카카오 단계 완료/건너뜀
  const [kakaoSeed, setKakaoSeed] = useState({});      // 카카오에서 받은 닉네임·사진 — 프로필 입력 화면에 prefill
  const [consentDone, setConsentDone] = useState(false); // 약관 동의 완료
  const [consentData, setConsentData] = useState(null);  // 약관 동의 결과 (legalVersion·agreedAt·marketing 등)
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [minSplashDone, setMinSplashDone] = useState(false); // 로딩 화면 최소 표시 시간
  const [firstSingleAlert, setFirstSingleAlert] = useState(false);
  const [bestAlert, setBestAlert] = useState(false);

  // 번들 폰트 — Pretendard 정적 굵기 4종(한글 본문) + Lora Italic("Dear Golf" 워드마크)
  //   + Playfair Display Bold (영문·숫자 표시용 — Georgia 대체, OS 간 일관)
  // RN은 가변 폰트의 fontWeight를 못 살리므로 굵기별 파일을 각각 패밀리로 로드한다
  // (사용은 constants/colors.js의 F.sys / F.sysM / F.sysSb / F.sysB / F.en 참고)
  const [fontsLoaded, fontError] = useFonts({
    Lora_500Medium_Italic,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
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

  // 차단 목록 + 한도 카운터 + 사용자 설정 Firestore ↔ 로컬 동기화 — profile 로드 후 1회.
  // Firestore가 source of truth (멀티기기). 액션은 write-through로 양쪽 동시 반영.
  // 한도 카운터(친구 신청/강퇴/신고)는 max 머지로 우회 차단.
  useEffect(() => {
    if (!profileLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const remoteBlocked = await loadMyBlockedUids();
        if (cancelled) return;
        setUserProfile(prev => {
          const cur = Array.isArray(prev.blockedUsers) ? prev.blockedUsers : [];
          if (cur.length === remoteBlocked.length
            && cur.every(u => remoteBlocked.includes(u))) return prev;
          return { ...prev, blockedUsers: remoteBlocked };
        });
      } catch (e) {
        if (__DEV__) console.warn('[App] block sync failed', e?.message);
      }
      // 한도 카운터 2종 — 병렬 sync (개별 실패는 각 util이 자체 처리). 강퇴 폐기로 kick sync 제거.
      await Promise.all([
        syncFriendRequestLimitFromFirestore(),
        syncReportLimitFromFirestore(),
      ]);
      // 푸시 토큰 등록 — 권한 요청 + Expo Push 토큰 발급 + users/{uid}.pushToken 저장.
      // 거부 시 null 반환, 인앱 알림으로 자동 보완 ([[notification-policy]] §2).
      setupPushNotifications().catch(e => __DEV__ && console.warn('[App] push setup fail', e?.message));
      // 사용자 설정 + 닉네임/변경이력 — Firestore가 source of truth.
      // lastNicknameChange는 더 최근 시각이 권위 (멀티기기 우회 차단).
      try {
        const uid = await getUid();
        if (!uid || cancelled) return;
        const snap = await getDoc(doc(db, 'users', uid));
        if (cancelled) return;
        if (!snap.exists()) return;
        const data = snap.data();
        const settings = data.settings;
        setUserProfile(prev => {
          const next = { ...prev };
          if (settings) Object.assign(next, settings);
          if (data.nickname) next.nickname = data.nickname;
          // 카카오 연동 상태 — Firestore가 권위 (재설치 후 자동 복원)
          if (typeof data.kakaoLinked === 'boolean') next.kakaoLinked = data.kakaoLinked;
          if (data.kakaoId) next.kakaoId = data.kakaoId;
          // 더 최근 변경 시각이 권위
          const remoteLast = data.lastNicknameChange;
          const localLast = prev.lastNicknameChange;
          if (remoteLast && (!localLast || new Date(remoteLast) > new Date(localLast))) {
            next.lastNicknameChange = remoteLast;
          }
          return next;
        });
      } catch (e) {
        if (__DEV__) console.warn('[App] settings/nickname sync failed', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [profileLoaded]);

  // 사용자 설정 + 닉네임/변경이력 — Firestore write-through (500ms debounce).
  // 멀티기기 동기화. 그 외 필드(blockedUsers·hostedCount 등)는 별도 처리.
  useEffect(() => {
    if (!profileLoaded) return;
    const t = setTimeout(async () => {
      try {
        const uid = await getUid();
        if (!uid) return;
        const payload = {
          settings: {
            alarmDefaults: userProfile.alarmDefaults || null,
            alarmPromptDisabled: !!userProfile.alarmPromptDisabled,
            roundupMatch: userProfile.roundupMatch || null,
            hideStrangerRoundups: !!userProfile.hideStrangerRoundups,
            roundupNotifyPrefs: userProfile.roundupNotifyPrefs || null,
          },
          updatedAt: serverTimestamp(),
        };
        if (userProfile.nickname) payload.nickname = userProfile.nickname;
        if (userProfile.lastNicknameChange) payload.lastNicknameChange = userProfile.lastNicknameChange;
        if (typeof userProfile.kakaoLinked === 'boolean') payload.kakaoLinked = userProfile.kakaoLinked;
        if (userProfile.kakaoId) payload.kakaoId = userProfile.kakaoId;
        // 명함 공개필드 — 친구에게 노출(친구 공개 뷰 1단계). 주소·전화 등 비공개는 동기화 X.
        if (userProfile.realName) payload.realName = userProfile.realName;
        if (userProfile.statusMessage) payload.statusMessage = userProfile.statusMessage;
        if (userProfile.avatarUrl && /^https?:\/\//.test(userProfile.avatarUrl)) payload.avatarUrl = userProfile.avatarUrl;  // Storage 업로드 결과 https URL(친구 공개용). avatarUri(로컬 dgphoto)는 본인 표시 전용
        if (userProfile.lifeBest > 0) payload.lifeBest = userProfile.lifeBest;
        if (userProfile.avgScore > 0) payload.avgScore = userProfile.avgScore;
        if (userProfile.totalRounds > 0) payload.totalRounds = userProfile.totalRounds;
        await setDoc(doc(db, 'users', uid), payload, { merge: true });
      } catch (e) {
        if (__DEV__) console.warn('[App] settings write-through failed', e?.message);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [
    profileLoaded,
    userProfile.alarmDefaults,
    userProfile.alarmPromptDisabled,
    userProfile.roundupMatch,
    userProfile.hideStrangerRoundups,
    userProfile.roundupNotifyPrefs,
    userProfile.nickname,
    userProfile.lastNicknameChange,
    userProfile.kakaoLinked,
    userProfile.kakaoId,
    userProfile.realName,
    userProfile.statusMessage,
    userProfile.avatarUrl,
    userProfile.lifeBest,
    userProfile.avgScore,
    userProfile.totalRounds,
  ]);

  // 로딩 화면이 너무 빨리 사라지지 않게 — 최소 1.6초는 브랜드 화면을 보여준다
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 1600);
    return () => clearTimeout(t);
  }, []);

  // 라운딩 알람을 탭하면 홈 탭(D-day 카드)으로 이동
  useEffect(() => {
    const goHome = () => {
      if (navigationRef.isReady()) {
        try { navigationRef.navigate(ROUTES.HOME); } catch (e) { /* 네비게이션 미준비 */ }
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
    setConsentDone(false);
    setConsentData(null);
    setShowOnboarding(true);
  };

  // 개발용 — 데이터 보존한 채 온보딩만 미리보기 (앱을 리로드하면 원래 화면으로 복귀)
  const previewOnboarding = () => {
    setIntroDone(false);
    setKakaoDone(false);
    setKakaoSeed({});
    setConsentDone(false);
    setConsentData(null);
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
    } else if (!consentDone) {
      screen = <OnboardingConsent
        onAgree={(consent) => { setConsentData(consent); setConsentDone(true); }} />;
    } else {
      screen = <OnboardingScreen seed={kakaoSeed} consent={consentData} onComplete={handleOnboardingComplete} />;
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
    <NavigationContainer
      ref={navigationRef}
      onReady={() => sentryNavigationIntegration?.registerNavigationContainer?.(navigationRef)}
    >
      <Tab.Navigator tabBar={props => <TabBar {...props} />} screenOptions={{ headerShown: false }} backBehavior="history">
        <Tab.Screen name={ROUTES.HOME} component={HomeScreen} />
        <Tab.Screen name={ROUTES.LOUNGE} component={LoungeScreen} />
        <Tab.Screen name={ROUTES.MY} component={DiaryScreen} />
        <Tab.Screen name={ROUTES.FRIENDS} component={FriendsScreen} />
        <Tab.Screen name={ROUTES.COURSE} component={GuideScreen} />
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

// Sentry.wrap — 루트 컴포넌트 감싸 자동 에러 캐치 + 성능 모니터링 활성화
export default Sentry.wrap(App);
