import React, { useState, useEffect, useRef } from 'react';
import {
  StatusBar, View, Text, TouchableOpacity, ScrollView,
  Share, Alert, Modal, LayoutAnimation, Platform, UIManager, Linking, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function HomeScreen({ navigation, route }) {
  const { userProfile } = React.useContext(UserContext);
  const { schedules, hydrated, addSchedule, editSchedule, removeSchedule } = React.useContext(SchedulesContext);
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
  // 자정 기준 재계산 D-day / 라운딩 종료 판정(티오프 + 4시간 — 후반 막바지, 식사·기록 동선)
  // 매너평가 윈도우(티오프+5h)와 의도적으로 다름: 홈은 끝나갈 때 진입, 매너평가는 실제 종료 후
  const freshDDay = (s) => (s ? Math.max(0, Math.round((parseSchedDate(s) - now0) / 86400000)) : 0);
  const teeoffEndMs = (s) => {
    const [hh, mm] = (s?.time || '08:00').split(':').map(Number);
    return parseSchedDate(s) + (hh || 8) * 3600000 + (mm || 0) * 60000 + 4 * 3600000;
  };
  // 오늘 라운딩 종료(티오프+4h) 카드 — 기록해도 사라지지 않고 "기록 완료"로 유지(교통·맛집 동선), 나가기/자정까지.
  const isEndedToday = (s) => freshDDay(s) === 0 && now >= teeoffEndMs(s);
  const isDismissed = (s) => !!(s && s.id && dismissedCards[s.id]);
  const upcomingSchedules = schedules
    .filter(s => parseSchedDate(s) >= now0 && !isDismissed(s) && (!isRecorded(s) || isEndedToday(s)))
    .sort((a, b) => parseSchedDate(a) - parseSchedDate(b) || parseSchedTime(a) - parseSchedTime(b));
  const next = upcomingSchedules.length > 0 ? upcomingSchedules[0] : null;
  const roundEnded = !!next && isEndedToday(next);

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

  const handleShareSchedule = async (s) => {
    if (!s) return;
    const msg = `[ Dear Golf ]\n${s.course}\n${s.date} ${s.day}요일 ${s.time}\n${s.members}명 동반 · D-${s.dDay}\n예상 날씨 ${s.weather || '맑음'}\n티오프 30분 전 도착을 권장해요\n\n라운딩의 모든 순간을 더 특별하게\nDear Golf ⛳`;
    try { await Share.share({ message: msg }); }
    catch (e) { console.warn('[share schedule]', e?.message); }
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
        });
      } catch (e) {
        console.warn('[home] schedule add failed:', e?.message);
        return;
      }
      // 새로 등록된 userCourse 반영 (코스명→id 매칭 최신화)
      getUserCourses().then(list => setUserCoursesList(list || []));
      // (캘린더 추가는 addSchedule이 일괄 처리)
      // 일정 추가 완료 → 알람 팝업 (다시 묻지 않기 설정 시 기본값 자동 적용)
      if (userProfile.alarmPromptDisabled) {
        applyDefaultAlarms(newS, userProfile.alarmDefaults);
      } else {
        setPendingAlarmSchedule(newS);
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
        });
      } catch (e) {
        console.warn('[home] schedule edit failed:', e?.message);
        return;
      }
      getUserCourses().then(list => setUserCoursesList(list || []));
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

  // 하단 캘린더 알약 라벨 — 오늘 날짜·요일 노출(진입 유도 + 정보 겸용). 렌더마다 계산이라 자정 넘어가도 갱신.
  const _today = new Date();
  const todayLabel = `${_today.getMonth() + 1}월 ${_today.getDate()}일 (${WEEKDAYS[_today.getDay()]})`;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
      <StatusBar barStyle="light-content" />
      <HomeBgSlider />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* SafeArea top: iOS는 노치, Android는 status bar 자동 padding.
            Android는 SafeArea만으로 iOS와 시각적으로 어긋나 약간 보정 ([[cross-platform-check]])
            하단은 SafeArea 안 함 — 탭바가 자체 처리하고 안드로이드 navigation bar는 bottomArea가 처리 */}
        <TripleStripe style={{ marginTop: Platform.OS === 'android' ? 8 : 0 }} />
        <View style={homeS.hdr}>
          <Text style={homeS.hdrSub}>라운딩의 모든 순간을 더 특별하게</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={homeS.hdrTitle} numberOfLines={1} allowFontScaling={false}>Dear Golf</Text>
            <TouchableOpacity onPress={openCurrentWeather} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(28), marginTop: 4 }}>{wxEmoji}</Text>
            </TouchableOpacity>
          </View>
          <Text style={homeS.hdrGreeting}>
            안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
          </Text>
          {/* Dear Golf 이용 안내 진입 — 안녕하세요 아래 가로 띠. 미열람 시 빨간 점으로 호기심 유도. */}
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
        </View>
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
          <ScrollView ref={cardsScrollRef} horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            <View style={homeS.mainCard}>
              {roundEnded ? (
                <>
                  {/* 라운딩 종료 카드 — 티오프 + 4시간 경과 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ backgroundColor: 'rgba(245,230,168,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.butter, letterSpacing: 1 }}>
                        {isRecorded(next) ? '기록 완료' : '라운딩 종료'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {/* 나가기 — 홈에서만 카드 숨김(기록 여부 무관). 서브카드 메인 전환용. 일정·내코스모아보기는 그대로 */}
                    <TouchableOpacity onPress={() => handleDismissCard(next)} activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.55)' }}>나가기 ✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={homeS.cardCourse} numberOfLines={1}>{next.course}</Text>
                  <Text style={[homeS.cardDate, { marginBottom: 12 }]}>{next.date.slice(5)} {next.day} 라운딩</Text>

                  {/* 기록 완료 / 기록 유도 박스 */}
                  {isRecorded(next) ? (
                    <TouchableOpacity activeOpacity={0.85}
                      onPress={() => {
                        // 매칭 다이어리 상세로 직행 — 없으면(이론상 X) MY 첫 화면 폴백
                        // returnToHome: 상세 닫기(안드 뒤로가기)에서 MY 목록 대신 홈으로 복귀
                        const d = recordedDiary(next);
                        navigation.navigate(ROUTES.MY, d ? { openDiaryId: d.id, returnToHome: true } : {});
                      }}
                      style={{ backgroundColor: 'rgba(245,230,168,0.12)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.3)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>오늘 라운딩 기록 완료 ✓</Text>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>기록 보기 →</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate(ROUTES.MY, {
                        openAddModal: true,
                        addDate: next.date,
                        addCourse: next.course,
                        addCourseId: next.courseLogId || next.courseId,
                        addScheduleId: next.id || null,
                        // 동반자를 일정 객체에서 직접 전달(pickRoundToRecord와 동일) — scheduleId find 의존 제거([[diary-companion-matching]])
                        addCompanions: Array.isArray(next.companions) ? next.companions : null,
                      })}
                      style={{ backgroundColor: 'rgba(245,230,168,0.12)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.3)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>오늘 라운딩 어떠셨나요?</Text>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>기록 남기기 →</Text>
                    </TouchableOpacity>
                  )}

                  {/* 귀가 교통 / 주변 맛집 */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 'auto' }}>
                    <TouchableOpacity
                      onPress={() => { setSelectedSchedule(next); setShowTrafficFull(true); }}
                      activeOpacity={0.8}
                      style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#fff' }}>🚗 귀가 교통</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const id = resolveCourseLogId(next);
                        if (id) { navigation.navigate(ROUTES.COURSE, { openCourseId: id, openCourseTab: 'food' }); return; }
                        // id 없는 코스(카카오 검색·직접입력 등) — 구장 ›와 동일하게 이름으로 코스탭 열되 '맛집' 탭으로.
                        //   GuideScreen이 카카오 검색→상세를 열고 openCourseTab='food'면 맛집 탭을 띄운다(앱 내 통일).
                        if (next.course) {
                          navigation.navigate(ROUTES.COURSE, {
                            openCourseName: next.course,
                            openCourseKakaoId: next.courseKakaoId || null,
                            openCourseTab: 'food',
                          });
                        }
                      }}
                      activeOpacity={0.8}
                      style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 9, alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#fff' }}>🍴 주변 맛집</Text>
                    </TouchableOpacity>
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
              return (
              <View key={s.id} style={[homeS.subCard, { opacity }]}>
                <TouchableOpacity
                  onPress={() => handleCardCoursePress(s)}
                  onLongPress={() => openScheduleSheet(s)}
                  delayLongPress={350}
                  activeOpacity={canOpenCourse(s) ? 0.7 : 1}>
                  <Text style={homeS.subCourse} numberOfLines={2}>{s.course}
                    {canOpenCourse(s) ? <Text style={{ fontSize: fs(8), color: 'rgba(200,217,230,0.55)' }}> ›</Text> : null}
                  </Text>
                  <Text style={homeS.subDate}>{s.date.slice(5)} {s.day}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openScheduleSheet(s)}
                  onLongPress={() => openScheduleSheet(s)}
                  delayLongPress={350}
                  activeOpacity={0.85}>
                  <Text style={homeS.subDDay}>D-{freshDDay(s)}</Text>
                </TouchableOpacity>
              </View>
              );
            })}

          </ScrollView>

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
        onEdit={() => handleEditSchedule(selectedSchedule)}
        onDelete={async () => {
          // 시트 안에서 이미 confirm 완료 — 바로 remove + 시트 닫음 (별도 AppAlert 띄우지 않음, RN 3중 Modal 충돌 회피)
          const s = selectedSchedule;
          if (s) {
            try { await removeSchedule(s.id); } catch (e) { console.warn('[home] schedule remove failed:', e?.message); }
            cancelRoundAlarms(s.id); // 캘린더 제거는 removeSchedule이 일괄 처리
          }
          setShowScheduleModal(false);
        }}
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
        onClose={() => setPendingAlarmSchedule(null)}
      />

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
