import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Polyline, Circle, Rect } from 'react-native-svg';
import { F, fs } from '../../constants/colors';
import { WeatherGlyph } from './Icon';
import { pcpAmount } from '../../utils/kma';

// 시간별 날씨 그래프 — 기온 꺾은선 + 강수량 막대(네이버 날씨식). 라운딩 컨디션 섹션 전용.
//  · slots: kma toUiSlot 배열 + cond({dots,label}, 골프 컨디션) 주입본 · teeIdx: 티오프 컬럼(-1=없음)
//  · 컬럼 폭은 onLayout 실측을 균등 분할 — SVG 절대좌표와 행 셀이 항상 일치(확대 모드에서도 어긋나지 않음)
const GRAPH_H = 88;   // 그래프(SVG) 높이
const PAD_TOP = 24;   // 기온 라벨 공간
const PAD_BOT = 14;   // 곡선이 바닥(기준선·아래 행)에 붙지 않게 — 붙으면 구분선과 뭉쳐 보임(사용자 2026-07-05)
const BAR_MAX = 54;   // 강수 막대 최대 높이(15mm 이상은 만땅)
const GUTTER = 24;    // 좌측 행 라벨(이모지) 폭

// 풍향(바람이 불어오는 방향) → 부는 방향 화살표. 북풍(북→남)=↓ (네이버 날씨와 동일한 관례)
const WIND_ARROW = { 북: '↓', 북동: '↙', 동: '←', 남동: '↖', 남: '↑', 남서: '↗', 서: '→', 북서: '↘' };

// 컨디션 점수(0~5) → 라벨 색 — 좋음 버터/보통 은은/나쁨 붉은기
const condColor = (dots) => (dots >= 4 ? '#F5E6A8' : dots >= 2.5 ? 'rgba(255,255,255,0.6)' : '#E6A8A8');

