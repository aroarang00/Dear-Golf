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
            {/* 평균·핸디 혼동 방지 안내 — 연한 박스 + 💡 */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, backgroundColor: C.bgSecondary,
              borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 0.5, borderColor: C.hairline }}>
              <Text style={{ fontSize: fs(13) }}>💡</Text>
              <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, lineHeight: 17 }}>
                <Text style={{ fontFamily: F.sysSb, color: C.charcoal }}>평균</Text>은 전체 라운딩 평균이에요.{'\n'}
                <Text style={{ fontFamily: F.sysSb, color: C.charcoal }}>핸디</Text>는 가장 잘 친 5개의 평균이에요 <Text style={{ color: C.warmGrayLight }}>(기록 6개부터)</Text>
              </Text>
            </View>

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
