import React from 'react';
import { View, Text } from 'react-native';
import { SurfaceLight, PressScale } from './common/Surface';
import { Icon } from './common/Icon';
import { PassportStamp, EmptyStamp } from './PassportStamp';
import { C, F, fs } from '../constants/colors';

// 골프 여권 진입 배너(MY 탭, 내 스코어 배너 바로 아래) — 같은 남색 카드 언어([[golf-passport]] 3단계, 2026-09-29)
//   한 줄: '골프 여권' + 도장 n · 100대 m/100 + 최근 도장 2개 미니. 탭 → 코스 탭 여권.
//   숫자는 usePassportCounts(호출부)에서. 도장 0이면 빈 도장 + "첫 도장을 찍어보세요".
export function PassportBanner({ stampCount = 0, top100Count = 0, recent = [], onPress, style }) {
  const minis = (recent || []).slice(0, 2);
  return (
    <PressScale style={[{ marginHorizontal: 16 }, style]} shadow={{ radius: 12, bg: C.navy }} contentStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
      onPress={onPress}>
      <SurfaceLight radius={12} tone="dark" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="idCard" size={fs(15)} color={C.butter} strokeWidth={1.9} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>골프 여권</Text>
          </View>
          {stampCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(22), color: C.butter, includeFontPadding: false }}>{stampCount}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.7)' }}>도장</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(22), color: '#fff', includeFontPadding: false }}>{top100Count}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.7)' }}>/ 100대</Text>
              </View>
            </View>
          ) : (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.75)', marginTop: 5 }}>
              라운딩을 기록하면 구장마다 도장이 찍혀요
            </Text>
          )}
        </View>
        {/* 최근 도장 2개 — 카드 안 미리보기. 없으면 빈 도장 하나. */}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {minis.length
            ? minis.map(s => <PassportStamp key={s.key} size={50} ink={C.butter} name={s.name} count={0} onLight={false} />)   /* 남색 위라 버터 잉크(지역색은 밝은 바탕용) */
            : <EmptyStamp size={50} label="첫 도장" />}
        </View>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: 'rgba(255,255,255,0.6)' }}>›</Text>
      </View>
    </PressScale>
  );
}
