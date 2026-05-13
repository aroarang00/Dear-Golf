import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { C, F } from '../constants/colors';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { SCHEDULES_INIT, DIARY_DATA } from '../constants/data';
import { ScheduleModal } from './ScheduleModal';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function MyScheduleTab({ onRequestAddDiary }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState(SCHEDULES_INIT);
  const [completedDates, setCompletedDates] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState({ visible: false, initial: null });
  const [sheet, setSheet] = useState({ visible: false, schedule: null });
  const [picker, setPicker] = useState({ visible: false, year: 0, month: 0 });

  const openPicker = () => setPicker({ visible: true, year: currentDate.getFullYear(), month: currentDate.getMonth() + 1 });
  const confirmPicker = () => {
    setCurrentDate(new Date(picker.year, picker.month - 1, 1));
    setPicker(p => ({ ...p, visible: false }));
  };

  useEffect(() => {
    (async () => {
      const s = await storage.load(STORAGE_KEYS.schedules, SCHEDULES_INIT);
      const d = await storage.load(STORAGE_KEYS.diaries, DIARY_DATA);
      setSchedules(s);
      setCompletedDates((d || []).map(x => x.date).filter(Boolean));
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    storage.save(STORAGE_KEYS.schedules, schedules);
  }, [schedules, hydrated]);

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

  // status: 'today' | 'upcoming' | 'completed-record' | 'completed-norecord' | 'other' | 'normal'
  const getStatus = (m, d) => {
    const dateStr = dateStrFor(m, d);
    if (isToday(m, d)) return 'today';
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

  const goPrev = () => setCurrentDate(new Date(year, month - 1, 1));
  const goNext = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleDateTap = (m, d) => {
    if (m !== 0) {
      setCurrentDate(new Date(year, month + m, 1));
      return;
    }
    const dateStr = dateStrFor(0, d);
    const existing = schedOnStr(dateStr);
    if (existing) {
      setSheet({ visible: true, schedule: existing });
    } else {
      const dt = new Date(year, month, d);
      setModal({
        visible: true,
        initial: { date: dateStr, day: DAYS[dt.getDay()], time: '07:00', members: 4 },
      });
    }
  };

  const handleSave = (type, data) => {
    if (type === 'schedule') {
      setSchedules(prev => [...prev, { id: String(Date.now()), ...data }]);
    } else if (type === 'schedule-edit') {
      setSchedules(prev => prev.map(s => (s.id === data.id ? { ...s, ...data } : s)));
    }
    setModal({ visible: false, initial: null });
  };

  const handleEdit = () => {
    const s = sheet.schedule;
    setSheet({ visible: false, schedule: null });
    setModal({ visible: true, initial: s });
  };

  const handleDelete = () => {
    const s = sheet.schedule;
    setSchedules(prev => prev.filter(x => x.id !== s.id));
    setSheet({ visible: false, schedule: null });
  };

  const monthSchedules = schedules.filter(s => s.date && s.date.startsWith(monthStr));

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
        return (
          <View style={[base, { backgroundColor: C.charcoal }]}>
            <Text style={[baseText, { color: C.butter, fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'upcoming':
        return (
          <View style={[base, { backgroundColor: '#C8D9E6' }]}>
            <Text style={[baseText, { color: '#1A3A5C', fontWeight: '600' }]}>{d}</Text>
          </View>
        );
      case 'completed-record':
        return (
          <View style={[base, { borderWidth: 2, borderColor: '#C9A84C', opacity: 0.5 }]}>
            <Text style={[baseText, { color: '#C9A84C' }]}>{d}</Text>
          </View>
        );
      case 'completed-norecord':
        return (
          <View style={[base, { borderWidth: 2, borderColor: '#8B8680', borderStyle: 'dashed' }]}>
            <Text style={[baseText, { color: '#6B1E2A', fontWeight: '600' }]}>{d}</Text>
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
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: i === 0 ? '#6B1E2A' : i === 6 ? '#1A3D52' : C.warmGrayLight, fontWeight: '500' }}>
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

        {/* Legend */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#C8D9E6' }} />
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>예정</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#C9A84C', opacity: 0.5 }} />
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>완료·기록</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#8B8680', borderStyle: 'dashed' }} />
            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>완료·미기록</Text>
          </View>
        </View>

        {/* This month list */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 10 }}>
            이번달 일정 · {monthSchedules.length}개
          </Text>
          {monthSchedules.length === 0 ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGrayLight }}>이번달 일정이 없어요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>날짜를 탭해서 일정을 추가하세요</Text>
            </View>
          ) : (
            monthSchedules
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(s => {
                const past = new Date(s.date.replace(/\./g, '-')).getTime() < todayMid;
                const rec = hasRecord(s.date);
                let status, sideColor, badgeBg, badgeFg, badgeTxt;
                if (!past) {
                  status = 'upcoming';
                  sideColor = '#6B1E2A';
                  badgeBg = '#F5EAEC'; badgeFg = '#6B1E2A'; badgeTxt = '예정';
                } else if (rec) {
                  status = 'completed-record';
                  sideColor = '#C9A84C';
                  badgeBg = '#FBF7EE'; badgeFg = '#C9A84C'; badgeTxt = '기록완료';
                } else {
                  status = 'completed-norecord';
                  sideColor = '#8B8680';
                  badgeBg = '#F0EDE6'; badgeFg = '#8B8680'; badgeTxt = '미기록';
                }

                const cardBorder = status === 'completed-norecord'
                  ? { borderWidth: 1, borderColor: '#8B8680', borderStyle: 'dashed' }
                  : { borderWidth: 0.5, borderColor: C.hairline };
                const cardOpacity = past ? 0.45 : 1;

                return (
                  <TouchableOpacity key={s.id}
                    onPress={() => setSheet({ visible: true, schedule: s })}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: 'row',
                      backgroundColor: C.bgSecondary,
                      borderRadius: 12,
                      padding: 14,
                      marginBottom: 8,
                      opacity: cardOpacity,
                      ...cardBorder,
                    }}>
                    {/* Left side bar */}
                    <View style={{ width: 3, borderRadius: 2, backgroundColor: sideColor, marginRight: 12, alignSelf: 'stretch' }} />

                    {/* Left content */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600' }}>{s.course}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>
                        {s.date} {s.day} · {s.time} · {s.members}명
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
                          style={{ marginTop: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy, fontWeight: '600' }}>기록 추가하기 →</Text>
                        </TouchableOpacity>
                      )}
                      {status === 'completed-record' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#C9A84C', fontWeight: '600' }}>📔 다이어리</Text>
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
