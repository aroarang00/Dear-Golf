import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScrollHide } from '../utils/tabBarHide';   // 내려 읽으면 헤더·탭바 숨김, 되돌리면 복귀(사용자 2026-09-29)
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import AppTextInput from './common/AppTextInput';
import { Icon } from './common/Icon';
import { showAppAlert } from './AppAlert';
import { PassportStamp, EmptyStamp } from './PassportStamp';
import { C, F, fs } from '../constants/colors';
import { normalizeCourseName, syncTop100ChecksFromFirestore, saveManualTop100Checks, getManualTop100Checks } from '../utils/top100';
import { buildPassport, masterKeyOf, syncVisitedChecksFromFirestore, saveVisitedChecks, getVisitedChecks, REGION_INK } from '../utils/passport';

// =============================================================
// 골프 여권 — 코스 탭 위에 덮이는 전체 화면 ([[golf-passport]], 2026-09-29)
//  구성(사장님 결정 C안): ① 요약 카드(공유 이미지 그대로) ② 100대 구장 100칸 ③ 내 도장(지역별) — 지도는 뒤로 가면 그대로.
//  ★Modal을 쓰지 않는다 — 코스 탭 목록 덮개와 같은 절대배치 덮개(zIndex 31). 안내창(AppAlert)만 띄우므로 모달 겹침 없음.
//  ★덮개에 onStartShouldSetResponder를 달지 않는다(2026-09-30) — 덮개가 JS responder를 잡으면 안의 ScrollView 네이티브
//    스크롤을 가로채, 버튼 없는 곳(요약 카드·제목·여백)에서 시작한 드래그가 안 먹는다. 첫 화면이 거의 요약 카드라
//    "처음 화면이 살짝 멈췄다가 스크롤된다"(사용자)로 나타났다. 코스 상세 덮개(GuideScreen, e2a2398)와 같은 함정.
//    밑의 지도로 터치가 새는 것은 CourseExploreTab이 여권이 열린 동안 아래 층을 pointerEvents 'none'으로 잠가 막는다.
//  ★100칸 중 빈 칸은 Svg 없는 View(EmptyStamp) — Svg 100개를 한 번에 그리면 저사양 기기가 버벅인다.
// =============================================================
//  ★첫 화면은 가볍게(2026-09-30, 사용자 "처음 화면이 살짝 멈췄다가 스크롤된다") — 열자마자 보이는 것(요약 카드 + 100대 첫 5줄)만
//    먼저 그리고, 나머지 75칸과 내 도장은 첫 장면이 뜬 뒤에 붙인다. 격자 높이는 미리 잡아 둬서 화면이 밀리지 않는다.
//    격자·내 도장은 memo — 헤더 높이 측정·체크 동기화 같은 작은 상태 변화에 도장 백여 개를 다시 그리지 않는다.
const GAP4 = 10, GAP5 = 8, PAD = 16;
const FIRST_ROWS = 5;   // 첫 장면에 그리는 100대 줄 수(5열 × 5줄 = 25칸)

const sameList = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// 100대 구장 격자 — rows가 바뀔 때만 다시 그린다. total은 전체 칸 수(높이 예약용).
const Top100Grid = React.memo(function Top100Grid({ rows, total, size, onPressRow }) {
  const lines = Math.ceil(total / 5);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP5, marginTop: 12, minHeight: lines ? lines * size + (lines - 1) * GAP5 : 0 }}>
      {rows.map(row => (
        <TouchableOpacity key={row.rank} onPress={() => onPressRow(row)} activeOpacity={0.75} style={{ width: size, height: size }}>
          {row.visited
            ? <PassportStamp size={size} ink={REGION_INK[row.stamp?.region] || C.burgundy} name={row.name} rank={row.rank}
                date={row.stamp?.firstDate || null} count={row.stamp?.count || 0} manual={!row.stamp || row.stamp.count === 0} />
            : <EmptyStamp size={size} rank={row.rank} />}
        </TouchableOpacity>
      ))}
    </View>
  );
});

// 내 도장 — 지역별 묶음. groups가 바뀔 때만 다시 그린다.
const StampRegions = React.memo(function StampRegions({ groups, size, onPressStamp }) {
  return groups.map(g => (
    <View key={g.region} style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: g.ink }} />
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>{g.region}</Text>
        <Text style={{ fontFamily: F.en, fontSize: fs(12), color: C.warmGray }}>{g.stamps.length}{g.total ? ` / ${g.total}` : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP4 }}>
        {g.stamps.map(s => (
          <TouchableOpacity key={s.key} onPress={() => onPressStamp(s)} activeOpacity={0.75} style={{ width: size, height: size }}>
            <PassportStamp size={size} ink={g.ink} name={s.name} date={s.firstDate} count={s.count} manual={s.count === 0} best={s.best} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  ));
});

