import React, { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, Share, Platform, Animated, Easing, useWindowDimensions } from 'react-native';

const _and = Platform.OS === 'android';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { ROUTES } from '../constants/routes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';   // 코스 탭 헤더와 동일한 그린 그라데이션(색 통일)
import { C, F, fs } from '../constants/colors';
import { formatNameList } from '../utils/nameList';
import { WEEKDAYS } from '../constants/data';
import { ScheduleModal } from './ScheduleModal';
import { ScheduleSheetModal } from './ScheduleSheetModal';
import { RoundupTeamScreen } from './RoundupTeamScreen';      // 단체팀 화면(조 편성·티오프)
import { ShareMomentModal } from './ShareMomentModal';        // 동반자 공유 — 이미지 카드(홈과 동일)
import { getScheduleWxSummary } from '../utils/scheduleWx';    // 공유 카드 코스명 위 해당일 날씨 주입
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { showAppAlert } from './AppAlert';
import { showToast } from './AppToast'; // 순수 성공 알림('초대를 보냈어요')은 차단형 대신 토스트로
import { AlarmSetupModal, QuickMealPrompt } from './AlarmSetupModal';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { UserContext } from '../contexts/UserContext';
import { cancelRoundAlarms, scheduleRoundAlarms, getAlarmTypes, getAlarmConfig, applyDefaultAlarms } from '../utils/notifications';
import { getCalendarChoice } from '../utils/deviceCalendar';
import { roundsOnly } from '../utils/diaryKind';
import { GreenFlag, Icon } from './common/Icon'; // 🏌️ → 입체 그린·핀 SVG / people → 동반자 아이콘
import { CalendarPickerModal } from './CalendarPickerModal';
import { CourseLogModal } from './CourseLogModal';
import { loadFriendData } from '../utils/friendGroups';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { loadMyFriendsEnriched } from '../utils/friends';
import { shareScheduleToFriends, getScheduleGroup, notifyScheduleGroupMembers, leaveScheduleGroup, syncGroupContentByMember } from '../utils/scheduleShares';
import { buildCompanionNames } from '../utils/scheduleCompanions';
import { leaveMealAudience } from '../utils/mealSuggestions'; // 일정 이탈 시 식사 audience 이탈(식사 푸시·카드 중단)
import { WEB_BASE } from '../utils/links';                 // 일정 공유 평문에 붙일 앱 랜딩/설치 링크
import { FriendSelectModal } from './FriendSelectModal';
import { MealDecisionBar } from './MealDecisionBar';

const DAYS = WEEKDAYS;

// 라운딩 종료(티오프+4h) 경과 여부 — 홈 종료 카드(HomeScreen.teeoffEndMs)와 동일 시점으로 통일.
//   같은 날(D-0)이라도 라운딩이 끝났으면 '완료'로 보아 ①미기록 표시·기록 추가하기 노출
//   ②일정 출처(모집/수동) 무관하게 캘린더 직접 삭제 허용(모집연동도 갇히지 않음).
//   date 'YYYY.MM.DD' + time 'HH:MM'. 시간 없으면 08:00 가정(홈과 동일).
function roundEnded(s) {
  if (!s?.date) return false;
  const [y, m, d] = String(s.date).split('.').map(Number);
  const [hh, mm] = String(s.time || '08:00').split(':').map(Number);
  if (!y || !m || !d) return false;
  const teeOff = new Date(y, m - 1, d, hh || 8, mm || 0).getTime();
  return !Number.isNaN(teeOff) && Date.now() > teeOff + 4 * 3600 * 1000;
}

// 일정이 없을 때 빈 상태 뒤에 흐릿하게 깔리는 샘플 카드 (장식용 · 비활성)
function SampleScheduleCard({ course, meta, sideColor, badgeBg, badgeFg, badgeTxt, dashed, fade }) {
  return (
    <View style={{
      flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 12,
      padding: _and ? 10 : 14, marginBottom: _and ? 7 : 12, opacity: fade,
      ...(dashed
        ? { borderWidth: 1, borderColor: C.warmGray, borderStyle: 'dashed' }
        : { borderWidth: 0.5, borderColor: C.hairline }),
    }}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: sideColor, marginRight: 12, alignSelf: 'stretch' }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>{course}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>{meta}</Text>
      </View>
      <View style={{ backgroundColor: badgeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: badgeFg }}>{badgeTxt}</Text>
      </View>
    </View>
  );
}

