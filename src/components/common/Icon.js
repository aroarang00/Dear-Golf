import React from 'react';
import { Text } from 'react-native';
import Svg, { G, Path, Circle, Rect, Ellipse, Defs, LinearGradient, Stop } from 'react-native-svg';
import { C } from '../../constants/colors';

// 커스텀 라인 아이콘 — 시스템 이모지(iOS·안드 렌더 제각각) 대체용 공용 컴포넌트.
//   24x24 그리드, 가는 라인 + 라운드 캡/조인. color로 브랜드 색 자유 적용(채움 필요한 부분만 path에서 fill 지정).
//   사용: <Icon name="flag" size={18} color={C.burgundy} />
// 날씨 아이콘 멀티컬러 — 각 path에 직접 stroke 지정(Icon의 단색 color 무시). 어두운 카드/날씨화면 기준.
// sun=앰버골드(버터 UI와 분리돼 '태양' 포인트로 살게, 2026-06-21). 버터(#F5E6A8) → #F2B441
const WXC = { sun: '#F2B441', cloud: '#FFFFFF', rain: '#7FB3E0', snow: '#CFE3F2' };
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
  // 🔍 검색 — 렌즈 크게 + 유리(연블루 반투명) 채움으로 돋보기 느낌 강조. 링·손잡이는 color.
  search: () => (
    <>
      <Circle cx="10" cy="10" r="7.5" fill="rgba(123,179,224,0.22)" />
      <Path d="M15.3 15.3 L21 21" />
    </>
  ),
  // 📸 카메라 — 바디 + 뷰파인더 험프 + 렌즈. 차콜 모노 라인(color 상속).
  camera: () => (
    <>
      <Rect x="3" y="7" width="18" height="12.5" rx="2.5" />
      <Path d="M8.5 7 L9.8 4.7 L14.2 4.7 L15.5 7" />
      <Circle cx="12" cy="13.3" r="3.2" />
    </>
  ),
  // 🖼️ 사진/앨범 — 액자 + 해 + 산. 차콜 모노 라인(color 상속).
  image: () => (
    <>
      <Rect x="3" y="4" width="18" height="16" rx="2.5" />
      <Circle cx="8.5" cy="9" r="1.7" />
      <Path d="M4 17.5 L9.5 12 L13 15.5 L15.5 13 L20 17.5" />
    </>
  ),
  // 🎬 동영상 — 캠코더(본체 + 렌즈 삼각). color 상속.
  video: () => (
    <>
      <Rect x="2.5" y="7" width="13" height="10" rx="2.5" />
      <Path d="M15.5 10.3 L21 7.3 L21 16.7 L15.5 13.7 Z" />
    </>
  ),
  // ✏️ 일상/메모 — 연필 + 밑줄(글쓰기 느낌). 라인, color 상속.
  pen: () => (
    <>
      <Path d="M15.5 4.5 L19.5 8.5 L9.5 18.5 L5 20 L6.5 15.5 Z" />
      <Path d="M13.5 6.5 L17.5 10.5" />
      <Path d="M4.5 21.8 L15 21.8" />
    </>
  ),
  // ⚙️ 설정(톱니바퀴) — 휠 + 가운데 구멍 + 짧고 굵은 톱니 8개. 라인, color 상속.
  gear: () => (
    <>
      <Circle cx="12" cy="12" r="5.8" />
      <Circle cx="12" cy="12" r="2.3" />
      <Path d="M18 12 L20.4 12 M16.3 16.3 L18 18 M12 18 L12 20.4 M7.7 16.3 L6 18 M6 12 L3.6 12 M7.7 7.7 L6 6 M12 6 L12 3.6 M16.3 7.7 L18 6" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  // 👤＋ 친구 초대(사람+) — 머리 + 어깨 + 플러스. 라인, color 상속.
  personAdd: () => (
    <>
      <Circle cx="9.5" cy="7.5" r="3.3" />
      <Path d="M3.8 20 C3.8 15.8 6.3 13.8 9.5 13.8 C11.3 13.8 12.8 14.6 13.9 15.9" />
      <Path d="M18 13.5 L18 19 M15.3 16.25 L20.7 16.25" />
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
  // 👨‍👩‍👧 크루(친구 소수 그룹) — 가운데 인물 + 양옆 살짝 뒤 두 인물. DM(send)·친구(people 2인)와 구분되는 '모임' 트리오. color 상속.
  crew: () => (
    <>
      <Circle cx="12" cy="7" r="3" />
      <Path d="M6.6 18c0-3.1 2.4-5.2 5.4-5.2s5.4 2.1 5.4 5.2" />
      <Circle cx="5" cy="9.6" r="2.1" />
      <Path d="M2 17c0-2.2 1.4-3.7 3.3-3.9" />
      <Circle cx="19" cy="9.6" r="2.1" />
      <Path d="M22 17c0-2.2-1.4-3.7-3.3-3.9" />
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
  //   ★iOS 경로 파서가 'M12 1.8V5.4'처럼 숫자 뒤 V/H를 못 읽어 광선 Path를 통째로 누락(원만 남음) →
  //     공백 있는 L 명령으로 변환. 중첩 G 상속도 iOS서 불안정해 각 요소에 fill/stroke 직접 지정. ([[rn-platform-gotchas]])
  sun: () => (
    <>
      <Circle cx="12" cy="12" r="3.9" fill="none" stroke={WXC.sun} strokeWidth="2.2" />
      <Path
        d="M12 1.8 L12 5.4 M12 18.6 L12 22.2 M1.8 12 L5.4 12 M18.6 12 L22.2 12 M4.6 4.6 L7.1 7.1 M16.9 16.9 L19.4 19.4 M4.6 19.4 L7.1 16.9 M16.9 7.1 L19.4 4.6"
        fill="none" stroke={WXC.sun} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  ),
  // ☁️ 흐림 — 통일 구름
  cloud: () => (
    <Path d={WX_CLOUD.d} fill={WXC.cloud} stroke="none" transform={WX_CLOUD.tf} />
  ),
  // 🌤️·⛅ 구름조금 — 해 + 구름(해가 보이게 우하단 구름 합성, 전체 1.1배)
  //   sun과 동일하게 iOS 파서 안전(공백 L)·요소별 속성 직접 지정. 좌표는 기존과 동일.
  cloudSun: () => (
    <G transform="translate(-1.2 -1.2) scale(1.1)">
      <Path
        d="M12 2 L12 4 M4.93 4.93 L6.34 6.34 M20 12 L22 12 M19.07 4.93 L17.66 6.34 M15.947 12.65 a4 4 0 0 0 -5.925 -4.128"
        fill="none" stroke={WXC.sun} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" fill={WXC.cloud} stroke="none" />
    </G>
  ),
  // 🌧️·🌦️ 비 — 통일 구름 + 빗줄기 (iOS 파서 안전: 공백 L + 요소별 속성 직접)
  rain: () => (
    <>
      <Path d={WX_CLOUD.d} fill={WXC.cloud} stroke="none" transform={WX_CLOUD.tf} />
      <Path d="M8 17.6 L8 21.2 M12 18.6 L12 22.2 M16 17.6 L16 21.2"
        fill="none" stroke={WXC.rain} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // ❄️·🌨️ 눈 — 통일 구름 + 눈송이(둥근 점=strokeLinecap round 필수). iOS 파서 안전: 공백 L.
  snow: () => (
    <>
      <Path d={WX_CLOUD.d} fill={WXC.cloud} stroke="none" transform={WX_CLOUD.tf} />
      <Path d="M8 18 L8.01 18 M8 21.2 L8.01 21.2 M12 19.4 L12.01 19.4 M12 22.6 L12.01 22.6 M16 18 L16.01 18 M16 21.2 L16.01 21.2"
        fill="none" stroke={WXC.snow} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // 🚗 교통 — 옆에서 본 스포티 쿠페(낮은 루프·눕힌 윈드실드·패스트백). 토이 느낌 줄임.
  //   외곽 1선 + 윈도우 벨트라인 1선 + 바퀴 2개(작게). 모든 명령 공백 L/C(iOS 파서 안전).
  car: () => (
    <>
      <Path d="M2.6 15.5 C2.6 14.6 2.9 14.2 3.7 14 L8 13.4 C8.6 13.3 8.9 13.1 9.3 12.6 L11 9.9 C11.3 9.5 11.7 9.3 12.3 9.3 L15.2 9.3 C15.9 9.3 16.3 9.5 16.6 10 L18.7 13.3 L20.7 13.9 C21.2 14.1 21.4 14.5 21.4 15 L21.4 15.5" />
      <Path d="M9.6 12.6 L18.4 13.2" />
      <Path d="M2.6 15.5 L4.8 15.5 M8.8 15.5 L15.2 15.5 M19.2 15.5 L21.4 15.5" />
      <Circle cx="6.8" cy="15.5" r="2" />
      <Circle cx="17.2" cy="15.5" r="2" />
    </>
  ),
  // ✉️ 편지 날아가는 — 살짝 기운 봉투 + 왼쪽 속도선(모션). DM 버튼. 라인, color 상속.
  //   회전은 각 요소에 직접(중첩 G 상속 iOS 불안정 회피). 공백 L(iOS 파서 안전).
  send: () => (
    <>
      <Path d="M1.2 8 L4.4 8 M0.8 11.5 L4 11.5 M1.2 15 L4.4 15" />
      <Rect x="7" y="7" width="15" height="10.5" rx="1.6" transform="rotate(-10 14 12)" />
      <Path d="M7.4 7.8 L14.5 12.6 L21.6 7.8" transform="rotate(-10 14 12)" />
    </>
  ),
  // ✈️ 종이비행기 — 댓글 전송(DM '편지(send)'와 구분되는 클래식 페이퍼플레인). color 상속.
  paperPlane: () => (
    <>
      <Path d="M22 2 L2 9.6 L10.6 13.4 L14.4 22 L22 2 Z" />
      <Path d="M22 2 L10.6 13.4" />
    </>
  ),
  // ⤓ 저장(다운로드) — 트레이로 내려가는 화살표. 남이 올린 사진·영상 저장용. color 상속.
  download: () => (
    <>
      <Path d="M12 3.5 V14.5" />
      <Path d="M7.5 10 L12 14.7 L16.5 10" />
      <Path d="M4.5 19.5 H19.5" />
    </>
  ),
  // ★ 별 — ⭐ 느낌 정통 5각 + 금빛 그라데이션(위 밝음→아래 진함)으로 반짝이는 입체감.
  //   평점(골퍼·코스)·저장 공용. iOS/안드 동일 렌더. (color prop 무시 — 고정 금빛 그라데이션)
  star: () => (
    <>
      <Defs>
        <LinearGradient id="dgStar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBD262" />
          <Stop offset="1" stopColor="#E2922C" />
        </LinearGradient>
      </Defs>
      <Path d="M12 2.5 L14.4 8.7 L21 9.1 L15.9 13.3 L17.6 19.7 L12 16.1 L6.4 19.7 L8.1 13.3 L3 9.1 L9.6 8.7 Z"
        fill="url(#dgStar)" stroke="none" strokeLinejoin="round" />
    </>
  ),
  // 🏆 트로피 — 별과 같은 금빛 그라데이션 컵 + 진금 손잡이·기둥·받침. 100대 코스 등. color 무시(고정 금빛).
  trophy: () => (
    <>
      <Defs>
        <LinearGradient id="dgTrophy" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBD262" />
          <Stop offset="1" stopColor="#E2922C" />
        </LinearGradient>
      </Defs>
      <Path d="M6.5 4.5 C3.5 5 3.5 9.5 7 9.5" fill="none" stroke="#E2922C" strokeWidth="1.6" strokeLinecap="round" />
      <Path d="M17.5 4.5 C20.5 5 20.5 9.5 17 9.5" fill="none" stroke="#E2922C" strokeWidth="1.6" strokeLinecap="round" />
      <Path d="M6.5 4 L17.5 4 L17.5 8.5 C17.5 12 15 14.5 12 14.5 C9 14.5 6.5 12 6.5 8.5 Z" fill="url(#dgTrophy)" stroke="none" />
      <Path d="M12 14.5 L12 18" fill="none" stroke="#E2922C" strokeWidth="1.8" strokeLinecap="round" />
      <Path d="M9.5 18 L14.5 18 M8 20 L16 20" fill="none" stroke="#E2922C" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // ♡ 좋아요 하트(아웃라인) — 미좋아요 상태. stroke=color. 명령 공백 C/Z(iOS 안전).
  heart: () => (
    <Path d="M12 20.5 C12 20.5 3.5 14.5 3.5 8.5 C3.5 5.8 5.8 4 8 4 C9.8 4 11.3 5 12 6.5 C12.7 5 14.2 4 16 4 C18.2 4 20.5 5.8 20.5 8.5 C20.5 14.5 12 20.5 12 20.5 Z" />
  ),
  // ♥ 좋아요 하트(빨강 채움) — 좋아요 상태. color 무시, 빨강 고정.
  heartFilled: () => (
    <Path d="M12 20.5 C12 20.5 3.5 14.5 3.5 8.5 C3.5 5.8 5.8 4 8 4 C9.8 4 11.3 5 12 6.5 C12.7 5 14.2 4 16 4 C18.2 4 20.5 5.8 20.5 8.5 C20.5 14.5 12 20.5 12 20.5 Z" fill="#E5484D" stroke="#E5484D" />
  ),
  // ✉️ send의 흰색 채움 변형 — 봉투 body 흰색(버터/어두운 배경서 '흰 편지'로 또렷). 외곽·플랩·속도선은 color.
  sendFilled: () => (
    <>
      <Path d="M1.2 8 L4.4 8 M0.8 11.5 L4 11.5 M1.2 15 L4.4 15" />
      <Rect x="7" y="7" width="15" height="10.5" rx="1.6" fill="#fff" transform="rotate(-10 14 12)" />
      <Path d="M7.4 7.8 L14.5 12.6 L21.6 7.8" transform="rotate(-10 14 12)" />
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
