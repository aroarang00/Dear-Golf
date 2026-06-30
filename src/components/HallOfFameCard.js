import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
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
  const accentColor = isLifeBest ? '#9FDDB2' : '#C9A84C';  // 선명한 브랜드 골드/그린 (채도 ↑, 사진급 또렷한 톤)
  // 카드 타입 표기 — 홀인원·이글·알바와 통일되게 영문으로
  const typeLabel = isFirstSingle ? 'FIRST SINGLE' : isLifeBest ? 'LIFE BEST' : item.type;

  return (
    <LinearGradient colors={hofGradient(item.type)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      // 공유 캡처(onShare 없음)일 땐 카드 간격용 marginBottom 제거 — ViewShot이 그 여백까지 담아
      // 저장 이미지 하단에 모달 배경(흰 띠)이 비치던 것 방지
      style={[dS.hofCard, { backgroundColor: 'transparent' }, !onShare && { marginBottom: 0 }]}>
      {/* 배경 깊이 — 평면 색면을 재질감 있게. 좌상단 부드러운 광원(금속 광택) + 우하단 비네팅(명암 깊이)을
          absolute로 깔아 콘텐츠 아래에만 작용(텍스트 가독성·레이아웃 불변). 사진이 아닌 '재질 강화' 방향 ([[score-brag-card]]) */}
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.10)', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 0.66, y: 0.62 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.36)']}
        locations={[0, 0.55, 1]} start={{ x: 0.32, y: 0.36 }} end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {/* 상단 하이라이트 라인 — 광택감 */}
      <View style={{ height: 1, backgroundColor: accentColor + '66' }} />
      <View style={dS.hofHeader}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          {/* 타입 라벨 — 산세리프 Bold라 자간은 2.5로 적당히(과한 letterSpacing은 산세리프서 벌어져 보임). 긴 'HOLE IN ONE'은
              numberOfLines+adjustsFontSizeToFit로 좌측 영역 안에 안전히 맞춰 우측 Dear Golf와 붙지 않게(카드 폭 고정과 함께 폰 무관 일관). */}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
            style={[dS.hofType, { fontFamily: F.sysB, color: accentColor, fontSize: fs(22), letterSpacing: 2.5,
            textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }]}>{typeLabel}</Text>
          <Text numberOfLines={1} style={[dS.hofDate, { color: 'rgba(255,255,255,0.92)', fontSize: fs(11) }]}>{item.date} · {item.course}</Text>
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
        {/* 공유 이미지(onShare 없음)일 때만 Dear Golf 브랜드 마크 — 우상단 코너에 작게(골드점 제거).
            typeLabel 첫 줄에 맞춰 상단 정렬. 글씨를 줄여 좌측 타입 라벨과 여유 확보(붙음 방지, 2026-06-14). */}
        {!onShare && (
          <Text style={{ fontFamily: F.brand, fontSize: fs(11), color: accentColor, alignSelf: 'flex-start', marginTop: 3 }}>Dear Golf</Text>
        )}
        {/* 골드 점 — 앱 내 목록(onShare)에서만 장식. 공유 카드는 Dear Golf만 깔끔히 두려고 제거. */}
        {onShare && <View style={[dS.hofGoldDot, { backgroundColor: accentColor }]} />}
      </View>
      <View style={dS.hofGrid}>
        {(isRound
          ? [
              { label: 'SCORE', value: `${item.score}타`, big: true },
              { label: 'WITH', value: formatNameList(item.companions, { sep: ', ' }) || '나 홀로 라운딩' },
            ]
          : [
              { label: 'HOLE', value: Number.isFinite(item.hole) ? `${item.hole}번홀` : '—', big: true },
              { label: 'PAR · DIST', value: `파${item.par} · ${item.distance}` },
              { label: 'BALL', value: item.ball },
              { label: 'WITH', value: formatNameList(item.companions, { sep: ', ' }) || '나 홀로 라운딩' },
            ]
        ).map((cell, i) => (
          // 셀 양각 — 상단·좌측 밝게(광택), 우측·하단 어둡게(그림자)로 입체감
          <View key={i} style={[dS.hofCell, { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.2)', borderLeftColor: 'rgba(255,255,255,0.09)',
            borderRightColor: 'rgba(0,0,0,0.16)', borderBottomColor: 'rgba(0,0,0,0.2)' }]}>
            <Text style={[dS.hofCellLabel, { color: accentColor + 'CC' }]}>{cell.label}</Text>
            {cell.big
              ? <Text style={[dS.hofCellBig, { color: accentColor }]}>{cell.value}</Text>
              : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[dS.hofCellVal, { color: '#FFFFFF' }]}>{cell.value}</Text>
            }
          </View>
        ))}
      </View>
      <View style={[dS.hofDivider, { backgroundColor: accentColor + '22' }]} />
      <Text style={[dS.hofMemo, { color: 'rgba(255,255,255,0.85)' }]}>"{item.memo}"</Text>
      <View style={{ height: 1, backgroundColor: accentColor + '44' }} />
    </LinearGradient>
  );
}
