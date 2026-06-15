import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { getCountryFlag } from '../constants/data';

// 라운딩 자랑 카드 — '홀별 스코어카드' 스타일. OCR로 입력된 18홀 holeScores를 표로.
//  ★3색 구분(사용자 지시): 매거진(다크 사진)·폴라로이드(흰)와 다른 '딥그린' 배경. 골프장 그린 톤(라운지 네이비 회피 [[navy-lounge-color]]).
//  언더(버디·이글)=원 강조, 보기=숫자 하단 짧은 밑줄(더블+는 표시 없음). 못친 홀 깎는 톤 X [[golfer-score-psychology]]. holeScores 없으면 총타수 폴백.
//  ※ 18홀 표 텍스트는 fs() 최소12 클램프 피해 고정 px(캡처 이미지라 폰트스케일 무관).
//  ※ 표 숫자 폰트 = F.sysB(Pretendard Bold) — Playfair는 작은 그리드에서 가독성 떨어져 전환, SemiBold는 약해 Bold로(사용자 2026-06-15). 큰 TOTAL은 F.en 유지.

const GREEN_TOP = '#33513E'; // 그라데이션 강하게(사용자 2026-06-14) — 위 더 밝은 그린
const GREEN_BOT = '#0D1510'; // 아래 더 어둡게 — 대비 ↑
const GOLD = '#E8D9A0';
const WHITE = '#F0EDE3';
const BURGUNDY = '#6B1E2A'; // 특별한 순간(홀인원·이글 등) 채움 알약 — 딥그린 배경 위에 버건디+크림 글자로 도드라짐 ([[score-brag-card]])
const CREAM = '#F5E6A8';
const MUTE = 'rgba(240,237,227,0.55)';
const LINE = 'rgba(201,168,76,0.28)';
const UNDERLINE = 'rgba(240,237,227,0.75)'; // 보기 — 숫자 하단 짧은 밑줄(흐림은 안 보여 밑줄로 되돌림, 사용자 2026-06-15). 더블+는 표시 없음. 중립 화이트 [[golfer-score-psychology]]

