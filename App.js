import 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback } from 'react';
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
    enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN, // DSN 없으면 비활성 (dev·미설정 환경 안전)
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
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SystemUI from 'expo-system-ui';
import { useFonts, Lora_500Medium_Italic } from '@expo-google-fonts/lora';
import { PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display';
import { C, F, fs } from './src/constants/colors';
import { USER_PROFILE_INIT } from './src/constants/data';
import { STORAGE_KEYS, storage } from './src/utils/storage';
import { loadMyBlockedUids, loadReceivedRequests } from './src/utils/friends';
import { syncFriendRequestLimitFromFirestore } from './src/utils/friendRequestLimit';
import { syncReportLimitFromFirestore } from './src/utils/reportLimit';
import { syncUserCoursesFromFirestore } from './src/utils/userCourses';
import { setupPushNotifications } from './src/utils/pushTokens';
import { db, getUid } from './src/utils/firebase';
import { fetchKakaoProfileImage } from './src/utils/kakaoAuth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import './src/utils/firebase'; // 앱 시작 시 Firebase 초기화 + 익명 로그인
import { UserContext } from './src/contexts/UserContext';
import { FriendBadgeContext } from './src/contexts/FriendBadgeContext';
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
import { ScheduleReminderPopup } from './src/components/ScheduleReminderPopup';
import { ErrorBoundary } from './src/components/common/ErrorBoundary';
import { subscribeMyNotifications, markNotificationRead } from './src/utils/roundupNotifications';
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

  // 친구 탭 탭바 뱃지 — 받은 친구신청 수. 친구신청 알림은 라운지 알림함에서 분리, 친구 탭에서만 표시.
  const [friendReqCount, setFriendReqCount] = useState(0);
  // 수동 갱신 폴백(컨텍스트 제공) — 리스너 붙기 전/오류 시 1회 조회용.
  const refreshFriendBadge = useCallback(async () => {
    try {
      const reqs = await loadReceivedRequests();
      setFriendReqCount(Array.isArray(reqs) ? reqs.length : 0);
    } catch (e) {
      if (__DEV__) console.warn('[App] friend badge refresh failed', e?.message);
    }
  }, []);
  // 받은 친구신청 실시간 구독 ([[lounge-realtime]] ② 친구신청) — 앱 켜둔 중에도 신청 도착·수락 시 뱃지 즉시 갱신.
  //   friendships: recipientUid==me && status=='pending'. 수락하면 pending에서 빠져 size 감소 → 자동 해제.
  //   kakaoLinked 변동(익명↔카카오) 시 재구독 — getUid가 안정 uid를 반환하도록 ([[auth-relink-and-seed-cleanup]]).
  useEffect(() => {
    if (showOnboarding || !profileLoaded) return;
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
  }, [showOnboarding, profileLoaded, userProfile.kakaoLinked]);

  // 라운딩 일정 알림(scheduleNotice) — 주최자의 '동반자에게 일정 알리기'를 수신자가 앱 어디서나 확인.
  //   실시간 구독([[lounge-realtime]]) — 앱 켜둔 중에도 주최자가 알리면 즉시 팝업. 본인 수신분만·최신 50건 좁게.
  //   kakaoLinked 변동(익명↔카카오) 시 재구독 — getUid가 안정 uid를 반환하도록 ([[auth-relink-and-seed-cleanup]]).
  const [scheduleNotices, setScheduleNotices] = useState([]);
  useEffect(() => {
    if (showOnboarding || !profileLoaded) return;
    return subscribeMyNotifications(list => {
      setScheduleNotices(list.filter(n => n.type === 'scheduleNotice' && !n.read));
    });
  }, [showOnboarding, profileLoaded, userProfile.kakaoLinked]);

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
      // 한도 카운터 2종 + 등록 코스 — 병렬 sync (개별 실패는 각 util이 자체 처리). 강퇴 폐기로 kick sync 제거.
      //   userCourses는 로컬 캐시를 Firestore로 복원 — 프레시 설치 시 홈 카드 코스이동·GuideScreen 매칭 회복.
      await Promise.all([
        syncFriendRequestLimitFromFirestore(),
        syncReportLimitFromFirestore(),
        syncUserCoursesFromFirestore(),
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
        // 카카오 프로필 사진 backfill ([[avatar-resignup-bug]]) — 연동됐는데 avatarUrl이 비어 있으면
        //   (재설치·재가입으로 푸시토큰만 먼저 생긴 빈 문서) 카카오 사진을 1회 소급 저장한다.
        //   친구가 사진을 못 보고 이니셜만 뜨던 문제 보정. 토큰 살아있을 때만(silent)·기존 값은 절대 덮어쓰지 않음.
        if (data.kakaoLinked === true && !data.avatarUrl) {
          const url = await fetchKakaoProfileImage({ silent: true });
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
    SystemUI.setBackgroundColorAsync(C.paleSky).catch(() => {});
  }, []);

  // 로딩 화면이 너무 빨리 사라지지 않게 — 최소 1.6초는 브랜드 화면을 보여준다
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 1600);
    return () => clearTimeout(t);
  }, []);

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
      'apply', 'confirmed', 'cancel', 'waitlist', 'kicked', 'slotOpen',
      'comment', 'mannerEval', 'hostCancelledD7', 'scheduleNotice', 'roundupChanged',
    ]);
    const handleResponse = (resp) => {
      if (!navigationRef.isReady()) return;
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
        const openPostId = (POST_DETAIL_TYPES.has(type) && data.postId) ? data.postId : null;
        navigationRef.navigate(ROUTES.LOUNGE, openPostId ? { openPostId } : undefined);
      } catch (e) { /* 네비게이션 미준비 */ }
    };
    // 앱이 종료된 상태에서 알림 탭으로 실행된 경우 — 네비게이션 준비 시간 확보
    Notifications.getLastNotificationResponseAsync().then(resp => {
      if (resp) setTimeout(() => handleResponse(resp), 400);
    });
    // 앱 실행 중 알림 탭
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, []);

  const handleOnboardingComplete = (data) => {
    // 기존 프로필과 병합 — 온보딩 data엔 statusMessage·departure·phone 등이 없어서, 통째 교체하면
    //   재온보딩(미리보기 포함) 시 그 필드들이 날아간다. 신규 사용자는 prev=USER_PROFILE_INIT라 결과 동일.
    setUserProfile(prev => ({ ...prev, ...data }));
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
    <KeyboardProvider>
    <SafeAreaProvider>
    <UserContext.Provider value={{ userProfile, setUserProfile, onAccountDeleted: handleAccountDeleted, previewOnboarding }}>
    <SchedulesProvider>
    <DiariesProvider>
    <FriendBadgeContext.Provider value={{ friendReqCount, setFriendReqCount, refreshFriendBadge }}>
    <NavigationContainer
      ref={navigationRef}
      onReady={() => sentryNavigationIntegration?.registerNavigationContainer?.(navigationRef)}
    >
      <Tab.Navigator tabBar={props => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }} backBehavior="history">
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
    </FriendBadgeContext.Provider>
    </DiariesProvider>
    </SchedulesProvider>
    </UserContext.Provider>
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
