import React, { useState, useMemo, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { C, F, fs } from '../constants/colors';
import { roundsOnly, isRoundDiary } from '../utils/diaryKind';
import { calcHandicap } from '../utils/handicap';
import { countCompletedRounds, displayTotalRounds } from '../utils/roundStats';

// 스코어 통계·추세 — "내 코스 모아보기"의 요약 배너에서 진입(전용 화면). ([[feature-backlog]] ①)
//  전부 다이어리(라운딩 기록) 클라 집계 = 추가 저장 0. 차트는 기존 react-native-svg(재빌드 X).
//  해외·일상(moment) 제외, score>0만. 36홀 같은날 2건도 각각 점.

const PERIODS = [[10, '최근 10'], [20, '최근 20'], [0, '전체']];

// "YYYY.MM.DD" → 정렬 키(숫자). 형식 깨지면 0.
export function dateKey(s) {
  const m = String(s || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return 0;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

// 미니 추세 스파크라인 — 내 코스 모아보기 배너 안에 박는 작은 추세선(낮은 점수=위). 베스트 점 골드.
//   진입 배너가 곧 '콘텐츠 미리보기'가 되도록(까딱임 대신 시선 유도). scores=날짜오름차순 점수배열.
export function ScoreSparkline({ scores, width, height = 32 }) {
  if (!scores || scores.length < 2 || !width) return null;
  const best = Math.min(...scores);
  let minV = best, maxV = Math.max(...scores);
  if (minV === maxV) { minV -= 1; maxV += 1; }   // 전부 동점 — 평평한 중앙선
  const span = maxV - minV;
  const n = scores.length;
  const padY = 4;
  const x = (i) => (width * i) / (n - 1);
  const y = (v) => padY + ((v - minV) / span) * (height - padY * 2);   // ★낮은 v(좋음)→작은 y(위)
  const pts = scores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const bi = scores.lastIndexOf(best);
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(bi)} cy={y(best)} r={3} fill={C.butter} />
    </Svg>
  );
}

// 스코어 진입 배너(공용) — 미니 추세 스파크라인 + 평균·베스트·핸디 + 하이라이트 배지 + CTA.
//   MY 명함 화면·내 코스 모아보기 양쪽에서 같은 배너 사용(onPress로 ScoreStatsScreen 진입). 다이어리 클라 집계라 추가 저장 0.
export function ScoreBanner({ diaries, userProfile, onPress, style, collapsible = false }) {
  // collapsible이면 '기본 접힘'으로 시작 — 평소엔 한 줄로 깔끔, 필요할 때만 펼침. 로컬 상태라
  //   다른 화면 갔다 오면(재마운트) 다시 접힌다. 비-collapsible(코스 모아보기)은 항상 펼침.
  const [collapsed, setCollapsed] = useState(collapsible);
  const series = useMemo(() => (diaries || []).filter(isRoundDiary)
    .filter((d) => typeof d.score === 'number' && d.score > 0)
    .map((d) => ({ s: d.score, k: dateKey(d.date) }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.s), [diaries]);

  const avg = series.length ? Math.round(series.reduce((a, b) => a + b, 0) / series.length) : null;
  const bestCand = [series.length ? Math.min(...series) : null, userProfile?.lifeBest].filter((v) => Number.isFinite(v) && v > 0);
  const best = bestCand.length ? Math.min(...bestCand) : null;
  const handi = calcHandicap(diaries || [], userProfile?.avgScore);

  const recentDelta = useMemo(() => {
    if (series.length < 4) return null;
    const k = Math.min(5, Math.floor(series.length / 2));
    const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return m(series.slice(-k * 2, -k)) - m(series.slice(-k));   // >0 개선
  }, [series]);

  const hint = series.length < 4 ? '탭하면 추세·구장별·분포까지 →'
    : recentDelta > 0.5 ? '최근 좋아지는 중 ↗'
    : recentDelta < -0.5 ? '최근 흐름이 아쉬워요'
    : '꾸준히 유지 중';

  const highlight = useMemo(() => {
    if (series.length < 2) return null;
    const last = series[series.length - 1];
    const prevBest = Math.min(...series.slice(0, -1));
    if (last <= prevBest) return `🎉 베스트 갱신 ${last}!`;                  // 최근 라운드 = 역대 최저
    if (last < 80 && prevBest >= 80) return '🏆 첫 싱글 달성!';             // 처음으로 80 깸
    if (last < 90 && prevBest >= 90) return '🏆 90 브레이크!';              // 처음으로 90 깸
    if (recentDelta != null && recentDelta >= 2) return `📈 최근 ${Math.round(recentDelta)}타 좋아지는 중`;
    return null;
  }, [series, recentDelta]);

  const SPARK_W = Dimensions.get('window').width - 16 * 2 - 16 * 2;   // margin16*2 + padding16*2

  return (
    <TouchableOpacity style={[{ marginHorizontal: 16, marginVertical: 8, backgroundColor: C.navy, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }, style]}
      activeOpacity={0.85} onPress={onPress}>
      {/* 상단 — 제목 + 평균·베스트·핸디 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>내 스코어</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {[['평균', avg], ['베스트', best], ['핸디', handi]].map(([l, v]) => (
            <View key={l} style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: l === '베스트' ? C.butter : '#fff' }}>{v != null ? v : '-'}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(9.5), color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>{l}</Text>
            </View>
          ))}
          {/* 접기/펼치기 — 배너 탭(통계 진입)과 분리된 별도 터치영역. collapsible일 때만 */}
          {collapsible && (
            <TouchableOpacity onPress={() => setCollapsed((c) => !c)} hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }} style={{ paddingLeft: 2 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.6)' }}>{collapsed ? '▼' : '▲'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {/* 접힌 상태(collapsible)면 위 한 줄만 — 추세·배지·CTA 숨김 */}
      {!collapsed && (
        <>
          {/* 중단 — 미니 추세(2R+) 또는 빈 안내 */}
          {series.length >= 2 ? (
            <View style={{ marginTop: 10 }}>
              <ScoreSparkline scores={series.slice(-20)} width={SPARK_W} height={32} />
            </View>
          ) : (
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>
              라운딩을 기록하면 스코어 추세가 보여요
            </Text>
          )}
          {/* 하단 — 하이라이트 배지(있으면 골드) 또는 흐름 힌트 + CTA */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            {highlight ? (
              <View style={{ backgroundColor: C.butter, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.navy }} numberOfLines={1}>{highlight}</Text>
              </View>
            ) : (
              <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: 'rgba(255,255,255,0.72)' }}>{hint}</Text>
            )}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: C.butter }}>통계 자세히 보기 →</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

export function ScoreStatsScreen({ visible, onClose, diaries, schedules, userProfile }) {
  const [period, setPeriod] = useState(20);
  const [infoOpen, setInfoOpen] = useState(false);   // 안내 — 항상 접힌 채 시작, 탭 시 펼침
  // 화면을 닫으면(다른 화면으로 이동) 안내를 다시 접는다 — 모달은 마운트 유지라 상태가 남기 때문.
  useEffect(() => { if (!visible) setInfoOpen(false); }, [visible]);

  // 점수 있는 라운딩만 날짜순(오름차순) — 추세용
  const scored = useMemo(() => roundsOnly(diaries || [])
    .filter(d => typeof d.score === 'number' && d.score > 0)
    .map(d => ({ score: d.score, date: d.date || '', course: d.course || '', k: dateKey(d.date) }))
    .sort((a, b) => a.k - b.k), [diaries]);

  const series = useMemo(() => (period > 0 ? scored.slice(-period) : scored), [scored, period]);

  // 요약 지표 — DiaryScreen과 동일 헬퍼/필드로 숫자 불일치 방지
  const totalRounds = displayTotalRounds(userProfile || {}, countCompletedRounds(diaries || [], schedules || []));
  const allScores = scored.map(s => s.score);
  const avg = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
  const diaryBest = allScores.length ? Math.min(...allScores) : null;
  const best = [diaryBest, userProfile?.lifeBest].filter(v => Number.isFinite(v) && v > 0);
  const bestVal = best.length ? Math.min(...best) : null;
  const handicap = calcHandicap(diaries || [], userProfile?.avgScore);

  // 최근 폼 — 최근 N R 평균 vs 직전 N R 평균(낮을수록 좋음). 숫자만 보던 걸 '해석' 한 줄로.
  const form = useMemo(() => {
    const arr = scored.map(s => s.score);
    if (arr.length < 4) return null;                 // 흐름 비교엔 최소 4R
    const k = Math.min(5, Math.floor(arr.length / 2));
    const recent = arr.slice(-k), prev = arr.slice(-k * 2, -k);
    const m = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
    const ra = m(recent), pa = m(prev);
    return { k, ra, delta: pa - ra };                // delta>0 = 개선(점수 낮아짐)
  }, [scored]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13,
            borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>내 스코어</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}>
            {/* A. 요약 스탯바 */}
            <View style={{ flexDirection: 'row', backgroundColor: C.navy, borderRadius: 16, paddingVertical: 18 }}>
              {[
                ['총 라운딩', totalRounds != null ? `${totalRounds}` : '-'],
                ['평균', avg != null ? `${avg}` : '-'],
                ['베스트', bestVal != null ? `${bestVal}` : '-'],
                ['핸디', handicap != null ? `${handicap}` : '-'],
              ].map(([label, val], i) => (
                <View key={label} style={{ flex: 1, alignItems: 'center',
                  borderLeftWidth: i === 0 ? 0 : 0.5, borderLeftColor: 'rgba(255,255,255,0.15)' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: i === 2 ? C.butter : '#fff' }}>{val}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{label}</Text>
                </View>
              ))}
            </View>
            {/* 안내 — 평소 접힘(제목만 또렷이), 탭하면 화면 각 항목 설명 펼침. 공간 절약 + 알아보기 쉬운 제목 */}
            <TouchableOpacity onPress={() => setInfoOpen((o) => !o)} activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10,
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoal }}>💡 평균·베스트·핸디 안내</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{infoOpen ? '접기 ▲' : '펼치기 ▼'}</Text>
            </TouchableOpacity>
            {infoOpen && (
              <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline,
                paddingHorizontal: 14, paddingVertical: 12, marginTop: 6, gap: 7 }}>
                {[
                  ['평균·베스트·핸디', `점수를 기록한 ${scored.length}라운드 기준이에요.`],
                  ['핸디', '그중 최근 20R의 베스트 5개 평균이에요 (기록 6개부터).'],
                  ['총 라운딩', '점수 없는 라운딩·지난 일정까지 포함해요.'],
                  ['최근 폼', '최근 5R 평균이 직전 5R보다 좋아졌는지·나빠졌는지 보여줘요.'],
                  ['점수대 분포', '70대 이하·80대·90대·100+ 비율이에요.'],
                  ['구장별 스코어', '구장마다 방문 수·베스트·평균을 모았어요.'],
                ].map(([k, v]) => (
                  <Text key={k} style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, lineHeight: 17 }}>
                    <Text style={{ fontFamily: F.sysSb, color: C.charcoal }}>{k}</Text>  {v}
                  </Text>
                ))}
              </View>
            )}

            {/* A-2. 최근 폼 인사이트 — 숫자 해석 한 줄(개선=그린/아쉬움=코랄/유지=중립) */}
            {form && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
                backgroundColor: (form.delta > 0 ? '#EAF1E2' : form.delta < 0 ? '#F7E9E4' : C.bgSecondary),
                borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11,
                borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontSize: fs(14) }}>{form.delta > 0 ? '📈' : form.delta < 0 ? '📉' : '➖'}</Text>
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                  최근 <Text style={{ fontFamily: F.sysB }}>{form.k}R 평균 {form.ra}</Text>
                  {form.delta > 0
                    ? <Text> — 직전 {form.k}R보다 <Text style={{ fontFamily: F.sysB, color: '#4B7A3E' }}>{form.delta}타 좋아졌어요 ↗</Text></Text>
                    : form.delta < 0
                      ? <Text> — 직전 {form.k}R보다 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>{-form.delta}타 아쉬웠어요</Text></Text>
                      : <Text> — 직전과 <Text style={{ fontFamily: F.sysB }}>비슷한 흐름</Text>이에요</Text>}
                </Text>
              </View>
            )}

            {/* A-3. 기록(마일스톤) — 라이프 베스트·브레이크 달성 등 성취 하이라이트 */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginTop: 24, marginBottom: 2 }}>기록</Text>
            <Milestones scored={scored} lifeBest={userProfile?.lifeBest} />

            {/* B. 스코어 추세 그래프 */}
            <View style={{ marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>스코어 추세</Text>
              <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 9, padding: 2 }}>
                {PERIODS.map(([v, l]) => {
                  const on = period === v;
                  return (
                    <TouchableOpacity key={l} onPress={() => setPeriod(v)} activeOpacity={0.8}
                      style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 7, backgroundColor: on ? C.charcoal : 'transparent' }}>
                      <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(11.5), color: on ? C.butter : C.warmGray }}>{l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginTop: 4 }}>위로 갈수록 좋은 스코어예요</Text>

            <TrendChart series={series} avg={avg} bestVal={bestVal} />

            {/* C. 점수대 분포 — 내 실력대가 어디에 몰려 있는지 */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginTop: 24, marginBottom: 2 }}>점수대 분포</Text>
            <ScoreDistribution scored={scored} />

            {/* D. 홀 분석 — 파·버디·보기 비율 도넛 */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginTop: 24, marginBottom: 2 }}>홀 분석</Text>
            <HoleBreakdown diaries={diaries} />

            {/* E. 구장별 스코어 — '내 코스 모아보기'와 직접 연결(구장·방문·베스트·평균) */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginTop: 24, marginBottom: 2 }}>구장별 스코어</Text>
            <CourseScores scored={scored} />
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

