import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, fs } from '../constants/colors';
import { dS } from '../styles/dS';
import { formatNameList } from '../utils/nameList';

// 명예의 전당 카드 배경색 — 성취 타입별 (공유 미리보기 헤더에서도 재사용)
export function hofBgColor(type) {
  return type === 'HOLE IN ONE' ? '#2A2622'
    : type === 'ALBATROSS' ? '#4A1620'
    : type === '퍼스트 싱글' ? '#1A3D52'
    : type === '라이프 베스트' ? '#2A5A3A'
    : '#3E3220';
}

// 입체감용 그라데이션 (상단 약간 밝게 → 하단 어둡게, 대각선). hofBgColor와 톤 맞춤.
export function hofGradient(type) {
  return type === 'HOLE IN ONE' ? ['#3B342D', '#221E1A']
    : type === 'ALBATROSS' ? ['#5C1C28', '#380F18']
    : type === '퍼스트 싱글' ? ['#244F68', '#142E3E']
    : type === '라이프 베스트' ? ['#347044', '#1E4327']
    : ['#4E4029', '#2D2416'];
}

export function HallOfFameCard({ item, onShare }) {
  const isFirstSingle = item.type === '퍼스트 싱글';
  const isLifeBest = item.type === '라이프 베스트';
  const isRound = isFirstSingle || isLifeBest; // 라운드 단위 성취 — 홀 정보 없음
  const accentColor = isLifeBest ? '#A8D4B4' : '#B8985C';  // 차분한 앤틱 골드 (쨍한 #C9A84C → 고급감)
  // 카드 타입 표기 — 홀인원·이글·알바와 통일되게 영문으로
  const typeLabel = isFirstSingle ? 'FIRST SINGLE' : isLifeBest ? 'LIFE BEST' : item.type;

  return (
    <LinearGradient colors={hofGradient(item.type)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[dS.hofCard, { backgroundColor: 'transparent' }]}>
      {/* 상단 하이라이트 라인 — 광택감 */}
      <View style={{ height: 1, backgroundColor: accentColor + '66' }} />
      <View style={dS.hofHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[dS.hofType, { color: accentColor, fontSize: fs(22), letterSpacing: 6,
            textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }]}>{typeLabel}</Text>
          <Text style={[dS.hofDate, { color: 'rgba(255,255,255,0.78)', fontSize: fs(11) }]}>{item.date} · {item.course}</Text>
        </View>
        {onShare && (
          <TouchableOpacity onPress={onShare} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 10,
              borderWidth: 1, borderColor: accentColor + '66', borderRadius: 12,
              paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: fs(11) }}>↗</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: accentColor }}>공유</Text>
          </TouchableOpacity>
        )}
        {/* 공유 이미지(onShare 없음)일 때만 카드 안에 Dear Golf 브랜드 마크 — 카드 배경 위라 항상 또렷, 투명배경 영향 X.
            헤더가 alignItems:center라 그냥 두면 2줄 블록 중앙으로 처져 보임 → typeLabel 첫 줄에 맞춰 상단 정렬. */}
        {!onShare && (
          <Text style={{ fontFamily: F.brand, fontSize: fs(13), color: accentColor, marginRight: 10, alignSelf: 'flex-start', marginTop: 5 }}>Dear Golf</Text>
        )}
        <View style={[dS.hofGoldDot, { backgroundColor: accentColor }, !onShare && { alignSelf: 'flex-start', marginTop: 6 }]} />
      </View>
      <View style={dS.hofGrid}>
        {(isRound
          ? [
              { label: 'SCORE', value: `${item.score}타`, big: true },
              { label: 'WITH', value: formatNameList(item.companions, { sep: ', ' }) || '나 홀로 라운딩' },
            ]
          : [
              { label: 'HOLE', value: `${item.hole}번홀`, big: true },
              { label: 'PAR · DIST', value: `파${item.par} · ${item.distance}` },
              { label: 'BALL', value: item.ball },
              { label: 'WITH', value: formatNameList(item.companions, { sep: ', ' }) || '나 홀로 라운딩' },
            ]
        ).map((cell, i) => (
          // 셀 양각 — 상단·좌측 밝게(광택), 우측·하단 어둡게(그림자)로 입체감
          <View key={i} style={[dS.hofCell, { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.2)', borderLeftColor: 'rgba(255,255,255,0.09)',
            borderRightColor: 'rgba(0,0,0,0.16)', borderBottomColor: 'rgba(0,0,0,0.2)' }]}>
            <Text style={[dS.hofCellLabel, { color: accentColor + 'AA' }]}>{cell.label}</Text>
            {cell.big
              ? <Text style={[dS.hofCellBig, { color: accentColor }]}>{cell.value}</Text>
              : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[dS.hofCellVal, { color: 'rgba(255,255,255,0.9)' }]}>{cell.value}</Text>
            }
          </View>
        ))}
      </View>
      <View style={[dS.hofDivider, { backgroundColor: accentColor + '22' }]} />
      <Text style={[dS.hofMemo, { color: 'rgba(255,255,255,0.65)' }]}>"{item.memo}"</Text>
      <View style={{ height: 1, backgroundColor: accentColor + '44' }} />
    </LinearGradient>
  );
}
