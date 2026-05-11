import React from 'react';
import { View, Text } from 'react-native';
import { C } from '../constants/colors';
import { dS } from '../styles/dS';

export function HallOfFameCard({ item }) {
  const isHIO = item.type === 'HOLE IN ONE';
  const isAlba = item.type === 'ALBATROSS';
  const isFirstSingle = item.type === '퍼스트 싱글';
  const isLifeBest = item.type === '라이프 베스트';
  const bgColor = isHIO ? '#2A2622' : isAlba ? C.burgundy : isFirstSingle ? '#4A7A8A' : isLifeBest ? '#2A5A3A' : '#6B6660';
  const accentColor = isFirstSingle ? '#C8D9E6' : isLifeBest ? '#A8D4B4' : '#C9A84C';

  return (
    <View style={[dS.hofCard, { backgroundColor: bgColor }]}>
      <View style={{ height: 1, backgroundColor: accentColor + '44' }} />
      <View style={dS.hofHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[dS.hofType, { color: accentColor, fontSize: 22, letterSpacing: 6 }]}>{item.type}</Text>
          <Text style={[dS.hofDate, { color: 'rgba(255,255,255,0.4)' }]}>{item.date} · {item.course}</Text>
        </View>
        <View style={[dS.hofGoldDot, { backgroundColor: accentColor }]} />
      </View>
      <View style={dS.hofGrid}>
        {[
          { label: 'HOLE', value: `${item.hole}번홀`, big: true },
          { label: 'PAR · DIST', value: `파${item.par} · ${item.distance}` },
          { label: 'BALL', value: item.ball },
          { label: 'WITH', value: item.companions.join(', ') },
        ].map((cell, i) => (
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
