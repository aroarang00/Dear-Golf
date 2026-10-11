import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { buildRecap, recapTitle } from '../utils/recap';

// 결산 입구 띠 — 기록 탭 피드 상단·홈 '최근 기록' 위 공용([[record-share-redesign]]).
//  ★2026-10-11 색 교체(사용자 "컬러 좀 바꾸자") — 다크 차콜+골드 테두리 → 결산 카드와 같은 웜 화이트 종이에 네이비 제목·골드 액션.
//   한 줄 요약(라운딩 n회 · 평균 n타)을 같이 보여 '왜 눌러야 하는지'가 보이게. 숫자는 buildRecap 하나에서(카드와 같은 값).
const GOLD_DEEP = '#A9854A';

export function RecapBanner({ diaries, period, onPress, style }) {
  const recap = useMemo(() => (period ? buildRecap(diaries, period) : null), [diaries, period]);
  if (!period || !recap || recap.count === 0) return null;
  const avg = recap.avg == null ? null : (Number.isInteger(recap.avg) ? recap.avg : recap.avg.toFixed(1));
  const summary = `라운딩 ${recap.count}회${avg != null ? ` · 평균 ${avg}타` : ''}${recap.best ? ` · 베스트 ${recap.best.score}` : ''}`;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFDF8', borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(201,168,76,0.45)', paddingVertical: 13, paddingHorizontal: 15 }, style]}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chart" size={fs(18)} color={GOLD_DEEP} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.navy }}>{recapTitle(period)}</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: 'rgba(42,38,34,0.62)', marginTop: 2 }}>{summary}</Text>
      </View>
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: GOLD_DEEP }}>카드 보기 ›</Text>
    </TouchableOpacity>
  );
}
