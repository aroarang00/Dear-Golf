import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';
import { getCountryFlag } from '../constants/data';

// 라운딩 자랑 카드 — '모던 화이트(갤러리)'. 인스타 피드 퀄리티 목표(2026-06-14 정밀 교정):
//  A 사진 마운팅(안쪽 헤어라인 + 상/하 미세 음영 = 깊이) · B 편집형 캡션(영문 트래킹 날짜 라벨 → 구장 히어로
//  → 골드 룰 → 멘트, 타수는 SCORE 스탯으로 우상단) · C 흰 바탕 웜 그라데이션(평면 회피·종이 온기).
//  4종 중 유일한 밝은 카드(다크 매거진·딥그린 스코어·다크 기념과 대비).

const INK = '#2A2622';                  // 차콜 — 멘트
const NAVY = '#1A3D52';                 // 구장명 — 네이비(사용자 지시. 원래 라운지색 [[navy-lounge-color]])
const GOLD = '#C9A84C';                 // 골드 — 타수·룰
const GOLD_DEEP = '#A9854A';            // 깊은 골드 — SCORE 라벨
// 브랜드 삼색 미니바(랜딩·초대카드와 동일 톤) — 하단 시그니처
const MS_YELLOW = '#ECD884';
const MS_SKY = '#B2CADD';
const MS_BURGUNDY = '#6B1E2A';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// "2026.06.14" → "JUN 14, 2026"(편집형 날짜 라벨). 파싱 실패 시 원본 유지.
function fmtDate(d) {
  const p = (d || '').split(/[.\-/]/).map(s => s.trim()).filter(Boolean);
  if (p.length >= 3) {
    const mo = parseInt(p[1], 10), da = parseInt(p[2], 10);
    if (MONTHS[mo - 1] && da) return `${MONTHS[mo - 1]} ${da}, ${p[0]}`;
  }
  return d || '';
}

export function RoundCardPolaroid({ item, width = 320 }) {
  const height = Math.round(width * 1.25);

  const photoRaw = (item.photos && item.photos[0]) || null;
  const photoUri = photoRaw ? resolvePhotoUri(typeof photoRaw === 'object' ? photoRaw.uri : photoRaw) : null;

  const hasScore = typeof item.score === 'number';
  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const memo = (item.memo || '').trim();
  const special = item.special || null; // 홀인원·이글 등 — 사진 좌상단 작은 버건디 배지
  const dateLabel = fmtDate(item.date);

  const FRAME = Math.round(width * 0.055);
  const photoH = Math.round(height * 0.56);  // 편집형 캡션(날짜라벨·룰·멘트3줄) 공간 확보 위해 0.62→0.56

  return (
    <View style={{ width, height, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
      {/* C — 흰 바탕 웜 그라데이션(평면 #FCFAF5 대신 종이 온기) */}
      <LinearGradient colors={['#FFFDF8', '#F2EBDC']} start={{ x: 0.35, y: 0 }} end={{ x: 0.65, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      <View style={{ padding: FRAME }}>
        {/* A — 사진 마운팅: 안쪽 헤어라인 + 상/하 미세 음영(깊이·갤러리 프린트 느낌) */}
        <View style={{ width: '100%', height: photoH, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E7E0D2', borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' }}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={false} />
          ) : (
            <LinearGradient colors={['#EFEADD', '#E0D8C5']} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.brand, fontSize: fs(22), color: 'rgba(42,38,34,0.35)' }}>Dear Golf</Text>
            </LinearGradient>
          )}
          {/* 상단 음영 — Dear Golf·special 배지 가독용(맨 위에만 살짝, 사진 많이 안 가리게). 사용자 2026-06-14 */}
          <LinearGradient colors={['rgba(0,0,0,0.34)', 'transparent']} pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.round(photoH * 0.14) }} />
          {/* 하단 미세 음영 — 마운트 깊이 */}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.13)']} pointerEvents="none"
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.round(photoH * 0.16) }} />
          {photoUri ? (
            <Text style={{ position: 'absolute', top: 8, right: 10, fontFamily: F.brand, fontSize: fs(14), color: '#fff',
              textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 }}>Dear Golf</Text>
          ) : null}
          {/* 특별한 순간 — 사진 좌상단 작은 배지. 기존 스타일(투명+골드 테두리·골드 글씨), 사진 위 가독 위해 반투명 바탕+그림자(사용자 2026-06-14) */}
          {special ? (
            <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: INK, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3.5 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#F5E6A8', letterSpacing: 1 }}>{special}</Text>
            </View>
          ) : null}
        </View>

        {/* B — 편집형 캡션: SCORE 스탯(우상단) / 날짜 라벨 → 구장 히어로 → 골드 룰 → 멘트 */}
        <View style={{ paddingTop: 12, paddingHorizontal: 2 }}>
          {hasScore ? (
            <View style={{ position: 'absolute', top: 11, right: 2, alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(9), letterSpacing: 3, color: GOLD_DEEP }}>SCORE</Text>
              <Text style={{ fontFamily: F.en, fontSize: fs(38), lineHeight: fs(40), color: GOLD, marginTop: 1 }}>{item.score}</Text>
            </View>
          ) : null}
          {dateLabel ? (
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12), letterSpacing: 1, color: 'rgba(42,38,34,0.8)' }}>{dateLabel}</Text>
          ) : null}
          <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(20), color: NAVY, letterSpacing: 0.2, marginTop: 4, paddingRight: hasScore ? 56 : 0 }}>
            {flag ? flag + ' ' : ''}{item.course || '라운딩'}
          </Text>
          <View style={{ height: 1.5, width: 26, backgroundColor: GOLD, marginTop: 9, marginBottom: 9 }} />
          {/* 멘트 — 행잉 인용: 여는 따옴표를 왼쪽에 걸고 본문은 그 뒤로 정렬 → 둘째 줄이 첫 줄 본문과 맞게 살짝 밀림. 행간 fs20 */}
          {memo ? (
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: INK, lineHeight: fs(20) }}>"</Text>
              <Text numberOfLines={3} style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: INK, lineHeight: fs(20) }}>{memo}"</Text>
            </View>
          ) : null}
        </View>
      </View>
      {/* 브랜드 삼색 미니바 — 하단 시그니처. 사진 폭만큼(좌우 FRAME) 꽉 채워 배치(사용자 2026-06-14) */}
      <View style={{ position: 'absolute', bottom: FRAME, left: FRAME, right: FRAME, flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden' }}>
        <View style={{ flex: 1, backgroundColor: MS_YELLOW }} />
        <View style={{ flex: 1, backgroundColor: MS_SKY }} />
        <View style={{ flex: 1, backgroundColor: MS_BURGUNDY }} />
      </View>
    </View>
  );
}