export const HourlyWeatherGraph = React.memo(function HourlyWeatherGraph({ slots, teeIdx = -1 }) {
  const [w, setW] = useState(0);
  if (!Array.isArray(slots) || slots.length === 0) return null;
  const n = slots.length;
  const colW = w > 0 ? (w - GUTTER) / n : 0;
  const xs = slots.map((_, i) => GUTTER + colW * (i + 0.5));
  // 롤링(현재날씨)에서 날짜가 바뀌는 첫 칸 — 그 위에 '내일' 라벨(네이버식, 사용자 2026-07-06). date 없으면(티오프 라운딩) -1.
  const nextDayIdx = slots.findIndex((s, i) => i > 0 && s.date && slots[i - 1].date && s.date !== slots[i - 1].date);

  const temps = slots.map(s => (Number.isFinite(s.temp) ? s.temp : null));
  const valid = temps.filter(t => t !== null);
  const tMin = valid.length ? Math.min(...valid) : 0;
  const tMax = valid.length ? Math.max(...valid) : 0;
  const span = Math.max(tMax - tMin, 2); // 기온 변화 없는 날 곡선 과장 방지(최소 스팬 2°)
  const yOf = (t) => PAD_TOP + (1 - (t - tMin) / span) * (GRAPH_H - PAD_TOP - PAD_BOT);
  const linePts = slots.map((s, i) => (temps[i] !== null ? `${xs[i]},${yOf(temps[i])}` : null)).filter(Boolean).join(' ');
  const barH = (s) => { const mm = pcpAmount(s.pcp) || pcpAmount(s.sno); return mm > 0 ? 6 + Math.min(1, mm / 15) * (BAR_MAX - 6) : 0; };

  const cell = { width: colW, alignItems: 'center' };
  const subTxt = { fontFamily: F.sysM, fontSize: fs(9.5), color: 'rgba(255,255,255,0.6)' };
  // 좌측 행 라벨 — View로 감싸 세로 중앙(두 줄짜리 강수 행에서도 가운데)
  const Gutter = ({ children }) => (
    <View style={{ width: GUTTER, justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(255,255,255,0.45)' }}>{children}</Text>
    </View>
  );
  const hairline = { height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: GUTTER };

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <View>
          {/* 티오프 라벨 — ⛳를 글자 위에 세로 스택, 컬럼 중심 절대좌표(셀보다 넓어도 중앙 유지). 박스 밖(위) 배치(사용자 2026-07-05) */}
          {teeIdx >= 0 && teeIdx < n && (
            <>
              {/* 컨테이너 높이 < 내용(⛳+글자 ≈ 34) 이면 절대배치 내용이 아래로 삐져나와 구분선에 닿음 — 넉넉히(사용자 2026-07-05 재지적) */}
              <View style={{ height: fs(36), marginBottom: 4 }}>
                <View style={{ position: 'absolute', left: GUTTER + colW * teeIdx + colW / 2 - 40, width: 80, alignItems: 'center' }}>
                  <Text style={{ fontSize: fs(11) }}>⛳</Text>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(9), color: '#F5E6A8', marginTop: 1 }} numberOfLines={1}>티오프</Text>
                </View>
              </View>
              {/* 라벨-시간 사이 구분선 — 아래 구분선들과 같은 들여쓰기(전폭이면 혼자 왼쪽이 길어 보임, 사용자 2026-07-05) */}
              <View style={[hairline, { marginBottom: 10 }]} />
            </>
          )}

          {/* 데이터 행 묶음 — 하이라이트 박스는 이 안(시간~컨디션)까지만. 밖(범례)까지 내려와 글씨를 덮던 것 수정(사용자 2026-07-05) */}
          <View>
          {teeIdx >= 0 && teeIdx < n && (
            <View pointerEvents="none" style={{ position: 'absolute', left: GUTTER + colW * teeIdx, width: colW, top: -4, bottom: -4,
              backgroundColor: 'rgba(245,230,168,0.07)', borderRadius: 10, borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.22)' }} />
          )}

          {/* '내일' 라벨 — 롤링에서 자정 넘어가는 첫 칸 위(네이버식, 사용자 2026-07-06). date 있는 슬롯에서만 */}
          {nextDayIdx > 0 && (
            <View style={{ flexDirection: 'row', marginBottom: 2 }}>
              <View style={{ width: GUTTER }} />
              {slots.map((s, i) => (
                <View key={`nd${i}`} style={cell}>
                  {i === nextDayIdx ? (
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(9), color: '#F5E6A8' }} numberOfLines={1}>내일</Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* 시간(24h) */}
          <View style={{ flexDirection: 'row', marginBottom: 7 }}>
            <View style={{ width: GUTTER }} />
            {slots.map((s, i) => (
              <View key={i} style={cell}>
                <Text style={{ fontFamily: i === teeIdx ? F.sysB : F.sysM, fontSize: fs(10), color: i === teeIdx ? '#F5E6A8' : 'rgba(255,255,255,0.8)' }}>
                  {String(s.hour).padStart(2, '0')}시
                </Text>
              </View>
            ))}
          </View>

          {/* 날씨 아이콘 */}
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            <View style={{ width: GUTTER }} />
            {slots.map((s, i) => (
              <View key={i} style={cell}><WeatherGlyph icon={s.icon} size={fs(15)} /></View>
            ))}
          </View>

          {/* 기온 꺾은선 + 강수량 막대 */}
          <View style={{ height: GRAPH_H }}>
            <Svg width={w} height={GRAPH_H}>
              {/* 바닥 기준선 — 막대가 서는 지면(정갈함) */}
              <Rect x={GUTTER} y={GRAPH_H - 0.5} width={Math.max(0, w - GUTTER)} height={0.5} fill="rgba(255,255,255,0.12)" />
              {slots.map((s, i) => {
                const h = barH(s);
                if (!h) return null;
                return <Rect key={i} x={xs[i] - 5} y={GRAPH_H - h} width={10} height={h} rx={3} fill="rgba(126,168,212,0.65)" />;
              })}
              {valid.length >= 2 && (
                <Polyline points={linePts} fill="none" stroke="rgba(245,230,168,0.9)" strokeWidth="1.5" />
              )}
              {slots.map((s, i) => (temps[i] !== null
                ? <Circle key={i} cx={xs[i]} cy={yOf(temps[i])} r="2.5" fill="#F5E6A8" />
                : null))}
            </Svg>
            {/* 기온 라벨 — SVG 텍스트 대신 RN Text(앱 폰트 일관) */}
            {slots.map((s, i) => (temps[i] !== null ? (
              <Text key={i} style={{ position: 'absolute', left: xs[i] - 16, top: yOf(temps[i]) - 18, width: 32, textAlign: 'center',
                fontFamily: F.sysSb, fontSize: fs(10), color: 'rgba(255,255,255,0.92)' }}>
                {Math.round(temps[i])}°
              </Text>
            ) : null))}
          </View>

          {/* 강수 — 확률(파랑 강조) + 량(mm/❄cm). 량 줄은 예보가 하나라도 있는 날만 —
              마른 날 빈 줄이 죽은 공간을 만들어 구분선 간격 균형을 깨던 것(사용자 2026-07-05) */}
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Gutter>💧</Gutter>
            {slots.map((s, i) => {
              const wet = s.rain >= 20 || s.pcp || s.sno;
              const hasAmount = slots.some(x => x.pcp || x.sno);
              return (
                <View key={i} style={cell}>
                  <Text style={[subTxt, { color: wet ? '#9EC3E8' : 'rgba(255,255,255,0.4)' }]}>{Math.round(s.rain) || 0}%</Text>
                  {hasAmount ? (
                    <Text style={[subTxt, { fontSize: fs(8.5), height: fs(12), marginTop: 1, color: '#9EC3E8' }]} numberOfLines={1}>
                      {s.sno ? `❄${s.sno}` : (s.pcp || ' ')}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* 구분선 위아래 여백 대칭(11) — 바람·습도 그룹이 선 사이 정중앙에 오게(사용자 2026-07-05) */}
          <View style={[hairline, { marginTop: 11 }]} />

          {/* 바람 — 부는 방향 화살표 + 풍속(m/s) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
            <Gutter>💨</Gutter>
            {slots.map((s, i) => (
              <View key={i} style={cell}>
                <Text style={[subTxt, s.wind >= 8 && { color: '#E6A8A8' }]} numberOfLines={1}>
                  {Number.isFinite(s.wind) ? `${WIND_ARROW[s.windDir] || ''}${s.wind}` : ' '}
                </Text>
              </View>
            ))}
          </View>

          {/* 습도 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 9 }}>
            <Gutter>💦</Gutter>
            {slots.map((s, i) => (
              <View key={i} style={cell}>
                <Text style={subTxt}>{Number.isFinite(s.humidity) ? `${Math.round(s.humidity)}%` : ' '}</Text>
              </View>
            ))}
          </View>

          <View style={[hairline, { marginTop: 11 }]} />

          {/* 골프 컨디션(시간별) — 기존 점수 라벨 유지 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
            <Gutter>⛳</Gutter>
            {slots.map((s, i) => (
              <View key={i} style={cell}>
                <Text style={[subTxt, { fontFamily: F.sysSb, color: condColor(s.cond?.dots ?? 0) }]} numberOfLines={1}>{s.cond?.label || ' '}</Text>
              </View>
            ))}
          </View>

          </View>

          {/* 범례 — 바람 단위·화살표 의미 (작고 흐리면 안 읽힘 — 사용자 2026-07-05) */}
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10.5), color: 'rgba(255,255,255,0.55)', textAlign: 'right', marginTop: 12 }}>
            💨 화살표는 바람이 불어가는 방향 · 숫자는 초속(m/s)
          </Text>
        </View>
      )}
    </View>
  );
});
