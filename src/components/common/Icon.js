import React from 'react';
import { Text } from 'react-native';
import Svg, { G, Path, Circle, Rect, Ellipse, Defs, LinearGradient, Stop } from 'react-native-svg';
import { C } from '../../constants/colors';

// 커스텀 라인 아이콘 — 시스템 이모지(iOS·안드 렌더 제각각) 대체용 공용 컴포넌트.
//   24x24 그리드, 가는 라인 + 라운드 캡/조인. color로 브랜드 색 자유 적용(채움 필요한 부분만 path에서 fill 지정).
//   사용: <Icon name="flag" size={18} color={C.burgundy} />
// 날씨 아이콘 멀티컬러 — 각 path에 직접 stroke 지정(Icon의 단색 color 무시). 어두운 카드/날씨화면 기준.
const WXC = { sun: '#F5E6A8', cloud: '#FFFFFF', rain: '#7FB3E0', snow: '#CFE3F2' };
// 통일 구름 — 흐림·비·눈 공용(같은 채움 구름, 같은 크기/위치). 비·눈은 아래에 빗줄기/눈송이만 추가.
const WX_CLOUD = { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z', tf: 'translate(-1.5 -4.9) scale(1.125)' };
const ICONS = {
  // ⛳ 골프 깃발 — 앱 대표 심볼
  flag: (c) => (
    <>
      <Path d="M6.5 21V3" />
      <Path d="M6.5 3.6 16.6 6.4 6.5 9.2Z" fill={c} stroke="none" />
      <Path d="M3.8 21H9.2" />
    </>
  ),
  // ⛳ 그린 — 위에서 본 퍼팅 그린(초록 채움 타원) + 가운데 깃발(크게). 코스 라벨용.
  green: (c) => (
    <>
      <Ellipse cx="12" cy="17" rx="9" ry="4.4" fill="#5E7E52" stroke="none" />
      <Path d="M12 16.6 V3" />
      <Path d="M12 3.3 20.5 6 12 8.7Z" fill={c} stroke="none" />
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
  // ── 날씨(라인, 멀티컬러) — WeatherGlyph에서 이모지별 매핑. 해=버터·구름=흰색·비=파랑·눈=연파랑. ──
  // ☀️ 맑음 — 해(원 + 광선 8개). 광선은 길고 굵게(작은 크기서도 햇살 보이게).
  sun: () => (
    <G stroke={WXC.sun} strokeWidth="2.2">
      <Circle cx="12" cy="12" r="3.9" />
      <Path d="M12 1.8V5.4 M12 18.6V22.2 M1.8 12H5.4 M18.6 12H22.2 M4.6 4.6L7.1 7.1 M16.9 16.9L19.4 19.4 M4.6 19.4L7.1 16.9 M16.9 7.1L19.4 4.6" />
    </G>
  ),
  // ☁️ 흐림 — 통일 구름
  cloud: () => (
    <Path d={WX_CLOUD.d} fill={WXC.cloud} stroke="none" transform={WX_CLOUD.tf} />
  ),
  // 🌤️·⛅ 구름조금 — 해 + 구름(해가 보이게 우하단 구름 합성, 전체 1.1배)
  cloudSun: () => (
    <G transform="translate(-1.2 -1.2) scale(1.1)">
      <G stroke={WXC.sun} strokeWidth="2.2">
        <Path d="M12 2v2" />
        <Path d="m4.93 4.93 1.41 1.41" />
        <Path d="M20 12h2" />
        <Path d="m19.07 4.93-1.41 1.41" />
        <Path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
      </G>
      <Path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" fill={WXC.cloud} stroke="none" />
    </G>
  ),
  // 🌧️·🌦️ 비 — 통일 구름 + 빗줄기
  rain: () => (
    <>
      <Path d={WX_CLOUD.d} fill={WXC.cloud} stroke="none" transform={WX_CLOUD.tf} />
      <Path d="M8 17.6v3.6 M12 18.6v3.6 M16 17.6v3.6" stroke={WXC.rain} />
    </>
  ),
  // ❄️·🌨️ 눈 — 통일 구름 + 눈송이
  snow: () => (
    <>
      <Path d={WX_CLOUD.d} fill={WXC.cloud} stroke="none" transform={WX_CLOUD.tf} />
      <Path d="M8 18h.01 M8 21.2h.01 M12 19.4h.01 M12 22.6h.01 M16 18h.01 M16 21.2h.01" stroke={WXC.snow} />
    </>
  ),
  // 🚗 교통(자동차) — 옆에서 본 차체(보닛·캐빈·트렁크) + 창문 + 바퀴. 라인 드로잉.
  car: () => (
    <>
      <Path d="M3 15.5 L3 13 C3 12.4 3.4 12.1 4.1 12 L8.5 11.3 L10.2 7 C10.5 6.5 11 6.3 11.6 6.3 L13.4 6.3 C14 6.3 14.5 6.5 14.8 7 L16.9 11.3 L19.9 12 C20.6 12.1 21 12.5 21 13 L21 15.5" />
      <Path d="M3 15.5 H4.8 M9.2 15.5 H14.8 M19.2 15.5 H21" />
      <Path d="M12.5 6.3 V11.3 M8.5 11.3 H16.9" />
      <Circle cx="7" cy="15.5" r="2.2" />
      <Circle cx="17" cy="15.5" r="2.2" />
    </>
  ),
};

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

// 날씨 이모지 → 멀티컬러 라인 아이콘(사용자 2026-06-21). kma·openweather가 내보내는 이모지를 각 라인 아이콘에 매핑.
//   색은 아이콘 내부(WXC)에서 멀티컬러로 직접 지정. 매핑 없는 이모지만 폴백으로 그대로 표시.
const WX_ICON = {
  '☀️': 'sun', '🌤️': 'sun', // 맑음·거의 맑음 → 풀 해(햇살)
  '⛅': 'cloudSun',           // 구름많음 → 해 + 구름
  '☁️': 'cloud',
  '🌧️': 'rain', '🌦️': 'rain',
  '❄️': 'snow', '🌨️': 'snow',
};
export function WeatherGlyph({ icon, size = 22 }) {
  const name = WX_ICON[icon];
  if (name) return <Icon name={name} size={size} strokeWidth={1.8} />;
  return <Text style={{ fontSize: size }}>{icon}</Text>; // 매핑 없는 이모지는 그대로
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