export function GolfPassportScreen({ onClose, master = [], top100 = [], diaries = [], schedules = [], onPressCourse }) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const s4 = Math.floor((W - PAD * 2 - GAP4 * 3) / 4);   // 내 도장 4열
  const s5 = Math.floor((W - PAD * 2 - GAP5 * 4) / 5);   // 100대 구장 5열
  const cardRef = useRef(null);
  // 스크롤 숨김 — 헤더는 절대배치로 띄워 위로 밀어 올리고(hide→-headerH), 탭바는 훅이 전역 값으로 같이 내린다.
  const { hide, onScroll } = useScrollHide();
  const [headerH, setHeaderH] = useState(insets.top + 48);
  const headerY = hide.interpolate({ inputRange: [0, 1], outputRange: [0, -headerH] });

  const [manualKeys, setManualKeys] = useState([]);
  const [top100Checks, setTop100Checks] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');

  // 첫 장면이 그려진 다음 프레임에 나머지(100대 6줄~ + 내 도장)를 붙인다.
  const [full, setFull] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setFull(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  // 직접 체크 복원 — ①로컬 먼저(수 ms) ②Firestore 합집합(재설치·타기기)은 그 뒤. 실패해도 화면은 뜬다(기록·일정 도장은 로컬 컨텍스트).
  //   ★내용이 같으면 상태를 안 바꾼다 — 전엔 서버 응답이 올 때마다(열고 0.3~1초 뒤) 여권 전체를 다시 계산·다시 그려
  //     막 스크롤을 시작한 순간과 겹쳤다.
  useEffect(() => {
    let alive = true;
    const put = (v, t) => {
      if (!alive) return;
      setManualKeys(prev => (sameList(prev, v || []) ? prev : (v || [])));
      setTop100Checks(prev => (sameList(prev, t || []) ? prev : (t || [])));
    };
    (async () => {
      try { const [v, t] = await Promise.all([getVisitedChecks(), getManualTop100Checks()]); put(v, t); } catch {}
      try { const [v, t] = await Promise.all([syncVisitedChecksFromFirestore(), syncTop100ChecksFromFirestore()]); put(v, t); } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const pp = useMemo(
    () => buildPassport({ master, top100, diaries, schedules, manualKeys, top100Checks }),
    [master, top100, diaries, schedules, manualKeys, top100Checks],
  );

  // ── 공유: 요약 카드를 그대로 PNG로 찍어 OS 공유 시트(카톡 등). 취소는 오류가 아니라 조용히.
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, pixelRatio: 3 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '골프 여권 공유' });
      else showAppAlert('공유할 수 없어요', '이 기기에서는 공유 시트를 열 수 없어요.');
    } catch (e) {
      if (!/cancel/i.test(String(e?.message || ''))) showAppAlert('공유에 실패했어요', '잠시 후 다시 시도해 주세요.');
    } finally { setSharing(false); }
  };

  // ── 도장 탭 — 방문 기록이 있고 마스터 구장이면 상세로. 직접 체크만 있으면 해제 여부.
  const openCourse = useCallback((s) => {
    if (s?.kakaoId && onPressCourse) onPressCourse({ kakaoId: s.kakaoId, name: s.name, loc: s.loc, x: s.x, y: s.y });
  }, [onPressCourse]);
  const pressStamp = (s) => {
    if (s.count > 0) { openCourse(s); return; }
    showAppAlert(s.name, '직접 체크한 구장이에요.', [
      { text: '체크 해제', style: 'destructive', onPress: () => saveVisitedChecks(manualKeys.filter(k => k !== s.key)).then(setManualKeys) },
      ...(s.kakaoId ? [{ text: '구장 보기', onPress: () => openCourse(s) }] : []),
      { text: '닫기', style: 'cancel' },
    ]);
  };
  // ── 100대 칸 탭 — 빈 칸=다녀왔어요 체크, 수동 체크=해제, 도장=상세
  const pressTop100 = (row) => {
    if (row.stamp && row.stamp.count > 0) { openCourse(row.stamp); return; }
    if (row.visited) {
      showAppAlert(`No.${row.rank} ${row.name}`, '직접 체크한 구장이에요.', [
        { text: '체크 해제', style: 'destructive', onPress: () => saveManualTop100Checks(top100Checks.filter(r => r !== row.rank)).then(() => setTop100Checks(prev => prev.filter(r => r !== row.rank))) },
        { text: '닫기', style: 'cancel' },
      ]);
      return;
    }
    showAppAlert(`No.${row.rank} ${row.name}`, '다녀온 구장으로 체크할까요?\n기록이 없어도 도장이 찍혀요.', [
      { text: '취소', style: 'cancel' },
      { text: '다녀왔어요', onPress: () => { const next = [...new Set([...top100Checks, row.rank])]; saveManualTop100Checks(next); setTop100Checks(next); } },
    ]);
  };
  // ── 예전에 간 구장 추가(소급) — 마스터에서 이름 검색 → 직접 체크
  const addResults = useMemo(() => {
    const q = normalizeCourseName(addQuery);
    if (!q || q.length < 1) return [];
    return master.filter(c => normalizeCourseName(c.name).includes(q) || normalizeCourseName(c.input || '').includes(q)).slice(0, 8);
  }, [addQuery, master]);
  const addManual = (c) => {
    const k = masterKeyOf(c);
    if (pp.stamps.has(k)) { showAppAlert('이미 도장이 있어요', `${c.name}은(는) 이미 여권에 찍혀 있어요.`); return; }
    saveVisitedChecks([...manualKeys, k]).then(setManualKeys);
    setAddQuery(''); setAddOpen(false);
  };

  // 격자·내 도장(memo)에 넘기는 값은 참조를 고정한다 — 누름 핸들러는 최신 상태를 ref로 읽는다.
  const pressRef = useRef({});
  pressRef.current = { pressTop100, pressStamp };
  const onPressRow = useCallback((row) => pressRef.current.pressTop100(row), []);
  const onPressStamp = useCallback((s) => pressRef.current.pressStamp(s), []);
  const gridRows = useMemo(() => (full ? pp.top100Rows : pp.top100Rows.slice(0, FIRST_ROWS * 5)), [full, pp.top100Rows]);
  const stampGroups = useMemo(() => pp.regionGroups.filter(g => g.stamps.length), [pp.regionGroups]);
  const maxTotal = Math.max(1, ...pp.regionGroups.map(g => g.total));

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bgPrimary, zIndex: 31, elevation: 31 }}>
      {/* 헤더 — 코스 목록 헤더와 같은 버터 띠 한 줄(상태바 뒤까지). 절대배치 + translateY로 스크롤 시 위로 밀려 숨음. */}
      <Animated.View onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h && Math.abs(h - headerH) > 1) setHeaderH(h); }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, elevation: 2, transform: [{ translateY: headerY }],
          backgroundColor: C.butter, paddingHorizontal: 8, paddingTop: insets.top + 6, paddingBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 6, paddingRight: 10 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal, includeFontPadding: false }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, flex: 1 }}>골프 여권</Text>
        <TouchableOpacity onPress={share} disabled={sharing} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
            backgroundColor: C.charcoal, opacity: sharing ? 0.6 : 1 }}>
          <Icon name="share" size={fs(14)} color={C.butter} strokeWidth={2} />
          <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter, includeFontPadding: false }}>{sharing ? '준비 중…' : '공유'}</Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: headerH, paddingBottom: insets.bottom + 96 }}
        onScroll={onScroll} scrollEventThrottle={16}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* ── ① 요약 카드 = 공유 이미지. 남색 바탕에 도장 수·100대·지역 진행·최근 도장 3개. */}
        <View ref={cardRef} collapsable={false} style={{ marginHorizontal: PAD, marginTop: 14, borderRadius: 18, backgroundColor: C.navy, padding: 18, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(11), letterSpacing: 2, color: 'rgba(245,230,168,0.85)' }}>DEAR GOLF PASSPORT</Text>
            <Icon name="flag" size={fs(16)} color={C.butter} strokeWidth={1.8} />
          </View>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(19), color: '#fff', marginTop: 8 }}>나의 골프 여권</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 22, marginTop: 10 }}>
            <View>
              <Text style={{ fontFamily: F.en, fontSize: fs(38), lineHeight: fs(42), color: C.butter, includeFontPadding: false }}>{pp.stampCount}</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.8)' }}>다녀온 구장</Text>
            </View>
            <View>
              <Text style={{ fontFamily: F.en, fontSize: fs(38), lineHeight: fs(42), color: '#fff', includeFontPadding: false }}>
                {pp.top100Count}<Text style={{ fontSize: fs(16), color: 'rgba(255,255,255,0.6)' }}> / 100</Text>
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.8)' }}>100대 구장</Text>
            </View>
          </View>
          {/* 지역 진행 — 막대 길이는 지역 총수 비례, 채움은 다녀온 수 */}
          <View style={{ marginTop: 14, gap: 5 }}>
            {pp.regionGroups.filter(g => g.region !== '기타' && g.region !== '해외').map(g => (   /* 해외·기타는 총수가 없어 막대 없음(내 도장 묶음에만) */
              <View key={g.region} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 40, fontFamily: F.sysSb, fontSize: fs(11), color: 'rgba(255,255,255,0.85)', includeFontPadding: false }}>{g.region}</Text>
                <View style={{ flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round((g.total / maxTotal) * 100)}%`, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)' }}>
                    <View style={{ width: `${g.total ? Math.min(100, Math.round((g.stamps.length / g.total) * 100)) : 0}%`, height: 7, borderRadius: 4, backgroundColor: C.butter }} />
                  </View>
                </View>
                <Text style={{ width: 52, textAlign: 'right', fontFamily: F.en, fontSize: fs(11), color: 'rgba(255,255,255,0.85)', includeFontPadding: false }}>
                  {g.stamps.length} / {g.total}
                </Text>
              </View>
            ))}
          </View>
          {pp.recent.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' }}>
              {pp.recent.map(s => (
                <PassportStamp key={s.key} size={58} ink={C.butter} name={s.name} date={s.lastDate} count={0} onLight={false} />
              ))}
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>최근 도장</Text>
            </View>
          )}
          <Text style={{ fontFamily: F.brand, fontSize: fs(11), color: 'rgba(255,255,255,0.45)', marginTop: 12, textAlign: 'right' }}>deargolf.app</Text>
        </View>

        {/* ── ② 100대 구장 — 순위대로 100칸. 빈 칸이 보여야 '다음엔 저기'가 생긴다. */}
        <View style={{ marginTop: 22, paddingHorizontal: PAD }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>100대 구장</Text>
            <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.burgundy }}>{pp.top100Count} / {top100.length || 100}</Text>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 3 }}>빈 칸을 누르면 다녀온 구장으로 체크할 수 있어요</Text>
          <Top100Grid rows={gridRows} total={pp.top100Rows.length} size={s5} onPressRow={onPressRow} />
          {top100.length === 0 && <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 10 }}>100대 구장 목록을 불러오는 중이에요…</Text>}
        </View>

        {/* ── ③ 내 도장 — 지역별, 다녀온 것만. 478칸을 빈칸으로 늘어놓지 않는다(압도됨). */}
        <View style={{ marginTop: 26, paddingHorizontal: PAD }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>내 도장 <Text style={{ fontFamily: F.en, color: C.burgundy }}>{pp.stampCount}</Text></Text>
            <TouchableOpacity onPress={() => { setAddOpen(v => !v); setAddQuery(''); }} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name={addOpen ? 'close' : 'pen'} size={fs(13)} color={C.navy} strokeWidth={2} />
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.navy }}>{addOpen ? '닫기' : '예전에 간 구장 추가'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 3 }}>라운딩 기록과 지난 일정에서 자동으로 찍혀요</Text>

          {addOpen && (
            <View style={{ marginTop: 10, backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: C.hairline, padding: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 10 }}>
                <Icon name="search" size={fs(15)} color={C.warmGray} />
                <AppTextInput value={addQuery} onChangeText={setAddQuery} placeholder="구장 이름" placeholderTextColor={C.warmGray} autoFocus
                  style={{ flex: 1, paddingVertical: Platform.OS === 'android' ? 8 : 10, paddingHorizontal: 8, fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} />
              </View>
              {addResults.map(c => (
                <TouchableOpacity key={c.kakaoId || c.name} onPress={() => addManual(c)} activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 1 }} numberOfLines={1}>{c.loc}</Text>
                  </View>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.navy }}>도장 찍기</Text>
                </TouchableOpacity>
              ))}
              {!!addQuery.trim() && addResults.length === 0 && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 10, paddingHorizontal: 4 }}>찾는 구장이 없어요. 다른 이름으로 검색해 보세요.</Text>
              )}
            </View>
          )}

          {pp.stampCount === 0 ? (
            <View style={{ marginTop: 14, backgroundColor: C.bgSecondary, borderRadius: 14, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: C.hairline }}>
              <EmptyStamp size={64} label="첫 도장" />
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal, marginTop: 12, textAlign: 'center' }}>아직 도장이 없어요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                라운딩을 기록하거나 일정을 잡아두면{'\n'}다녀온 날 도장이 저절로 찍혀요.
              </Text>
            </View>
          ) : full ? (
            <StampRegions groups={stampGroups} size={s4} onPressStamp={onPressStamp} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
