import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C, F } from '../constants/colors';

// 골프 여권 도장 — 커스텀 SVG(이모지 금지). ([[golf-passport]], 2026-09-29)
//  배열은 스타벅스(반듯한 격자), 도장 하나는 여권(잉크 링 두 겹 + 점선 안쪽 링 + 살짝 어긋난 번짐 + ±3° 기울기).
//  ★글자 크기는 고정 px(allowFontScaling=false) — 도장은 크기가 정해진 '그림'이라 폰 글자 확대를 따르면 원 밖으로 넘친다.
//  ★기울기는 이름 해시로 결정 — 같은 구장은 언제 봐도 같은 각도(랜덤이면 스크롤마다 흔들려 보임).

const tiltOf = (seed) => {
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 7) - 3;   // -3 … 3
};
const shortDate = (d) => (d ? String(d).slice(2) : '');   // 2026.07.26 → 26.07.26

export const PassportStamp = React.memo(function PassportStamp({
  size = 80, ink = C.navy, name = '', date = null, count = 0, rank = null, manual = false, best = null, onLight = true,
}) {
  const r = size / 2;
  const big = size >= 72;
  const tilt = tiltOf(`${name}|${rank ?? ''}`);
  const topLabel = rank != null ? `No.${rank}` : 'DEAR GOLF';
  const bottom = date ? shortDate(date) : (manual ? '직접 체크' : '');
  // 잉크색 텍스트는 밝은 바탕용. 어두운 카드(요약 카드) 위에선 onLight=false로 잉크 자체를 밝게 넘겨 쓴다.
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${tilt}deg` }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
        {/* 잉크 번짐 — 살짝 어긋난 연한 링(찍힌 느낌) */}
        <Circle cx={r + 0.9} cy={r + 0.7} r={r - 2.4} stroke={ink} strokeWidth={2.2} fill="none" opacity={0.26} />
        <Circle cx={r} cy={r} r={r - 2.4} stroke={ink} strokeWidth={2.2} fill="none" opacity={0.92} />
        <Circle cx={r} cy={r} r={r - 6.8} stroke={ink} strokeWidth={0.9} fill="none" opacity={0.7} strokeDasharray="2.4 2.2" />
        <Circle cx={r} cy={r} r={r - 6.8} fill={ink} opacity={onLight ? 0.06 : 0.12} />
        {/* 좌우 점 — 출입국 도장의 구분점 */}
        <Circle cx={8} cy={r} r={1.4} fill={ink} opacity={0.85} />
        <Circle cx={size - 8} cy={r} r={1.4} fill={ink} opacity={0.85} />
      </Svg>
      <View style={{ width: size - 18, alignItems: 'center', justifyContent: 'center' }}>
        <Text allowFontScaling={false} numberOfLines={1}
          style={{ fontFamily: F.en, fontSize: big ? 7.5 : 6.5, letterSpacing: 0.6, color: ink, opacity: 0.85, includeFontPadding: false }}>
          {topLabel}
        </Text>
        <Text allowFontScaling={false} numberOfLines={2}
          style={{ fontFamily: F.sysB, fontSize: big ? 11.5 : 9.5, lineHeight: big ? 14 : 11.5, color: ink, textAlign: 'center',
            marginTop: big ? 3 : 2, includeFontPadding: false }}>
          {name}
        </Text>
        {!!bottom && (
          <Text allowFontScaling={false} numberOfLines={1}
            style={{ fontFamily: F.en, fontSize: big ? 8.5 : 7, color: ink, opacity: 0.9, marginTop: big ? 3 : 2, includeFontPadding: false }}>
            {bottom}
          </Text>
        )}
        {big && best != null && (
          <Text allowFontScaling={false} numberOfLines={1}
            style={{ fontFamily: F.sys, fontSize: 7.5, color: ink, opacity: 0.75, marginTop: 1, includeFontPadding: false }}>
            베스트 {best}
          </Text>
        )}
      </View>
      {/* 방문 횟수 — 2회 이상만, 우상단 작은 원 */}
      {count > 1 && (
        <View style={{ position: 'absolute', top: 1, right: 1, minWidth: 17, height: 17, borderRadius: 8.5, paddingHorizontal: 4,
          backgroundColor: ink, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: onLight ? C.bgPrimary : C.navy }}>
          <Text allowFontScaling={false} style={{ fontFamily: F.sysB, fontSize: 9, color: '#fff', includeFontPadding: false }}>{count}</Text>
        </View>
      )}
    </View>
  );
});

// 빈 칸 — 아직 안 밟은 100대 구장. 점선 원 + 순위. 눌러서 '다녀왔어요' 체크 가능(호출부).
export const EmptyStamp = React.memo(function EmptyStamp({ size = 60, rank = null, label = '' }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.2, borderStyle: 'dashed', borderColor: C.warmGrayLight,
      alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.35)' }}>
      {rank != null && (
        <Text allowFontScaling={false} style={{ fontFamily: F.en, fontSize: 9.5, color: C.warmGrayLight, includeFontPadding: false }}>{rank}</Text>
      )}
      {!!label && (
        <Text allowFontScaling={false} numberOfLines={2}
          style={{ fontFamily: F.sys, fontSize: 8.5, lineHeight: 10.5, color: C.warmGrayLight, textAlign: 'center', marginTop: 2, paddingHorizontal: 6, includeFontPadding: false }}>
          {label}
        </Text>
      )}
    </View>
  );
});
