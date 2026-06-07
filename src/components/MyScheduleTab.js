import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Share, Platform } from 'react-native';

const _and = Platform.OS === 'android';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { ROUTES } from '../constants/routes';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { C, F, fs } from '../constants/colors';
import { WEEKDAYS } from '../constants/data';
import { ScheduleModal } from './ScheduleModal';
import { ScheduleSheetModal } from './ScheduleSheetModal';
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { showAppAlert } from './AppAlert';
import { AlarmSetupModal } from './AlarmSetupModal';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { UserContext } from '../contexts/UserContext';
import { cancelRoundAlarms, scheduleRoundAlarms, getAlarmTypes, applyDefaultAlarms } from '../utils/notifications';
import { getCalendarChoice } from '../utils/deviceCalendar';
import { roundsOnly } from '../utils/diaryKind';
import { CalendarPickerModal } from './CalendarPickerModal';
import { CourseLogModal } from './CourseLogModal';

const DAYS = WEEKDAYS;

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
  const insets = useSafeAreaInsets(); // 바텀시트가 안드로이드 내비바에 안 가리도록
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modal, setModal] = useState({ visible: false, initial: null });
  const [pendingAlarm, setPendingAlarm] = useState(null);
  const [calPickerOpen, setCalPickerOpen] = useState(false);
  const [sheet, setSheet] = useState({ visible: false, schedule: null });
  const [wxPopup, setWxPopup] = useState({ visible: false, schedule: null, tab: 'wx' });
  const [picker, setPicker] = useState({ visible: false, year: 0, month: 0 });
  const [showCourseLog, setShowCourseLog] = useState(false);

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
      catch (e) { console.warn('[mySchedule] add failed:', e?.message); return; }
      // (캘린더 추가는 addSchedule이 일괄 처리)
      // 일정 추가 완료 → 알람 팝업 (다시 묻지 않기 설정 시 기본값 자동 적용)
      if (userProfile.alarmPromptDisabled) {
        applyDefaultAlarms(newS, userProfile.alarmDefaults);
        maybePromptCalendar(); // 알람 팝업이 없으면 바로 캘린더 선택 안내
      } else {
        setPendingAlarm(newS);
      }
    } else if (type === 'schedule-edit') {
      try {
        const { id, createdAt, ownerUid, ...patch } = data;
        await editSchedule(data.id, patch);
      } catch (e) { console.warn('[mySchedule] edit failed:', e?.message); return; }
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

  const handleEdit = () => {
    const s = sheet.schedule;
    setSheet({ visible: false, schedule: null });
    setModal({ visible: true, initial: s });
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

  // 바텀시트 → 코스 상세 (코스기록과 연결된 일정일 때만)
  const handleSheetCourse = () => {
    const s = sheet.schedule;
    const id = s && (s.courseLogId || s.courseId);
    if (!id || !navigation) return;
    setSheet({ visible: false, schedule: null });
    navigation.navigate(ROUTES.COURSE, { openCourseId: id });
  };

  // 바텀시트 → 동반자에게 공유
  const handleSheetShare = async () => {
    const s = sheet.schedule;
    if (!s) return;
    const dd = computeDDay(s);
    const ddText = dd > 0 ? `D-${dd}` : dd === 0 ? 'D-DAY' : '지난 라운딩';
    const msg = `[ Dear Golf ]\n${s.course}\n${s.date} ${s.day}요일 ${s.time}\n${s.members}명 동반 · ${ddText}\n나만의 골프 캐디, Dear Golf와 함께하는 라운딩입니다 ⛳`;
    try { await Share.share({ message: msg }); }
    catch (e) { console.warn('[share schedule]', e?.message); }
  };

  // 일정 삭제 — 상황별 확인. 시트의 삭제 버튼 + 목록 카드 길게누르기 양쪽에서 사용
  const deleteSchedule = (s) => {
    if (!s) return;
    const isPast = new Date((s.date || '').replace(/\./g, '-')).getTime() < todayMid;
    const hasRec = hasRecordForSched(s);
    const remove = async () => {
      try { await removeSchedule(s.id); }
      catch (e) { console.warn('[mySchedule] remove failed:', e?.message); return; }
      cancelRoundAlarms(s.id); // 일정 삭제 시 예약된 알람도 취소 (캘린더 제거는 removeSchedule이 일괄 처리)
    };

    // 과거 라운딩 + 다이어리 기록 있음 → 다이어리에서 삭제하도록 안내
    if (isPast && hasRec) {
      showAppAlert('삭제 안내', '이 라운딩은 기록이 있어요.\nMY 탭에서 삭제해주세요.', [{ text: '확인' }]);
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
  const handleDelete = async () => {
    const s = sheet.schedule;
    if (s) {
      try { await removeSchedule(s.id); }
      catch (e) { console.warn('[mySchedule] remove failed:', e?.message); }
      cancelRoundAlarms(s.id); // 캘린더 제거는 removeSchedule이 일괄 처리
    }
    setSheet({ visible: false, schedule: null });
  };

  const monthSchedules = schedules.filter(s => s.date && s.date.startsWith(monthStr));
  // 일정 없이 라운딩 기록(diary)만 있는 날짜 → 가상 카드로 추가.
  // 신규 사용자가 과거 라운딩을 기록으로만 입력해도 캘린더에서 '어디 다녀왔는지' 보여야 함
  // (통계·내코스모아보기와 일관). 카드 탭 시 onPress의 past+rec 분기가 다이어리 상세로 연결하므로
  // B-3안(2026-05-29)이 우려했던 '잘못된 진입'은 해소된 상태.
  const scheduleDateSet = new Set(monthSchedules.map(s => s.date));
  const orphanItems = diaries
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
      };
    });
  const monthItems = [...monthSchedules, ...orphanItems];

  const renderDateCircle = (cell) => {
    const { d, monthOffset } = cell;
    // Outside current month
    if (monthOffset !== 0) {
      return (
        <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.en, fontSize: fs(16), color: '#C8C4BC' }}>{d}</Text>
        </View>
      );
    }

    const status = getStatus(0, d);
    const base = { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' };
    const baseText = { fontFamily: F.en, fontSize: fs(16) };
    // Android Fabric(New Arch)은 둥근 View를 렌더 최적화로 병합하며 borderRadius를 간헐적으로
    // 누락시켜 네모로 그림(달 이동 시 됐다 안 됐다). collapsable={false}로 병합을 막아 원형 고정.
    const noCollapse = _and ? { collapsable: false } : {};

    switch (status) {
      case 'today':
        // 오늘 — 크고 버건디색 숫자 + 버건디 언더바 (동그라미 X)
        return (
          <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: _and ? 7 : 14 }}>
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

        {/* 내 코스기록 진입 — 코스 탭 헤더 버튼과 동일 모달. 다이어리 안 쓰는 사용자가 본인 라운딩 기록을 일정 동선에서 찾을 수 있게. */}
        <TouchableOpacity onPress={() => setShowCourseLog(true)} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: _and ? 2 : 4,
            backgroundColor: C.butter, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: _and ? 10 : 11 }}>
          <Text style={{ fontSize: fs(14) }}>🏌️</Text>
          <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>
            내 코스 모아보기
          </Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }}>›</Text>
        </TouchableOpacity>

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
                  첫 라운드를 등록해보세요
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
                const past = new Date(s.date.replace(/\./g, '-')).getTime() < todayMid;
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
                      {Array.isArray(s.companions) && s.companions.length > 0 && (
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }} numberOfLines={1}>
                          👥 {s.companions.map(c => (typeof c === 'string' ? c : c?.name)).filter(Boolean).join(', ')}
                        </Text>
                      )}
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
        onClose={() => { setPendingAlarm(null); maybePromptCalendar(); }}
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
        schedule={sheet.schedule ? { ...sheet.schedule, dDay: computeDDay(sheet.schedule) } : null}
        onClose={() => setSheet(prev => ({ ...prev, visible: false }))}
        onCourseTap={handleSheetCourse}
        onWeather={() => openWxFromSheet('wx')}
        onTraffic={() => openWxFromSheet('tr')}
        onShare={handleSheetShare}
        onEdit={handleEdit}
        onDelete={handleDelete}
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

