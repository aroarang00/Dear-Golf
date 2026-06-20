import React from 'react';
import { Text } from 'react-native';
import Svg, { G, Path, Circle, Rect, Line, Ellipse, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import { C } from '../../constants/colors';

// 커스텀 라인 아이콘 — 시스템 이모지(iOS·안드 렌더 제각각) 대체용 공용 컴포넌트.
//   24x24 그리드, 가는 라인 + 라운드 캡/조인. color로 브랜드 색 자유 적용(채움 필요한 부분만 path에서 fill 지정).
//   사용: <Icon name="flag" size={18} color={C.burgundy} />
const ICONS = {
  // ⛳ 골프 깃발 — 앱 대표 심볼
  flag: (c) => (
    <>
      <Path d="M6.5 21V3" />
      <Path d="M6.5 3.6 16.6 6.4 6.5 9.2Z" fill={c} stroke="none" />
      <Path d="M3.8 21H9.2" />
    </>
  ),
  // 📅 캘린더(일정)
  calendar: () => (
    <>
      <Rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <Path d="M3.5 9.5H20.5" />
      <Path d="M8 3.2V6.4" />
      <Path d="M16 3.2V6.4" />
    </>
  ),
  // 🔔 알림(벨)
  bell: () => (
    <>
      <Path d="M18 8.6a6 6 0 1 0-12 0c0 4.8-2.1 6.2-2.1 6.2h16.2S18 13.4 18 8.6Z" />
      <Path d="M10.2 18.6a2 2 0 0 0 3.6 0" />
    </>
  ),
  // 🎯 맞춤(타깃)
  target: (c) => (
    <>
      <Circle cx="12" cy="12" r="8.5" />
      <Circle cx="12" cy="12" r="4.6" />
      <Circle cx="12" cy="12" r="1.4" fill={c} stroke="none" />
    </>
  ),
  // 🔍 검색
  search: () => (
    <>
      <Circle cx="11" cy="11" r="6.5" />
      <Path d="M15.8 15.8 20.5 20.5" />
    </>
  ),
  // 👥 친구
  people: () => (
    <>
      <Circle cx="9" cy="8" r="3.2" />
      <Path d="M3.6 19.4c0-3 2.4-5.2 5.4-5.2s5.4 2.2 5.4 5.2" />
      <Path d="M16.2 5.6a3 3 0 0 1 0 5.4" />
      <Path d="M17.6 14.6c1.8.6 3.2 2.3 3.2 4.8" />
    </>
  ),
  // 🎫 티켓(체크인 카드) — 양옆 노치 + 점선 스텁
  ticket: () => (
    <>
      <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <Path d="M13 5v2" />
      <Path d="M13 11v2" />
      <Path d="M13 17v2" />
    </>
  ),
  // 🍲 함께 식사 — 그릇 + 김(steam 3가닥, 가운데 길게)
  bowl: () => (
    <>
      <Path d="M3.5 12 H20.5 A8.5 8.5 0 0 1 3.5 12 Z" />
      <Path d="M7.5 4 q1 1.2 0 2.4 q-1 1.2 0 2.4" />
      <Path d="M12 2.8 q1 1.2 0 2.4 q-1 1.2 0 2.4 q1 1.2 0 2.4" />
      <Path d="M16.5 4 q1 1.2 0 2.4 q-1 1.2 0 2.4" />
    </>
  ),
  // 🏌️ → 클럽하우스(저택) — 페디먼트 지붕 + 기둥 + 바닥
  clubhouse: () => (
    <>
      <Path d="M2.5 10.5 L12 4 L21.5 10.5" />
      <Path d="M4 10.5 H20" />
      <Path d="M7 11 V20" />
      <Path d="M12 11 V20" />
      <Path d="M17 11 V20" />
      <Path d="M4 20 H20" />
    </>
  ),
};

// ☀️ 맑음 해 — 채움 + 입체감(사용자 2026-06-21). 라디얼 그라데이션 디스크(밝은 위→진한 앰버 아래=구체감)
//   + 광택 하이라이트 + 앰버 광선. 노랑 대신 차분한 앰버/허니톤.
function SunIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <RadialGradient id="dgSunBody" cx="42%" cy="36%" r="68%">
          <Stop offset="0" stopColor="#FFF0A6" />
          <Stop offset="0.55" stopColor="#FFD23E" />
          <Stop offset="1" stopColor="#F6B61F" />
        </RadialGradient>
      </Defs>
      <G stroke="#FBC02D" strokeWidth="3.8" strokeLinecap="round">
        <Line x1="24" y1="2" x2="24" y2="5" />
        <Line x1="24" y1="43" x2="24" y2="46" />
        <Line x1="2" y1="24" x2="5" y2="24" />
        <Line x1="43" y1="24" x2="46" y2="24" />
        <Line x1="8.4" y1="8.4" x2="10.6" y2="10.6" />
        <Line x1="37.4" y1="37.4" x2="39.6" y2="39.6" />
        <Line x1="8.4" y1="39.6" x2="10.6" y2="37.4" />
        <Line x1="37.4" y1="10.6" x2="39.6" y2="8.4" />
      </G>
      <Circle cx="24" cy="24" r="14.5" fill="url(#dgSunBody)" stroke="#EBAA1C" strokeWidth="0.6" />
      <Circle cx="20" cy="20" r="4.6" fill="#FFF7DA" opacity={0.5} />
    </Svg>
  );
}

