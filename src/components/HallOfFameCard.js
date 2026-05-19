import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../constants/colors';
import { dS } from '../styles/dS';

export function HallOfFameCard({ item, onShare }) {
  const isHIO = item.type === 'HOLE IN ONE';
  const isAlba = item.type === 'ALBATROSS';
  const isFirstSingle = item.type === '퍼스트 싱글';
  const isLifeBest = item.type === '라이프 베스트';
  const isRound = isFirstSingle || isLifeBest; // 라운드 단위 성취 — 홀 정보 없음
  const bgColor = isHIO ? '#2A2622' : isAlba ? C.burgundy : isFirstSingle ? '#1A3D52' : isLifeBest ? '#2A5A3A' : '#6B6660';
  const accentColor = isLifeBest ? '#A8D4B4' : '#C9A84C';
  // 카드 타입 표기 — 홀인원·이글·알바와 통일되게 영문으로
  const typeLabel = isFirstSingle ? 'FIRST SINGLE' : isLifeBest ? 'LIFE BEST' : item.type;

  return (
    <View style={[dS.hofCard, { backgroundColor: bgColor }]}>
      <View style={{ height: 1, backgroundColor: accentColor + '44' }} />
      <View style={dS.hofHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[dS.hofType, { color: accentColor, fontSize: 22, letterSpacing: 6 }]}>{typeLabel}</Text>
          <Text style={[dS.hofDate, { color: 'rgba(255,255,255,0.4)' }]}>{item.date} · {item.course}</Text>
        </View>
        {onShare && (
          <TouchableOpacity onPress={onShare} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 10,
              borderWidth: 1, borderColor: accentColor + '66', borderRadius: 12,
              paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ fontSize: 11 }}>↗</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: accentColor, fontWeight: '700' }}>공유</Text>
          </TouchableOpacity>
        )}
        <View style={[dS.hofGoldDot, { backgroundColor: accentColor }]} />
      </View>
      <View style={dS.hofGrid}>
        {(isRound
          ? [
              { label: 'SCORE', value: `${item.score}타`, big: true },
              { label: 'WITH', value: (item.companions || []).join(', ') || '나 홀로 라운딩' },
            ]
          : [
              { label: 'HOLE', value: `${item.hole}번홀`, big: true },
              { label: 'PAR · DIST', value: `파${item.par} · ${item.distance}` },
              { label: 'BALL', value: item.ball },
              { label: 'WITH', value: (item.companions || []).join(', ') },
            ]
        ).map((cell, i) => (
          <View key={i} style={[dS.hofCell, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: accentColor + '22' }]}>
            <Text style={[dS.hofCellLabel, { color: accentColor + 'AA' }]}>{cell.label}</Text>
            {cell.big
              ? <Text style={[dS.hofCellBig, { color: accentColor }]}>{cell.value}</Text>
              : <Text style={[dS.hofCellVal, { color: 'rgba(255,255,255,0.85)' }]}>{cell.value}</Text>
            }
          </View>
        ))}
      </View>
      <View style={[dS.hofDivider, { backgroundColor: accentColor + '22' }]} />
      <Text style={[dS.hofMemo, { color: 'rgba(255,255,255,0.65)' }]}>"{item.memo}"</Text>
      <View style={{ height: 1, backgroundColor: accentColor + '44' }} />
    </View>
  );
}
