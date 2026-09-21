import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { C, F, fs } from '../../constants/colors';
import { WEEKDAYS } from '../../constants/data';
import { holidayName } from '../../constants/holidays';
import { STORAGE_KEYS, storage } from '../../utils/storage';

// 홈 상단 달력(2026-09-21) — 주간 줄(기본) ↔ 월 달력(펼침).
//  · 주간: 이번 주가 첫 장, 옆으로 넘겨 다음 주(앞 12주)·지난 주(뒤 2주). "이번 주에 라운딩 없으면 점 하나 없는 빈 줄"이던
//    것을 넘기기로 해소(사용자 2026-09-21 "주간만 뜨는 게 별론가" → 월 고정은 30칸 중 27칸이 비어 첫 화면이 죽어 보여 반려).
//  · 월: 월 라벨을 탭하면 그 자리에서 월 달력이 펼쳐진다(앞 6달·뒤 1달 넘기기). 펼침 상태는 저장돼 다음 실행에도 유지 —
//    "항상 전체 달력"을 원하는 사람은 한 번 펼쳐두면 된다.
//  · 상자 없음 — 사진 위 글자+그림자. 홈 위쪽 반투명 판을 줄여 크림 D-N 카드가 주인공이 되게([[feedback-minimal-borders]]).
//  · 날짜 탭 → 일정 캘린더(onDayPress). 일요일·공휴일 숫자는 연한 빨강(일정 탭 달력의 버건디와 같은 의미, 사진 위라 밝게).
const PAST_WEEKS = 2, FUTURE_WEEKS = 12;
const PAST_MONTHS = 1, FUTURE_MONTHS = 6;
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };
const DOT = '#8FB06B';
const RED = '#F2A7AC';
const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;

function midnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export function HomeCalendarStrip({ schedDaySet, onDayPress }) {
  const [w, setW] = useState(0);
  const [monthOpen, setMonthOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [weekPage, setWeekPage] = useState(PAST_WEEKS);
  const [monthPage, setMonthPage] = useState(PAST_MONTHS);
  const weekRef = useRef(null);
  const monthRef = useRef(null);

  // 펼침 상태 복원/저장
  useEffect(() => {
    storage.load(STORAGE_KEYS.homeCalMonthOpen, false).then(v => setMonthOpen(!!v)).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  const toggleMonth = () => {
    setMonthOpen(v => { storage.save(STORAGE_KEYS.homeCalMonthOpen, !v); return !v; });
  };

  // 페이저는 폭을 알아야 그릴 수 있다 — 첫 장(오늘)으로 즉시 이동(안드는 contentOffset prop이 안 먹어 scrollTo)
  useEffect(() => {
    if (!w) return;
    const t = setTimeout(() => {
      weekRef.current?.scrollTo({ x: PAST_WEEKS * w, animated: false });
      monthRef.current?.scrollTo({ x: PAST_MONTHS * w, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [w, monthOpen, loaded]);   // loaded — 저장값 복원이 폭 측정보다 늦게 끝나도 첫 장으로 맞춘다

  const today = midnight(new Date());
  const todayMs = today.getTime();
  const has = (d) => !!schedDaySet && schedDaySet.has(midnight(d).getTime());
  const isRed = (d) => d.getDay() === 0 || !!holidayName(dateKey(d));

  // ── 주간 페이지들 ──
  const weekStart0 = new Date(today); weekStart0.setDate(today.getDate() - today.getDay());
  const weekPages = Array.from({ length: PAST_WEEKS + FUTURE_WEEKS + 1 }, (_, p) => {
    const start = new Date(weekStart0); start.setDate(weekStart0.getDate() + (p - PAST_WEEKS) * 7);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  });
  // ── 월 페이지들 ──
  const monthPages = Array.from({ length: PAST_MONTHS + FUTURE_MONTHS + 1 }, (_, p) => {
    const first = new Date(today.getFullYear(), today.getMonth() + (p - PAST_MONTHS), 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = Array(first.getDay()).fill(null);
    for (let i = 1; i <= days; i++) cells.push(new Date(first.getFullYear(), first.getMonth(), i));
    while (cells.length % 7) cells.push(null);
    return { first, cells };
  });

  // 라벨 — 주간은 그 주가 걸친 달("8월 · 9월"), 월은 그 달. 올해가 아니면 연도도.
  const yearOf = (d) => (d.getFullYear() !== today.getFullYear() ? `${d.getFullYear()}년 ` : '');
  const label = monthOpen
    ? `${yearOf(monthPages[monthPage].first)}${monthPages[monthPage].first.getMonth() + 1}월`
    : [...new Set(weekPages[weekPage].map(d => `${yearOf(d)}${d.getMonth() + 1}월`))].join(' · ');
  const onToday = monthOpen ? monthPage === PAST_MONTHS : weekPage === PAST_WEEKS;
  const goToday = () => {
    if (monthOpen) { monthRef.current?.scrollTo({ x: PAST_MONTHS * w, animated: true }); setMonthPage(PAST_MONTHS); }
    else { weekRef.current?.scrollTo({ x: PAST_WEEKS * w, animated: true }); setWeekPage(PAST_WEEKS); }
  };

  const dayCell = (d, { compact }) => {
    if (!d) return <View key={`e${Math.random()}`} style={{ flex: 1 }} />;
    const isToday = d.getTime() === todayMs;
    const numColor = isToday ? '#16281c' : (isRed(d) ? RED : '#fff');
    return (
      <TouchableOpacity key={d.getTime()} onPress={() => onDayPress && onDayPress(d)} activeOpacity={0.7}
        style={{ flex: 1, alignItems: 'center', paddingVertical: compact ? 0 : 3 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? C.butter : 'transparent' }}>
          <Text style={[{ fontFamily: isToday ? F.sysB : F.sysM, fontSize: fs(15.5), color: numColor }, !isToday && SHADOW]}>{d.getDate()}</Text>
        </View>
        <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: compact ? 6 : 2, backgroundColor: has(d) ? DOT : 'transparent' }} />
      </TouchableOpacity>
    );
  };
  const weekdayRow = (days) => (
    <View style={{ flexDirection: 'row' }}>
      {WEEKDAYS.map((nm, i) => {
        const d = days ? days[i] : null;
        const isToday = d && d.getTime() === todayMs;
        return (
          <Text key={nm} style={[{ flex: 1, textAlign: 'center', fontFamily: F.sys, fontSize: fs(11.5), color: isToday ? C.butter : (i === 0 ? RED : 'rgba(255,255,255,0.75)'), marginBottom: 6 }, SHADOW]}>{nm}</Text>
        );
      })}
    </View>
  );
  const pageEnd = (setter) => (e) => { if (w) setter(Math.max(0, Math.round(e.nativeEvent.contentOffset.x / w))); };

  return (
    <View style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 4 }} onLayout={e => { const x = Math.round(e.nativeEvent.layout.width) - 8; if (x > 0 && x !== w) setW(x); }}>
      {/* 라벨 줄 — 월 라벨 탭=펼침/접힘(글씨+작은 화살표, 버튼 아님). 오늘 장이 아니면 우측 '오늘' 글씨로 복귀 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12, marginRight: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={toggleMonth} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[{ fontFamily: F.sysB, fontSize: fs(12), color: 'rgba(255,255,255,0.85)' }, SHADOW]}>{label}</Text>
          <Text style={[{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.6)' }, SHADOW]}>{monthOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {!onToday && (
          <TouchableOpacity onPress={goToday} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 'auto' }}>
            <Text style={[{ fontFamily: F.sysSb, fontSize: fs(12), color: C.butter }, SHADOW]}>오늘</Text>
          </TouchableOpacity>
        )}
      </View>
      {w > 0 && loaded && (monthOpen ? (
        <ScrollView key={`m${w}`} ref={monthRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={pageEnd(setMonthPage)} onScrollEndDrag={pageEnd(setMonthPage)}>
          {monthPages.map(({ first, cells }) => (
            <View key={first.getTime()} style={{ width: w }}>
              {weekdayRow(null)}
              {Array.from({ length: cells.length / 7 }, (_, r) => (
                <View key={r} style={{ flexDirection: 'row' }}>
                  {cells.slice(r * 7, r * 7 + 7).map((d, i) => d ? dayCell(d, { compact: false }) : <View key={`e${r}-${i}`} style={{ flex: 1 }} />)}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView key={`w${w}`} ref={weekRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={pageEnd(setWeekPage)} onScrollEndDrag={pageEnd(setWeekPage)}>
          {weekPages.map((days) => (
            <View key={days[0].getTime()} style={{ width: w }}>
              {weekdayRow(days)}
              <View style={{ flexDirection: 'row' }}>{days.map(d => dayCell(d, { compact: true }))}</View>
            </View>
          ))}
        </ScrollView>
      ))}
    </View>
  );
}