// ⛳ → 입체 그린·홀컵·핀 — '내 코스 모아보기' 바(그린 그라데이션)용. 깃발은 형태가 또렷해 작은 크기서도 잘 읽힘.
//   퍼팅 그린 둔덕 + 홀컵(어두운 타원+윗림 하이라이트) + 흰 핀(좌→우 음영=원통감) + 빨강 깃발(그린 배경서 강조) + 옆 골프공.
function GreenFlagIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id="dgFlag" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EC6A6A" />
          <Stop offset="1" stopColor="#C42E2E" />
        </LinearGradient>
        <LinearGradient id="dgPole" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#F1F4F0" />
          <Stop offset="1" stopColor="#C5CCC4" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="21" cy="40" rx="15.5" ry="3.8" fill="#A6C78C" opacity={0.5} />
      <Ellipse cx="21" cy="39" rx="8" ry="2.8" fill="#262220" />
      <Ellipse cx="21" cy="38.1" rx="7.8" ry="2.4" fill="#566150" opacity={0.55} />
      <Rect x="19.4" y="5.5" width="3" height="33.5" rx="1.5" fill="url(#dgPole)" />
      <Path d="M21 4.5 L39 9 Q41 11.5 39 14 L21 19 Z" fill="url(#dgFlag)" />
      <Path d="M21 5.8 L35.5 9.4 L21 11.6 Z" fill="#FFFFFF" opacity={0.2} />
      <Circle cx="34" cy="38" r="3.1" fill="#FFFFFF" stroke="#B7C4B9" strokeWidth="0.7" />
    </Svg>
  );
}
export function GreenFlag({ size = 22 }) {
  return <GreenFlagIcon size={size} />;
}

// 날씨 이모지 → SVG 대체. 지금은 맑음 해만(구름·비·눈은 이모지가 더 자연스러워 유지, 사용자 2026-06-21).
const WX_SUN = ['☀️', '🌤️'];
export function WeatherGlyph({ icon, size = 22 }) {
  if (WX_SUN.includes(icon)) return <SunIcon size={size} />;
  return <Text style={{ fontSize: size }}>{icon}</Text>; // 구름·비·눈 등은 이모지 유지
}

export function Icon({ name, size = 22, color = C.charcoal, strokeWidth = 1.8 }) {
  const render = ICONS[name];
  if (!render) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {render(color)}
      </G>
    </Svg>
  );
}
