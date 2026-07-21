import 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, Image, Platform, StatusBar as RNStatusBar, Linking, AppState } from 'react-native';

// 글로벌 default 폰트 — fontFamily를 명시하지 않은 모든 Text/TextInput에 Pretendard Regular 적용.
//  ※ React 19 + automatic JSX runtime(jsx())에선 함수형 컴포넌트 defaultProps가 무시돼(옛 _withDefaultFont 방식 사망),
//    이제 patch-package(react-native+0.81.5.patch)의 Text.js/TextInput.js 소스에서 직접 _style 앞에 주입한다.
//    (명시 style의 fontFamily가 항상 이김 · 중첩 Text는 부모 폰트 상속 보존 · placeholder는 AppTextInput 오버레이가 별도 처리)
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
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
    // dev(개발 클라)에선 OFF — Expo Dev Launcher 자체 크래시(NullPointerException 등) 개발 노이즈가
    //   테스트할 때마다 메일 폭탄이 됨(2026-06-15 사장님 테스트폰 SM-A175N). 프로덕션 에러만 받는다.
    //   preview·production 빌드는 __DEV__=false라 그대로 보고됨. DSN 없으면 어차피 비활성.
    enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production', // 대시보드 필터·구분용
    sendDefaultPii: false,                          // IP·기기 식별자 등 PII 미전송
    integrations: [sentryNavigationIntegration],
    // 성능 추적 OFF — tracesSampleRate 1.0(전 트랜잭션·내비 100% 계측)이 안드서 전환·상호작용마다
    //   부하를 줘 전반 렉의 한 원인(2026-06-13 사용자 "전반적으로 다 렉·반응 느림"). 에러 캡처는 그대로 유지.
    //   안정화 후 모니터링 필요하면 0.1 등 소량으로 재개([[sentry-symbolication]]).
    tracesSampleRate: 0,
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
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
// expo-system-ui는 정적 import 시 모듈 로드 시점에 requireNativeModule('ExpoSystemUI')를 호출 →
//   구버전 iOS dev client(모듈 없음)에서 'Cannot find native module' 크래시. 안드 전용이라 아래 effect에서 lazy require.
import { useFonts, Lora_500Medium_Italic } from '@expo-google-fonts/lora';
import { PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display';
import { C, F, fs } from './src/constants/colors';
import { USER_PROFILE_INIT } from './src/constants/data';
import { STORAGE_KEYS, storage } from './src/utils/storage';
import { loadMyBlockedUids, loadReceivedRequests } from './src/utils/friends';
import { syncReportLimitFromFirestore } from './src/utils/reportLimit';
import { syncUserCoursesFromFirestore } from './src/utils/userCourses';
import { syncSavedCoursesFromFirestore } from './src/utils/savedCourses';           // 저장 골프장(위시리스트) 재설치 보존
import { syncSavedRestaurantsFromFirestore } from './src/utils/savedRestaurants';   // 저장 맛집 재설치 보존
import { syncTop100ChecksFromFirestore } from './src/utils/top100';                 // 체크한 100대 코스 재설치 보존
import { syncFoodRecsFromFirestore } from './src/utils/foodRecs';                   // ♥ 추천 맛집 재설치 보존
import { getGolfCourses } from './src/utils/golfCourses'; // 마스터 캐시 워밍 — 식사 좌표해석 콜드스타트 레이스 예방
import { prefetchTabData } from './src/utils/prefetch'; // 콜드 탭(친구·라운지) 백그라운드 프리페치 — 첫 탭 채워짐 지연 완화
import { loadPrivateProfile } from './src/utils/privateProfile'; // 출발지 등 비공개 프로필 — 기기 간 유지
import { setupPushNotifications } from './src/utils/pushTokens';
import { db, getUid, auth } from './src/utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { fetchKakaoProfileImage } from './src/utils/kakaoAuth';
import { uploadAvatar } from './src/utils/avatarStorage';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import './src/utils/firebase'; // 앱 시작 시 Firebase 초기화 + 익명 로그인
import { UserContext } from './src/contexts/UserContext';
import { FriendBadgeContext } from './src/contexts/FriendBadgeContext';
import { subscribeIncomingScheduleInvites } from './src/utils/scheduleShares';
import { subscribeSelectInvitesForMe } from './src/utils/roundup';
import { suppressRoundupInvite, syncRoundupSuppressedFromFirestore } from './src/utils/roundupSuppressed'; // 초대 거절 재설치 보존
import { CurrentUidContext } from './src/contexts/CurrentUidContext';
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
import { AppToastHost } from './src/components/AppToast';
import { SplashOverlay, SplashContent } from './src/components/SplashOverlay';
import { ScheduleReminderPopup } from './src/components/ScheduleReminderPopup';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { subscribeMyNotifications, markNotificationRead } from './src/utils/roundupNotifications';
import { ROUTES } from './src/constants/routes';
import { parseDeepLink } from './src/utils/links';

const Tab = createBottomTabNavigator();
export const navigationRef = createNavigationContainerRef();

// ★TEMP_DEV — __DEV__ 전용 로그인 우회. 카카오 없이 메인 탭 직행(로딩 흔들림·상단 띠·카드 핫리로드 디버깅용).
//   프로덕션 빌드(__DEV__=false)에선 항상 false라 완전 무시됨 — 안전. 디버깅 끝나면 이 줄 제거 ([[android_edge_to_edge]]).
const DEV_BYPASS_LOGIN = __DEV__ && false;

// 안드 edge-to-edge 첫 프레임 보정 게이트 ([[android_edge_to_edge]] 증상③).
//  화면(Tab scene)이 첫 마운트 때 상태바 inset(top)이 아직 0인 채로 그려져 상태바만큼 아래로 밀리고,
//  그 위 빈칸에 루트 배경(paleSky)이 '띠'로 비친다. 네비게이션으로 화면이 재마운트되면 측정된 inset으로
//  정상 배치(=풀블리드)되던 자가치유(사용자 실측 확정)를, 사용자가 보기 전에 미리 끝내는 방식.
//  → top inset이 측정(>0)된 뒤에만 자식(NavigationContainer)을 마운트. 그동안은 SplashOverlay가 덮고 있어 깜빡임 없음.
//  iOS는 edge-to-edge 강제 이슈가 없어 즉시 통과. 일부 기기/상황에서 0이 지속될 수 있으니 600ms 폴백.
function InsetGate({ children }) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(Platform.OS !== 'android');
  useEffect(() => {
    if (ready) return;
    if (insets.top > 0) { setReady(true); return; }
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, [ready, insets.top]);
  if (!ready) return null;
  return children;
}

function App() {
  const [userProfile, setUserProfile] = useState(USER_PROFILE_INIT);
  const [showOnboarding, setShowOnboarding] = useState(!USER_PROFILE_INIT.onboardingDone);
  const [introDone, setIntroDone] = useState(false);
  const [kakaoDone, setKakaoDone] = useState(false);   // 온보딩 카카오 단계 완료/건너뜀
  const [kakaoSeed, setKakaoSeed] = useState({});      // 카카오에서 받은 닉네임·사진 — 프로필 입력 화면에 prefill
  const [consentDone, setConsentDone] = useState(false); // 약관 동의 완료
  const [consentData, setConsentData] = useState(null);  // 약관 동의 결과 (legalVersion·agreedAt·marketing 등)
  const [profileLoaded, setProfileLoaded] = useState(false);
  // 단일 uid 소스 — onAuthStateChanged를 여기서 한 번 구독해 authUid로 노출(CurrentUidContext).
  //   uid가 바뀌면(익명→카카오 settle·재설치 시나리오 ②) 아래 Firestore 동기화 useEffect들이
  //   authUid 의존성으로 자동 재실행되어 새 계정 데이터로 갱신된다([[uid-stabilization-plan]]).
  const [authUid, setAuthUid] = useState(() => auth.currentUser?.uid || null);
  useEffect(() => {
    let prev = auth.currentUser?.uid || null;
    const unsub = onAuthStateChanged(auth, (user) => {
      const next = user?.uid || null;
      if (next === prev) return;   // 같은 uid 중복 갱신 방지(DiariesContext 패턴)
      prev = next;
      setAuthUid(next);
    });
    return unsub;
  }, []);
  const [minSplashDone, setMinSplashDone] = useState(false); // 로딩 화면 최소 표시 시간
  const [firstSingleAlert, setFirstSingleAlert] = useState(false);
  const [bestAlert, setBestAlert] = useState(false);

  // 친구 탭 탭바 뱃지 — 받은 친구신청 수. 친구신청 알림은 라운지 알림함에서 분리, 친구 탭에서만 표시.
  const [friendReqCount, setFriendReqCount] = useState(0);
  // 홈 탭 뱃지 — 받은 일정 전파 초대 수(어느 탭에서든 보이게). 홈 배너와 별개 신호 ([[schedule-propagation-spec]])
  const [scheduleInviteCount, setScheduleInviteCount] = useState(0);
  // 수동 갱신 폴백(컨텍스트 제공) — 리스너 붙기 전/오류 시 1회 조회용.
  const refreshFriendBadge = useCallback(async () => {
    try {
      const reqs = await loadReceivedRequests();
      setFriendReqCount(Array.isArray(reqs) ? reqs.length : 0);
    } catch (e) {
      if (__DEV__) console.warn('[App] friend badge refresh failed', e?.message);
    }
  }, []);

  // 콜드 탭(친구·라운지) 백그라운드 프리페치 — 로그인·온보딩 후 1회. 첫 탭 진입 시 '비었다가 채워짐' 지연 완화
  //   (Firestore 연결·인증·메모리 워밍 + 결과 캐시 적재 → 화면이 getPrefetch로 즉시 시드 가능). best-effort, 실패 무해.
  useEffect(() => {
    if (showOnboarding || !profileLoaded || !authUid) return;
    prefetchTabData(authUid);
  }, [authUid, profileLoaded, showOnboarding]);

  // 받은 친구신청 실시간 구독 ([[lounge-realtime]] ② 친구신청) — 앱 켜둔 중에도 신청 도착·수락 시 뱃지 즉시 갱신.
  //   friendships: recipientUid==me && status=='pending'. 수락하면 pending에서 빠져 size 감소 → 자동 해제.
  //   uid 변동(익명↔카카오 settle·재설치 시나리오 ②) 시 authUid 의존성으로 재구독 ([[uid-stabilization-plan]]).
  useEffect(() => {
    if (showOnboarding || !profileLoaded || !authUid) return;
    let unsub = null, cancelled = false;
    (async () => {
      const uid = await getUid();
      if (!uid || cancelled) return;
      const q = query(
        collection(db, 'friendships'),
        where('recipientUid', '==', uid),
        where('status', '==', 'pending'),
      );
      unsub = onSnapshot(q,
        snap => setFriendReqCount(snap.size),
        err => { if (__DEV__) console.warn('[App] friend req listener', err?.message); });
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [showOnboarding, profileLoaded, authUid]);

  // 일정 전파 초대 뱃지 — 받은 초대(audienceUids array-contains me, 미수락·미거절) 수를 홈 탭에 표시.
  //   어느 탭에 있어도 보이게(푸시 놓쳐도 인지). 수락/거절하면 실시간 감소. uid 변동 시 재구독 ([[schedule-propagation-spec]])
  useEffect(() => {
    if (showOnboarding || !profileLoaded || !authUid) return;
    let unsub = null, cancelled = false;
    (async () => {
      const uid = await getUid();
      if (!uid || cancelled) return;
      unsub = subscribeIncomingScheduleInvites(uid, list => setScheduleInviteCount(Array.isArray(list) ? list.length : 0));
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [showOnboarding, profileLoaded, authUid]);

  // 라운지 친구지정(select) 초대 — 라운지 탭 뱃지 + 홈 배너. 받은 미응답 초대를 실시간 구독([[roundup-invitation]]).
  //   서버 조건(미참여·윈도우)은 subscribeSelectInvitesForMe가, '거절·취소'는 로컬(roundupSuppressed)·'가리기'(roundupHidden)라 여기서 차감.
  const [roundupInvitePending, setRoundupInvitePending] = useState([]); // 서버 원천 미응답 초대
  const [roundupHiddenMap, setRoundupHiddenMap] = useState({});         // 로컬 가리기(라운지와 같은 스토리지 키 공유)
  const [roundupSuppressedMap, setRoundupSuppressedMap] = useState({}); // 로컬 초대 자동억제(거절·취소) — 초대 표시만 숨김
  const refreshRoundupHidden = useCallback(async () => {
    try {
      const [h, s] = await Promise.all([
        storage.load(STORAGE_KEYS.roundupHidden, {}),
        storage.load(STORAGE_KEYS.roundupSuppressed, {}),
      ]);
      setRoundupHiddenMap(h || {});
      setRoundupSuppressedMap(s || {});
    } catch (e) { if (__DEV__) console.warn('[App] roundup hidden load fail', e?.message); }
  }, []);
  useEffect(() => { refreshRoundupHidden(); }, [refreshRoundupHidden]); // 마운트 시 가리기 로드
  // 배너에서 거절 — '초대 자동억제'에 기록(라운지 suppressInvite와 같은 로컬 키) + users/{uid} 서버 미러.
  //   초대 재노출만 막고(친구공개로 바뀌면 다시 보이게 — 가리기와 분리), 즉시 반영. ★서버 백업이라
  //   재설치·타기기에서 거절이 되살아나지 않는다([[roundup-invitation]], roundupSuppressed 유틸).
  const declineRoundupInvite = useCallback(async (postId) => {
    if (!postId) return;
    try {
      const next = await suppressRoundupInvite(postId);
      setRoundupSuppressedMap(next);
    } catch (e) { if (__DEV__) console.warn('[App] roundup decline fail', e?.message); }
  }, []);
  useEffect(() => {
    if (showOnboarding || !profileLoaded || !authUid) return;
    let unsub = null, cancelled = false;
    (async () => {
      const uid = await getUid();
      if (!uid || cancelled) return;
      unsub = subscribeSelectInvitesForMe(uid, list => setRoundupInvitePending(Array.isArray(list) ? list : []));
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [showOnboarding, profileLoaded, authUid]);
  // 거절(자동억제) 서버 복원 — 재설치·타기기에서 거절한 초대가 되살아나지 않게 users/{uid}에서 머지(로컬 미러).
  //   마운트 로컬 로드(refreshRoundupHidden) 이후, 인증 준비되면 서버∪로컬로 덮어써 최종 정합.
  useEffect(() => {
    if (showOnboarding || !profileLoaded || !authUid) return;
    let cancelled = false;
    (async () => {
      const merged = await syncRoundupSuppressedFromFirestore();
      if (!cancelled) setRoundupSuppressedMap(merged || {});
    })();
    return () => { cancelled = true; };
  }, [showOnboarding, profileLoaded, authUid]);
  // 가리기(거절) 반영된 최종 목록 + 카운트 — 라운지 탭 뱃지/홈 배너 공용 단일 소스.
  const roundupInvites = useMemo(
    () => roundupInvitePending.filter(p => !roundupHiddenMap[p.id] && !roundupSuppressedMap[p.id]),
    [roundupInvitePending, roundupHiddenMap, roundupSuppressedMap]);
  const roundupInviteCount = roundupInvites.length;

  // 라운딩 일정 알림(scheduleNotice) — 주최자의 '동반자에게 일정 알리기'를 수신자가 앱 어디서나 확인.
  //   실시간 구독([[lounge-realtime]]) — 앱 켜둔 중에도 주최자가 알리면 즉시 팝업. 본인 수신분만·최신 50건 좁게.
  //   uid 변동(익명↔카카오 settle·재설치 시나리오 ②) 시 authUid 의존성으로 재구독 ([[uid-stabilization-plan]]).
  const [scheduleNotices, setScheduleNotices] = useState([]);
  useEffect(() => {
    if (showOnboarding || !profileLoaded || !authUid) return;
    return subscribeMyNotifications(list => {
      setScheduleNotices(list.filter(n => n.type === 'scheduleNotice' && !n.read));
    });
  }, [showOnboarding, profileLoaded, authUid]);

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
      // ★TEMP_DEV — 카카오 로그인 우회: 가짜 프로필로 온보딩 건너뛰고 메인 탭 직행(프로덕션 무시)
      if (DEV_BYPASS_LOGIN) {
        setUserProfile({ ...USER_PROFILE_INIT, onboardingDone: true, nickname: '개발자', kakaoLinked: true });
        setShowOnboarding(false);
        setProfileLoaded(true);
        return;
      }
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
    if (!profileLoaded || !authUid) return;   // uid 확정 후 동기화 — uid 바뀌면 새 계정으로 재실행
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
      // 한도 카운터 + 등록 코스 — 병렬 sync (개별 실패는 각 util이 자체 처리). 강퇴 폐기로 kick, 친구신청 한도 폐지로 friendRequest sync 제거.
      //   userCourses는 로컬 캐시를 Firestore로 복원 — 프레시 설치 시 홈 카드 코스이동·GuideScreen 매칭 회복.
      await Promise.all([
        syncReportLimitFromFirestore(),
        syncUserCoursesFromFirestore(),
        syncSavedCoursesFromFirestore(),       // 저장 골프장 — 재설치/타기기 복원
        syncSavedRestaurantsFromFirestore(),   // 저장 맛집 — 재설치/타기기 복원
        syncTop100ChecksFromFirestore(),       // 체크한 100대 코스 — 재설치/타기기 복원
        syncFoodRecsFromFirestore(),           // ♥ 추천 맛집 — 재설치/타기기 복원
      ]);
      // 골프장 마스터 캐시 백그라운드 워밍(블로킹 X) — '함께 식사' 좌표해석이 course 이름검색으로
      //   콜드 Firestore 조회를 처음 기다리다 빈 리스트로 끝나던 레이스 예방. in-flight dedupe로 중복 안전.
      getGolfCourses().catch(() => {});
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
          // 프로필 한마디(statusMessage) — Firestore 권위로 복원(재설치·새 기기서도 유지). '' 도 반영(서버에서 지운 상태).
          if (data.statusMessage != null) next.statusMessage = data.statusMessage;
          // 명함 공개필드 복원 — write-through로 users 문서엔 저장되지만 startup에서 안 읽어, 재설치 시
          //   본인 화면에서 아바타·본명·입력 스탯이 사라지던 빈틈 보완(친구는 users 문서를 직접 읽어 정상이었음).
          if (data.avatarUrl) {
            next.avatarUrl = data.avatarUrl;
            // 본인 표시는 avatarUri 기준 — 로컬에 없으면(재설치) https로 복원. 없으면 친구는 보는데 내 화면엔 내 사진이 안 떴음.
            if (!prev.avatarUri) next.avatarUri = data.avatarUrl;
          }
          if (data.realName) next.realName = data.realName;
          if (data.avgScore > 0) next.avgScore = data.avgScore;
          if (data.lifeBest > 0) next.lifeBest = data.lifeBest;
          if (data.totalRounds > 0) next.totalRounds = data.totalRounds;
          // 카카오 연동 상태 — Firestore가 권위 (재설치 후 자동 복원)
          if (typeof data.kakaoLinked === 'boolean') next.kakaoLinked = data.kakaoLinked;
          if (data.kakaoId) next.kakaoId = data.kakaoId;
          // 등급 한도(entitlements) — 결제 검증한 CF만 상향(users 규칙이 클라 변경 차단). 읽기만 반영 → 유료 확장 시 앱이 자동 인식.
          if (data.entitlements) next.entitlements = data.entitlements;
          // 더 최근 변경 시각이 권위
          const remoteLast = data.lastNicknameChange;
          const localLast = prev.lastNicknameChange;
          if (remoteLast && (!localLast || new Date(remoteLast) > new Date(localLast))) {
            next.lastNicknameChange = remoteLast;
          }
          return next;
        });
        // 비공개 프로필(출발지 등) — users 문서엔 안 올리는 민감정보를 owner-only 서브컬렉션에서 복원(재설치·새 기기서도 유지).
        //   로컬에 이미 있으면(같은 기기) 그대로, 없으면 Firestore-private에서 채움. 옛 사용자(private 없음)는 로컬 유지 후 다음 저장 때 마이그레이션.
        try {
          const priv = await loadPrivateProfile(uid);
          if (priv && !cancelled) {
            setUserProfile(prev => {
              const next = { ...prev };
              if (priv.departure != null) next.departure = priv.departure;
              if (priv.departureCoord && typeof priv.departureCoord.x === 'number' && typeof priv.departureCoord.y === 'number') next.departureCoord = priv.departureCoord;
              if (priv.work != null) next.work = priv.work;
              if (priv.workCoord && typeof priv.workCoord.x === 'number' && typeof priv.workCoord.y === 'number') next.workCoord = priv.workCoord;
              return next;
            });
          }
        } catch (e) { if (__DEV__) console.warn('[App] private profile load fail', e?.message); }
        // 카카오 프로필 사진 backfill ([[avatar-resignup-bug]]) — 연동됐는데 avatarUrl이 비어 있으면
        //   (재설치·재가입으로 푸시토큰만 먼저 생긴 빈 문서) 카카오 사진을 1회 소급 저장한다.
        //   친구가 사진을 못 보고 이니셜만 뜨던 문제 보정. 토큰 살아있을 때만(silent)·기존 값은 절대 덮어쓰지 않음.
        if (data.kakaoLinked === true && !data.avatarUrl) {
          const kakaoUrl = await fetchKakaoProfileImage({ silent: true });
          // 카카오 URL을 그대로 저장하면 친구가 못 봄(http·ATS/만료) → 우리 Storage로 재호스팅한 https만 저장.
          const url = kakaoUrl ? await uploadAvatar(uid, kakaoUrl) : null;
          if (url && !cancelled) {
            await setDoc(doc(db, 'users', uid), { uid, avatarUrl: url, updatedAt: serverTimestamp() }, { merge: true });
            setUserProfile(prev => (prev.avatarUrl ? prev : { ...prev, avatarUrl: url }));
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('[App] settings/nickname sync failed', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [profileLoaded, authUid]);

  // 사용자 설정 + 닉네임/변경이력 — Firestore write-through (500ms debounce).
  // 멀티기기 동기화. 그 외 필드(blockedUsers·hostedCount 등)는 별도 처리.
  useEffect(() => {
    if (!profileLoaded || !authUid) return;
    const t = setTimeout(async () => {
      try {
        const uid = await getUid();
        if (!uid) return;
        // ★유령 계정 방지 — 소셜 연동자가 세션 유실로 '새 익명 uid'에 떨어진 상태면 write 자체를 skip.
        //   로컬 프로필의 nickname·kakaoId가 users/{익명uid}에 그대로 박혀 친구 검색·신청에 유령 등장
        //   ([[kakao-anon-orphan-accounts]] 재발 경로 — ensureUserDoc을 안 거치는 raw setDoc이라 21b38f9
        //   3중방어가 못 막음). FriendsTab ensure 가드와 동일 기준. 재로그인으로 원래 uid 복귀 후 정상 동기화.
        if (auth.currentUser?.isAnonymous) {
          const hasTrace = (await storage.load(STORAGE_KEYS.kakaoTrace, false))
            || (await storage.load(STORAGE_KEYS.appleTrace, false));
          if (hasTrace) return;
        }
        const payload = {
          uid, // users 규칙(request.resource.data.uid == uid) 충족 — 없으면 문서 생성/수정이 권한 거부됨
          settings: {
            alarmDefaults: userProfile.alarmDefaults || null,
            alarmPromptDisabled: !!userProfile.alarmPromptDisabled,
            roundupMatch: userProfile.roundupMatch || null,
            hideStrangerRoundups: !!userProfile.hideStrangerRoundups,
            roundupNotifyPrefs: userProfile.roundupNotifyPrefs || null,
            notifyPrefs: userProfile.notifyPrefs || null,   // 마이페이지 알림(친구 신청 등) — CF onNotificationCreated가 토글 체크에 사용
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
    authUid,
    userProfile.alarmDefaults,
    userProfile.alarmPromptDisabled,
    userProfile.roundupMatch,
    userProfile.hideStrangerRoundups,
    userProfile.roundupNotifyPrefs,
    userProfile.notifyPrefs,
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

  // 안드 edge-to-edge 루트 배경 — 시스템바(상태바·네비바) 뒤까지 brand 배경(paleSky)으로 칠해
  //   로딩·화면 전환 시 검은 영역이 노출(로딩 풀스크린 안 됨)되던 것 방지 (2026-06-14, [[android_edge_to_edge]]).
  //   splash.backgroundColor는 네이티브 런치 스크린만 칠함 → JS 전환 후 루트 뷰 배경은 별도 설정 필요.
  useEffect(() => {
    // 안드 전용 — 기능 목적이 안드 edge-to-edge 배경이고, iOS엔 ExpoSystemUI 네이티브 모듈이 없어
    //   (구버전 dev client) setBackgroundColorAsync 호출 시 'Cannot find native module' 크래시. iOS에선 불필요.
    if (Platform.OS === 'android') {
      const SystemUI = require('expo-system-ui'); // lazy — iOS에선 실행 안 돼 네이티브 모듈 require 회피
      SystemUI.setBackgroundColorAsync(C.paleSky).catch(() => {});
      // ★띠 진단/수정 — 불투명 paleSky 상태바가 띠로 보임 + inset.top=0. 투명+translucent로 풀블리드+inset 정상화.
      try { RNStatusBar.setTranslucent(true); } catch (e) {}
      try { RNStatusBar.setBackgroundColor('transparent', false); } catch (e) {}
    }
  }, []);

  // 로딩 화면이 너무 빨리 사라지지 않게 — 최소 1.6초는 브랜드 화면을 보여준다
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 1600);
    return () => clearTimeout(t);
  }, []);

  // 콜드스타트 초기 딥링크/알림 1회 처리 플래그 — 아래 두 effect가 showOnboarding 완료 시 재실행되며
  //   초기 URL/알림을 다시 읽는데(온보딩 중 유실 방지), 이미 라우팅한 걸 재온보딩 뒤 또 재생하지 않게 막는다.
  const initialLinkHandledRef = useRef(false);
  const initialNotiHandledRef = useRef(false);

  // 푸시 알림을 탭하면 종류에 맞는 화면으로 이동.
  //  - 친구신청·초대 → 친구 탭 (받은 신청·초대 카드가 친구 탭 메인에 인라인 노출, [[friend-notification-ia]])
  //  - 모집글 중심 알림(댓글·확정·참여 등) → 라운지 탭 + 해당 모집글 상세 자동 오픈
  //  - 그 외 라운지 알림(노쇼·매너·정지·신고 등) → 라운지 탭 (종 아이콘 알림함에서 확인)
  //  - type 없는 로컬 라운딩 알람(D-3/D-1/당일) → 홈 D-day 카드
  //  서버 푸시 data:{ type, postId, notiId } / 로컬 알람 data:{ scheduleId, nav:'home' }(type 없음).
  //  postId는 푸시에 이미 포함 — 앱이 그 id로 Firestore 최신 상세를 다시 읽어 연다(푸시엔 식별자만, 내용 X).
  useEffect(() => {
    // 모집글 상세로 바로 여는 게 자연스러운(글 중심) 타입. 노쇼·정지 등은 상세 대신 라운지 착지.
    const POST_DETAIL_TYPES = new Set([
      'apply', 'confirmed', 'cancel', 'waitlist', 'waitlistPromoted',
      'comment', 'mannerEval', 'hostCancelledD7', 'scheduleNotice', 'roundupChanged', 'roundupFull',
    ]);
    const handleResponse = (resp, attempt = 0, fromInitial = false) => {
      // 콜드스타트 — 종료 상태서 알림 탭으로 켜지면 네비가 아직 미준비일 수 있어, 딥링크와 동일하게 준비될 때까지 재시도(고정 지연은 안드 InsetGate 마운트 지연에 유실).
      if (!navigationRef.isReady()) {
        if (attempt < 20) setTimeout(() => handleResponse(resp, attempt + 1, fromInitial), 250);
        // 온보딩 중이면 재시도가 소진돼도 유실 아님 — showOnboarding 완료 시 effect 재실행이 초기 알림을 다시 읽는다.
        return;
      }
      if (fromInitial) initialNotiHandledRef.current = true; // 재온보딩 시 옛 알림 중복 재생 방지
      const data = resp?.notification?.request?.content?.data || {};
      const type = data.type;
      try {
        if (!type) { navigationRef.navigate(ROUTES.HOME); return; }
        if (type === 'friendRequest') { navigationRef.navigate(ROUTES.FRIENDS); return; }
        // 라운지 친구지정 초대(invite) — 초대장 카드는 라운지 '내 참여(mine)' view에만 렌더되므로
        //   (RoundupTab의 InvitationCard/Ticket, view==='mine' 게이트) 그 view로 열어준다 ([[roundup-invitation]]).
        if (type === 'invite') { navigationRef.navigate(ROUTES.LOUNGE, { openView: 'mine' }); return; }
        // DM 푸시 탭 → MY 탭 열고 senderUid와의 대화방 직행(DiaryScreen openDmUid 처리). 안 그러면 기본값 라운지로 잘못 감.
        if (type === 'dm') { navigationRef.navigate(ROUTES.MY, { openDmUid: data.senderUid }); return; }
        // 일정 전파 초대 → 홈(수신 배너가 홈에 있음) ([[schedule-propagation-spec]])
        if (type === 'scheduleInvite') { navigationRef.navigate(ROUTES.HOME); return; }
        // 일정 전파 변경·취소·공지 → 홈. postId(=groupId)로 해당 일정 시트 자동 오픈.
        if (type === 'scheduleChanged' || type === 'scheduleCancelled' || type === 'scheduleMemo') {
          navigationRef.navigate(ROUTES.HOME, data.postId ? { openScheduleSheetId: data.postId } : undefined);
          return;
        }
        // 뒤풀이 결정·변경 → 홈 + 뒤풀이 시트 자동 오픈(푸시→길찾기 한 동선) ([[afterround-meal-decision]])
        if (type === 'mealSuggestion') { navigationRef.navigate(ROUTES.HOME, { openMeal: data.mealId || true }); return; }
        // 스코어 공유 → MY(ScoreShareInbox 수신 배너가 MY 피드 상단)
        if (type === 'scoreShare') { navigationRef.navigate(ROUTES.MY); return; }
        // 크루 초대 → 홈 + 크루 화면 자동 오픈(글로우가 있는 홈 우상단 진입점) ([[crew-space-design]])
        if (type === 'crewInvite') { navigationRef.navigate(ROUTES.HOME, { openCrew: true }); return; }
        const openPostId = (POST_DETAIL_TYPES.has(type) && data.postId) ? data.postId : null;
        navigationRef.navigate(ROUTES.LOUNGE, openPostId ? { openPostId } : undefined);
      } catch (e) { /* 네비게이션 미준비 */ }
    };
    // 앱이 종료된 상태에서 알림 탭으로 실행된 경우 — 네비게이션 준비 시간 확보
    Notifications.getLastNotificationResponseAsync().then(resp => {
      if (resp && !initialNotiHandledRef.current) handleResponse(resp, 0, true); // handleResponse가 네비 준비까지 재시도 내장
    });
    // 앱 실행 중 알림 탭
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
    // deps에 showOnboarding — 온보딩 중엔 NavigationContainer 미마운트라 재시도(~5s)가 소진되는데,
    //   온보딩 완료 시 effect가 재실행되며 초기 알림을 다시 읽어 목적지로 보낸다(신규 설치 유입 유실 방지).
  }, [showOnboarding]);

  // iOS 앱 아이콘 배지 정리 — 인앱에서 알림을 다 읽어도(푸시 탭 안 하고) 아이콘 갯수가 안 사라지던 문제.
  //   앱을 열면(포그라운드 복귀·콜드스타트) = 확인한 것으로 보고 배지를 0으로 내린다. 안드는 배지 모델이 달라 무해.
  //   ★알림센터(트레이) 일괄 정리도 함께 — "푸시 하나 탭하면 나머지가 사라진다"는 원래 민원은
  //    홈 우측 레일의 미확인 알림 종(개수 뱃지)이 대신 해결한다(2026-07-21). 트레이까지 남기면 같은 알림을
  //    폰 알림창·앱 두 곳에서 지워야 해 오히려 번거로움(사용자 지적). 확인처는 인앱 한 곳으로 일원화.
  //    트레이를 지워도 잃는 정보 없음 — 알림함에 없는 종류(DM·일정초대·크루초대·함께식사·스코어공유)도
  //    각자 인앱 수신함이 있고 그중 넷은 홈에 상시 노출(메시지 뱃지·초대 배너·크루 글로우·식사바).
  useEffect(() => {
    const clearBadge = () => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      Notifications.dismissAllNotificationsAsync().catch(() => {});
    };
    clearBadge(); // 실행/콜드스타트 시 1회
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') clearBadge(); });
    return () => appSub.remove();
  }, []);

  // 딥링크 수신 — deargolf.app/r/{postId}(Universal/App Links) 또는 deargolf://r/{postId} → 라운지 모집 상세.
  //   푸시 handleResponse와 동일하게 navigationRef로 라우팅. openPostId는 목록에 없어도 RoundupTab이 fetch해 상세를 연다(RoundupTab:505).
  //   Firestore read 규칙이 권한을 거르므로(친구지정=audienceUids 등) 비권한 글은 상세가 안 열림 — 보안 모델과 일치. ([[invite-deeplink-system]])
  useEffect(() => {
    const route = (url, attempt = 0, fromInitial = false) => {
      if (!url) return;
      // 콜드스타트 — 앱이 완전 종료 상태서 링크로 켜지면 네비가 아직 준비 안 됐을 수 있어, 준비될 때까지 재시도(최대 ~5s)
      if (!navigationRef.isReady()) {
        if (attempt < 20) setTimeout(() => route(url, attempt + 1, fromInitial), 250);
        // 온보딩 중이면 소진돼도 유실 아님 — 온보딩 완료 시 effect 재실행이 초기 URL을 다시 읽는다(아래 deps).
        return;
      }
      if (fromInitial) initialLinkHandledRef.current = true; // 재온보딩 시 옛 링크 중복 재생 방지
      const parsed = parseDeepLink(url);
      if (parsed?.type === 'roundup' && parsed.postId) {
        // openPostHost = 주최자 uid(있으면) — 비친구라 글 읽기 막힐 때 '친구 맺기' 안내에 사용 ([[roundup-friend-redesign]])
        navigationRef.navigate(ROUTES.LOUNGE, { openPostId: parsed.postId, openPostHost: parsed.hostUid || undefined });
      }
    };
    // 종료 상태에서 링크로 실행된 경우 — route가 네비 준비될 때까지 재시도(고정 지연 대신, 콜드스타트 유실 방지)
    Linking.getInitialURL().then(url => { if (url && !initialLinkHandledRef.current) route(url, 0, true); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => route(url)); // 앱 실행 중 링크 진입
    return () => sub.remove();
    // deps에 showOnboarding — "초대 링크 → 설치 → 첫 실행"은 온보딩에 막혀 네비가 5초 내 준비되지 않음.
    //   온보딩 완료 시 재실행해 초기 URL을 재생(딥링크 핵심 유입 시나리오 유실 방지).
  }, [showOnboarding]);

  const handleOnboardingComplete = (data) => {
    // 기존 프로필과 병합 — 온보딩 data엔 statusMessage·departure·phone 등이 없어서, 통째 교체하면
    //   재온보딩(미리보기 포함) 시 그 필드들이 날아간다. 신규 사용자는 prev=USER_PROFILE_INIT라 결과 동일.
    setUserProfile(prev => ({ ...prev, ...data }));
    setShowOnboarding(false);
  };

  // 계정 탈퇴 완료 — 프로필 초기화 후 온보딩 화면으로. useCallback: UserContext value 안정화용(setter만 사용, deps 빈)
  const handleAccountDeleted = useCallback(() => {
    setUserProfile(USER_PROFILE_INIT);
    setIntroDone(false);
    setKakaoDone(false);
    setKakaoSeed({});
    setConsentDone(false);
    setConsentData(null);
    setShowOnboarding(true);
  }, []);

  // 개발용 — 데이터 보존한 채 온보딩만 미리보기 (앱을 리로드하면 원래 화면으로 복귀)
  const previewOnboarding = useCallback(() => {
    setIntroDone(false);
    setKakaoDone(false);
    setKakaoSeed({});
    setConsentDone(false);
    setConsentData(null);
    setShowOnboarding(true);
  }, []);

  // UserContext value 메모 — App은 배지 카운트(FriendBadge) onSnapshot으로 자주 재렌더되는데,
  //   인라인 value면 매번 새 참조라 모든 UserContext 소비 화면이 재렌더됐다. userProfile 안 바뀌면 스킵.
  const userCtxValue = useMemo(
    () => ({ userProfile, setUserProfile, onAccountDeleted: handleAccountDeleted, previewOnboarding }),
    [userProfile, handleAccountDeleted, previewOnboarding]);

  // 폰트 로드 실패해도(fontError) 시스템 폰트로 폴백하며 진행 — 앱이 멈추지 않게.
  // 콘텐츠(프로필·폰트) 준비 전엔 정적 로딩 화면, 준비된 뒤엔 SplashOverlay가 페이드아웃.
  const appReady = profileLoaded && (fontsLoaded || fontError) && minSplashDone;
  if (!profileLoaded || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paleSky }}>
        <SplashContent fadeIn />
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
    <KeyboardProvider>
    <SafeAreaProvider>
    <CurrentUidContext.Provider value={authUid}>
    <UserContext.Provider value={userCtxValue}>
    <SchedulesProvider>
    <DiariesProvider>
    <FriendBadgeContext.Provider value={{ friendReqCount, setFriendReqCount, refreshFriendBadge, scheduleInviteCount, roundupInviteCount, roundupInvites, declineRoundupInvite, refreshRoundupHidden }}>
    <InsetGate>
    <NavigationContainer
      ref={navigationRef}
      onReady={() => sentryNavigationIntegration?.registerNavigationContainer?.(navigationRef)}
    >
      <Tab.Navigator tabBar={props => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' },
          // 플로팅 유리 탭바 — position:absolute로 화면 위에 띄워 뒤 배경(홈 이미지 등)이 비치게. 씬은 전체 높이.
          tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 } }} backBehavior="history">
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
      <AppToastHost />

      {/* 라운딩 일정 알림 팝업 — 앱 전역(어느 탭에서나). 안 읽은 scheduleNotice가 있으면 모집 단위로 하나씩 표시. */}
      {(() => {
        if (scheduleNotices.length === 0) return null;
        const current = scheduleNotices[0];
        const otherPostIds = new Set(scheduleNotices.filter(n => n.postId !== current.postId).map(n => n.postId));
        return (
          <ScheduleReminderPopup
            notice={current}
            extraCount={otherPostIds.size}
            onConfirm={() => {
              // 같은 모집(postId)의 알림 모두 읽음 처리 → 화면에서 제거, 다음 모집 건이 있으면 이어서 표시
              const ids = scheduleNotices.filter(n => n.postId === current.postId).map(n => n.id);
              setScheduleNotices(prev => prev.filter(n => n.postId !== current.postId));
              ids.forEach(id => markNotificationRead(id).catch(() => {}));
            }} />
        );
      })()}
    </NavigationContainer>
    </InsetGate>
    </FriendBadgeContext.Provider>
    </DiariesProvider>
    </SchedulesProvider>
    </UserContext.Provider>
    </CurrentUidContext.Provider>
    </SafeAreaProvider>
    </KeyboardProvider>
    {/* 로딩 오버레이는 KeyboardProvider 밖(GestureHandlerRootView 직속)에 둔다 — 안에 두면 keyboard-controller가
        첫 마운트에 영역 높이를 측정하는 동안 absolute(bottom:0) 뷰의 center가 위→아래로 밀려, 로딩화면이
        살짝 내려오던 점프가 생김(2026-06-14 수정). 정적 로딩 View와 같은 위치 기준으로 맞춰 이음새 제거. */}
    <SplashOverlay appReady={appReady} />
    </GestureHandlerRootView>
  );
}

// 앱 전역 에러 경계 — 렌더 에러로 앱이 죽지 않고 "잠시 후 다시 시도해주세요" 안내를 띄운다.
//   ErrorBoundary가 App 트리 전체(로딩·온보딩·메인)를 감싼다. Sentry.wrap은 그 위에서 보고·성능 모니터링.
function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// Sentry.wrap — 루트 컴포넌트 감싸 자동 에러 캐치 + 성능 모니터링 활성화
export default Sentry.wrap(Root);
