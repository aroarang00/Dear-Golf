import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { C } from '../../constants/colors';

// 크로스플랫폼 로딩 스피너 — 양쪽 동일한 'iOS풍 방사형 막대 12개'를 회전(2026-06-04).
//   ★JS 타이머로 회전(setState→transform:rotate). 네이티브 애니메이션(ActivityIndicator·Animated 네이티브 드라이버)은
//     안드 개발자옵션 '애니메이터 배율=끄기'·접근성 '애니메이션 제거'에서 멈춰버려 스피너가 안 도는 것처럼 보임.
//     JS 타이머 재렌더는 애니메이션 시스템을 안 거치므로 기기 설정과 무관하게 항상 돈다(2026-07-20).
//   막대 간격(30°)만큼 매 틱 회전 → 가장 진한 막대가 한 칸씩 이동하는 클래식 스피너 룩. size·color만 받음.
const BARS = 12;
const STEP = 360 / BARS;

export function Spinner({ size = 28, color = C.paleSky, style }) {
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDeg(d => (d + STEP) % 360), 80); // 12스텝 × 80ms ≈ 960ms/회전
    return () => clearInterval(id);
  }, []);

  const barW = Math.max(2, Math.round(size * 0.09));
  const barH = Math.round(size * 0.28);
  const barRadius = barW / 2;

  return (
    <View style={[{ width: size, height: size, transform: [{ rotate: `${deg}deg` }] }, style]}>
      {Array.from({ length: BARS }).map((_, i) => (
        // 각 막대를 size×size 래퍼에 담아 통째로 회전 → 컨테이너 중심을 축으로 방사형 배치.
        <View
          key={i}
          style={{
            position: 'absolute', width: size, height: size, alignItems: 'center',
            transform: [{ rotate: `${STEP * i}deg` }],
          }}>
          <View style={{ width: barW, height: barH, borderRadius: barRadius, backgroundColor: color, opacity: (i + 1) / BARS }} />
        </View>
      ))}
    </View>
  );
}
