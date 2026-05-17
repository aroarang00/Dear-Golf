import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { C, F } from '../constants/colors';
import { ScheduleModal } from './ScheduleModal';
import { AlarmSetupModal } from './AlarmSetupModal';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { UserContext } from '../contexts/UserContext';
import { cancelRoundAlarms, scheduleRoundAlarms, getAlarmTypes, applyDefaultAlarms } from '../utils/notifications';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 일정이 없을 때 빈 상태 뒤에 흐릿하게 깔리는 샘플 카드 (장식용 · 비활성)
function SampleScheduleCard({ course, meta, sideColor, badgeBg, badgeFg, badgeTxt, dashed, fade }) {
  return (
    <View style={{
      flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 12,
      padding: 14, marginBottom: 12, opacity: fade,
      ...(dashed
        ? { borderWidth: 1, borderColor: C.warmGray, borderStyle: 'dashed' }
        : { borderWidth: 0.5, borderColor: C.hairline }),
    }}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: sideColor, marginRight: 12, alignSelf: 'stretch' }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600' }}>{course}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>{meta}</Text>
      </View>
      <View style={{ backgroundColor: badgeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
        <Text style={{ fontFamily: F.sys, fontSize: 10, color: badgeFg, fontWeight: '600' }}>{badgeTxt}</Text>
      </View>
    </View>
  );
}

export function MyScheduleTab({ onRequestAddDiary, diaries = [] }) {
  const { schedules, setSchedules } = React.useContext(SchedulesContext);
  const { userProfile } = React.useContext(UserContext);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modal, setModal] = useState({ visible: false, initial: null });
  const [pendingAlarm, setPendingAlarm] = useState(null);
  const [sheet, setSheet] = useState({ visible: false, schedule: null });
  const [picker, setPicker] = useState({ visible: false, year: 0, month: 0 });

  const openPicker = () => setPicker({ visible: true, year: currentDate.getFullYear(), month: currentDate.getMonth() + 1 });
  const confirmPicker = () => {
    setCurrentDate(new Date(picker.year, picker.month - 1, 1));
    setPicker(p => ({ ...p, visible: false }));
  };

  const completedDates = React.useMemo(
    () => diaries.map(x => x.date).filter(Boolean),
    [diaries],
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
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
      const sched = schedOnStr(dateStr);
      if (sched || hasRecord(dateStr)) return 'today-round';
      return 'today';
    }
    const sched = schedOnStr(dateStr);
    const past = isPast(m, d);
    if (sched && !past) return 'upcoming';
    if (sched && past && hasRecord(dateStr)) return 'completed-record';
    if (sched && past && !hasRecord(dateStr)) return 'completed-norecord';
    if (past && hasRecord(dateStr)) return 'completed-record';
    return 'normal';
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
  // activeOffsetX: 가로로 살짝만 움직여도 활성화 / failOffsetY: 세로 움직임이 먼저면 실패 → 세로 스크롤 유지
  const monthSwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      if (e.translationX > 35 || e.velocityX > 350) goPrev();
      else if (e.translationX < -35 || e.velocityX < -350) goNext();
    });

  const handleDateTap = (m, d) => {
    if (m !== 0) {
      setCurrentDate(new Date(year, month + m, 1));
      return;
    }
    const dateStr = dateStrFor(0, d);
    const existing = schedOnStr(dateStr);
    if (existing) {
      setSheet({ visible: true, schedule: existing });
      return;
    }
    const dt = new Date(year, month, d);
    // 오늘 이전 날짜는 '예정 일정'이 아니라 '라운딩 기록' 입력으로 연결
    if (dt.getTime() < todayMid) {
      onRequestAddDiary && onRequestAddDiary({ date: dateStr, day: DAYS[dt.getDay()] });
      return;
    }
    setModal({
      visible: true,
      initial: { date: dateStr, day: DAYS[dt.getDay()], time: '07:00', members: 4 },
    });
  };

  const handleSave = (type, data) => {
    if (type === 'schedule') {
      const newS = {
        id: String(Date.now()),
        weather: '맑음 20°', wind: '남 2m/s', duration: '1시간 30분',
        ...data,
      };
      setSchedules(prev => [...prev, newS]);
      // 일정 추가 완료 → 알람 팝업 (다시 묻지 않기 설정 시 기본값 자동 적용)
      if (userProfile.alarmPromptDisabled) {
        applyDefaultAlarms(newS, userProfile.alarmDefaults);
      } else {
        setPendingAlarm(newS);
      }
    } else if (type === 'schedule-edit') {
      setSchedules(prev => prev.map(s => (s.id === data.id ? { ...s, ...data } : s)));
      // 알람이 설정된 일정이면 변경된 날짜·시간으로 재예약
      getAlarmTypes(data.id).then(types => {
        if (types && types.length) {
          scheduleRoundAlarms(
            { id: data.id, course: data.course, date: data.date, time: data.time },
            types,
          );
        }
      });
    }
    setModal({ visible: false, initial: null });
  };

  const handleEdit = () => {
    const s = sheet.schedule;
    setSheet({ visible: false, schedule: null });
    setModal({ visible: true, initial: s });
  };

  // 일정 삭제 — 상황별 확인. 시트의 삭제 버튼 + 목록 카드 길게누르기 양쪽에서 사용
  const deleteSchedule = (s) => {
    if (!s) return;
    const isPast = new Date((s.date || '').replace(/\./g, '-')).getTime() < todayMid;
    const hasRec = hasRecord(s.date);
    const remove = () => {
      setSchedules(prev => prev.filter(x => x.id !== s.id));
      cancelRoundAlarms(s.id); // 일정 삭제 시 예약된 알람도 취소
    };

    // 과거 라운딩 + 다이어리 기록 있음 → 다이어리에서 삭제하도록 안내
    if (isPast && hasRec) {
      Alert.alert('삭제 안내', '이 라운딩은 다이어리 기록이 있어요.\n다이어리 탭에서 삭제해주세요.', [{ text: '확인' }]);
      return;
    }
    // 과거 + 기록 없음 → 일정·코스기록 모두 삭제 / 예정 → 단순 확인
    const msg = isPast
      ? '이 일정을 삭제하면 일정과 내 코스기록이 모두 삭제됩니다.\n삭제할까요?'
      : '이 예정 라운딩을 삭제할까요?';
    Alert.alert('일정 삭제', msg, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: remove },
    ]);
  };

  const handleDelete = () => {
    const s = sheet.schedule;
    setSheet({ visible: false, schedule: null });
    deleteSchedule(s);
  };

  const monthSchedules = schedules.filter(s => s.date && s.date.startsWith(monthStr));
  // 일정 없이 다이어리만 있는 날짜 → 가상 카드로 추가 (오늘 라운딩을 다이어리에만 입력한 케이스)
  const scheduleDateSet = new Set(monthSchedules.map(s => s.date));
  const orphanDiaries = diaries.filter(d => d.date && d.date.startsWith(monthStr) && !scheduleDateSet.has(d.date));
  const orphanItems = orphanDiaries.map(d => {
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
          <Text style={{ fontFamily: F.en, fontSize: 14, color: '#C8C4BC' }}>{d}</Text>
        </View>
      );
    }

    const status = getStatus(0, d);
    const base = { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' };
    const baseText = { fontFamily: F.en, fontSize: 14 };

    switch (status) {
      case 'today':
        // 오늘 — 큰 숫자 + 차콜 언더바 (동그라미 X)
        return (
          <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.en, fontSize: 17, color: C.charcoal, fontWeight: '700' }}>{d}</Text>
            <View style={{ position: 'absolute', bottom: 2, width: 16, height: 3, borderRadius: 2, backgroundColor: C.charcoal }} />
          </View>
        );
      case 'today-round':
        // 오늘 라운딩 있음: 차콜 fill + 골드 테두리 (기존 유지)
        return (
          <View style={[base, { backgroundColor: C.charcoal, borderWidth: 2, borderColor: '#C9A84C' }]}>
            <Text style={[baseText, { color: C.butter, fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'upcoming':
        // 예정: 버건디 fill 원
        return (
          <View style={[base, { backgroundColor: C.burgundy }]}>
            <Text style={[baseText, { color: '#fff', fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'completed-record':
        // 완료+기록있음: 버터색 fill 원
        return (
          <View style={[base, { backgroundColor: C.butter, opacity: 0.85 }]}>
            <Text style={[baseText, { color: C.charcoal, fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'completed-norecord':
        // 완료+기록없음: 점선 원
        return (
          <View style={[base, { borderWidth: 1.5, borderColor: C.warmGray, borderStyle: 'dashed' }]}>
            <Text style={[baseText, { color: C.warmGray }]}>{d}</Text>
          </View>
        );
      default:
        return (
          <View style={base}>
            <Text style={[baseText, { color: C.charcoal }]}>{d}</Text>
          </View>
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 캘린더 영역 (좌우 스와이프 → 전달/다음달) */}
        <GestureDetector gesture={monthSwipe}>
        <View>
        {/* Month header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 }}>
          <TouchableOpacity onPress={goPrev} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 22, color: C.warmGray }}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openPicker} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }} activeOpacity={0.6}>
            <Text style={{ fontFamily: F.en, fontSize: 18, color: C.charcoal, fontWeight: '600' }}>
              {year}. {String(month + 1).padStart(2, '0')} ▾
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goNext} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 22, color: C.warmGray }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day labels */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
          {DAYS.map((dl, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', paddingBottom: 6 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: i === 0 ? '#6B1E2A' : i === 6 ? C.navy : C.warmGrayLight, fontWeight: '500' }}>
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
              style={{ width: `${100 / 7}%`, paddingVertical: 4, alignItems: 'center' }}>
              {renderDateCircle(cell)}
            </TouchableOpacity>
          ))}
        </View>
        </View>
        </GestureDetector>

        {/* Legend */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.burgundy }} />
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>예정</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.butter, opacity: 0.85 }} />
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>완료·기록</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: C.warmGray, borderStyle: 'dashed' }} />
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>완료·미기록</Text>
          </View>
        </View>

        {/* This month list */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 14 }}>
            이번달 일정 · {monthItems.length}개
          </Text>
          {monthItems.length === 0 ? (
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
                <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.charcoal, fontWeight: '700', marginBottom: 14 }}>
                  첫 라운드를 등록해보세요
                </Text>
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => {
                    const dt = new Date(year, month, 1);
                    setModal({ visible: true, initial: { date: dateStrFor(0, 1), day: DAYS[dt.getDay()], time: '07:00', members: 4 } });
                  }}
                  style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 26 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.butter, fontWeight: '600' }}>+ 일정 추가하기</Text>
                </TouchableOpacity>
              </BlurView>
            </View>
          ) : (
            monthItems
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(s => {
                const past = new Date(s.date.replace(/\./g, '-')).getTime() < todayMid;
                const rec = hasRecord(s.date);
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
                    onPress={() => s.virtual ? null : setSheet({ visible: true, schedule: s })}
                    onLongPress={() => { if (!s.virtual) deleteSchedule(s); }}
                    delayLongPress={400}
                    disabled={s.virtual}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: 'row',
                      backgroundColor: C.bgSecondary,
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 12,
                      opacity: cardOpacity,
                      ...cardBorder,
                    }}>
                    {/* Left side bar */}
                    <View style={{ width: 3, borderRadius: 2, backgroundColor: sideColor, marginRight: 12, alignSelf: 'stretch' }} />

                    {/* Left content */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600' }}>{s.course}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>
                        {s.date} {s.day}{s.time ? ` · ${s.time}` : ''}{s.members ? ` · ${s.members}명` : ''}
                      </Text>
                    </View>

                    {/* Right: badge + record link */}
                    <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', marginLeft: 8 }}>
                      <View style={{ backgroundColor: badgeBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 10, color: badgeFg, fontWeight: '600' }}>{badgeTxt}</Text>
                      </View>
                      {status === 'completed-norecord' && (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation?.(); onRequestAddDiary && onRequestAddDiary(s); }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={{ marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: C.navy }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff', fontWeight: '600' }}>기록 추가하기</Text>
                        </TouchableOpacity>
                      )}
                      {status === 'completed-record' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#A88A2E', fontWeight: '600' }}>📔 다이어리</Text>
                        </View>
                      )}
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
        onClose={() => setPendingAlarm(null)}
      />

      {/* Edit/Delete Bottom Sheet */}
      <Modal visible={sheet.visible} transparent animationType="slide"
        onRequestClose={() => setSheet({ visible: false, schedule: null })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
            onPress={() => setSheet({ visible: false, schedule: null })} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 28 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairline, alignSelf: 'center', marginBottom: 14 }} />
            {sheet.schedule && (
              <>
                <Text style={{ fontFamily: F.sys, fontSize: 16, color: C.charcoal, fontWeight: '600', marginBottom: 4 }}>
                  {sheet.schedule.course}
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, marginBottom: 16 }}>
                  {sheet.schedule.date} {sheet.schedule.day} · {sheet.schedule.time} · {sheet.schedule.members}명
                </Text>
                <TouchableOpacity onPress={handleEdit} activeOpacity={0.6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <Text style={{ fontSize: 18 }}>✏️</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal }}>일정 수정</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} activeOpacity={0.6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 18 }}>🗑️</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>일정 삭제</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 년/월 피커 */}
      <Modal visible={picker.visible} transparent animationType="slide"
        onRequestClose={() => setPicker(p => ({ ...p, visible: false }))}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
            onPress={() => setPicker(p => ({ ...p, visible: false }))} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 28 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairline, alignSelf: 'center', marginBottom: 14 }} />

            {/* 연도 선택 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 10, marginBottom: 8 }}>
              <TouchableOpacity onPress={() => setPicker(p => ({ ...p, year: p.year - 1 }))} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                <Text style={{ fontSize: 26, color: C.warmGray }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: F.en, fontSize: 28, color: C.charcoal, fontWeight: '600', minWidth: 100, textAlign: 'center' }}>{picker.year}</Text>
              <TouchableOpacity onPress={() => setPicker(p => ({ ...p, year: p.year + 1 }))} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                <Text style={{ fontSize: 26, color: C.warmGray }}>›</Text>
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
                      <Text style={{ fontFamily: F.sys, fontSize: 14, color: on ? C.butter : C.charcoal, fontWeight: on ? '700' : '400' }}>
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
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.warmGray }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmPicker} activeOpacity={0.8}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: C.charcoal }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.butter, fontWeight: '600' }}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

