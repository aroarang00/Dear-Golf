import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StatusBar, View, Text, TouchableOpacity, ScrollView,
  Share, Modal, LayoutAnimation, Platform, UIManager, Linking, AppState, Animated, Easing, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications'; // DM 푸시 포그라운드 수신 → 안읽음 뱃지 즉시 갱신
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { COURSE_LOG, DIARY_DATA, WEEKDAYS } from '../constants/data';
import { getUserCourses, syncUserCoursesFromFirestore } from '../utils/userCourses';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { normalizeSchedules } from '../utils/helpers';
import { homeS } from '../styles/homeS';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { HomeBgSlider, getCurrentWx } from './common/HomeBgSlider';
import { TripleStripe } from './common/TripleStripe';
import { ScheduleSheetModal } from './ScheduleSheetModal';
import { ShareMomentModal } from './ShareMomentModal';
import { ScheduleShareCard } from './ScheduleShareCard';   // 체크인 카드 전용(공유화면 없이 카드만) 뷰어용
import { AttentionMotion } from './common/AttentionMotion'; // 주목 유도 모션(맥동·nudge·부유) 공용 래퍼
import { ScheduleModal } from './ScheduleModal';
import { HomeIntroModal } from './HomeIntroModal';
import { ScheduleScreen } from './ScheduleScreen';
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { HomeTooltip } from './HomeTooltip';
import { AlarmSetupModal } from './AlarmSetupModal';
import { cancelRoundAlarms, scheduleRoundAlarms, getAlarmTypes, applyDefaultAlarms } from '../utils/notifications';
import { getTopComment } from '../utils/courseComments';
import { isRoundDiary } from '../utils/diaryKind';
import { loadFriendData } from '../utils/friendGroups';
import { DMListScreen } from './DMListScreen';
import { DMChatScreen } from './DMChatScreen';
import { loadUnreadTotal } from '../utils/dm';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { loadMyFriendsEnriched } from '../utils/friends';
import { shareScheduleToFriends, getScheduleGroup, notifyScheduleGroupMembers, leaveScheduleGroup } from '../utils/scheduleShares';
import { WEB_BASE } from '../utils/links';                 // 일정 공유 평문에 붙일 앱 랜딩/설치 링크
import { getScheduleWxSummary, getScheduleDriveMin } from '../utils/scheduleWx'; // 공유 카드 날씨 주입 + D-0 카드 우측 날씨·교통
import { loadRoundup } from '../utils/roundup';            // 고아 정리 — 모집 상태 직접 조회
import { deleteMeal } from '../utils/mealSuggestions';     // 고아 정리 — 식사 문서 정리
import { FriendSelectModal } from './FriendSelectModal';
import { ScheduleInviteInbox } from './ScheduleInviteInbox';
import { MealDecisionBar } from './MealDecisionBar';
import { showAppAlert } from './AppAlert';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function HomeScreen({ navigation, route }) {
  const { userProfile } = React.useContext(UserContext);
  const { schedules, hydrated, addSchedule, editSchedule, removeSchedule } = React.useContext(SchedulesContext);
  const currentUid = useCurrentUid();   // 일정 전파 초대 발신자 uid ([[uid-stabilization-plan]])
  const insets = useSafeAreaInsets();
  const [showAddModal, setShowAddModal] = useState(false);
  const [userCoursesList, setUserCoursesList] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // 동반자 별명(customName) 해석용 owner-only 메타 — 일정 시트에서 별명 표시 ([[friend_groups]])
  const [friendMeta, setFriendMeta] = useState({});
  useEffect(() => { loadFriendData().then(fd => setFriendMeta(fd.friendMeta || {})).catch(() => {}); }, []);
  const [showHomeIntro, setShowHomeIntro] = useState(false);   // Dear Golf 이용 안내 모달
  const [homeIntroSeen, setHomeIntroSeen] = useState(true);    // 초기 true(뱃지 X), AsyncStorage 로드 후 갱신
  const [showWeatherFull, setShowWeatherFull] = useState(false);
  const [showTrafficFull, setShowTrafficFull] = useState(false);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);
  const [showUpcomingList, setShowUpcomingList] = useState(false);
  const [showScheduleScreen, setShowScheduleScreen] = useState(false); // 일정(캘린더) 풀스크린
  const [upcomingPos, setUpcomingPos] = useState({ x: 0, y: 0 });
  const [editScheduleTarget, setEditScheduleTarget] = useState(null);
  // 친구 일정에 초대(일정 전파) — 대상 일정 + 친구목록 + 모달 ([[schedule-propagation-spec]])
  const [inviteTarget, setInviteTarget] = useState(null);
  const [inviteFriends, setInviteFriends] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sheetMealSchedule, setSheetMealSchedule] = useState(null); // 일정 시트 '함께 식사' 대상(triggerless) — 세컨 카드 등 next 아닌 일정용
  const [sheetMealAutoOpen, setSheetMealAutoOpen] = useState(false);
  const [pendingInviteSchedule, setPendingInviteSchedule] = useState(null); // 생성 직후 초대 제안 대상(알람 팝업 뒤)
  const [cardSlide, setCardSlide] = useState(0);
  const [now, setNow] = useState(Date.now());
  // 다이어리는 DiariesContext에서 받음 (Firestore 단일 소스)
  const { diaries } = React.useContext(DiariesContext);
  const [showTooltip, setShowTooltip] = useState(false);
  const [pendingAlarmSchedule, setPendingAlarmSchedule] = useState(null);
  const [dismissedCards, setDismissedCards] = useState({}); // 홈 종료 카드 나가기 — {scheduleId: true} (홈에서만 숨김)
  useEffect(() => { storage.load(STORAGE_KEYS.dismissedRoundCards, {}).then(setDismissedCards); }, []);
  // 종료 카드 나가기 — 홈에서만 숨김(기록 여부 무관). 일정·내코스모아보기는 그대로.
  const handleDismissCard = (s) => {
    if (!s?.id) return;
    setDismissedCards(prev => {
      const next = { ...prev, [s.id]: true };
      storage.save(STORAGE_KEYS.dismissedRoundCards, next);
      return next;
    });
  };
  const [homeTopComment, setHomeTopComment] = useState(null);
  const [wxEmoji, setWxEmoji] = useState('☀️'); // 헤더 현재 날씨 이모지

  // DM(메시지) — 진입점을 홈 우상단 💬로 일원화(테스터 '친구 탭은 불편' 피드백, 2026-06-17. 옛 친구 탭 💬 제거).
  //   단일 Modal서 목록↔대화방 전환([[dm-design]]). 안읽음 N 뱃지는 열고/닫을 때 1회 로드(상시구독 X, 비용 절약).
  const [dmOpen, setDmOpen] = useState(false);
  const [dmChat, setDmChat] = useState(null);   // { uid, name, avatar } 선택 시 대화방
  const [dmUnread, setDmUnread] = useState(0);
  // DM 안읽음 있을 때 버튼 '전체'가 진동하듯 좌우로 떨림(2초마다 1회 buzz). 원은 회전대칭이라 rotate면 숫자만 도는 것처럼
  //   보여 translateX로 떨어야 동그라미 전체가 흔들림. 사용자 요청 2026-06-18.
  const dmShake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!(dmUnread > 0)) { dmShake.setValue(0); return; }
    const buzz = (v) => Animated.timing(dmShake, { toValue: v, duration: 45, useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([
      buzz(1), buzz(-1), buzz(1), buzz(-1), buzz(1), buzz(-1), buzz(0),
      Animated.delay(2000),
    ]));
    loop.start();
    return () => { loop.stop(); dmShake.setValue(0); };
  }, [dmUnread]);
  const dmShift = dmShake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] });
  // 안읽음 0(idle)일 때 DM 버튼이 너무 밋밋(그냥 표식)해 은은하게 숨쉬듯 맥동(호흡 스케일)만.
  //   안읽음(>0) 생기면 진동(buzz)에 양보 — 루프 정지 + 값 0(스케일1)이라 두 애니가 겹치지 않음.
  const dmBreathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (dmUnread > 0) { dmBreathe.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dmBreathe, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(dmBreathe, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); dmBreathe.setValue(0); };
  }, [dmUnread]);
  const dmIdleScale = dmBreathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.13] });
  useEffect(() => { if (!dmOpen) loadUnreadTotal().then(setDmUnread).catch(() => {}); }, [dmOpen]);
  // 홈 탭 복귀(focus) 시 안읽음 카운트 재조회 — 마운트·DM모달 닫힘에만 갱신하면, 푸시로 다른 탭에서 DM을 읽었을 때
  //   홈의 dmUnread가 옛 값(>0)으로 남아 안읽음 없는데도 버튼이 흔들리던 버그 방지(+자리 비운 새 DM도 반영). 2026-06-18.
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('focus', () => {
      if (!dmOpen) loadUnreadTotal().then(setDmUnread).catch(() => {});
    });
    return unsub;
  }, [navigation, dmOpen]);
  // DM 푸시를 포그라운드(앱 켜둔 상태)에서 받으면 안읽음 뱃지 즉시 갱신 — 상시 onSnapshot 없이 '받은 사람만, 받은 만큼'만 1회 조회([[lounge-realtime]] 비용 원칙).
  //   CF가 unread를 +1 한 뒤 푸시를 보내므로 이 시점엔 카운트가 이미 맞음. DM 모달 열려있으면(대화 보는 중) 생략 — 닫을 때 위 effect가 갱신. 2026-06-18.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((noti) => {
      if (noti?.request?.content?.data?.type !== 'dm') return;
      if (!dmOpen) loadUnreadTotal().then(setDmUnread).catch(() => {});
    });
    return () => sub.remove();
  }, [dmOpen]);
  const cardsScrollRef = useRef(null);
  const upcomingLabelRef = useRef(null); // '예정 라운딩' 라벨 — 목록 팝업 위치 기준

  // 다이어리 추가 모달이 일정 모달에서 진입한 경우 → 닫을 때 일정 모달 자동 재오픈
  // ([[modal-navigation-pattern]] navigation 복귀 패턴, [[home-multi-schedule-same-day]])
  useEffect(() => {
    if (route?.params?.openSchedule) {
      setShowScheduleScreen(true);
      navigation.setParams({ openSchedule: undefined });
    }
  }, [route?.params?.openSchedule]);

  // 뒤풀이 푸시 탭 → 홈 착지 + 뒤풀이 시트 자동 오픈(푸시→길찾기 한 동선). MealDecisionBar에 autoOpen 신호 전달.
  const [autoOpenMeal, setAutoOpenMeal] = useState(false);
  useEffect(() => {
    if (route?.params?.openMeal) {
      setAutoOpenMeal(true);
      navigation.setParams({ openMeal: undefined });
    }
  }, [route?.params?.openMeal]);

  // 1분마다 현재 시각 갱신 — 라운딩 종료(티오프+4h)/자정 전환 감지
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // 헤더 날씨 이모지 — 날씨 상세탭과 동일한 소스(forecast.current.icon)를 공유 캐시로 받아 표시.
  // 앱 복귀(배경 톤과 동일 시점)·날씨 팝업 닫힘 때 갱신해 둘이 어긋나지 않게 한다.
  const refreshWxEmojiRef = useRef(() => {});
  useEffect(() => {
    let cancelled = false;
    const run = () => getCurrentWx().then(({ icon }) => { if (!cancelled) setWxEmoji(icon || '☀️'); });
    refreshWxEmojiRef.current = run;
    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => { cancelled = true; sub.remove(); };
  }, []);

  // 홈 첫 진입 안내 툴팁 — 최초 1회만
  useEffect(() => {
    storage.load(STORAGE_KEYS.homeTooltipDone, false).then(done => {
      if (!done) setShowTooltip(true);
    });
  }, []);

  // Dear Golf 이용 안내 모달 — 미열람 시 헤더에 빨간 점 뱃지로 호기심 유도
  useEffect(() => {
    storage.load(STORAGE_KEYS.homeIntroSeen, false).then(seen => setHomeIntroSeen(!!seen));
  }, []);

  const openHomeIntro = () => {
    setShowHomeIntro(true);
    if (!homeIntroSeen) {
      setHomeIntroSeen(true);
      storage.save(STORAGE_KEYS.homeIntroSeen, true);
    }
  };

  // '예정 라운딩' 라벨 탭 → 라벨 위쪽에 예정 라운딩 목록 팝업
  const openUpcomingList = () => {
    upcomingLabelRef.current?.measureInWindow((x, y) => {
      setUpcomingPos({ x, y });
      setShowUpcomingList(true);
    });
  };

  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('tabPress', () => {
      setShowAddModal(false);
      setShowScheduleModal(false);
      setShowWeatherFull(false);
      setShowTrafficFull(false);
      setShowWeatherPopup(false);
      setEditScheduleTarget(null);
      setSelectedSchedule(null);
      setPendingAlarmSchedule(null);
      setShowScheduleScreen(false);
      setShowUpcomingList(false);
    });
    return unsubscribe;
  }, [navigation]);

  // 다른 탭에서 홈으로 돌아오면 D-day 카드 스크롤을 첫번째(메인카드)로 초기화
  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('focus', () => {
      cardsScrollRef.current?.scrollTo({ x: 0, animated: false });
      // userCourses 최신화 — 코스명→id 매칭(resolveCourseLogId)이 최신 목록을 쓰도록
      getUserCourses().then(list => setUserCoursesList(list || []));
      // 다이어리는 DiariesContext가 단일 소스 — 별도 로드 불필요 (Firestore 동기화는 Context가 담당)
    });
    return unsubscribe;
  }, [navigation]);

  // userCourses 사전 로드 — 코스명으로 user-added 코스 매칭하기 위함.
  //   Firestore에서 복원·머지(프레시 설치 시 코스 비어 코스이동·">"가 사라지던 문제 회복, [[data-migration]]).
  useEffect(() => {
    (async () => {
      const list = await syncUserCoursesFromFirestore();
      setUserCoursesList(list || []);
    })();
  }, []);

  // 홈 D-day 카드 — 날짜 기준(자정 넘어가면 자동 갱신) + 다이어리 기록 완료분 제외
  const now0 = (() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const parseSchedDate = (s) => {
    const [y, m, d] = (s?.date || '').split('.').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
  };
  // 같은 날 일정 정렬 보조 키 — 시간 분 단위 (오전·오후 같은 날 2건 시간순 보장)
  // 빈 time(자동 등록 등)은 정렬 끝으로 — 시간 정보 있는 일정 우선
  const parseSchedTime = (s) => {
    if (!s?.time) return 24 * 60;
    const [hh, mm] = s.time.split(':').map(Number);
    return (hh || 0) * 60 + (mm || 0);
  };
  // 일정-다이어리 매칭 — scheduleId 우선, course+date fallback ([[home-multi-schedule-same-day]] 룰3)
  // 일정에 매칭된 다이어리 반환(isRecorded와 동일 규칙) — '기록 보기'에서 해당 상세로 직행하기 위함
  const recordedDiary = (s) => {
    if (!s) return null;
    if (s.id) { const m = diaries.find(d => d.scheduleId === s.id); if (m) return m; }
    return diaries.find(d => d.course === s.course && d.date === s.date && !d.scheduleId) || null;
  };
  const isRecorded = (s) => !!recordedDiary(s);

  // 모집 확정 해제·삭제 시 고아 일정·식사 정리 (옵션1) — 라운지 탭 의존 없이 홈에서 모집 상태를 '직접 조회'해 정리.
  //   기존엔 RoundupTab reconcile이 라운지 posts 로드 때만 돌아 '라운지 열어야 정리'되는 지연 갭이 있었음([[diary-schedule-orphan-fix]]).
  //   ★오삭제 방지: 모집 조회 성공 + 명확히 비확정/미참여(또는 모집 삭제=null)일 때만 삭제. 조회 throw(네트워크·권한)는 보존.
  //   기록 연결 일정(isRecorded)은 보존. 식사 문서(meal_{roundupId})는 작성자·주최자만 규칙상 삭제됨(아니면 무해).
  const reconcileRoundupOrphans = useCallback(async () => {
    if (!currentUid) return;
    const list = schedules || [];
    const rids = [...new Set(list.filter(s => s.roundupId).map(s => s.roundupId))];
    for (const rid of rids) {
      let post;
      try { post = await loadRoundup(rid); }   // 미존재(삭제)=null 반환 / 에러=throw → catch에서 skip
      catch { continue; }                       // 조회 실패(네트워크·권한) → 손대지 않음(오삭제 방지)
      const valid = !!post && post.closed &&
        (post.authorUid === currentUid || (Array.isArray(post.participantUids) && post.participantUids.includes(currentUid)));
      if (valid) continue;                      // 확정 + 내가 속함 → 정상 유지
      const targets = list.filter(s => s.roundupId === rid && !isRecorded(s)); // 기록 연결 일정은 보존
      for (const s of targets) { await removeSchedule(s.id).catch(() => {}); }
      if (targets.length) { deleteMeal(rid, 1).catch(() => {}); deleteMeal(rid, 2).catch(() => {}); } // 식사 문서도 정리
    }
  }, [currentUid, schedules, diaries, removeSchedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // 마운트·schedules/diaries 변화 시 + 홈 focus 시 정리(라운지 안 열어도 즉시 반영).
  useEffect(() => { if (hydrated) reconcileRoundupOrphans(); }, [hydrated, reconcileRoundupOrphans]);
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('focus', () => { reconcileRoundupOrphans(); });
    return unsub;
  }, [navigation, reconcileRoundupOrphans]);
  // 자정 기준 재계산 D-day / 라운딩 종료 판정(티오프 + 4시간 — 후반 막바지, 식사·기록 동선)
  // 매너평가 윈도우(티오프+5h)와 의도적으로 다름: 홈은 끝나갈 때 진입, 매너평가는 실제 종료 후
  const freshDDay = (s) => (s ? Math.max(0, Math.round((parseSchedDate(s) - now0) / 86400000)) : 0);
  const teeoffEndMs = (s) => {
    const [hh, mm] = (s?.time || '08:00').split(':').map(Number);
    return parseSchedDate(s) + (hh || 8) * 3600000 + (mm || 0) * 60000 + 4 * 3600000;
  };
  // 티오프 시각(ms) — 당일 체크인 카드 배너 노출 창 계산용
  const teeoffMs = (s) => {
    const [hh, mm] = (s?.time || '08:00').split(':').map(Number);
    return parseSchedDate(s) + (hh || 8) * 3600000 + (mm || 0) * 60000;
  };
  // 오늘 라운딩 종료(티오프+4h) 카드 — 기록해도 사라지지 않고 "기록 완료"로 유지(교통·맛집 동선), 나가기/자정까지.
  const isEndedToday = (s) => freshDDay(s) === 0 && now >= teeoffEndMs(s);
  const isDismissed = (s) => !!(s && s.id && dismissedCards[s.id]);
  const upcomingSchedules = schedules
    .filter(s => parseSchedDate(s) >= now0 && !isDismissed(s) && (!isRecorded(s) || isEndedToday(s)))
    .sort((a, b) => parseSchedDate(a) - parseSchedDate(b) || parseSchedTime(a) - parseSchedTime(b));
  const next = upcomingSchedules.length > 0 ? upcomingSchedules[0] : null;
  const roundEnded = !!next && isEndedToday(next);
  // D-0(당일) — 메인 카드를 전폭으로 키우고 서브카드를 숨김(정보 박스 3개가 다 들어가게, 사용자 2026-06-18)
  const isD0 = !!next && freshDDay(next) === 0;
  // 당일 체크인 카드 배너 — D-0이고 티오프 30분 후까지(프론트 체크인용), 종료(+4h) 전. 탭하면 공유 카드 전체화면 ([[schedule-booker]])
  const checkinActive = !!next && isD0 && !roundEnded && now < teeoffMs(next) + 30 * 60000;
  const { width: winW } = useWindowDimensions();
  // 체크인 배너 맥동 — 활성일 때만 루프(은은한 scale + 골드 오버레이 opacity 펄스). MyScheduleTab 코스버튼과 동일 톤.
  //   ★LinearGradient를 Animated.View 안에 넣었더니 런타임 에러나서, 글로우는 단순 골드 오버레이 opacity 펄스로(안전).
  const checkinPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!checkinActive) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(checkinPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(checkinPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [checkinActive]);
  const checkinScale = checkinPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const checkinGlow = checkinPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] });

  // D-0 카드 우측 날씨·교통 채움 — 큰 이모지만 두면 휑해서 실제 정보로(사용자 2026-06-20).
  //   날씨=getScheduleWxSummary(캐시), 교통=getScheduleDriveMin(출발지 저장 시 경로 1회 조회). 당일 카드일 때만.
  const [d0Info, setD0Info] = useState({ wx: '', drive: null, icon: '' });
  useEffect(() => {
    if (!isD0 || !next) { setD0Info({ wx: '', drive: null, icon: '' }); return; }
    let alive = true;
    setD0Info({ wx: '', drive: null, icon: '' });
    getScheduleWxSummary(next).then(w => { if (alive && w) setD0Info(p => ({ ...p, wx: w.summary, icon: w.icon || '' })); }).catch(() => {});
    const home = userProfile?.departureCoord;
    if (home && typeof home.x === 'number' && typeof home.y === 'number') {
      getScheduleDriveMin(next, home).then(m => { if (alive && m) setD0Info(p => ({ ...p, drive: m })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [isD0, next?.id, next?.course, userProfile?.departureCoord?.x, userProfile?.departureCoord?.y]);

  const carouselActive = React.useMemo(() => {
    const course = next?.course;
    if (!course) return false;
    const hasMyMemo = diaries.some(d => isRoundDiary(d) && d.course === course && d.memo); // 일상(모멘트) 제외
    if (!hasMyMemo) return false;
    return !!homeTopComment;
  }, [next?.course, diaries, homeTopComment]);

  useEffect(() => {
    if (!carouselActive) {
      setCardSlide(0);
      return;
    }
    const id = setInterval(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCardSlide(prev => (prev === 0 ? 1 : 0));
    }, 5000);
    return () => clearInterval(id);
  }, [carouselActive]);

  const toggleCardSlide = () => {
    if (!carouselActive) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCardSlide(prev => (prev === 0 ? 1 : 0));
  };

  // 일정 → 코스 상세에 쓸 id (COURSE_LOG id 우선, 없으면 userCourses id).
  // GuideScreen이 둘 다 처리하므로 어느 쪽이든 OK.
  const resolveCourseLogId = (schedule) => {
    if (!schedule) return null;
    if (schedule.courseLogId) return schedule.courseLogId;
    const name = (schedule.course || '').toLowerCase().trim();
    if (name) {
      const exact = COURSE_LOG.find(c => c.name.toLowerCase() === name);
      if (exact) return exact.id;
      const fuzzy = COURSE_LOG.find(c => {
        const n = c.name.toLowerCase();
        return n.includes(name) || name.includes(n);
      });
      if (fuzzy) return fuzzy.id;
    }
    // userCourses fallback — 카카오 검색으로 추가한 코스(블루헤런 등)
    if (schedule.courseId) return schedule.courseId;
    // 코스명으로 userCourses 매칭 (사용자가 카카오 없이 타이핑만 한 케이스)
    if (name) {
      const userCourse = userCoursesList.find(c => c.name.toLowerCase() === name);
      if (userCourse) return userCourse.id;
    }
    return null;
  };

  // 다음 라운딩 코스 id — COURSE_LOG·userCourses 모두 해석.
  const nextCourseId = resolveCourseLogId(next);

  // 코멘트 조회 키 — 상세화면(GuideScreen.commentKeyFor)과 반드시 동일 체계여야 함.
  // 카카오로 등록된 코스는 'kakao:{kakaoId}'로 키 통일(상세에서 그 키로 저장하므로).
  // 이게 안 맞으면 코멘트가 있어도 홈에서 못 찾아 '골퍼 코멘트 없어요'로 표시됨.
  const nextCommentKey = (() => {
    if (!nextCourseId) return null;
    const d = COURSE_LOG.find(c => c.id === nextCourseId) || userCoursesList.find(c => c.id === nextCourseId);
    return d?.kakaoId ? `kakao:${d.kakaoId}` : nextCourseId;
  })();

  // 홈 골퍼 코멘트 — 다음 라운딩 코스의 좋아요 1위 코멘트 (Firestore 공유)
  useEffect(() => {
    if (!nextCommentKey) { setHomeTopComment(null); return; }
    let cancelled = false;
    setHomeTopComment(null); // 코스 바뀜 — 이전 코스 코멘트 잔상 방지
    getTopComment(nextCommentKey).then(c => { if (!cancelled) setHomeTopComment(c); });
    return () => { cancelled = true; };
  }, [nextCommentKey]);

  // 코스 탭으로 이동 — id로 해석되면 그 코스, 아니면 이름/kakaoId로 (GuideScreen이 카카오 검색해 연다).
  //   일정엔 코스 이름이 항상 있으므로 '코스 가기'는 항상 동작 (로컬 userCourses·courseId 유무와 무관, [[course-name-input]]).
  const handleCardCoursePress = (schedule) => {
    if (!schedule) return;
    const id = resolveCourseLogId(schedule);
    if (id) { navigation.navigate(ROUTES.COURSE, { openCourseId: id }); return; }
    if (schedule.course) {
      navigation.navigate(ROUTES.COURSE, {
        openCourseName: schedule.course,
        openCourseKakaoId: schedule.courseKakaoId || null,
      });
    }
  };
  // '코스 가기' 어포던스(›) 표시 여부 — 코스 이름만 있어도 열 수 있으므로 이름 유무로 판단.
  const canOpenCourse = (s) => !!(s && (resolveCourseLogId(s) || s.course));

  const openScheduleSheet = (schedule) => {
    // 일정 시트(ScheduleSheetModal)가 D-day를 표시하므로 항상 최신 D-day를 주입
    setSelectedSchedule(schedule ? { ...schedule, dDay: freshDDay(schedule) } : schedule);
    setShowScheduleModal(true);
  };

  // 친구 일정에 초대(일정 전파 발신) — 친구 선택 → 인앱 초대 발송 + 내 일정에 groupId 스탬프(전파 표식) ([[schedule-propagation-spec]])
  const handleInviteFriends = async (schedule) => {
    if (!schedule) return;
    setShowScheduleModal(false);
    setInviteTarget(schedule);
    try { setInviteFriends(await loadMyFriendsEnriched()); } catch { setInviteFriends([]); }
    setInviteOpen(true);
  };
  const submitInviteFriends = async ({ selectedUids } = {}) => {
    setInviteOpen(false);
    const schedule = inviteTarget;
    const uids = (selectedUids || []).filter(Boolean);
    setInviteTarget(null);
    if (!schedule || !uids.length) return;
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    try {
      // 초대 친구 이름맵 — FriendSelectModal에 넘긴 친구목록(inviteFriends)에서 uid→이름 추출(그룹에 저장)
      const names = {};
      (inviteFriends || []).forEach(f => { const id = f.id || f.uid; if (id && uids.includes(id)) names[id] = f.customName || f.name || ''; });
      const groupId = await shareScheduleToFriends({
        schedule, initiatorUid: currentUid, initiatorName: userProfile?.nickname || '', friendUids: uids, names,
      });
      if (!groupId) { showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.'); return; }
      if (!schedule.groupId) await editSchedule(schedule.id, { groupId }); // 전파 일정 표식
      showAppAlert('초대를 보냈어요', `친구 ${uids.length}명에게 일정 초대를 보냈어요.\n상대가 수락하면 그 친구 일정에도 등록돼요.`);
    } catch (e) {
      if (__DEV__) console.warn('[home] invite schedule', e?.message);
      showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.');
    }
  };
  // 이미 선택한 동반자(친구)에게 일정 바로 발송 — 생성 직후 '보내기' 전용(친구 재선택 X). ([[schedule-propagation-spec]])
  const inviteCompanionsDirectly = async (schedule) => {
    const friendUids = [...new Set((schedule?.companions || []).map(c => c?.friendUid).filter(Boolean))];
    if (!friendUids.length) return;
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    try {
      // 동반자 이름맵 — schedule.companions(친구선택 시 이름 보유)에서 추출
      const names = {};
      (schedule?.companions || []).forEach(c => { if (c?.friendUid && c?.name) names[c.friendUid] = c.name; });
      const groupId = await shareScheduleToFriends({
        schedule, initiatorUid: currentUid, initiatorName: userProfile?.nickname || '', friendUids, names,
      });
      if (!groupId) { showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.'); return; }
      if (!schedule.groupId) await editSchedule(schedule.id, { groupId });
      showAppAlert('초대를 보냈어요', `동반자 ${friendUids.length}명에게 일정 초대를 보냈어요.\n수락하면 그 친구 일정에도 등록돼요.`);
    } catch (e) {
      if (__DEV__) console.warn('[home] invite companions', e?.message);
      showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.');
    }
  };
  // 일정 생성 직후 초대 제안 — 친구 동반자가 있을 때만. [보내기]=이미 고른 동반자에게 바로 발송(재선택 X). ([[schedule-propagation-spec]])
  const offerInviteAfterCreate = (schedule) => {
    showAppAlert('동반자에게 보낼까요?', '방금 선택한 동반자에게 이 일정을 보내면, 수락 시 그 친구 일정에도 등록돼요.', [
      { text: '나중에', style: 'cancel' },
      { text: '보내기', onPress: () => inviteCompanionsDirectly(schedule) },
    ]);
  };

  const openCurrentWeather = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
    const currentLocationSchedule = {
      course: '현재 위치',
      date: dateStr,
      day: WEEKDAYS[today.getDay()],
      time: '--:--',
      members: 0,
      dDay: 0,
      weather: '맑음 18°',
      wind: '',
      duration: '',
    };
    setSelectedSchedule(currentLocationSchedule);
    setShowWeatherPopup(true);
  };

  const [scheduleShareTarget, setScheduleShareTarget] = useState(null); // 일정 공유 카드 모달 대상
  const [checkinCard, setCheckinCard] = useState(null); // 당일 체크인 — 공유화면 없이 카드만 깔끔히 띄우기
  // 체크인 카드 — 카드만 전체화면(프론트 체크인용). 해당일 날씨 비동기 주입(코스명 위).
  const openCheckinCard = (s) => {
    if (!s) return;
    const target = { ...s };
    setCheckinCard(target);
    if (!target.weather) {
      getScheduleWxSummary(target).then(w => {
        if (w) setCheckinCard(prev => (prev && prev.date === target.date && prev.course === target.course) ? { ...prev, weather: w.summary, weatherIcon: w.icon } : prev);
      }).catch(() => {});
    }
  };
  // 일정 공유 평문(설치 링크 동선) — 카드 모달의 '링크 공유' 옵션에서 사용
  const buildScheduleMsg = (s) => {
    const lines = [
      '[ Dear Golf ]', s.course, `${s.date} ${s.day}요일 ${s.time}`, `${s.members}명 동반 · D-${s.dDay}`,
    ];
    if (s.weatherText) lines.push(`예상 날씨 ${s.weatherText}`); // 실제 예보(기온·강수확률) 있을 때만 — 없으면 생략(가짜 '맑음' 안 보냄)
    lines.push('티오프 30분 전 도착을 권장해요', '', '라운딩의 모든 순간을 더 특별하게', 'Dear Golf ⛳', WEB_BASE);
    return lines.join('\n');
  };
  const shareScheduleText = async (s) => {
    if (!s) return;
    try { await Share.share({ message: buildScheduleMsg(s) }); }
    catch (e) { console.warn('[share schedule]', e?.message); }
  };
  // D-day 카드 공유 → 카드 모달(이미지 바로공유/저장 + 링크). 시트 닫고 홈 레벨에서 열어 3중 Modal 회피.
  const handleShareSchedule = (s) => {
    if (!s) return;
    setShowScheduleModal(false);
    setScheduleShareTarget(s);
    // 해당일 날씨를 비동기로 주입 — 카드는 즉시 뜨고, 예보가 오면 코스명 위에 표시(예보 범위 밖이면 그대로 없음).
    //   캡처 전에 도착하면 이미지에도 포함. 대상이 바뀌었으면(다른 일정) 덮어쓰지 않도록 date+course 일치 확인.
    if (!s.weather) {
      getScheduleWxSummary(s).then(w => {
        if (!w) return;
        setScheduleShareTarget(prev => (prev && prev.date === s.date && prev.course === s.course) ? { ...prev, weather: w.summary, weatherText: w.detail, weatherIcon: w.icon } : prev);
      }).catch(() => {});
    }
  };

  const handleEditSchedule = (s) => {
    setShowScheduleModal(false);
    setEditScheduleTarget(s);
  };

  const handleScheduleSave = async (type, data) => {
    if (type === 'schedule') {
      let newS;
      try {
        newS = await addSchedule({
          course: data.course, date: data.date, day: data.day || '토',
          time: data.time || '08:00', members: data.members || 4,
          courseLogId: data.courseLogId || null,
          courseId: data.courseId || null,
          courseLoc: data.courseLoc || null, // 코스 주소 — 지역탭 분류용([[region-classification]])
          courseKakaoId: data.courseKakaoId || null, // 코스 가기(프레시설치) 매칭용
          companions: Array.isArray(data.companions) ? data.companions : [], // 동반자
          booker: data.booker || '',                 // 예약자(체크인 이름)
          subCourse: data.subCourse || '',           // 코스(세부코스 라벨)
        });
      } catch (e) {
        console.warn('[home] schedule add failed:', e?.message);
        return;
      }
      // 새로 등록된 userCourse 반영 (코스명→id 매칭 최신화)
      getUserCourses().then(list => setUserCoursesList(list || []));
      // (캘린더 추가는 addSchedule이 일괄 처리)
      // 친구 동반자가 있으면 생성 직후(알람 팝업 뒤) 일정 전파 초대 제안 ([[schedule-propagation-spec]] A안)
      const hasFriendCompanions = Array.isArray(data.companions) && data.companions.some(c => c?.friendUid);
      // 일정 추가 완료 → 알람 팝업 (다시 묻지 않기 설정 시 기본값 자동 적용)
      if (userProfile.alarmPromptDisabled) {
        applyDefaultAlarms(newS, userProfile.alarmDefaults);
        if (hasFriendCompanions) offerInviteAfterCreate(newS);   // 알람 팝업 없음 → 바로 제안
      } else {
        setPendingAlarmSchedule(newS);
        if (hasFriendCompanions) setPendingInviteSchedule(newS); // 알람 팝업 닫힌 뒤 제안
      }
    } else if (type === 'schedule-edit') {
      try {
        await editSchedule(data.id, {
          course: data.course, date: data.date, day: data.day,
          time: data.time, members: data.members,
          courseId: data.courseId || null,
          courseLoc: data.courseLoc || null, // 코스 주소 — 지역탭 분류용([[region-classification]])
          courseKakaoId: data.courseKakaoId || null,
          companions: Array.isArray(data.companions) ? data.companions : [],
          booker: data.booker || '',                 // 예약자(체크인 이름)
          subCourse: data.subCourse || '',           // 코스(세부코스 라벨)
        });
      } catch (e) {
        console.warn('[home] schedule edit failed:', e?.message);
        return;
      }
      getUserCourses().then(list => setUserCoursesList(list || []));
      // 전파 일정(groupId)이고 핵심 정보(날짜·시간·코스) 변경 시 → 동반자 알림 여부 prompt(알림 기본). ([[schedule-propagation-spec]])
      const oldS = editScheduleTarget;
      const material = oldS?.groupId && (oldS.date !== data.date || oldS.time !== data.time || oldS.course !== data.course);
      if (material && currentUid) {
        // 수정 모달이 닫힌 뒤 뜨도록 지연(showAppAlert가 닫히는 모달 위에 겹치면 터치 충돌 — 알려진 이슈)
        setTimeout(() => showAppAlert('동반자에게 알릴까요?', '변경된 일정을 함께하는 동반자에게 알려요.', [
          { text: '조용히 저장', style: 'cancel' },
          { text: '알리고 저장', onPress: async () => {
              try {
                const group = await getScheduleGroup(oldS.groupId);
                await notifyScheduleGroupMembers({ group, myUid: currentUid, type: 'scheduleChanged',
                  actorName: userProfile?.nickname || '', course: data.course, date: data.date, time: data.time });
              } catch (e) { if (__DEV__) console.warn('[home] notify changed', e?.message); }
            } },
        ]), 350);
      }
      // 알람이 설정된 일정이면 변경된 날짜·시간으로 재예약
      getAlarmTypes(data.id).then(types => {
        if (types && types.length) {
          scheduleRoundAlarms(
            { id: data.id, course: data.course, date: data.date, time: data.time },
            types,
          );
        }
      });
      // (캘린더 갱신은 editSchedule이 일괄 처리)
    }
  };

  // 일정초대 배너가 떠 있는 동안엔 아래 한줄메모/코멘트 카드를 숨겨 좁은 화면 겹침을 막는다(수락/거절 후 복원).
  const [scheduleInvitePending, setScheduleInvitePending] = useState(false);

  // 하단 캘린더 알약 라벨 — 오늘 날짜·요일 노출(진입 유도 + 정보 겸용). 렌더마다 계산이라 자정 넘어가도 갱신.
  const _today = new Date();
  const todayLabel = `${_today.getMonth() + 1}월 ${_today.getDate()}일 (${WEEKDAYS[_today.getDay()]})`;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
      <StatusBar barStyle="light-content" />
      <HomeBgSlider />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* SafeArea top: iOS는 노치, Android는 status bar 자동 padding.
            ※ currentHeight 수동 패딩(b63920e) 롤백 — 안드 edge-to-edge에서 SafeArea와 이중 적용돼
            삼선바가 과하게 내려오는 부작용(흔들림도 못 고침). 흔들림은 dev로 insets 실측 후 재시도 ([[cross-platform-check]])
            하단은 SafeArea 안 함 — 탭바가 자체 처리하고 안드로이드 navigation bar는 bottomArea가 처리 */}
        <TripleStripe style={{ marginTop: Platform.OS === 'android' ? 8 : 0 }} />
        <View style={homeS.hdr}>
          <Text style={homeS.hdrSub}>라운딩의 모든 순간을 더 특별하게</Text>
          {/* 타이틀 줄 — Dear Golf + 날씨 + DM 💬. 💬는 날씨 아이콘 우상단에 살짝 띄워(브랜드가 말하는 말풍선 느낌),
              너무 붙지 않게 간격(marginLeft)·위로 올림(marginTop 음수). 사용자 위치 지정 2026-06-17. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={homeS.hdrTitle} numberOfLines={1} allowFontScaling={false}>Dear Golf</Text>
              <TouchableOpacity onPress={openCurrentWeather} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 12 }}>
                <Text style={{ fontSize: fs(28), marginTop: 4 }}>{wxEmoji}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setDmOpen(true)} activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginTop: -28, marginRight: 0 }}>
              {/* DM 커스텀 버튼 — 반투명 버터 동그라미 + 균일 테두리. 안읽음=버건디+숫자. 안읽음 시 좌우 진동.
                  ★드롭섀도 제거(2026-06-18): 반투명 배경을 그림자가 투과해 iOS/안드 릴리즈에서 'DM 뒤 뿌연 팔각형'
                  아티팩트가 보였음(배경 없는 뷰의 그림자 다각형 근사 + elevation 팔각형). 깔끔함 우선으로 그림자 제거. */}
              <Animated.View style={{ width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                transform: [{ translateX: dmShift }] }}>
                <Animated.View style={{ transform: [{ scale: dmIdleScale }] }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: C.butter,
                    backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.2, borderColor: C.butter,
                      backgroundColor: dmUnread > 0 ? C.burgundy : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: dmUnread > 0 ? F.sysB : F.brand,
                        fontSize: fs(dmUnread > 0 ? (dmUnread > 99 ? 10 : 13) : 13), lineHeight: fs(13),
                        color: C.butter, letterSpacing: 0.3, includeFontPadding: false,
                        /* 안드는 includeFontPadding:false로 -1에서 정확히 센터. iOS는 그 보정이 없어 'DM'이 위로 치우쳐 +2로 내려 원 안 정중앙에 맞춤(살짝 높던 것 보정). */
                        marginTop: dmUnread > 0 ? (Platform.OS === 'ios' ? 1 : 0) : (Platform.OS === 'ios' ? 2 : -1) }}>
                        {dmUnread > 0 ? (dmUnread > 99 ? '99+' : dmUnread) : 'DM'}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              </Animated.View>
            </TouchableOpacity>
          </View>
          <Text style={homeS.hdrGreeting}>
            안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
          </Text>
          {/* 당일 체크인 카드 배너 — 박스가 많아 정신없어, 이용안내 띠 '자리'에 대신 노출(둘 다 안 띄움). 활성 아니면 이용안내 띠. */}
          {checkinActive ? (
            <Animated.View style={{ marginTop: Platform.OS === 'android' ? 13 : 15, borderRadius: 12, transform: [{ scale: checkinScale }],
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 2.5, elevation: 3 }}>
              <TouchableOpacity onPress={() => openCheckinCard(next)} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden',
                  backgroundColor: 'rgba(245,230,168,0.16)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.5)',
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                {/* 안쪽 골드 글로우 — 맥동에 맞춰 opacity 펄스 */}
                <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(245,230,168,0.55)', opacity: checkinGlow }} />
                <Text style={{ fontSize: fs(18) }}>🎫</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>오늘 라운딩 · 체크인 카드</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.78)', marginTop: 1 }} numberOfLines={1}>
                    {next.booker ? `예약자 ${next.booker} · 탭하면 전체화면` : '탭하면 전체화면으로 보여드려요'}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter }}>›</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
          /* Dear Golf 이용 안내 진입 — 안녕하세요 아래 가로 띠. 미열람 시 빨간 점으로 호기심 유도. */
          <TouchableOpacity onPress={openHomeIntro} activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: Platform.OS === 'android' ? 6 : 8, marginTop: Platform.OS === 'android' ? 13 : 15,
              backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)',
              borderRadius: 10,
              paddingHorizontal: Platform.OS === 'android' ? 10 : 12,
              paddingVertical: Platform.OS === 'android' ? 5 : 7, alignSelf: 'flex-start' }}>
            <View>
              <Text style={{ fontSize: Platform.OS === 'android' ? fs(18) : fs(22) }}>💡</Text>
              {!homeIntroSeen && (
                <View style={{ position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5,
                  backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)' }} />
              )}
            </View>
            <View>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff', includeFontPadding: false }}>Dear Golf 이용 안내</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.7)', marginTop: 1, includeFontPadding: false }}>
                {homeIntroSeen ? '기능 한눈에 보기' : '처음이신가요? 한 번 열어보세요'}
              </Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: 'rgba(255,255,255,0.6)', marginLeft: 2 }}>›</Text>
          </TouchableOpacity>
          )}
        </View>

        {/* 일정 전파 수신 — 친구가 보낸 일정 초대 배너(홈 상단). 수락 시 내 일정·캘린더에 자기파생 ([[schedule-propagation-spec]]) */}
        <ScheduleInviteInbox onActiveChange={setScheduleInvitePending} />

        {next ? (
        <>
        <View style={{ flex: 1 }} />
        <View style={[homeS.bottomArea, { paddingBottom: 0 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, marginBottom: 8 }}>
            <TouchableOpacity
              ref={upcomingLabelRef}
              onPress={() => setShowScheduleScreen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.24)',
                paddingHorizontal: 12, paddingVertical: 6,
                borderRadius: 20,
              }}>
              <Text style={{ fontSize: fs(16) }}>📅</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: 'rgba(255,255,255,0.95)' }}>{todayLabel}</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: '#fff' }}>›</Text>
            </TouchableOpacity>
            {upcomingSchedules.length < 10 && (
              <TouchableOpacity onPress={() => setShowAddModal(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(17), color: 'rgba(255,255,255,0.9)' }}>+ 추가</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* (체크인 배너는 헤더 '이용 안내' 자리로 이동 — 박스 중복 제거) */}
          <ScrollView ref={cardsScrollRef} horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {/* D-0이면 첫 카드 전폭(이후 서브카드는 옆으로 스와이프해서 봄). 높이는 D-N과 동일 고정. D-N이면 기존 고정폭 카드. */}
            <View style={isD0
              ? { width: winW - 40, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: Platform.OS === 'android' ? 13 : 16, height: 234 }
              : homeS.mainCard}>
              {(freshDDay(next) === 0) ? (
                <>
                  {/* D-0 카드(전폭) — 상단 좌(정보 박스)·우(날씨교통, 박스X 큰 이모지) + 우측하단 나가기 + 하단 함께식사 긴 박스.
                      티오프+4h는 좌측 박스 내용만 토글([[home-round-ended-threshold]] 2026-06-18 재정의) */}
                  <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                    {/* 좌 칼럼 — 정보(구장) 박스 + 함께식사 박스 세로 스택(같은 너비) */}
                    <View style={{ flex: 1.4 }}>
                    {/* 좌 — 정보 박스 (전: 구장+시간+D-0 / 후: 종료배지+구장+기록 안내) */}
                    {roundEnded ? (
                      <View style={{ flex: 1, paddingTop: 2 }}>
                        <View style={{ backgroundColor: 'rgba(245,230,168,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.butter, letterSpacing: 1 }}>{isRecorded(next) ? '기록 완료' : '라운딩 종료'}</Text>
                        </View>
                        <Text style={[homeS.cardCourse, { marginTop: 8, marginBottom: 0, fontSize: fs(Platform.OS === 'android' ? 21 : 18), lineHeight: Platform.OS === 'android' ? 27 : 23 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>{next.course}</Text>
                        <Text style={[homeS.cardDate, { marginTop: 4 }]}>{next.date.slice(5)} {next.day} · {next.time} · {next.members}명</Text>
                        {isRecorded(next) ? (
                          <TouchableOpacity activeOpacity={0.85} style={{ marginTop: 16 }}
                            onPress={() => { const d = recordedDiary(next); navigation.navigate(ROUTES.MY, d ? { openDiaryId: d.id, returnToHome: true } : {}); }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>기록 완료 ✓</Text>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>기록 보기 →</Text>
                          </TouchableOpacity>
                        ) : (
                          // 종료·미기록 D-0 — 핵심 동선(기록) 유도로 화살표 콕콕 nudge (시간한정이라 노이즈 X) ([[attention-motion]])
                          <AttentionMotion type="nudge" distance={5} style={{ marginTop: 16, alignSelf: 'flex-start' }}>
                            <TouchableOpacity activeOpacity={0.85}
                              onPress={() => navigation.navigate(ROUTES.MY, {
                                openAddModal: true, addDate: next.date, addCourse: next.course,
                                addCourseId: next.courseLogId || next.courseId, addScheduleId: next.id || null,
                                addCompanions: Array.isArray(next.companions) ? next.companions : null,
                              })}>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>오늘 라운딩 어떠셨나요?</Text>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>기록 남기기 →</Text>
                            </TouchableOpacity>
                          </AttentionMotion>
                        )}
                      </View>
                    ) : (
                      <View style={{ flex: 1, paddingTop: 2 }}>
                        {/* 구장+날짜 탭 → 코스 페이지 */}
                        <TouchableOpacity activeOpacity={canOpenCourse(next) ? 0.7 : 1} onPress={() => handleCardCoursePress(next)}>
                          <Text style={[homeS.cardCourse, { marginBottom: 0, fontSize: fs(Platform.OS === 'android' ? 21 : 18), lineHeight: Platform.OS === 'android' ? 27 : 23 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>{next.course}
                            {canOpenCourse(next) ? <Text style={{ fontSize: fs(12), color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                          </Text>
                          <Text style={[homeS.cardDate, { marginTop: 4 }]}>{next.date.slice(5)} {next.day} · {next.time} · {next.members}명</Text>
                        </TouchableOpacity>
                        {/* D-day 탭 → 일정 시트(바텀시트) 복구 */}
                        <TouchableOpacity onPress={() => openScheduleSheet(next)} activeOpacity={0.7} style={{ marginTop: 'auto', marginBottom: 12, alignSelf: 'flex-start' }}>
                          <Text style={[homeS.cardDDay, { fontSize: fs(56), lineHeight: fs(60) }]}>D-{freshDDay(next)}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {/* 함께 식사 — 구장 박스 아래(같은 너비), 2슬롯+메모([[afterround-meal-decision]]) */}
                    <View style={{ marginTop: 2, marginRight: 12 }}>
                      <MealDecisionBar schedule={next} uid={currentUid} nickname={userProfile?.nickname} active block friendMeta={friendMeta}
                        autoOpen={autoOpenMeal} onAutoOpened={() => setAutoOpenMeal(false)} />
                    </View>
                    </View>

                    {/* 좌 칼럼과 날씨·교통 사이 세로 분리선 */}
                    <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.32)', marginVertical: 2 }} />

                    {/* 우 — 세로 칼럼: 위 나가기(종료 후) + 아래 날씨·교통(우측 중앙, 박스X 큰 이모지) */}
                    <View style={{ flex: 1 }}>
                      {roundEnded && (
                        <TouchableOpacity onPress={() => handleDismissCard(next)} activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ alignSelf: 'flex-end' }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)' }}>나가기 ✕</Text>
                        </TouchableOpacity>
                      )}
                      {/* 우측 — 이모지(크게) 아래 날씨/교통 값 세로 스택. 탭 영역 넓고 이모지 큼. 탭=상세 팝업 */}
                      <TouchableOpacity onPress={() => { setSelectedSchedule(next); setShowWeatherFull(true); }} activeOpacity={0.7}
                        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: fs(38) }}>{d0Info.icon || '🌤️'}</Text>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginTop: 3 }} numberOfLines={1}>{d0Info.wx || '날씨'}</Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: fs(34) }}>🚗</Text>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginTop: 3 }} numberOfLines={1}>{d0Info.drive ? `약 ${d0Info.drive}분` : '교통'}</Text>
                        </View>
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: 'rgba(255,255,255,0.82)' }}>더보기 →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => handleCardCoursePress(next)}
                    activeOpacity={canOpenCourse(next) ? 0.7 : 1}
                    style={{ marginBottom: 4 }}>
                    <Text style={homeS.cardCourse}>{next.course}
                      {canOpenCourse(next) ? <Text style={{ fontSize: fs(11), color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                    </Text>
                    <Text style={homeS.cardDate}>{next.date} {next.day} · {next.time} · {next.members}명</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={() => openScheduleSheet(next)}
                      activeOpacity={0.7}
                      style={{ alignSelf: 'flex-start' }}>
                      <Text style={homeS.cardDDay}>D-{freshDDay(next)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setSelectedSchedule(next); setShowWeatherFull(true); }}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: Platform.OS === 'android' ? fs(28) : fs(32), marginBottom: Platform.OS === 'android' ? 4 : 6 }}>🌤  🚗</Text>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(255,255,255,0.85)' }}>탭하여 확인하기 →</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {upcomingSchedules.slice(1, 5).map((s, i) => {
              const opacity = [1, 0.85, 0.7, 0.55][i] ?? 0.55;
              // 카드 전체 = 일정 시트 열기(탭 영역 넓힘 — 가운데·여백·D-n 어디를 찍어도 시트, 발견성↑ 2026-06-13).
              //   구장명만 안쪽 터치로 코스 연결(코스 연결 불가하면 구장명도 시트로 폴백).
              return (
              <TouchableOpacity key={s.id} style={[homeS.subCard, { opacity }]}
                onPress={() => openScheduleSheet(s)} activeOpacity={0.85}>
                <TouchableOpacity
                  onPress={() => (canOpenCourse(s) ? handleCardCoursePress(s) : openScheduleSheet(s))}
                  onLongPress={() => openScheduleSheet(s)}
                  delayLongPress={350}
                  activeOpacity={canOpenCourse(s) ? 0.7 : 0.85}>
                  <Text style={homeS.subCourse} numberOfLines={2}>{s.course}
                    {canOpenCourse(s) ? <Text style={{ fontSize: fs(8), color: 'rgba(200,217,230,0.55)' }}> ›</Text> : null}
                  </Text>
                  <Text style={homeS.subDate}>{s.date.slice(5)} {s.day}</Text>
                </TouchableOpacity>
                <Text style={homeS.subDDay}>D-{freshDDay(s)}</Text>
              </TouchableOpacity>
              );
            })}

          </ScrollView>

          {/* 일정초대 배너가 떠 있는 동안엔 아래 구분선+한줄메모/코멘트 카드를 숨김 — 좁은 화면 겹침 방지(수락/거절 후 복원). 사용자 지정 2026-06-18. */}
          {!scheduleInvitePending && (<>
          <View style={{ marginHorizontal: 20, marginVertical: 20 }}>
            <TripleStripe height={1.5} />
          </View>

          {(() => {
            const courseLabel = next?.course || '';

            const diaryEntries = diaries.filter(d => isRoundDiary(d) && d.course === next?.course); // 일상(모멘트) 제외 — 방문 판정은 라운딩만
            const myMemo = diaryEntries[0]?.memo;
            // 방문 여부는 실제 라운딩 기록 기준 (COURSE_LOG 목업이 아님)
            const visitCount = diaryEntries.length;
            const isFirstVisit = visitCount === 0;
            const topComment = homeTopComment;
            const hasGolfer = !!topComment;

            const labelCourseTxt = (label) => (
              <Text style={[homeS.memoCardCourse, { fontSize: fs(11) }]} numberOfLines={1}>
                {label} · <Text style={{ color: 'rgba(255,255,255,0.55)' }}>{courseLabel}</Text>
              </Text>
            );

            // 케이스 3·4: 첫 방문
            if (isFirstVisit) {
              return (
                <View>
                  <View style={homeS.memoCard}>
                    <View style={homeS.memoCardTop}>
                      <View style={[homeS.memoBadgeFirst, { backgroundColor: '#C8D9E6' }]}>
                        <Text style={[homeS.memoBadgeTxt, { color: C.navy }]}>첫 방문</Text>
                      </View>
                      {labelCourseTxt('골퍼 코멘트')}
                    </View>
                    <View style={homeS.memoCardBottom}>
                      {hasGolfer ? (
                        <>
                          <Text style={homeS.commentTxt} numberOfLines={2} ellipsizeMode="tail">"{topComment.txt}"</Text>
                          <Text style={homeS.commentWho}>{topComment.who}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[homeS.memoTxt, { color: 'rgba(255,255,255,0.4)', borderLeftColor: 'rgba(255,255,255,0.2)' }]} numberOfLines={1}>아직 골퍼 코멘트가 없어요</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#F5E6A8', marginTop: 8, alignSelf: 'flex-start' }}>첫 번째 코멘트의 주인공이 되어보세요</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              );
            }

            // 케이스 2: 방문 + 내 메모 없음
            if (!myMemo) {
              return (
                <View>
                  <View style={homeS.memoCard}>
                    <View style={homeS.memoCardTop}>
                      <View style={homeS.memoBadgeVisit}>
                        <Text style={homeS.memoBadgeTxt}>한줄 메모</Text>
                      </View>
                      <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                    </View>
                    <View style={homeS.memoCardBottom}>
                      <Text style={[homeS.memoTxt, { color: 'rgba(255,255,255,0.4)', borderLeftColor: 'rgba(255,255,255,0.2)' }]} numberOfLines={1}>아직 메모가 없어요</Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate(ROUTES.MY, {
                          openAddModal: true,
                          addDate: next?.date,
                          addCourse: next?.course,
                          addCourseId: next?.courseLogId || next?.courseId,
                          addScheduleId: next?.id || null,
                          // 동반자 직접 전달(scheduleId find 의존 제거)
                          addCompanions: Array.isArray(next?.companions) ? next.companions : null,
                        })}
                        style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#F5E6A8' }}>메모 남기기 →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }

            // 케이스 1: 방문 + 내 메모 있음 (골퍼 코멘트 있으면 캐러셀)
            const showCardOne = cardSlide === 1 && hasGolfer;
            return (
              <View>
                <TouchableOpacity
                  activeOpacity={hasGolfer ? 0.9 : 1}
                  onPress={toggleCardSlide}
                  disabled={!hasGolfer}>
                  {!showCardOne ? (
                    <View style={homeS.memoCard}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeVisit}>
                          <Text style={homeS.memoBadgeTxt}>한줄 메모</Text>
                        </View>
                        <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.memoTxt} numberOfLines={1} ellipsizeMode="tail">"{myMemo}"</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={homeS.commentCard}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeComment}>
                          <Text style={[homeS.memoBadgeTxt, { color: '#C8D9E6' }]}>골퍼 코멘트</Text>
                        </View>
                        <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.commentTxt} numberOfLines={2} ellipsizeMode="tail">"{topComment.txt}"</Text>
                        <Text style={homeS.commentWho}>{topComment.who}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
                {hasGolfer && (
                  <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                    {[0, 1].map(i => (
                      <View key={i} style={{
                        width: cardSlide === i ? 14 : 5,
                        height: 5, borderRadius: 3,
                        backgroundColor: cardSlide === i ? (i === 0 ? '#F5E6A8' : '#C8D9E6') : 'rgba(255,255,255,0.15)',
                      }} />
                    ))}
                  </View>
                )}
              </View>
            );
          })()}
          </>)}
          <View style={{ height: 22 }} />
        </View>
        </>
        ) : hydrated ? (
        // 일정 로드 완료 후에만 '첫 라운딩' 빈 상태 노출 — 로드 전 깜빡임 방지 ([[home-empty-state-flash]])
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 40 }}>
          <View style={{ marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 12 }}>예정 라운딩</Text>
            <Text style={{ fontFamily: F.en, fontSize: fs(22), color: '#fff', marginBottom: 8, lineHeight: 30 }}>
              Dear Golf 에서{'\n'}첫 라운딩을 시작해보세요
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.45)', lineHeight: 18, marginBottom: 20 }}>
              날씨 · 교통 · 코스 정보를{'\n'}한눈에 확인할 수 있어요
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
              activeOpacity={0.8}
              onPress={() => setShowAddModal(true)}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, letterSpacing: 0.5 }}>+ 라운딩 추가하기</Text>
            </TouchableOpacity>
            {/* 일정 없어도 캘린더(과거 일정·기록) 진입 — 빈 상태에서도 접근 가능하게 */}
            <TouchableOpacity onPress={() => setShowScheduleScreen(true)} activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: fs(13) }}>📅</Text>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: 'rgba(255,255,255,0.7)' }}>일정 캘린더 보기 ›</Text>
            </TouchableOpacity>
          </View>
        </View>
        ) : (
        // 일정 로드 중 — 빈 CTA 대신 중립 여백(잘못된 빈 상태 깜빡임 차단)
        <View style={{ flex: 1 }} />
        )}
      </SafeAreaView>

      <ScheduleSheetModal
        visible={showScheduleModal}
        friendMeta={friendMeta}
        schedule={selectedSchedule}
        onClose={() => setShowScheduleModal(false)}
        courseNavigable={canOpenCourse(selectedSchedule)}
        onCourseTap={() => {
          setShowScheduleModal(false);
          handleCardCoursePress(selectedSchedule);
        }}
        onWeather={() => { setShowScheduleModal(false); setShowWeatherFull(true); }}
        onTraffic={() => { setShowScheduleModal(false); setShowTrafficFull(true); }}
        onShare={() => handleShareSchedule(selectedSchedule)}
        onInviteFriends={() => handleInviteFriends(selectedSchedule)}
        onMeal={() => { setShowScheduleModal(false); setSheetMealSchedule(selectedSchedule); setSheetMealAutoOpen(true); }}
        onEdit={() => handleEditSchedule(selectedSchedule)}
        onDelete={async () => {
          // 시트 안에서 이미 confirm 완료 — 바로 remove + 시트 닫음 (별도 AppAlert 띄우지 않음, RN 3중 Modal 충돌 회피)
          const s = selectedSchedule;
          if (s) {
            try { await removeSchedule(s.id); } catch (e) { console.warn('[home] schedule remove failed:', e?.message); }
            cancelRoundAlarms(s.id); // 캘린더 제거는 removeSchedule이 일괄 처리
            // 전파 일정(groupId) 취소 → 동반자에게 알림(취소는 함께한 사람이 꼭 알아야 함). ([[schedule-propagation-spec]])
            if (s.groupId && currentUid) {
              try {
                const group = await getScheduleGroup(s.groupId);
                await notifyScheduleGroupMembers({ group, myUid: currentUid, type: 'scheduleCancelled',
                  actorName: userProfile?.nickname || '', course: s.course, date: s.date, time: s.time });
                await leaveScheduleGroup(s.groupId, currentUid); // 그룹 탈퇴 — 안 하면 삭제 후에도 그룹 푸시 계속 옴
              } catch (e) { if (__DEV__) console.warn('[home] notify cancel', e?.message); }
            }
          }
          setShowScheduleModal(false);
        }}
      />

      {/* 일정 시트 '함께 식사' — 트리거 버튼 없이 시트만(세컨 카드 등 next 아닌 일정에서도 접근). D-0 카드 식사바와 별개([[afterround-meal-decision]]) */}
      <MealDecisionBar
        triggerless
        schedule={sheetMealSchedule}
        uid={currentUid}
        nickname={userProfile?.nickname}
        friendMeta={friendMeta}
        active={!!sheetMealSchedule}
        autoOpen={sheetMealAutoOpen}
        onAutoOpened={() => setSheetMealAutoOpen(false)}
      />

      <WeatherTransportPopup
        visible={showWeatherFull || showTrafficFull || showWeatherPopup}
        initialTab={showTrafficFull ? 'tr' : 'wx'}
        schedule={selectedSchedule || next}
        schedules={schedules}
        weatherOnly={showWeatherPopup}
        onClose={() => { setShowWeatherFull(false); setShowTrafficFull(false); setShowWeatherPopup(false); refreshWxEmojiRef.current(); }}
      />

      <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      <HomeIntroModal
        visible={showHomeIntro}
        onClose={() => setShowHomeIntro(false)}
        onAddSchedulePress={() => setShowAddModal(true)} />
      <ScheduleModal
        visible={!!editScheduleTarget}
        initial={editScheduleTarget}
        onClose={() => setEditScheduleTarget(null)}
        onSave={handleScheduleSave}
      />

      <AlarmSetupModal
        visible={!!pendingAlarmSchedule}
        schedule={pendingAlarmSchedule}
        onClose={() => {
          setPendingAlarmSchedule(null);
          // 알람 팝업 닫힌 뒤 친구 초대 제안(생성 직후 동선) — 모달 닫힘 후 띄우게 약간 지연 ([[schedule-propagation-spec]])
          if (pendingInviteSchedule) {
            const s = pendingInviteSchedule;
            setPendingInviteSchedule(null);
            setTimeout(() => offerInviteAfterCreate(s), 350);
          }
        }}
      />

      {/* 일정 공유 카드 — 이미지(바로공유/저장) + 평문 링크(설치 동선). 시트 닫은 뒤 홈 레벨에서 열림 */}
      <ShareMomentModal
        moment={scheduleShareTarget ? { ...scheduleShareTarget, shareKind: 'schedule' } : null}
        visible={!!scheduleShareTarget}
        onClose={() => setScheduleShareTarget(null)}
        onShareLink={() => { const t = scheduleShareTarget; setScheduleShareTarget(null); setTimeout(() => shareScheduleText(t), 350); }}
      />

      {/* 체크인 카드 뷰어 — 공유화면 없이 카드만 깔끔히 전체화면(프론트 체크인용). 닫기만 ([[schedule-booker]]) */}
      <Modal visible={!!checkinCard} transparent animationType="fade" onRequestClose={() => setCheckinCard(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setCheckinCard(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <TouchableOpacity onPress={() => setCheckinCard(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ position: 'absolute', top: insets.top + 14, right: 22 }}>
            <Text style={{ fontSize: fs(26), color: 'rgba(255,255,255,0.9)' }}>✕</Text>
          </TouchableOpacity>
          {/* activeOpacity 1 + 카드 자체 탭은 닫기 막기(배경 탭만 닫힘) */}
          {/* 공유 카드와 '똑같이' 320폭으로 렌더(거기서 구장명 정상) → 비율 그대로 transform scale로만 확대.
              폭을 바꾸면 폰트가 다시 reflow돼 잘리므로, 레이아웃은 320 고정하고 화면에 맞춰 크게 보이게만. */}
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ transform: [{ scale: Math.min((winW - 24) / 320, 1.35) }] }}>
            {checkinCard && <ScheduleShareCard schedule={checkinCard} width={320} />}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 예정 라운딩 목록 — 라벨 위쪽 팝업 (카드 5개를 넘는 일정도 한눈에) */}
      <Modal
        visible={showUpcomingList}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpcomingList(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowUpcomingList(false)}>
          <View style={{ position: 'absolute', left: upcomingPos.x, top: upcomingPos.y, width: 0, height: 0 }}>
            <View style={{
              position: 'absolute', bottom: 12, left: 0,
              backgroundColor: '#FAF6EC', borderRadius: 14,
              width: 272, paddingVertical: 6,
              shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3, shadowRadius: 32, elevation: 20,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#3D3935' }}>예정 라운딩</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#A89F8C' }}>{upcomingSchedules.length}건</Text>
              </View>
              <ScrollView
                style={{ maxHeight: Math.max(160, Math.min(286, upcomingPos.y - 54 - insets.top)) }}
                showsVerticalScrollIndicator={false}>
                {upcomingSchedules.map((s, i) => {
                  const dd = freshDDay(s);
                  return (
                    <TouchableOpacity
                      key={s.id}
                      activeOpacity={0.6}
                      onPress={() => { setShowUpcomingList(false); setTimeout(() => openScheduleSheet({ ...s, dDay: dd }), 260); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 10, paddingHorizontal: 16,
                        borderTopWidth: 0.5, borderColor: '#E8E2D0',
                      }}>
                      <View style={{
                        minWidth: 46, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7, alignItems: 'center',
                        backgroundColor: dd === 0 ? C.burgundy : '#EFE9D8',
                      }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: dd === 0 ? C.butter : '#3D3935' }}>
                          {dd === 0 ? 'D-DAY' : `D-${dd}`}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#3D3935' }} numberOfLines={1}>{s.course}</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#A89F8C', marginTop: 2 }}>{s.date} {s.day} · {s.time}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <HomeTooltip
        visible={showTooltip}
        onClose={() => { setShowTooltip(false); storage.save(STORAGE_KEYS.homeTooltipDone, true); }}
      />

      {/* 친구 일정에 초대(일정 전파) — 친구 다중선택 → 인앱 초대 발송 ([[schedule-propagation-spec]]) */}
      <FriendSelectModal
        visible={inviteOpen}
        mode="companion"
        friends={inviteFriends}
        onClose={() => { setInviteOpen(false); setInviteTarget(null); }}
        onConfirm={submitInviteFriends}
      />

      {/* 메시지(DM) — 홈 우상단 💬 진입 = 대화 목록(인스타식). 단일 Modal서 목록↔대화방 전환([[dm-design]]). */}
      <Modal visible={dmOpen} transparent animationType="slide"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => (dmChat ? setDmChat(null) : setDmOpen(false))}>
        {dmChat ? (
          <DMChatScreen friendUid={dmChat.uid} friendName={dmChat.name} friendAvatarUri={dmChat.avatar || null} onClose={() => setDmChat(null)}
            onOpenRoundup={(postId, hostUid, scope) => {
              setDmChat(null); setDmOpen(false);
              // 친구지정(select)=내 참여 초대장(openView:'mine'), 그 외(친구모집 등)=모집 상세(openPostId)
              if (scope === 'select') navigation.navigate(ROUTES.LOUNGE, { openView: 'mine' });
              else navigation.navigate(ROUTES.LOUNGE, { openPostId: postId, openPostHost: hostUid });
            }} />
        ) : (
          <DMListScreen onClose={() => { setDmOpen(false); setDmChat(null); }} onOpenChat={(uid, name, avatar) => setDmChat({ uid, name, avatar })} />
        )}
      </Modal>

      {/* 일정 풀스크린 — 홈의 '일정' 라벨 탭 시 캘린더 화면 표시 */}
      <ScheduleScreen
        asModal
        visible={showScheduleScreen}
        onClose={() => setShowScheduleScreen(false)}
        navigation={navigation}
      />
    </View>
  );
}