export function MyScheduleTab({ onRequestAddDiary, onRequestOpenDiary, diaries = [], navigation, jumpDate, onCloseSchedule }) {
  const { schedules, addSchedule, editSchedule, removeSchedule } = React.useContext(SchedulesContext);
  const { userProfile } = React.useContext(UserContext);
  const currentUid = useCurrentUid();   // 일정 전파 초대 발신자 uid (홈과 동일, [[uid-stabilization-plan]])
  // 캘린더 날짜 동그라미 — 확대(디스플레이 줌) 시 셀 폭(winW/7)이 좁아지면 32 고정이 셀을 넘쳐 캘린더 우측이
  //   잘림 → winW 기반으로 유연하게. 정상 줌(winW 큼)엔 32 유지, 확대 시만 축소(2026-06-24). 24=그리드 좌우 패딩(12*2).
  const { width: winW } = useWindowDimensions();
  const dateCircleSize = Math.min(32, Math.floor((winW - 24) / 7) - 4);
  const insets = useSafeAreaInsets(); // 바텀시트가 안드로이드 내비바에 안 가리도록
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modal, setModal] = useState({ visible: false, initial: null });
  const [pendingAlarm, setPendingAlarm] = useState(null);
  const [pendingQuickAlarm, setPendingQuickAlarm] = useState(null); // '이대로 자동' — 식사시각만 묻는 가벼운 프롬프트
  const [alarmEditExisting, setAlarmEditExisting] = useState(null); // 시트에서 알람 변경 시 기존 설정 프리필
  const [calPickerOpen, setCalPickerOpen] = useState(false);
  const [sheet, setSheet] = useState({ visible: false, schedule: null });
  const [scheduleShareTarget, setScheduleShareTarget] = useState(null); // 동반자 공유 — 이미지 카드 대상(홈과 동일)
  const [teamRid, setTeamRid] = useState(null);                         // 단체팀 화면 대상 roundupId(시트→단체팀)
  const [wxPopup, setWxPopup] = useState({ visible: false, schedule: null, tab: 'wx' });
  // 친구 일정에 초대 + 함께 식사 — 홈과 동일 기능을 캘린더에서도(공용 일정 시트에서 진입)
  const [inviteTarget, setInviteTarget] = useState(null);
  const [inviteFriends, setInviteFriends] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [mealSchedule, setMealSchedule] = useState(null);   // 함께 식사 시트 대상(triggerless MealDecisionBar)
  const [mealAutoOpen, setMealAutoOpen] = useState(false);
  const [picker, setPicker] = useState({ visible: false, year: 0, month: 0 });
  const [showCourseLog, setShowCourseLog] = useState(false);
  // '내 코스 모아보기' 주목 유도 — 은은한 맥동(scale). 통계·방문기록이 여기 있어 탭 유도(사용자 2026-06-19).
  const coursePulse = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(coursePulse, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(coursePulse, { toValue: 0, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const courseScale = coursePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  // 내가 지정한 친구 별명(customName) — 동반자 이름 '표시'에만 resolve. 저장된 일정 데이터(companions.name)는
  //   닉네임 그대로(전파·공유는 닉네임, owner-only 표시만 별명) ([[friend_groups]], [[diary-companion-matching]])
  const [friendMeta, setFriendMeta] = useState({});
  useEffect(() => { loadFriendData().then(fd => setFriendMeta(fd.friendMeta || {})).catch(() => {}); }, []);
  // MY 탭 focus 시 친구 별명 재로드 — 탭이 상주 마운트라 마운트 1회 로드만으론 별명 변경이 캘린더 동반자 표시에
  //   반영 안 되던 것 보강(2026-06-26 감사).
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('focus', () => {
      loadFriendData().then(fd => setFriendMeta(fd.friendMeta || {})).catch(() => {});
    });
    return unsub;
  }, [navigation]);
  // 전파 일정(groupId) 그룹 일괄 로드 — 캘린더 카드 동반자에 '친구 초대'(audience) 멤버까지 보강(2026-06-24).
  //   companions만 보면 친구초대로 들어온 동반자가 누락됐음(홈 바텀시트와 동일하게 그룹 보강). groupId 집합이 바뀔 때만 재로드.
  const [groupsById, setGroupsById] = useState({});
  const groupIdSig = useMemo(() => [...new Set((schedules || []).map(s => s?.groupId).filter(Boolean))].sort().join(','), [schedules]);
  useEffect(() => {
    const gids = groupIdSig ? groupIdSig.split(',') : [];
    if (!gids.length) { setGroupsById({}); return; }
    let alive = true;
    Promise.all(gids.map(gid => getScheduleGroup(gid).then(g => [gid, g]).catch(() => [gid, null])))
      .then(pairs => { if (alive) setGroupsById(Object.fromEntries(pairs.filter(([, g]) => g))); });
    return () => { alive = false; };
  }, [groupIdSig]);

  // 친구 일정에 초대(일정 전파) — 홈 HomeScreen과 동일 동선([[schedule-propagation-spec]]). 시트 닫고 친구선택 → 발송.
  const handleInviteFriends = async (schedule) => {
    if (!schedule) return;
    setSheet(prev => ({ ...prev, visible: false }));
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
      const names = {};
      (inviteFriends || []).forEach(f => { const id = f.id || f.uid; if (id && uids.includes(id)) names[id] = f.customName || f.name || ''; });
      const groupId = await shareScheduleToFriends({ schedule, initiatorUid: currentUid, initiatorName: userProfile?.nickname || '', friendUids: uids, names });
      if (!groupId) { showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.'); return; }
      if (!schedule.groupId) await editSchedule(schedule.id, { groupId }); // 전파 일정 표식
      // 인원 자동 증가 — 1(나) + 누적 초대자 수가 현재 인원보다 크면 올림 + 그룹 반영(다른 멤버에게도 인원 변경 반영).
      try {
        const group = await getScheduleGroup(groupId);
        const audCount = Array.isArray(group?.audienceUids) ? group.audienceUids.length : 0;
        const cur = Number(schedule?.members) || 0;
        const next = Math.max(cur, Math.min(4, 1 + audCount));   // 4 캡 — 모달 칩(2/3/4) 범위 내(한 조 최대 4)
        if (next !== cur && schedule?.id) {
          await editSchedule(schedule.id, { members: next });
          await syncGroupContentByMember(groupId, { ...schedule, members: next });
        }
      } catch (e) { if (__DEV__) console.warn('[mySchedule] members auto-bump', e?.message); }
      showToast(`친구 ${uids.length}명에게 초대를 보냈어요`);
    } catch (e) {
      if (__DEV__) console.warn('[mySchedule] invite', e?.message);
      showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.');
    }
  };
  // 함께 식사 — 시트 닫고 화면 레벨 triggerless MealDecisionBar를 autoOpen으로 연다(홈 카드와 동일 기능: 식당 정하기·네이버/티맵).
  const openMealForSchedule = (schedule) => {
    if (!schedule) return;
    setSheet(prev => ({ ...prev, visible: false }));
    setMealSchedule(schedule);
    setMealAutoOpen(true);
  };

  // B안 — 그리드 셀 탭 시 monthItems 카드로 스크롤 + 일시 하이라이트
  // ([[home-multi-schedule-same-day]] 일정-다이어리 풀 진입 제거, 캘린더 안에서 정보 확인 완결)
  const scrollViewRef = React.useRef(null);
  const monthSectionYRef = React.useRef(0);    // '이번달 일정' 섹션의 ScrollView 안 y 좌표
  const cardYsRef = React.useRef({});          // { [scheduleId]: 카드의 섹션 안 y }
  const pendingScrollDateRef = React.useRef(null); // 셀 탭 시점에 카드 측정 안 됐으면 여기 저장, onLayout 시 자동 scroll
  const [highlightedDate, setHighlightedDate] = React.useState(null); // 날짜 단위 강조 — 같은 날 카드 N개 모두 강조
  const highlightTimerRef = React.useRef(null);
  // 일반 함수 — 매 렌더마다 현재 monthItems를 보는 클로저로 새로 생성.
  // useCallback([])이면 첫 렌더의 monthItems(처음 본 달)를 영구 capture해, 다른 달로 넘기면
  // 그 달 카드를 .find()로 못 찾아 스크롤 실패(과거달 탭 무반응의 원인). 호출은 이벤트/onLayout뿐이라 매번 새로 만들어도 비용 무시 가능.
  const scrollToCardForDate = (dateStr) => {
    const target = monthItems
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
      .find(it => it.date === dateStr);
    if (!target) return false;
    const cardY = cardYsRef.current[target.id];
    if (typeof cardY !== 'number') return false;
    scrollViewRef.current?.scrollTo({
      y: Math.max(0, monthSectionYRef.current + cardY - 16),
      animated: true,
    });
    // 일시 하이라이트 — 사용자 시선이 따라가도록 1.4초간 강조
    setHighlightedDate(dateStr);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedDate(null), 1400);
    return true;
  };

  const openPicker = () => setPicker({ visible: true, year: currentDate.getFullYear(), month: currentDate.getMonth() + 1 });
  const confirmPicker = () => {
    setCurrentDate(new Date(picker.year, picker.month - 1, 1));
    setPicker(p => ({ ...p, visible: false }));
  };

  // 예정 라운딩 목록(캘린더 헤더 + 버튼)에서 항목 선택 → 해당 월로 이동
  React.useEffect(() => {
    if (jumpDate) setCurrentDate(new Date(jumpDate.y, jumpDate.m, 1));
  }, [jumpDate]);

  // 일상(모멘트)은 캘린더에 안 뜸 — 라운딩 기록만 날짜 점으로 표시([[moment-feed-extension]] 캘린더 무관)
  const completedDates = React.useMemo(
    () => roundsOnly(diaries).map(x => x.date).filter(Boolean),
    [diaries],
  );

  // 일정 카드 단위 매칭 — scheduleId 우선, fallback course+date.
  // 같은 날 일정 N건 + 다이어리 매칭의 비대칭 차단([[home-multi-schedule-same-day]] 룰3).
  const hasRecordForSched = React.useCallback((s) => {
    if (!s) return false;
    if (s.id && diaries.some(d => d.scheduleId === s.id)) return true;
    // fallback은 일정에 연결 안 된(scheduleId 없는) 구·직접작성 다이어리만 — 같은 구장·날 36홀 비대칭 차단
    return diaries.some(d => d.course === s.course && d.date === s.date && !d.scheduleId);
  }, [diaries]);

  // 일정 → 매칭되는 다이어리 객체 (탭 시 상세 열기에 사용)
  const findDiaryForSched = React.useCallback((s) => {
    if (!s) return null;
    if (s.id) {
      const byId = diaries.find(d => d.scheduleId === s.id);
      if (byId) return byId;
    }
    return diaries.find(d => d.course === s.course && d.date === s.date && !d.scheduleId) || null;
  }, [diaries]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  // 표시 중인 달이 과거 달인지 — 지난달엔 '첫 라운드 등록' 안내를 띄우지 않음
  const isPastMonth = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const monthStr = `${year}.${String(month + 1).padStart(2, '0')}`;

  const dateStrFor = (m, d) => {
    const ymd = new Date(year, month + m, d);
    return `${ymd.getFullYear()}.${String(ymd.getMonth() + 1).padStart(2, '0')}.${String(ymd.getDate()).padStart(2, '0')}`;
  };
  const schedOnStr = (str) => schedules.find(s => s.date === str);
  const hasRecord = (str) => completedDates.includes(str);
  const isToday = (m, d) => {
    const ymd = new Date(year, month + m, d);
    return ymd.getTime() === todayMid;
  };
  const isPast = (m, d) => {
    const ymd = new Date(year, month + m, d);
    return ymd.getTime() < todayMid;
  };

  // status: 'today' | 'today-round' | 'upcoming' | 'completed-record' | 'completed-norecord' | 'normal'
  const getStatus = (m, d) => {
    const dateStr = dateStrFor(m, d);
    if (isToday(m, d)) {
      // 오늘 일정 또는 기록(일정 없이 당일 입력 — 자동일정 폐지)이 있으면 라운딩 표시. ([[diary-schedule-orphan-fix]])
      if (schedOnStr(dateStr) || hasRecord(dateStr)) return 'today-round';
      return 'today';
    }
    const sched = schedOnStr(dateStr);
    // 일정 없이 라운딩 기록만 있는 날 → 완료+기록으로 표시 (과거 기록 입력 케이스).
    // 하단 orphan 카드와 캘린더 동그라미를 일치시켜 '다녀온 날'을 캘린더에서도 확인.
    if (!sched) return hasRecord(dateStr) ? 'completed-record' : 'normal';
    const past = isPast(m, d);
    if (!past) return 'upcoming';
    return hasRecord(dateStr) ? 'completed-record' : 'completed-norecord';
  };

  // Build cells: [{ d, monthOffset, status }]
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ d: prevMonthDays - i, monthOffset: -1 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, monthOffset: 0 });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ d: cells.length - daysInMonth - firstDay + 1, monthOffset: 1 });
  }

  const goPrev = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const goNext = () => setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  // 캘린더 좌우 스와이프로 전달/다음달 이동
  // activeOffsetX: 가로로 10px만 움직여도 활성화 / failOffsetY: 세로 움직임이 먼저면 실패 → 세로 스크롤 유지
  // (ScrollView를 gesture-handler 버전으로 교체해 Android에서도 중첩 제스처가 동작)
  const monthSwipe = React.useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-10, 10])
    .failOffsetY([-22, 22])
    .onEnd((e) => {
      if (e.translationX > 24 || e.velocityX > 260) goPrev();
      else if (e.translationX < -24 || e.velocityX < -260) goNext();
    }), []);

  const handleDateTap = (m, d) => {
    if (m !== 0) {
      setCurrentDate(new Date(year, month + m, 1));
      return;
    }
    const dateStr = dateStrFor(0, d);
    // 일정뿐 아니라 '기록만 있는 날'(과거 직접입력 — 일정 자동생성 폐지로 schedule 없음)도
    // 가상 카드(orphanItems)가 있으므로 스크롤 대상. 기록된 날 탭 시 기록추가창 오진입 차단. ([[diary-schedule-orphan-fix]])
    const existing = schedOnStr(dateStr) || hasRecord(dateStr);

    // 일정/기록 있는 셀 → 카드로 스크롤만. 시트·다이어리 진입은 카드에서 사용자가 의식적으로.
    // 달 전환 직후엔 onLayout 측정이 늦어 첫 시도 실패할 수 있음 → 카드 mount 대기 폴링
    if (existing) {
      if (scrollToCardForDate(dateStr)) return;
      // pendingScrollDate에 저장 → 카드 onLayout 측정 즉시 자동 scroll (폴링 X)
      pendingScrollDateRef.current = dateStr;
      // 안전망 — 500ms 후에도 측정 안 됐으면 한 번 더 시도, 그래도 실패면 포기
      setTimeout(() => {
        if (pendingScrollDateRef.current === dateStr) {
          scrollToCardForDate(dateStr);
          pendingScrollDateRef.current = null;
        }
      }, 500);
      return;
    }
    const dt = new Date(year, month, d);
    // 과거 + 일정·기록 둘 다 없음 → 라운딩 기록 추가
    if (dt.getTime() < todayMid) {
      onRequestAddDiary && onRequestAddDiary({ date: dateStr, day: DAYS[dt.getDay()] });
      return;
    }
    // 미래 + 일정 없음 → 새 일정 추가
    setModal({
      visible: true,
      initial: { date: dateStr, day: DAYS[dt.getDay()], time: '07:00', members: 4 },
    });
  };

  const handleSave = async (type, data) => {
    if (type === 'schedule') {
      let newS;
      try { newS = await addSchedule(data); }
      // 실패 시 false 반환 — 모달이 열린 채 내부 OverlayAlert로 안내(전역 알럿은 RN Modal 아래 깔림) + 입력 보존
      catch (e) { console.warn('[mySchedule] add failed:', e?.message); return false; }
      // (캘린더 추가는 addSchedule이 일괄 처리)
      // 일정 추가 완료 → 알람 팝업.
      //   '이대로 자동'이면 전체 팝업 대신 '식사시각만' 묻는 가벼운 프롬프트(나머지는 저장설정대로 자동).
      if (userProfile.alarmPromptDisabled) {
        setPendingQuickAlarm(newS);
      } else {
        setPendingAlarm(newS);
      }
    } else if (type === 'schedule-edit') {
      // oldS는 편집 모달의 프리필값(modal.initial)과 같은 소스여야 memoChanged가 정확 — 로컬 schedules 배열은
      //   memo가 stale일 수 있어 '메모 안 바꿔도 바뀐 것으로' 오판(spurious 그룹 알림·오귀속). HomeScreen(editScheduleTarget)과 통일(리뷰 3차 2026-07-06).
      const oldS = (modal.initial && modal.initial.id === data.id) ? modal.initial : schedules.find(s => s.id === data.id);
      try {
        const { id, createdAt, ownerUid, ...patch } = data;
        await editSchedule(data.id, patch);
      } catch (e) { console.warn('[mySchedule] edit failed:', e?.message); return false; } // 모달 유지 + 입력 보존
      // 전파 일정(groupId, 라운지 아님) 수정 → 그룹 내용 갱신 + 변경 알림. 다른 멤버는 자기 화면에서 '반영할까요?' 확인.
      //   구장·날짜는 잠금이라 time/members/booker/subCourse만 동기화. ([[schedule-propagation-spec]])
      if (oldS?.groupId && !oldS?.roundupId && currentUid) {
        const memoChanged = (oldS.memo || '') !== (data.memo || '');
        const coreChanged = (oldS.time !== data.time)
          || (Number(oldS.members) !== Number(data.members))
          || ((oldS.booker || '') !== (data.booker || ''))
          || ((oldS.subCourse || '') !== (data.subCourse || ''));
        const changed = coreChanged || memoChanged;
        if (changed) {
          // memo가 바뀐 편집이면 수정자 전달 → 그룹에 'OO님 수정' 기록 (HomeScreen 편집 경로와 동일, 리뷰 2026-07-06)
          syncGroupContentByMember(oldS.groupId, { ...oldS, ...data },
            memoChanged ? { uid: currentUid, name: userProfile?.nickname || '' } : null).then(async () => {
            try {
              const group = await getScheduleGroup(oldS.groupId);
              // 공지만 바뀐 편집은 전용 타입(scheduleMemo)+내용 미리보기 (HomeScreen과 동일, 2026-07-10)
              await notifyScheduleGroupMembers({ group, myUid: currentUid,
                type: coreChanged ? 'scheduleChanged' : 'scheduleMemo',
                actorName: userProfile?.nickname || '', course: data.course, date: data.date, time: data.time,
                memoPreview: !coreChanged ? String(data.memo || '').replace(/\s+/g, ' ').slice(0, 40) : undefined });
            } catch (e) { if (__DEV__) console.warn('[mySchedule] notify changed', e?.message); }
          });
        }
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
    setModal({ visible: false, initial: null });
  };

  // 첫 일정 등록 시 — 캘린더를 한 번도 안 골랐으면 선택 팝업 노출
  // 앞선 모달(일정·알람)이 완전히 닫힌 뒤 열어야 iOS 모달 표시 충돌이 안 남
  const maybePromptCalendar = () => {
    getCalendarChoice().then(choice => {
      if (!choice) setTimeout(() => setCalPickerOpen(true), 450);
    });
  };

  const handleEdit = async () => {
    const s = sheet.schedule;
    // 전파 일정 memo는 group.memo가 진실원 — 편집 프리필도 '최신 group.memo'로([[save-revert-bug-pattern]], HomeScreen과 동일).
    //   ★그룹 로드를 '먼저' 하고 시트를 닫는다 — 먼저 닫으면 로드 대기 중 빈 화면이 뜸(리뷰 3차 2026-07-06).
    let target = s;
    if (s?.groupId && !s?.roundupId) {
      try { const g = await getScheduleGroup(s.groupId); if (g) target = { ...s, memo: g.memo ?? s.memo ?? '' }; }
      catch (e) { if (__DEV__) console.warn('[mySchedule] edit prefill group memo', e?.message); }
    }
    setSheet({ visible: false, schedule: null });
    setModal({ visible: true, initial: target });
  };

  // 일정의 D-day 계산 (0=오늘, 음수=지난 라운딩)
  const computeDDay = (s) => {
    if (!s || !s.date) return 0;
    const t = new Date(s.date.replace(/\./g, '-')).getTime();
    return Math.round((t - todayMid) / 86400000);
  };

  // 바텀시트 → 날씨/교통 팝업 (시트가 닫힌 뒤 열어 iOS 모달 표시 충돌 방지)
  const openWxFromSheet = (tab) => {
    const s = sheet.schedule;
    if (!s) return;
    setSheet({ visible: false, schedule: null });
    setTimeout(() => setWxPopup({ visible: true, schedule: s, tab }), 280);
  };

  // 바텀시트 → 코스 상세. 홈(handleCardCoursePress)과 동일 — id 있으면 그 코스, 없으면 이름으로(GuideScreen이 검색해 연다).
  //   ★시트 + 일정 캘린더(asModal일 때 ScheduleScreen Modal)를 닫고 '즉시' navigate(onRequestOpenDiary와 동일 패턴).
  //     안 닫으면 일정 Modal이 위에 떠 COURSE가 뒤에 가려 안 보였음(iOS). 지연(setTimeout)은 언마운트 후 실행돼 오히려 씹힘.
  const handleSheetCourse = () => {
    const s = sheet.schedule;
    if (!s || !navigation) return;
    const id = s.courseLogId || s.courseId;
    setSheet({ visible: false, schedule: null });
    onCloseSchedule?.();   // 일정 캘린더 Modal 닫기(탭 화면이면 no-op)
    if (id) navigation.navigate(ROUTES.COURSE, { openCourseId: id, returnToCalendar: true });
    else if (s.course) navigation.navigate(ROUTES.COURSE, { openCourseName: s.course, openCourseKakaoId: s.courseKakaoId || null, returnToCalendar: true });
  };

  // 바텀시트 → 라운지 모집글 상세. 모집 연동 예정 일정은 일정수정이 막혀 있어, 원본 모집글로 보내 거기서 관리(취소·나가기·정보).
  //   handleSheetCourse와 동일 패턴 — 시트 + 일정 캘린더 Modal 닫고 즉시 navigate(openPostId로 RoundupTab이 목록에 없어도 fetch해 상세 오픈).
  const handleSheetRoundup = () => {
    const s = sheet.schedule;
    if (!s?.roundupId || !navigation) return;
    setSheet({ visible: false, schedule: null });
    onCloseSchedule?.();   // 일정 캘린더 Modal 닫기(탭 화면이면 no-op)
    navigation.navigate(ROUTES.LOUNGE, { openPostId: s.roundupId });
  };

  // 바텀시트 → 동반자에게 공유: 이미지 카드(ShareMomentModal) — 홈과 동일. 시트 닫고 카드 열기(3중 Modal 회피).
  //   해당일 날씨를 비동기 주입(코스명 위), 카드의 '링크 공유'가 평문(설치 링크) 담당.
  const handleSheetShare = () => {
    const s = sheet.schedule;
    if (!s) return;
    setSheet(prev => ({ ...prev, visible: false }));
    const target = { ...s, dDay: computeDDay(s) };
    setScheduleShareTarget(target);
    if (!target.weather) {
      getScheduleWxSummary(target).then(w => {
        if (w) setScheduleShareTarget(prev => (prev && prev.date === target.date && prev.course === target.course) ? { ...prev, weather: w.summary, weatherText: w.detail, weatherIcon: w.icon } : prev);
      }).catch(() => {});
    }
  };
  // 카드의 '링크 공유' — 평문(설치 링크 포함). 홈 shareScheduleText와 동일 동선. 날씨는 예보 있을 때만(기온·강수확률).
  const shareScheduleText = async (s) => {
    if (!s) return;
    const dd = computeDDay(s);
    const ddText = dd > 0 ? `D-${dd}` : dd === 0 ? 'D-DAY' : '지난 라운딩';
    const lines = [
      '[ Dear Golf ]', s.course, `${s.date} ${s.day}요일 ${s.time}`, `${s.members}명 동반 · ${ddText}`,
    ];
    if (s.weatherText) lines.push(`예상 날씨 ${s.weatherText}`);
    lines.push('나만의 골프 캐디, Dear Golf와 함께하는 라운딩입니다 ⛳', WEB_BASE);
    try { await Share.share({ message: lines.join('\n') }); }
    catch (e) { console.warn('[share schedule]', e?.message); }
  };

  // 전파 일정(groupId) 개인 삭제 = 조용히 탈퇴 — 취소 알림 X(한 명이 빠지는 것일 뿐, 개인 권리 존중). 홈 삭제와 동일.
  //   탈퇴(memberUids 제거)는 유지 → 변경 푸시 중단. 식사 audienceUids도 이탈 → 식사 푸시·카드 중단 ([[schedule-propagation-spec]]).
  const cleanupGroupOnDelete = async (s) => {
    if (!s?.groupId || !currentUid) return;
    leaveScheduleGroup(s.groupId, currentUid).catch(e => { if (__DEV__) console.warn('[mySchedule] leave group', e?.message); });
    leaveMealAudience(s.groupId, currentUid);
  };

  // 일정 삭제 — 상황별 확인. 시트의 삭제 버튼 + 목록 카드 길게누르기 양쪽에서 사용
  const deleteSchedule = (s) => {
    if (!s) return;
    const isPast = new Date((s.date || '').replace(/\./g, '-')).getTime() < todayMid;
    const hasRec = hasRecordForSched(s);
    const roundOver = roundEnded(s); // 티오프+5h 경과 — 모집연동 D-0 일정도 캘린더 직접 삭제 허용(갇힘 방지)
    const remove = async () => {
      try { await removeSchedule(s.id); }
      catch (e) { console.warn('[mySchedule] remove failed:', e?.message); return; }
      cancelRoundAlarms(s.id); // 일정 삭제 시 예약된 알람도 취소 (캘린더 제거는 removeSchedule이 일괄 처리)
      await cleanupGroupOnDelete(s); // 전파 일정이면 취소 알림 + 그룹 탈퇴
    };

    // 과거 라운딩 + 다이어리 기록 있음 → 다이어리에서 삭제하도록 안내
    if (isPast && hasRec) {
      showAppAlert('삭제 안내', '이 라운딩은 기록이 있어요.\nMY 탭에서 삭제해주세요.', [{ text: '확인' }]);
      return;
    }
    // 라운지 모집으로 생긴 예정 일정 — 캘린더에서 직접 삭제 X, 라운지 취소·나가기로만 ([[roundup-schedule-delete-policy]]).
    //   탭→시트(ScheduleSheetModal) 경로는 이미 막는데 길게누르기 경로만 가드가 빠져 있었음. 과거는 시트와 동일하게 일반 삭제 허용.
    if (s.roundupId && !isPast && !roundOver) {
      showAppAlert('라운지 일정', '이 라운딩은 라운지 모집으로\n만들어졌어요.\n취소하려면 라운지에서 모집 취소\n또는 참여 취소를 해주세요.', [{ text: '확인' }]);
      return;
    }
    // 과거 + 기록 없음 → 일정·코스기록 모두 삭제 / 예정 → 단순 확인
    showAppAlert(
      '일정 삭제',
      isPast
        ? '이 일정을 삭제하면 일정과\n라운딩 기록이 모두 삭제됩니다.'
        : '이 예정 라운딩을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: remove },
      ],
    );
  };

  // 시트 안에서 이미 confirm 완료된 상태 — 바로 remove + 시트 닫음.
  // (별도 AppAlert 띄우지 않음. RN의 3중 Modal 중첩 z-index 충돌 회피.)
  const handleDelete = () => {
    const s = sheet.schedule;
    // 시트를 '먼저' 닫고(닫힘 애니메이션과 리스트 변경이 겹쳐 안드에서 삭제 카드가 깜빡이던 잔상 방지)
    //   삭제는 낙관적으로 백그라운드 처리 — 컨텍스트 removeSchedule이 즉시 반영·실패 시 복원 + 알람 취소.
    setSheet({ visible: false, schedule: null });
    if (!s) return;
    removeSchedule(s.id).catch(e => { console.warn('[mySchedule] remove failed:', e?.message); showToast('일정 삭제에 실패했어요'); });
    cleanupGroupOnDelete(s); // 전파 일정이면 취소 알림 + 그룹 탈퇴 (홈과 동일)
  };

  const monthSchedules = schedules.filter(s => s.date && s.date.startsWith(monthStr));
  // 일정 없이 라운딩 기록(diary)만 있는 날짜 → 가상 카드로 추가.
  // 신규 사용자가 과거 라운딩을 기록으로만 입력해도 캘린더에서 '어디 다녀왔는지' 보여야 함
  // (통계·내코스모아보기와 일관). 카드 탭 시 onPress의 past+rec 분기가 다이어리 상세로 연결하므로
  // B-3안(2026-05-29)이 우려했던 '잘못된 진입'은 해소된 상태.
  const scheduleDateSet = new Set(monthSchedules.map(s => s.date));
  const orphanItems = roundsOnly(diaries) // 일상(모멘트)은 일정/캘린더 무관 — 가상 카드서 제외([[moment-feed-extension]])
    .filter(d => d.date && d.date.startsWith(monthStr) && !scheduleDateSet.has(d.date))
    .map(d => {
      const [y, mm, dd] = d.date.split('.').map(Number);
      const dt = new Date(y, mm - 1, dd);
      return {
        id: `diary-${d.id}`,
        virtual: true,
        course: d.course,
        date: d.date,
        day: d.day || DAYS[dt.getDay()],
        time: d.time || '',
        members: d.members || 0,
        // 과거 기록의 동반자도 카드에 표시 — 본인(isMe)은 예정 카드와 동일하게 제외 (diary는 {name,isMe} 저장)
        companions: Array.isArray(d.companions) ? d.companions.filter(c => c && !c.isMe) : [],
      };
    });
  const monthItems = [...monthSchedules, ...orphanItems];

  const renderDateCircle = (cell) => {
    const { d, monthOffset } = cell;
    // Outside current month
    if (monthOffset !== 0) {
      return (
        <View style={{ width: dateCircleSize, height: dateCircleSize, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.en, fontSize: fs(16), color: '#C8C4BC' }}>{d}</Text>
        </View>
      );
    }

    const status = getStatus(0, d);
    const base = { width: dateCircleSize, height: dateCircleSize, borderRadius: dateCircleSize / 2, alignItems: 'center', justifyContent: 'center' };
    const baseText = { fontFamily: F.en, fontSize: fs(16) };
    // Android Fabric(New Arch)은 둥근 View를 렌더 최적화로 병합하며 borderRadius를 간헐적으로
    // 누락시켜 네모로 그림(달 이동 시 됐다 안 됐다). collapsable={false}로 병합을 막아 원형 고정.
    const noCollapse = _and ? { collapsable: false } : {};

    switch (status) {
      case 'today':
        // 오늘 — 크고 버건디색 숫자 + 버건디 언더바 (동그라미 X)
        return (
          <View style={{ width: dateCircleSize, height: dateCircleSize, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(22), color: C.burgundy }}>{d}</Text>
            <View style={{ position: 'absolute', bottom: 1, width: 20, height: 3.5, borderRadius: 2, backgroundColor: C.burgundy }} />
          </View>
        );
      case 'today-round':
        // 오늘 라운딩 있음: 차콜 fill + 골드 테두리 (기존 유지)
        return (
          <View {...noCollapse} style={[base, { backgroundColor: C.charcoal, borderWidth: 2, borderColor: '#C9A84C' }]}>
            <Text style={[baseText, { color: C.butter, fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'upcoming':
        // 예정: 버건디 fill 원
        return (
          <View {...noCollapse} style={[base, { backgroundColor: C.burgundy }]}>
            <Text style={[baseText, { color: '#fff', fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'completed-record':
        // 완료+기록있음: 버터색 fill 원
        return (
          <View {...noCollapse} style={[base, { backgroundColor: 'rgba(245,230,168,0.85)' }]}>
            <Text style={[baseText, { color: C.charcoal, fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'completed-norecord':
        // 완료+기록없음: 실선 테두리 원 (테두리만 있어 Fabric 네모 버그가 가장 잘 드러나는 케이스)
        return (
          <View {...noCollapse} style={[base, { borderWidth: 2, borderColor: C.warmGray }]}>
            <Text style={[baseText, { color: C.warmGray }]}>{d}</Text>
          </View>
        );
      default:
        return (
          <View {...noCollapse} style={base}>
            <Text style={[baseText, { color: C.charcoal }]}>{d}</Text>
          </View>
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
        {/* 캘린더 영역 (좌우 스와이프 → 전달/다음달) */}
        <GestureDetector gesture={monthSwipe}>
        <View>
        {/* Month header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: _and ? 7 : 14 }}>
          <TouchableOpacity onPress={goPrev} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(22), color: C.warmGray }}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openPicker} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }} activeOpacity={0.6}>
            <Text style={{ fontFamily: F.en, fontSize: fs(19), color: C.charcoal }}>
              {year}. {String(month + 1).padStart(2, '0')} ▾
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goNext} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(22), color: C.warmGray }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day labels */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
          {DAYS.map((dl, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', paddingBottom: _and ? 3 : 6 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: i === 0 ? '#6B1E2A' : i === 6 ? C.navy : C.warmGrayLight }}>
                {dl}
              </Text>
            </View>
          ))}
        </View>

        {/* Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 }}>
          {cells.map((cell, i) => (
            <TouchableOpacity key={i}
              onPress={() => handleDateTap(cell.monthOffset, cell.d)}
              activeOpacity={0.6}
              style={{ width: `${100 / 7}%`, paddingVertical: _and ? 2 : 4, alignItems: 'center' }}>
              {renderDateCircle(cell)}
            </TouchableOpacity>
          ))}
        </View>
        </View>
        </GestureDetector>

        {/* Legend */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: _and ? 9 : 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: C.burgundy }} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>예정</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: 'rgba(245,230,168,0.85)' }} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>완료·기록</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 999, borderWidth: 1, borderColor: C.warmGray }} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>완료·미기록</Text>
          </View>
        </View>

        {/* 내 코스기록 진입 — 코스 탭 헤더와 '동일 그린 그라데이션'으로 색 통일(같은 기능=같은 색, CourseLogModal 헤더 그린).
            은은한 맥동(scale)+부제로 주목 유도 — 방문 코스·통계가 여기 있어 탭 유도. */}
        <Animated.View style={{ marginHorizontal: 16, marginBottom: _and ? 2 : 4, borderRadius: 12, transform: [{ scale: courseScale }],
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 2.5, elevation: 3 }}>
        <TouchableOpacity onPress={() => setShowCourseLog(true)} activeOpacity={0.85} style={{ borderRadius: 12 }}>
          <LinearGradient colors={['#7A9C6C', '#5E7E52']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12,
              borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)',
              paddingHorizontal: 14, paddingVertical: _and ? 10 : 11 }}>
            <GreenFlag size={fs(26)} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>내 코스 모아보기</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.82)', marginLeft: 7 }}>방문 코스 · 통계 보기</Text>
            </View>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff' }}>›</Text>
          </LinearGradient>
        </TouchableOpacity>
        </Animated.View>

        {/* This month list */}
        <View
          onLayout={(e) => { monthSectionYRef.current = e.nativeEvent.layout.y; }}
          style={{ paddingHorizontal: 16, paddingTop: _and ? 4 : 10, paddingBottom: 32 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, letterSpacing: 1.5, marginBottom: _and ? 6 : 14 }}>
            이번달 일정 · {monthItems.length}개
          </Text>
          {monthItems.length === 0 ? (
            isPastMonth ? (
              <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>이 달엔 등록된 라운딩이 없어요</Text>
              </View>
            ) : (
            <View style={{ position: 'relative' }}>
              {/* 흐릿한 샘플 카드 — 지난 라운딩(더 흐릿) / 예정 라운딩 */}
              <SampleScheduleCard
                course="레이크사이드 컨트리클럽"
                meta="05.06 화 · 07:30 · 4명"
                sideColor={C.warmGray}
                badgeBg="#F0EDE6" badgeFg={C.warmGray} badgeTxt="미기록"
                dashed fade={0.32}
              />
              <SampleScheduleCard
                course="제이드팰리스 골프클럽"
                meta="05.24 토 · 07:00 · 4명"
                sideColor={C.burgundy}
                badgeBg="#F5EAEC" badgeFg={C.burgundy} badgeTxt="예정"
                fade={0.55}
              />
              {/* blur 오버레이 + CTA */}
              <BlurView intensity={22} tint="light" style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                alignItems: 'center', justifyContent: 'center',
                borderRadius: 12, overflow: 'hidden',
                backgroundColor: 'rgba(250,248,243,0.32)',
              }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 14 }}>
                  이 달 라운딩을 등록해보세요
                </Text>
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => {
                    const dt = new Date(year, month, 1);
                    setModal({ visible: true, initial: { date: dateStrFor(0, 1), day: DAYS[dt.getDay()], time: '07:00', members: 4 } });
                  }}
                  style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 26 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.butter }}>+ 일정 추가하기</Text>
                </TouchableOpacity>
              </BlurView>
            </View>
            )
          ) : (
            monthItems
              .slice()
              // 같은 날 일정은 시간순 정렬 (오전·오후 36홀 등)
              // 빈 time(자동 등록 등)은 정렬 시 끝으로 — 시간 정보 있는 일정 우선
              .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '~').localeCompare(b.time || '~'))
              .map(s => {
                // '완료'(미기록·기록추가 노출) 판정 = 날짜 지남 OR 같은 날이라도 티오프+5h 경과(라운딩 끝남).
                //   기존엔 날짜 기준이라 D-0엔 라운딩이 끝나도 다음날까지 '예정'으로 남아 기록 버튼이 안 떴음(사용자 2026-06-20).
                const past = new Date(String(s.date || '').replace(/\./g, '-')).getTime() < todayMid || roundEnded(s);
                const rec = hasRecordForSched(s);
                let status, sideColor, badgeBg, badgeFg, badgeTxt;
                if (rec) {
                  // 다이어리 기록 있으면 완료로 간주 (오늘 입력한 케이스 포함)
                  status = 'completed-record';
                  sideColor = C.butter;
                  badgeBg = '#FBF7EE'; badgeFg = '#A88A2E'; badgeTxt = '기록완료';
                } else if (past) {
                  status = 'completed-norecord';
                  sideColor = C.warmGray;
                  badgeBg = '#F0EDE6'; badgeFg = C.warmGray; badgeTxt = '미기록';
                } else {
                  status = 'upcoming';
                  sideColor = C.burgundy;
                  badgeBg = '#F5EAEC'; badgeFg = C.burgundy; badgeTxt = '예정';
                }

                const cardBorder = status === 'completed-norecord'
                  ? { borderWidth: 1, borderColor: C.warmGray, borderStyle: 'dashed' }
                  : { borderWidth: 0.5, borderColor: C.hairline };
                // 완료된 카드 흐리게 (기록 유무 무관)
                const cardOpacity = (past || rec) ? 0.55 : 1;

                return (
                  <TouchableOpacity key={s.id}
                    onLayout={(e) => {
                      cardYsRef.current[s.id] = e.nativeEvent.layout.y;
                      // 셀 탭 시점에 측정 안 됐던 케이스 — 측정 즉시 자동 scroll (4월처럼 달 전환 후 마운트 늦은 케이스)
                      if (pendingScrollDateRef.current === s.date) {
                        const target = pendingScrollDateRef.current;
                        pendingScrollDateRef.current = null;
                        scrollToCardForDate(target);
                      }
                    }}
                    onLongPress={() => deleteSchedule(s)}
                    delayLongPress={400}
                    onPress={() => {
                      // 길게 누르면 일정 삭제(상황별 분기) — 과거 고아(미기록) 일정 정리 동선. ([[diary-schedule-orphan-fix]])
                      // 사용자 원칙 — 시트(수정·삭제·날씨·교통)는 '미기록 예정' 라운딩에만 의미.
                      // 기록 완료된 라운딩은 당일이라도 끝난 라운딩 → 다이어리 상세로. 수정은 MY 다이어리에서.
                      if (rec) {
                        const diary = findDiaryForSched(s);
                        if (diary && onRequestOpenDiary) onRequestOpenDiary(diary);
                        return;
                      }
                      if (past) {
                        // 과거 + 미기록 → 카드 전체 = '기록 추가하기' 액션 (편의)
                        onRequestAddDiary && onRequestAddDiary(s);
                        return;
                      }
                      // 미래 예정(미기록) → 시트
                      setSheet({ visible: true, schedule: { ...s, hasRec: rec } });
                    }}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: 'row',
                      backgroundColor: highlightedDate === s.date ? '#FBF1D8' : C.bgSecondary,
                      borderRadius: 12,
                      padding: _and ? 10 : 14,
                      marginBottom: _and ? 7 : 12,
                      opacity: highlightedDate === s.date ? 1 : cardOpacity,
                      ...(highlightedDate === s.date
                        ? { borderWidth: 1.5, borderColor: '#C9A84C' }
                        : cardBorder),
                    }}>
                    {/* Left side bar */}
                    <View style={{ width: 3, borderRadius: 2, backgroundColor: sideColor, marginRight: 12, alignSelf: 'stretch' }} />

                    {/* Left content */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>{s.course}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>
                        {s.date} {s.day}{s.time ? ` · ${s.time}` : ''}{s.members ? ` · ${s.members}명` : ''}
                      </Text>
                      {(() => {
                        // companions + 전파 그룹(친구초대 audience 포함) 보강 — 홈 바텀시트와 동일 로직(공용 유틸).
                        const cs = buildCompanionNames(s, { group: groupsById[s.groupId], friendMeta, myUid: currentUid });
                        return cs.length > 0 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                            <Icon name="people" size={fs(13)} color={C.warmGray} strokeWidth={1.7} />
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginLeft: 5, flex: 1 }} numberOfLines={1}>
                              {formatNameList(cs, { sep: ', ' })}
                            </Text>
                          </View>
                        ) : null;
                      })()}
                    </View>

                    {/* Right: badge + record link */}
                    <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', marginLeft: 8 }}>
                      <View style={{ backgroundColor: badgeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: badgeFg }}>{badgeTxt}</Text>
                      </View>
                      {status === 'completed-norecord' && (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation?.(); onRequestAddDiary && onRequestAddDiary(s); }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: C.navy }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#fff' }}>기록 추가하기</Text>
                        </TouchableOpacity>
                      )}
                      {status === 'completed-record' && (() => {
                        // 다이어리에서 score 가져와 카드에 표시 (귀차니즘 골퍼에게 기록 동기 강화 + OCR 도입 시 자동 채움)
                        // [[golfer-score-psychology]] — 잘 친 스코어(80타 미만)는 골드로 강조
                        const diary = findDiaryForSched(s);
                        const score = typeof diary?.score === 'number' ? diary.score : null;
                        if (!score) {
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 }}>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#A88A2E' }}>📔 다이어리</Text>
                            </View>
                          );
                        }
                        return (
                          <Text style={{
                            fontFamily: F.sysSb,
                            fontSize: fs(18),
                            color: score < 80 ? '#A88A2E' : C.charcoal,
                            marginTop: 6,
                          }}>
                            {score}타
                          </Text>
                        );
                      })()}
                    </View>
                  </TouchableOpacity>
                );
              })
          )}
        </View>
      </ScrollView>

      <ScheduleModal
        visible={modal.visible}
        initial={modal.initial}
        onClose={() => setModal({ visible: false, initial: null })}
        onSave={handleSave}
      />

      <AlarmSetupModal
        visible={!!pendingAlarm}
        schedule={pendingAlarm}
        existing={alarmEditExisting}
        onClose={() => { setPendingAlarm(null); setAlarmEditExisting(null); maybePromptCalendar(); }}
      />

      {/* '이대로 자동' 모드 — 식사시각만 묻고 나머지는 저장설정대로 자동 적용 */}
      <QuickMealPrompt
        visible={!!pendingQuickAlarm}
        schedule={pendingQuickAlarm}
        onDone={(arriveAt) => {
          const s = pendingQuickAlarm;
          setPendingQuickAlarm(null);
          if (s) applyDefaultAlarms(s, userProfile, { arriveAt });
          maybePromptCalendar();
        }}
      />

      <CalendarPickerModal visible={calPickerOpen} onClose={() => setCalPickerOpen(false)} />

      <CourseLogModal
        visible={showCourseLog}
        onClose={() => setShowCourseLog(false)}
        navigation={navigation ? {
          navigate: (name, params) => {
            // ScheduleScreen이 모달로 떠 있는 케이스 — navigate 전에 부모 모달도 닫아야
            // MY 탭의 다이어리 추가 모달이 사용자에게 보임 (안 그러면 일정 화면이 가려서 모름)
            onCloseSchedule?.();
            navigation.navigate(name, params);
          },
          addListener: navigation.addListener?.bind(navigation),
        } : undefined}
      />

      {/* 일정 바텀시트 — 코스정보 · 날씨 · 교통 · 공유 · 수정 · 삭제 (홈 화면과 동일) */}
      <ScheduleSheetModal
        visible={sheet.visible}
        friendMeta={friendMeta}
        schedule={sheet.schedule ? { ...sheet.schedule, dDay: computeDDay(sheet.schedule) } : null}
        onClose={() => setSheet(prev => ({ ...prev, visible: false }))}
        courseNavigable={!!(sheet.schedule && (sheet.schedule.courseLogId || sheet.schedule.courseId || sheet.schedule.course))}
        onCourseTap={handleSheetCourse}
        onWeather={() => openWxFromSheet('wx')}
        onTraffic={() => openWxFromSheet('tr')}
        onShare={handleSheetShare}
        onInviteFriends={() => handleInviteFriends(sheet.schedule)}
        onMeal={() => openMealForSchedule(sheet.schedule)}
        onTeam={() => { const rid = sheet.schedule?.roundupId || null; setSheet(prev => ({ ...prev, visible: false })); setTeamRid(rid); }}
        onOpenRoundup={handleSheetRoundup}
        onEdit={handleEdit}
        onAlarm={() => {
          const s = sheet.schedule;
          setSheet(prev => ({ ...prev, visible: false }));
          if (!s) return;
          getAlarmConfig(s.id).then(cfg => { setAlarmEditExisting(cfg); setPendingAlarm(s); }).catch(() => { setAlarmEditExisting(null); setPendingAlarm(s); });
        }}
        onDelete={handleDelete}
      />

      {/* 단체팀 화면 — 시트 닫은 뒤 열림(형제 Modal 회피, [[ios-modal-stacking]]) */}
      <RoundupTeamScreen visible={!!teamRid} roundupId={teamRid} onClose={() => setTeamRid(null)} />

      {/* 동반자 공유 카드 — 이미지(바로공유/저장) + 평문 링크(설치 동선). 시트 닫은 뒤 열림(홈과 동일) */}
      <ShareMomentModal
        moment={scheduleShareTarget ? { ...scheduleShareTarget, shareKind: 'schedule' } : null}
        visible={!!scheduleShareTarget}
        onClose={() => setScheduleShareTarget(null)}
        onShareLink={() => { const t = scheduleShareTarget; setScheduleShareTarget(null); setTimeout(() => shareScheduleText(t), 350); }}
      />

      {/* 친구 일정에 초대(일정 전파) — 홈과 동일. 친구 다중선택 → 인앱 초대 발송 ([[schedule-propagation-spec]]) */}
      <FriendSelectModal
        visible={inviteOpen}
        mode="companion"
        friends={inviteFriends}
        onClose={() => { setInviteOpen(false); setInviteTarget(null); }}
        onConfirm={submitInviteFriends}
      />

      {/* 함께 식사 — 트리거 버튼 없이 시트만(위 '함께 식사' 행에서 autoOpen). 홈 카드와 동일 기능([[afterround-meal-decision]]) */}
      <MealDecisionBar
        triggerless
        schedule={mealSchedule}
        uid={currentUid}
        nickname={userProfile?.nickname}
        friendMeta={friendMeta}
        active={!!mealSchedule}
        autoOpen={mealAutoOpen}
        onAutoOpened={() => setMealAutoOpen(false)}
        onClose={() => {
          // 식사 시트 닫히면 원래 일정 시트로 복귀(빈 화면에 덩그러니 남지 않게). 모달 닫힘 후 재오픈([[ios-modal-stacking]]).
          const s = mealSchedule;
          if (s) setTimeout(() => { setSheet({ visible: true, schedule: s }); setMealSchedule(null); }, 260);
        }}
      />

      <WeatherTransportPopup
        visible={wxPopup.visible}
        initialTab={wxPopup.tab}
        schedule={wxPopup.schedule}
        schedules={schedules}
        onClose={() => setWxPopup({ visible: false, schedule: null, tab: 'wx' })}
      />

      {/* 년/월 피커 */}
      <Modal visible={picker.visible} transparent animationType="slide"
        onRequestClose={() => setPicker(p => ({ ...p, visible: false }))}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
            onPress={() => setPicker(p => ({ ...p, visible: false }))} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 28 + insets.bottom }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairline, alignSelf: 'center', marginBottom: 14 }} />

            {/* 연도 선택 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 10, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => setPicker(p => ({ ...p, year: p.year - 1 }))} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                <Text style={{ fontSize: fs(26), color: C.warmGray }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: F.en, fontSize: fs(28), color: C.charcoal, minWidth: 100, textAlign: 'center' }}>{picker.year}</Text>
              <TouchableOpacity onPress={() => setPicker(p => ({ ...p, year: p.year + 1 }))} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                <Text style={{ fontSize: fs(26), color: C.warmGray }}>›</Text>
              </TouchableOpacity>
            </View>

            {/* 월 그리드 4x3 */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                const on = picker.month === m;
                return (
                  <View key={m} style={{ width: '25%', padding: 4 }}>
                    <TouchableOpacity onPress={() => setPicker(p => ({ ...p, month: m }))} activeOpacity={0.7}
                      style={{
                        paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                        backgroundColor: on ? C.charcoal : C.bgSecondary,
                        borderWidth: on ? 0 : 0.5, borderColor: C.hairline,
                      }}>
                      <Text style={{ fontFamily: on ? F.sysB : F.sys, fontSize: fs(14), color: on ? C.butter : C.charcoal }}>
                        {m}월
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* 액션 버튼 */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setPicker(p => ({ ...p, visible: false }))} activeOpacity={0.7}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', borderWidth: 0.5, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmPicker} activeOpacity={0.8}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: C.charcoal }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.butter }}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