export function RoundCardScorecard({ item, width = 320 }) {
  const height = Math.round(width * 1.25);
  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();
  const hasScore = typeof item.score === 'number';
  const special = item.special || null; // 홀인원·이글 등 — 총타수 옆 버건디 알약

  const scores = Array.isArray(item.holeScores) && item.holeScores.length === 18 ? item.holeScores : null;
  const pars = Array.isArray(item.holePars) && item.holePars.length === 18 ? item.holePars : null;
  const parOf = (i) => (pars ? pars[i] : null);
  const sum = (arr, a, b) => arr.slice(a, b).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
  const totalScore = hasScore ? item.score : (scores ? sum(scores, 0, 18) : null);
  // 영예 표시 — 싱글(≤79)·베스트. special(홀인원·이글)과 별개로 함께 노출 가능 ([[score-brag-card]] [[golfer-score-psychology]])
  const isSingle = typeof totalScore === 'number' && totalScore <= 79;
  const isBest = item.badge === '베스트';
  const honor = isBest ? 'BEST' : isSingle ? 'SINGLE' : null;

  // 홀별 결과 등급 — 실제 타수는 그대로 두고 골프식 표기(언더=원 강조, 빨강 없이 중립 [[golfer-score-psychology]]).
  //   par=연골드 빈 원 / 버디(−1)=버건디 원 / 이글(−2)=골드 원 / 홀인원(1타)·알바트로스(−3↓)=골드 과녁(겹원, 딥그린에 버건디·흰 링 약해 전환, 사용자 2026-06-15).
  //   보기(+1)=숫자 하단 짧은 밑줄 / 더블보기 이상(+2↑)=표시 없음(흐림은 안 보여 밑줄로 되돌림, 사용자 2026-06-15).
  //   par 미인식 홀은 등급 판정 불가 → 평범 숫자(홀인원만 1타로 판정 가능).
  const scoreTier = (i) => {
    const v = scores ? scores[i] : null;
    if (typeof v !== 'number') return 'none';
    const p = parOf(i);
    const d = (typeof p === 'number') ? v - p : null;
    if (v === 1 || (d != null && d <= -3)) return 'ace';   // 홀인원·알바트로스
    if (d === -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0) return 'par';
    if (d === 1) return 'bogey';                            // 보기 — 짧은 밑줄
    if (d != null && d >= 2) return 'dbogey';               // 더블보기+ — 표시 없음(평범 숫자)
    return 'over';                                          // par 미인식 — 평범 숫자
  };

  const Row = ({ label, from, to }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
      <Text style={{ width: 38, fontFamily: F.sysB, fontSize: 8, color: MUTE, letterSpacing: 1 }}>{label}</Text>
      {Array.from({ length: to - from }).map((_, k) => {
        const i = from + k;
        if (label === 'SCORE') {
          const v = scores ? scores[i] : null;
          const t = scoreTier(i);
          const showCircle = t === 'par' || t === 'birdie' || t === 'eagle';
          // 파=연골드 빈 원 / 버디=버건디 채움 / 이글=골드 채움 / 홀인원·알바트로스=골드 과녁(겹원)으로 가장 도드라지게 / 보기=짧은 밑줄 / 더블보기+=표시 없음
          let bg = 'transparent', bw = 0, bc = 'transparent', tc = WHITE;
          if (t === 'birdie') { bg = BURGUNDY; tc = CREAM; }
          else if (t === 'eagle') { bg = GOLD; tc = GREEN_BOT; }
          else if (t === 'par') { bw = 1.2; bc = 'rgba(232,217,160,0.5)'; } // 연골드 빈 원
          return (
            <View key={i} style={{ flex: 1, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              {t === 'ace' ? (
                // 홀인원·알바트로스 — 가장 특별. 골드 '과녁(겹원)' = 바깥 골드 링 + 어두운 간격 + 안쪽 골드 채움.
                //   흰 헤일로는 골드와 둘 다 밝아 약했음 → 겹원 모양으로 딥그린 위에서 확실히 도드라지게(사용자 2026-06-15).
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: GOLD,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: GOLD,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: 9, color: GREEN_BOT }}>{v}</Text>
                  </View>
                </View>
              ) : showCircle ? (
                <View style={{ width: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: bg, borderWidth: bw, borderColor: bc }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: 11, color: tc }}>{v}</Text>
                </View>
              ) : t === 'bogey' ? (
                // 보기 — 숫자 아래 짧은 밑줄(더블+는 표시 없이 평범 숫자)
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: 13, color: WHITE }}>{v}</Text>
                  <View style={{ height: 1.6, width: 4, backgroundColor: UNDERLINE, borderRadius: 1, marginTop: 1 }} />
                </View>
              ) : (
                <Text style={{ fontFamily: F.sysB, fontSize: 13, color: WHITE }}>{typeof v === 'number' ? v : '·'}</Text>
              )}
            </View>
          );
        }
        return (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F.sysB, fontSize: 13, color: label === 'HOLE' ? WHITE : MUTE }}>
            {label === 'HOLE' ? (i + 1) : (parOf(i) ?? '·')}
          </Text>
        );
      })}
      <Text style={{ width: 32, textAlign: 'right', fontFamily: F.sysB, fontSize: 13, color: label === 'SCORE' ? GOLD : MUTE }}>
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
          {/* 헤더 — 좌: SCORECARD·구장·날짜 / 우상단: Dear Golf 워터마크(사용자 2026-06-14) */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(11), color: GOLD, letterSpacing: 3 }}>SCORECARD</Text>
              <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(22), color: WHITE, marginTop: 9 }}>{flag ? flag + ' ' : ''}{item.course || '라운딩'}</Text>
              <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(12), color: GOLD, marginTop: 5 }}>{playerName ? playerName + '   ·   ' : ''}{item.date}</Text>
              {/* 영예칩(싱글 ≤79 / 베스트) — 이름 아래(스코어 옆은 special 전용). 골드 채움+딥그린 글자 메달 느낌 ([[golfer-score-psychology]]) */}
              {honor ? (
                <View style={{ alignSelf: 'flex-start', backgroundColor: GOLD, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3, marginTop: 9 }}>
                  <Text style={{ fontFamily: F.en, fontSize: fs(12), color: GREEN_BOT, letterSpacing: 2 }}>{honor}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontFamily: F.brand, fontSize: fs(14), color: WHITE, marginLeft: 12 }}>Dear Golf</Text>
          </View>

          {/* 총타수 — 표 위 왼쪽 정렬(사용자 2026-06-14). 헤더와 간격 더 늘려 총타수+표를 아래로 내림 → 하단 여백 축소(2026-06-15 사용자, 공유 캡처서 바닥 비어보임).
              ★영예칩(SINGLE·BEST) 있으면 칩 높이만큼 상단이 길어져 18홀 표 바닥이 잘림 → 칩 있을 때 위 여백 축소로 보정(2026-06-15) */}
          {totalScore != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start', marginTop: honor ? 14 : 46, marginBottom: 4 }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(46), lineHeight: fs(48), color: GOLD }}>{totalScore}</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: GOLD, letterSpacing: 2, marginLeft: 6, marginBottom: 7 }}>TOTAL</Text>
              {/* 특별한 순간(홀인원·이글) — 타수 옆 버건디 알약 고정. 싱글/베스트는 헤더 이름 아래로 옮김(스코어 옆 중복 회피, 사용자 2026-06-15) */}
              {special ? (
                <View style={{ backgroundColor: BURGUNDY, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 10, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.en, fontSize: fs(12), color: CREAM, letterSpacing: 2 }}>{special}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ height: 1, backgroundColor: LINE, marginTop: 16, marginBottom: 8 }} />

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
      </LinearGradient>
    </View>
  );
}
