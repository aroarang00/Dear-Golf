import React, { useState, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { C, F, fs } from '../constants/colors';
import { roundsOnly } from '../utils/diaryKind';
import { calcHandicap } from '../utils/handicap';
import { countCompletedRounds, displayTotalRounds } from '../utils/roundStats';

// 스코어 통계·추세 — "내 코스 모아보기"의 요약 배너에서 진입(전용 화면). ([[feature-backlog]] ①)
//  전부 다이어리(라운딩 기록) 클라 집계 = 추가 저장 0. 차트는 기존 react-native-svg(재빌드 X).
//  해외·일상(moment) 제외, score>0만. 36홀 같은날 2건도 각각 점.

const PERIODS = [[10, '최근 10'], [20, '최근 20'], [0, '전체']];

// "YYYY.MM.DD" → 정렬 키(숫자). 형식 깨지면 0.
function dateKey(s) {
  const m = String(s || '').match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return 0;
  return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

export function ScoreStatsScreen({ visible, onClose, diaries, schedules, userProfile }) {
  const [period, setPeriod] = useState(20);

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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
            {/* 평균·핸디 혼동 방지 안내 */}
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 9, lineHeight: 16 }}>
              평균은 전체 라운딩 평균이에요.{'\n'}핸디는 가장 잘 친 5개의 평균이에요(기록 6개부터, 그 전엔 입력값·평균).
            </Text>

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
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

// 추세 라인차트 — 낮은 점수(좋음)가 위로 가게 y 반전. 베스트 점 골드, 평균 점선.
function TrendChart({ series, avg, bestVal }) {
  const W = Dimensions.get('window').width - 32;  // ScrollView padding 16*2
  const H = 210;
  const padL = 30, padR = 14, padT = 16, padB = 26;
  const chartW = Math.max(1, W - padL - padR);
  const chartH = H - padT - padB;

  if (!series || series.length < 2) {
    return (
      <View style={{ height: H, borderRadius: 14, backgroundColor: C.bgSecondary, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
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
    <View style={{ marginTop: 10 }}>
      <Svg width={W} height={H}>
        {/* y축 가이드(베스트·워스트) */}
        <SvgText x={padL - 6} y={y(minV) + 4} fontSize={fs(10)} fill={C.warmGrayLight} textAnchor="end">{minV}</SvgText>
        <SvgText x={padL - 6} y={y(maxV) + 4} fontSize={fs(10)} fill={C.warmGrayLight} textAnchor="end">{maxV}</SvgText>
        {/* 평균 점선 */}
        {avgY != null && (
          <>
            <Line x1={padL} y1={avgY} x2={W - padR} y2={avgY} stroke={C.warmGrayLight} strokeWidth={1} strokeDasharray="4,4" />
            <SvgText x={W - padR} y={avgY - 5} fontSize={fs(9.5)} fill={C.warmGray} textAnchor="end">평균 {avg}</SvgText>
          </>
        )}
        {/* 추세선 */}
        <Polyline points={pts} fill="none" stroke={C.navy} strokeWidth={2} />
        {/* 점 — 베스트는 골드 강조 */}
        {series.map((s, i) => {
          const isBest = bestVal != null && s.score === bestVal;
          return (
            <Circle key={i} cx={x(i)} cy={y(s.score)} r={isBest ? 5 : 3.5}
              fill={isBest ? '#E0A800' : '#fff'} stroke={isBest ? '#E0A800' : C.navy} strokeWidth={2} />
          );
        })}
      </Svg>
      {/* x축 — 처음/끝 날짜 */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: padL, marginTop: 2 }}>
        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight }}>{series[0].date}</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight }}>{series[n - 1].date}</Text>
      </View>
    </View>
  );
}
