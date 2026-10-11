import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { buildRecap, recapTitle } from '../utils/recap';

// 결산 입구 띠 — 기록 탭 피드 상단·홈 '최근 기록' 위 공용([[record-share-redesign]]).
//  ★2026-10-11 색 교체(사용자 "컬러 좀 바꾸자") — 다크 차콜+골드 테두리 → 결산 카드와 같은 웜 화이트 종이에 네이비 제목·골드 액션.
//   한 줄 요약(라운딩 n회 · 평균 n타)을 같이 보여 '왜 눌러야 하는지'가 보이게. 숫자는 buildRecap 하나에서(카드와 같은 값).
//  ★2026-10-11 테두리 제거 + 입체감(사용자, 홈·MY 공통) — 골드 헤어라인 대신 떠 있는 그림자 + 종이 그라데이션(위 밝고 아래 살짝 따뜻).
//   안드 elevation은 배경이 불투명해야 네모 박스가 안 생김([[rn-platform-gotchas]]) — 바깥 View에 배경색을 두고 그 안에 그라데이션.
const GOLD_DEEP = '#A9854A';

export function RecapBanner({ diaries, period, onPress, style }) {
  const recap = useMemo(() => (period ? buildRecap(diaries, period) : null), [diaries, period]);
  if (!period || !recap || recap.count === 0) return null;
  const avg = recap.avg == null ? null : (Number.isInteger(recap.avg) ? recap.avg : recap.avg.toFixed(1));
  const summary = `라운딩 ${recap.count}회${avg != null ? ` · 평균 ${avg}타` : ''}${recap.best ? ` · 베스트 ${recap.best.score}` : ''}`;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[{ borderRadius: 16, backgroundColor: '#FFFDF8',
        shadowColor: '#2A2622', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 6 }, style]}>
      <LinearGradient colors={['#FFFEFB', '#F6F0E3']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
        style={{ borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(201,168,76,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chart" size={fs(18)} color={GOLD_DEEP} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.navy }}>{recapTitle(period)}</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: 'rgba(42,38,34,0.62)', marginTop: 2 }}>{summary}</Text>
        </View>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: GOLD_DEEP }}>카드 보기 ›</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}