// 추세 라인차트 — 낮은 점수(좋음)가 위로 가게 y 반전. 베스트 점 골드, 평균 점선.
function TrendChart({ series, avg, bestVal }) {
  const CARD_PAD = 12;
  const W = Dimensions.get('window').width - 32 - CARD_PAD * 2;  // ScrollView 16*2 + 카드 패딩
  const H = 200;
  const padL = 30, padR = 14, padT = 16, padB = 24;
  const chartW = Math.max(1, W - padL - padR);
  const chartH = H - padT - padB;
  const GOLD = '#C9A84C';   // 100대 배너와 같은 골드 — 화면 골드 톤 통일(베스트 강조)
  // 카드 — 스탯바·안내 박스와 같은 결(연한 배경 + 라운드 + 헤어라인)로 통일
  const card = { marginTop: 10, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline };

  if (!series || series.length < 2) {
    return (
      <View style={[card, { height: 180, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: fs(30) }}>📈</Text>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray, marginTop: 10, textAlign: 'center', paddingHorizontal: 24, lineHeight: 19 }}>
          라운딩 2회 이상 기록하면{'\n'}스코어 추세가 보여요
        </Text>
      </View>
    );
  }

  const scores = series.map(s => s.score);
  let minV = Math.min(...scores), maxV = Math.max(...scores);
  if (minV === maxV) { minV -= 2; maxV += 2; }            // 전부 동점 — 평평한 중앙선
  const span = maxV - minV;
  const n = series.length;
  const x = (i) => padL + (n === 1 ? chartW / 2 : (chartW * i) / (n - 1));
  const y = (v) => padT + ((v - minV) / span) * chartH;   // ★낮은 v(좋음) → 작은 y(위)
  const pts = series.map((s, i) => `${x(i)},${y(s.score)}`).join(' ');
  const avgY = avg != null ? y(Math.min(maxV, Math.max(minV, avg))) : null;

  return (
    <View style={[card, { paddingHorizontal: CARD_PAD, paddingVertical: CARD_PAD }]}>
      <Svg width={W} height={H}>
        {/* y축 가이드(베스트·워스트) */}
        <SvgText x={padL - 6} y={y(minV) + 4} fontSize={fs(10)} fill={C.warmGray} textAnchor="end">{minV}</SvgText>
        <SvgText x={padL - 6} y={y(maxV) + 4} fontSize={fs(10)} fill={C.warmGray} textAnchor="end">{maxV}</SvgText>
        {/* 평균 점선 — 중립 회색 가이드(값은 차트 아래 범례에 표시, 점/글자 겹침 방지) */}
        {avgY != null && (
          <Line x1={padL} y1={avgY} x2={W - padR} y2={avgY} stroke={C.warmGrayLight} strokeWidth={1} strokeDasharray="4,4" />
        )}
        {/* 추세선 — 네이비(브랜드) */}
        <Polyline points={pts} fill="none" stroke={C.navy} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {/* 점 — 베스트는 골드(흰 테두리), 그 외 흰 점+네이비 링 */}
        {series.map((s, i) => {
          const isBest = bestVal != null && s.score === bestVal;
          return (
            <Circle key={i} cx={x(i)} cy={y(s.score)} r={isBest ? 5.5 : 3.5}
              fill={isBest ? GOLD : '#fff'} stroke={isBest ? '#fff' : C.navy} strokeWidth={isBest ? 1.5 : 2} />
          );
        })}
      </Svg>
      {/* x축 — 처음/끝 날짜 (차트 점 위치에 맞춰 정렬) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: padL, paddingRight: padR, marginTop: 2 }}>
        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>{series[0].date}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>{series[n - 1].date}</Text>
      </View>
      {/* 범례 — 평균선·베스트점 의미를 차트 밖에서 표시(겹침 0) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 14, height: 2, backgroundColor: C.warmGrayLight, borderRadius: 1 }} />
          <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray }}>평균 {avg}</Text>
        </View>
        {bestVal != null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: GOLD, borderWidth: 1.5, borderColor: '#fff' }} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray }}>베스트 {bestVal}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// 홀 분석 도넛 — holeScores vs holePars로 버디↓/파/보기/더블+ 비율. 홀별 입력 있는 라운드만 집계.
const HB = { birdie: '#6B1E2A', par: '#6B8B5E', bogey: '#C8D9E6', dbl: '#B8B3AB' };
function HoleBreakdown({ diaries }) {
  const stat = useMemo(() => {
    let birdie = 0, par = 0, bogey = 0, dbl = 0, holes = 0, rounds = 0;
    roundsOnly(diaries || []).forEach(d => {
      const hs = d.holeScores, hp = d.holePars;
      if (!Array.isArray(hs) || !Array.isArray(hp)) return;
      let used = false;
      for (let i = 0; i < hs.length; i++) {
        const s = hs[i], p = hp[i];
        if (!Number.isFinite(s) || !Number.isFinite(p) || s <= 0 || p <= 0) continue;
        const diff = s - p; holes++; used = true;
        if (diff <= -1) birdie++; else if (diff === 0) par++; else if (diff === 1) bogey++; else dbl++;
      }
      if (used) rounds++;
    });
    return { birdie, par, bogey, dbl, holes, rounds };
  }, [diaries]);

  const card = { marginTop: 8, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: 16 };

  if (stat.holes === 0) {
    return (
      <View style={[card, { alignItems: 'center' }]}>
        <Text style={{ fontSize: fs(26) }}>🍩</Text>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: C.warmGray, marginTop: 8, textAlign: 'center', lineHeight: 18 }}>
          홀별 점수를 입력한 라운드가 없어요.{'\n'}기록할 때 홀별 점수를 넣으면 분석돼요.
        </Text>
      </View>
    );
  }

  const segs = [
    ['버디↓', stat.birdie, HB.birdie],
    ['파', stat.par, HB.par],
    ['보기', stat.bogey, HB.bogey],
    ['더블+', stat.dbl, HB.dbl],
  ];
  const total = stat.holes;
  const SIZE = 124, stroke = 18, R = (SIZE - stroke) / 2, CIRC = 2 * Math.PI * R, cx = SIZE / 2, cy = SIZE / 2;
  const parPct = Math.round((stat.par / total) * 100);
  let offset = 0;

  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      {/* 도넛 */}
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          {segs.map(([label, count, color]) => {
            if (!count) return null;
            const len = (count / total) * CIRC;
            const el = (
              <Circle key={label} cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`} />
            );
            offset += len;
            return el;
          })}
        </Svg>
        {/* 중앙 — 파 비율 */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal }}>{parPct}%</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 1 }}>파</Text>
        </View>
      </View>

      {/* 범례 */}
      <View style={{ flex: 1, gap: 9 }}>
        {segs.map(([label, count, color]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12.5), color: C.charcoal }}>{label}</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: C.charcoal }}>{Math.round((count / total) * 100)}%</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, width: 38, textAlign: 'right' }}>{count}홀</Text>
          </View>
        ))}
      </View>

      </View>
      {/* 기준 라운드 수 */}
      <Text style={{ fontFamily: F.sys, fontSize: fs(9.5), color: C.warmGrayLight, textAlign: 'right', marginTop: 10 }}>
        {stat.rounds}개 라운드 · 홀별 입력 기준
      </Text>
    </View>
  );
}

// 점수대 분포 — 70대 이하 / 80대 / 90대 / 100 이상 막대. 내 실력대가 어디 몰렸는지 한눈에.
const DIST_BUCKETS = [
  ['70대 이하', '#6B8B5E', (v) => v < 80],
  ['80대',     '#4E6E8E', (v) => v >= 80 && v < 90],
  ['90대',     '#C9A84C', (v) => v >= 90 && v < 100],
  ['100 이상', '#B8835A', (v) => v >= 100],
];
function ScoreDistribution({ scored }) {
  const rows = useMemo(() => {
    const counts = DIST_BUCKETS.map(([label, color]) => ({ label, color, count: 0 }));
    (scored || []).forEach((s) => {
      const idx = DIST_BUCKETS.findIndex(([, , test]) => test(s.score));
      if (idx >= 0) counts[idx].count++;
    });
    return counts;
  }, [scored]);
  const total = (scored || []).length;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const card = { marginTop: 8, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 16, paddingVertical: 14 };

  if (!total) {
    return (
      <View style={[card, { alignItems: 'center' }]}>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: C.warmGray, textAlign: 'center', lineHeight: 18 }}>
          점수를 기록한 라운딩이 없어요.
        </Text>
      </View>
    );
  }

  return (
    <View style={card}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 5 }}>
          <Text style={{ width: 56, fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal }}>{r.label}</Text>
          <View style={{ flex: 1, height: 16, backgroundColor: C.hairline, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ width: `${(r.count / max) * 100}%`, height: '100%', backgroundColor: r.color, borderRadius: 8 }} />
          </View>
          <Text style={{ width: 60, textAlign: 'right', fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>
            {r.count}<Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>회 · {Math.round((r.count / total) * 100)}%</Text>
          </Text>
        </View>
      ))}
      {/* 분모 명시 — '회' 합이 요약바 총 라운딩과 달라 보이는 혼동 방지(총 라운딩은 점수 없는 것까지 포함) */}
      <Text style={{ fontFamily: F.sys, fontSize: fs(9.5), color: C.warmGrayLight, textAlign: 'right', marginTop: 8 }}>
        점수 기록 {total}라운드 기준
      </Text>
    </View>
  );
}

// 구장별 스코어 — 구장·방문수·베스트·평균. '내 코스 모아보기'와 스코어를 직접 연결. 방문 많은 순→베스트 좋은 순.
function CourseScores({ scored }) {
  const rows = useMemo(() => {
    const m = new Map();
    (scored || []).forEach((s) => {
      const c = (s.course || '').trim() || '코스 미상';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(s.score);
    });
    return Array.from(m.entries())
      .map(([course, arr]) => ({
        course, count: arr.length,
        best: Math.min(...arr),
        avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      }))
      .sort((a, b) => b.count - a.count || a.best - b.best);
  }, [scored]);
  const card = { marginTop: 8, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 4 };

  if (!rows.length) {
    return (
      <View style={[card, { alignItems: 'center', paddingVertical: 16 }]}>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: C.warmGray, textAlign: 'center', lineHeight: 18 }}>
          점수를 기록한 라운딩이 없어요.
        </Text>
      </View>
    );
  }

  return (
    <View style={card}>
      {/* 헤더 */}
      <View style={{ flexDirection: 'row', paddingVertical: 8 }}>
        <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray }}>구장</Text>
        <Text style={{ width: 44, textAlign: 'center', fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray }}>방문</Text>
        <Text style={{ width: 52, textAlign: 'center', fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray }}>베스트</Text>
        <Text style={{ width: 44, textAlign: 'center', fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray }}>평균</Text>
      </View>
      {rows.map((r) => (
        <View key={r.course} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12.5), color: C.charcoal, paddingRight: 6 }}>{r.course}</Text>
          <Text style={{ width: 44, textAlign: 'center', fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>{r.count}</Text>
          <Text style={{ width: 52, textAlign: 'center', fontFamily: F.sysB, fontSize: fs(13.5), color: '#C9A84C' }}>{r.best}</Text>
          <Text style={{ width: 44, textAlign: 'center', fontFamily: F.sysM, fontSize: fs(12.5), color: C.charcoal }}>{r.avg}</Text>
        </View>
      ))}
    </View>
  );
}

// 기록(마일스톤) — 라이프 베스트·90 브레이크·첫 싱글(80↓)·총 라운딩. scored=날짜오름차순(첫 항목=최초 달성).
//   미달성은 '도전 중'으로 회색 — 목표가 보여 동기부여. 추가 저장 없이 다이어리에서 집계.
function Milestones({ scored, lifeBest }) {
  const m = useMemo(() => {
    const list = scored || [];
    let best = null;
    list.forEach((s) => { if (best == null || s.score < best.score) best = s; });
    const firstUnder = (th) => list.find((s) => s.score < th) || null;   // 날짜오름차순 → 첫 매치 = 최초 달성
    return { total: list.length, best, sub90: firstUnder(90), sub80: firstUnder(80) };
  }, [scored]);

  const card = { marginTop: 8, backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 16, paddingVertical: 4 };

  if (!m.total) {
    return (
      <View style={[card, { alignItems: 'center', paddingVertical: 16 }]}>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: C.warmGray, textAlign: 'center', lineHeight: 18 }}>
          점수를 기록하면 베스트·브레이크 기록이 쌓여요.
        </Text>
      </View>
    );
  }

  // 라이프 베스트 — 다이어리 최저 vs 수동입력 lifeBest 중 더 낮은 값(구장·날짜는 다이어리 베스트일 때만).
  const diaryBest = m.best ? m.best.score : null;
  const cand = [diaryBest, lifeBest].filter((v) => Number.isFinite(v) && v > 0);
  const bestVal = cand.length ? Math.min(...cand) : null;
  const bestSub = (m.best && diaryBest === bestVal) ? `${m.best.course || '코스 미상'} · ${m.best.date}` : null;

  const rows = [
    { emoji: '🏆', label: '라이프 베스트', val: bestVal != null ? `${bestVal}` : '—', sub: bestSub, done: bestVal != null },
    { emoji: '⛳', label: '90 브레이크', val: m.sub90 ? m.sub90.date : '도전 중', sub: m.sub90 ? (m.sub90.course || '코스 미상') : null, done: !!m.sub90 },
    { emoji: '🔥', label: '첫 싱글 (79↓)', val: m.sub80 ? m.sub80.date : '도전 중', sub: m.sub80 ? (m.sub80.course || '코스 미상') : null, done: !!m.sub80 },
    { emoji: '📒', label: '기록한 라운딩', val: `${m.total}회`, sub: null, done: true },
  ];

  return (
    <View style={card}>
      {rows.map((r, i) => (
        <View key={r.label} style={{ paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
          {/* 첫 줄 — 이모지 + 라벨 + 값(값은 right) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: fs(15), opacity: r.done ? 1 : 0.4 }}>{r.emoji}</Text>
            <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12.5), color: r.done ? C.charcoal : C.warmGrayLight }}>{r.label}</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: r.done ? C.charcoal : C.warmGrayLight }}>{r.val}</Text>
          </View>
          {/* 부제(구장·날짜) — 전체 폭 둘째 줄로 빼 잘림 방지(이모지 폭만큼 들여쓰기) */}
          {r.sub ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray, marginTop: 3, marginLeft: 25 }} numberOfLines={1}>{r.sub}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
