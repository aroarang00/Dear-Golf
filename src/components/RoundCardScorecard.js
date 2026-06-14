import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { getCountryFlag } from '../constants/data';

// 라운딩 자랑 카드 — '홀별 스코어카드' 스타일. OCR로 입력된 18홀 holeScores를 표로.
//  ★3색 구분(사용자 지시): 매거진(다크 사진)·폴라로이드(흰)와 다른 '딥그린' 배경. 골프장 그린 톤(라운지 네이비 회피 [[navy-lounge-color]]).
//  언더/버디 홀만 골드 강조(못친 홀 깎지 않음 [[golfer-score-psychology]]). holeScores 없으면 총타수 폴백.
//  ※ 18홀 표 텍스트는 fs() 최소12 클램프 피해 고정 px(캡처 이미지라 폰트스케일 무관).

const GREEN_TOP = '#22352A';
const GREEN_BOT = '#15211A';
const GOLD = '#E8D9A0';
const WHITE = '#F0EDE3';
const MUTE = 'rgba(240,237,227,0.55)';
const LINE = 'rgba(201,168,76,0.28)';

export function RoundCardScorecard({ item, width = 320 }) {
  const height = Math.round(width * 1.25);
  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();
  const hasScore = typeof item.score === 'number';

  const scores = Array.isArray(item.holeScores) && item.holeScores.length === 18 ? item.holeScores : null;
  const pars = Array.isArray(item.holePars) && item.holePars.length === 18 ? item.holePars : null;
  const parOf = (i) => (pars ? pars[i] : null);
  const sum = (arr, a, b) => arr.slice(a, b).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
  const totalScore = hasScore ? item.score : (scores ? sum(scores, 0, 18) : null);

  const Row = ({ label, from, to }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
      <Text style={{ width: 38, fontFamily: F.sysB, fontSize: 8, color: MUTE, letterSpacing: 1 }}>{label}</Text>
      {Array.from({ length: to - from }).map((_, k) => {
        const i = from + k;
        const isScore = label === 'SCORE';
        const under = isScore && scores && typeof parOf(i) === 'number' && typeof scores[i] === 'number' && scores[i] < parOf(i);
        return (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F.en, fontSize: 12,
            color: label === 'HOLE' ? WHITE : isScore ? (under ? GOLD : WHITE) : MUTE,
            textDecorationLine: under ? 'underline' : 'none', textDecorationColor: GOLD }}>
            {label === 'HOLE' ? (i + 1) : label === 'PAR' ? (parOf(i) ?? '·') : (scores ? (scores[i] ?? '·') : '·')}
          </Text>
        );
      })}
      <Text style={{ width: 32, textAlign: 'right', fontFamily: F.en, fontSize: 12, color: label === 'SCORE' ? GOLD : MUTE }}>
        {label === 'HOLE' ? (from === 0 ? 'OUT' : 'IN') : label === 'PAR' ? (pars ? sum(pars, from, to) : '·') : (scores ? sum(scores, from, to) : '·')}
      </Text>
    </View>
  );

  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden' }}>
      <LinearGradient colors={[GREEN_TOP, GREEN_BOT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18, justifyContent: 'space-between' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: LINE }} />

        {/* 상단 블록 — 헤더(구장·날짜·이름) + 총타수(표 위 강조) + 18홀 표. 표 아래가 너무 남던 것 → 토탈을 표 위로 + space-between 분산 */}
        <View>
          <View>
            <Text style={{ fontFamily: F.en, fontSize: fs(11), color: GOLD, letterSpacing: 3 }}>SCORECARD</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(18), color: WHITE, marginTop: 6 }}>{flag ? flag + ' ' : ''}{item.course || '라운딩'}</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(12), color: GOLD, marginTop: 3 }}>{playerName ? playerName + '   ·   ' : ''}{item.date}</Text>
          </View>

          {/* 총타수 — 표 위 중앙 강조(날씨 제거). 사용자 2026-06-14 */}
          {totalScore != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: 16, marginBottom: 2 }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(44), lineHeight: fs(46), color: GOLD }}>{totalScore}</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: GOLD, letterSpacing: 2, marginLeft: 6, marginBottom: 7 }}>TOTAL</Text>
            </View>
          ) : null}

          <View style={{ height: 1, backgroundColor: LINE, marginVertical: 12 }} />

          {/* 18홀 표 — OUT(1-9) / IN(10-18). 버디·이글(언더)은 골드 + 밑줄 */}
          {scores ? (
            <View>
              <Row label="HOLE" from={0} to={9} />
              <Row label="PAR" from={0} to={9} />
              <Row label="SCORE" from={0} to={9} />
              <View style={{ height: 1, backgroundColor: LINE, marginVertical: 7 }} />
              <Row label="HOLE" from={9} to={18} />
              <Row label="PAR" from={9} to={18} />
              <Row label="SCORE" from={9} to={18} />
            </View>
          ) : (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: MUTE, textAlign: 'center', lineHeight: 20 }}>
                홀별 스코어가 없어요{'\n'}스코어카드를 입력하면 표로 보여드려요
              </Text>
            </View>
          )}
        </View>

        {/* 푸터 — Dear Golf만(날씨 제거) */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.brand, fontSize: fs(14), color: WHITE }}>Dear Golf</Text>
        </View>
      </LinearGradient>
    </View>
  );
}
