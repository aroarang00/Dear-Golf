import React, { useState, useEffect, useRef } from 'react';
import {
  StatusBar, View, Text, TouchableOpacity, ScrollView,
  Share, Alert, Modal, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { showAppAlert } from './AppAlert';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { COURSE_LOG, DIARY_DATA, WEEKDAYS } from '../constants/data';
import { getUserCourses } from '../utils/userCourses';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { normalizeSchedules } from '../utils/helpers';
import { homeS } from '../styles/homeS';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { HomeBgSlider, getCurrentWxClass } from './common/HomeBgSlider';
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
import { syncRoundToCalendar, removeRoundFromCalendar } from '../utils/deviceCalendar';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function HomeScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const { schedules, setSchedules } = React.useContext(SchedulesContext);
  const insets = useSafeAreaInsets();
  const [showAddModal, setShowAddModal] = useState(false);
  const [userCoursesList, setUserCoursesList] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showHomeIntro, setShowHomeIntro] = useState(false);   // Dear Golf 이용 안내 모달
  const [homeIntroSeen, setHomeIntroSeen] = useState(true);    // 초기 true(뱃지 X), AsyncStorage 로드 후 갱신
  const [showWeatherFull, setShowWeatherFull] = useState(false);
  const [showTrafficFull, setShowTrafficFull] = useState(false);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);
  const [showUpcomingList, setShowUpcomingList] = useState(false);
  const [showScheduleScreen, setShowScheduleScreen] = useState(false); // 일정(캘린더) 풀스크린
  const [upcomingPos, setUpcomingPos] = useState({ x: 0, y: 0 });
  const [editSchedule, setEditSchedule] = useState(null);
  const [cardSlide, setCardSlide] = useState(0);
  const [showDDayMenu, setShowDDayMenu] = useState(false);
  const [dDayPos, setDDayPos] = useState({ x: 0, y: 0 });
  const [now, setNow] = useState(Date.now());
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [showTooltip, setShowTooltip] = useState(false);
  const [pendingAlarmSchedule, setPendingAlarmSchedule] = useState(null);
  const [homeTopComment, setHomeTopComment] = useState(null);
  const [wxEmoji, setWxEmoji] = useState('☀️'); // 헤더 현재 날씨 이모지
  const dDayRef = useRef(null);
  const cardsScrollRef = useRef(null);
  const upcomingLabelRef = useRef(null); // '예정 라운딩' 라벨 — 목록 팝업 위치 기준

  // 라운딩 기록 완료 여부 확인용 — 다이어리 로드
  const loadDiaries = React.useCallback(() => {
    storage.load(STORAGE_KEYS.diaries, DIARY_DATA)
      .then(d => setDiaries(Array.isArray(d) ? d : DIARY_DATA));
  }, []);

  // 1분마다 현재 시각 갱신 — 라운딩 종료(티오프+5h)/자정 전환 감지
  useEffect(() => {
    loadDiaries();
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [loadDiaries]);

  // 헤더 날씨 이모지 — 현재 날씨에 맞춰 표시 (홈 배경과 같은 캐시 공유)
  useEffect(() => {
    let cancelled = false;
    getCurrentWxClass().then(w => {
      if (cancelled) return;
      setWxEmoji({ clear: '☀️', cloudy: '⛅', rain: '🌧️', wind: '💨' }[w] || '☀️');
    });
    return () => { cancelled = true; };
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

  const openDDayMenu = () => {
    dDayRef.current?.measureInWindow((x, y) => {
      setDDayPos({ x, y });
      setShowDDayMenu(true);
    });
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
      setShowDDayMenu(false);
      setEditSchedule(null);
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
      // 다이어리 최신화 — 라운딩 기록 완료 시 종료 카드 → 다음 일정 전환
      loadDiaries();
    });
    return unsubscribe;
  }, [navigation]);

  // userCourses 사전 로드 — 코스명으로 user-added 코스 매칭하기 위함
  useEffect(() => {
    (async () => {
      const list = await getUserCourses();
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
  const isRecorded = (s) => !!s && diaries.some(d => d.course === s.course && d.date === s.date);
  const upcomingSchedules = schedules
    .filter(s => parseSchedDate(s) >= now0 && !isRecorded(s))
    .sort((a, b) => parseSchedDate(a) - parseSchedDate(b));
  const next = upcomingSchedules.length > 0 ? upcomingSchedules[0] : null;
  // 자정 기준 재계산 D-day / 라운딩 종료 판정(티오프 + 5시간)
  const freshDDay = (s) => (s ? Math.max(0, Math.round((parseSchedDate(s) - now0) / 86400000)) : 0);
  const teeoffEndMs = (s) => {
    const [hh, mm] = (s?.time || '08:00').split(':').map(Number);
    return parseSchedDate(s) + (hh || 8) * 3600000 + (mm || 0) * 60000 + 5 * 3600000;
  };
  const roundEnded = !!next && freshDDay(next) === 0 && now >= teeoffEndMs(next);

  const carouselActive = React.useMemo(() => {
    const course = next?.course;
    if (!course) return false;
    const hasMyMemo = diaries.some(d => d.course === course && d.memo);
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

  // 다음 라운딩 코스 id — COURSE_LOG·userCourses 모두 해석. 코멘트 조회 키로 사용.
  const nextCourseId = resolveCourseLogId(next);

  // 홈 골퍼 코멘트 — 다음 라운딩 코스의 좋아요 1위 코멘트 (Firestore 공유)
  useEffect(() => {
    if (!nextCourseId) { setHomeTopComment(null); return; }
    let cancelled = false;
    setHomeTopComment(null); // 코스 바뀜 — 이전 코스 코멘트 잔상 방지
    getTopComment(nextCourseId).then(c => { if (!cancelled) setHomeTopComment(c); });
    return () => { cancelled = true; };
  }, [nextCourseId]);

  const handleCardCoursePress = (schedule) => {
    const id = resolveCourseLogId(schedule);
    if (id) navigation.navigate('코스', { openCourseId: id });
  };

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
    const msg = `[ Dear Golf ]\n${s.course}\n${s.date} ${s.day}요일 ${s.time}\n${s.members}명 동반 · D-${s.dDay}\n예상 날씨 ${s.weather || '맑음'}\n티오프 30분 전 도착을 권장해요\n나만의 골프 캐디, Dear Golf와 함께하는 라운딩입니다 ⛳`;
    try { await Share.share({ message: msg }); }
    catch (e) { console.warn('[share schedule]', e?.message); }
  };

  const handleEditSchedule = (s) => {
    setShowScheduleModal(false);
    setEditSchedule(s);
  };

  const handleDeleteSchedule = (s) => {
    if (!s) return;
    showAppAlert(
      '일정 삭제',
      `${s.course}\n${s.date} ${s.day} · ${s.time}\n\n이 일정을 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            setSchedules(prev => prev.filter(x => x.id !== s.id));
            cancelRoundAlarms(s.id); // 일정 삭제 시 예약된 알람도 취소
            removeRoundFromCalendar(s.id); // 기기 캘린더 이벤트도 제거
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
        duration: '1시간 30분',
        // 코스 상세 이동용 — ScheduleModal이 넘긴 코스 id 보존
        courseLogId: data.courseLogId || null,
        courseId: data.courseId || null,
      };
      setSchedules(prev => normalizeSchedules([...prev, newS]));
      // 새로 등록된 userCourse 반영 (코스명→id 매칭 최신화)
      getUserCourses().then(list => setUserCoursesList(list || []));
      // 폰 기본 캘린더에 자동 추가
      syncRoundToCalendar(newS);
      // 일정 추가 완료 → 알람 팝업 (다시 묻지 않기 설정 시 기본값 자동 적용)
      if (userProfile.alarmPromptDisabled) {
        applyDefaultAlarms(newS, userProfile.alarmDefaults);
      } else {
        setPendingAlarmSchedule(newS);
      }
    } else if (type === 'schedule-edit') {
      setSchedules(prev => normalizeSchedules(prev.map(s => s.id === data.id
        ? { ...s, course: data.course, date: data.date, day: data.day,
            time: data.time, members: data.members, dDay: data.dDay,
            courseId: data.courseId || null }
        : s)));
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
      // 캘린더 이벤트도 변경된 내용으로 갱신
      syncRoundToCalendar({
        id: data.id, course: data.course, date: data.date, time: data.time, members: data.members,
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
      <StatusBar barStyle="light-content" />
      <HomeBgSlider />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <TripleStripe style={{ marginTop: Platform.OS === 'android' ? 10 : 0 }} />
        <View style={homeS.hdr}>
          <Text style={homeS.hdrSub}>나만의 골프 캐디</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={homeS.hdrTitle}>Dear Golf</Text>
            <TouchableOpacity onPress={openCurrentWeather} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(28), marginTop: 4 }}>{wxEmoji}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={homeS.hdrGreeting}>
              안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
            </Text>
            {/* Dear Golf 이용 안내 진입 — 미열람 시 빨간 점 뱃지 */}
            <TouchableOpacity onPress={openHomeIntro} activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(20) }}>💡</Text>
              {!homeIntroSeen && (
                <View style={{ position: 'absolute', top: 0, right: -3, width: 8, height: 8, borderRadius: 4,
                  backgroundColor: '#FF3B30', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' }} />
              )}
            </TouchableOpacity>
          </View>
        </View>
        {next ? (
        <>
        <View style={{ flex: 1 }} />
        <View style={homeS.bottomArea}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, marginBottom: 8 }}>
            <TouchableOpacity
              ref={upcomingLabelRef}
              onPress={() => setShowScheduleScreen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[homeS.secLabel, { paddingHorizontal: 0, marginBottom: 0, fontSize: fs(17), color: 'rgba(255,255,255,0.9)' }]}>일정</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(17), color: 'rgba(255,255,255,0.9)', marginLeft: 5, marginTop: 1 }}>›</Text>
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
                  {/* 라운딩 종료 카드 — 티오프 + 5시간 경과 */}
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <View style={{ backgroundColor: 'rgba(245,230,168,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.butter, letterSpacing: 1 }}>라운딩 종료</Text>
                    </View>
                  </View>
                  <Text style={homeS.cardCourse} numberOfLines={1}>{next.course}</Text>
                  <Text style={[homeS.cardDate, { marginBottom: 12 }]}>{next.date.slice(5)} {next.day} 라운딩</Text>

                  {/* 기록 유도 박스 — 당일/지난 라운딩이면 구장명 자동 채우기 */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('MY', {
                      openAddModal: true,
                      addDate: next.date,
                      addCourse: next.course,
                      addCourseId: next.courseLogId || next.courseId,
                    })}
                    style={{ backgroundColor: 'rgba(245,230,168,0.12)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.3)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>오늘 라운딩 어떠셨나요?</Text>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>기록 남기기 →</Text>
                  </TouchableOpacity>

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
                        if (id) navigation.navigate('코스', { openCourseId: id, openCourseTab: 'food' });
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
                    activeOpacity={resolveCourseLogId(next) ? 0.7 : 1}
                    style={{ marginBottom: 4 }}>
                    <Text style={homeS.cardCourse}>{next.course}
                      {resolveCourseLogId(next) ? <Text style={{ fontSize: fs(11), color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                    </Text>
                    <Text style={homeS.cardDate}>{next.date} {next.day} · {next.time} · {next.members}명</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      ref={dDayRef}
                      onPress={openDDayMenu}
                      activeOpacity={0.7}
                      style={{ alignSelf: 'flex-start' }}>
                      <Text style={homeS.cardDDay}>D-{freshDDay(next)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setSelectedSchedule(next); setShowWeatherFull(true); }}
                      activeOpacity={0.7}>
                      <Text style={{ fontSize: fs(32), marginBottom: 6 }}>🌤  🚗</Text>
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
                  activeOpacity={resolveCourseLogId(s) ? 0.7 : 1}>
                  <Text style={homeS.subCourse} numberOfLines={2}>{s.course}
                    {resolveCourseLogId(s) ? <Text style={{ fontSize: fs(8), color: 'rgba(200,217,230,0.55)' }}> ›</Text> : null}
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

            const diaryEntries = diaries.filter(d => d.course === next?.course);
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
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                              if (nextCourseId) navigation.navigate('코스', { openCourseId: nextCourseId, openComment: true });
                            }}
                            style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#F5E6A8' }}>첫 번째 코멘트의 주인공이 되어보세요 →</Text>
                          </TouchableOpacity>
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
                        onPress={() => navigation.navigate('MY', {
                          openAddModal: true,
                          addDate: next?.date,
                          addCourse: next?.course,
                          addCourseId: next?.courseLogId || next?.courseId,
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
                        <Text style={[homeS.memoCardCourse, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>{courseLabel}</Text>
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
        ) : (
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 40 }}>
          <View style={{ marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 12 }}>예정 라운딩</Text>
            <Text style={{ fontFamily: F.en, fontSize: fs(22), color: '#fff', marginBottom: 8, lineHeight: 30 }}>
              Dear Golf에서{'\n'}첫 라운딩을 시작해보세요
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
          </View>
        </View>
        )}
      </SafeAreaView>

      <ScheduleSheetModal
        visible={showScheduleModal}
        schedule={selectedSchedule}
        onClose={() => setShowScheduleModal(false)}
        onCourseTap={() => {
          setShowScheduleModal(false);
          const id = resolveCourseLogId(selectedSchedule);
          if (id) navigation.navigate('코스', { openCourseId: id });
        }}
        onWeather={() => { setShowScheduleModal(false); setShowWeatherFull(true); }}
        onTraffic={() => { setShowScheduleModal(false); setShowTrafficFull(true); }}
        onShare={() => handleShareSchedule(selectedSchedule)}
        onEdit={() => handleEditSchedule(selectedSchedule)}
        onDelete={() => { setShowScheduleModal(false); handleDeleteSchedule(selectedSchedule); }}
      />

      <WeatherTransportPopup
        visible={showWeatherFull || showTrafficFull || showWeatherPopup}
        initialTab={showTrafficFull ? 'tr' : 'wx'}
        schedule={selectedSchedule || next}
        schedules={schedules}
        weatherOnly={showWeatherPopup}
        onClose={() => { setShowWeatherFull(false); setShowTrafficFull(false); setShowWeatherPopup(false); }}
      />

      <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      <HomeIntroModal
        visible={showHomeIntro}
        onClose={() => setShowHomeIntro(false)}
        onAddSchedulePress={() => setShowAddModal(true)} />
      <ScheduleModal
        visible={!!editSchedule}
        initial={editSchedule}
        onClose={() => setEditSchedule(null)}
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

      <Modal
        visible={showDDayMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDDayMenu(false)}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setShowDDayMenu(false)}>
          <View style={{ position: 'absolute', left: dDayPos.x, top: dDayPos.y, width: 0, height: 0 }}>
            <View style={{
              position: 'absolute',
              bottom: 10,
              left: 0,
              backgroundColor: '#FAF6EC',
              borderRadius: 14,
              minWidth: 180,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 32,
              elevation: 20,
            }}>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={async () => {
                  if (!next) { setShowDDayMenu(false); return; }
                  try {
                    await handleShareSchedule(next);
                  } catch (e) { console.warn('[share schedule]', e?.message); }
                  setShowDDayMenu(false);
                }}
                style={{ paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: '#E8E2D0' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: '#3D3935' }}>📩  일정 공유</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => { setShowDDayMenu(false); handleEditSchedule(next); }}
                style={{ paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: '#E8E2D0' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: '#3D3935' }}>✏️  일정 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => { setShowDDayMenu(false); handleDeleteSchedule(next); }}
                style={{ paddingVertical: 13, paddingHorizontal: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: '#D32F2F' }}>🗑️  일정 삭제</Text>
              </TouchableOpacity>
              <View style={{
                position: 'absolute',
                top: '100%',
                left: 20,
                width: 0,
                height: 0,
                borderLeftWidth: 8,
                borderRightWidth: 8,
                borderTopWidth: 10,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: '#FAF6EC',
              }} />
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
