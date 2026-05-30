import { Platform } from 'react-native';

export const C = {
  bgPrimary:    '#FAF6EC',
  bgSecondary:  '#FFFFFF',
  charcoal:     '#3D3935',
  charcoalDeep: '#2A2622',
  burgundy:     '#6B1E2A',
  butter:       '#F5E6A8',
  paleSky:      '#C8D9E6',
  navy:         '#1A3D52',
  warmGray:     '#8B8680',
  warmGrayLight:'#B8B3AB',
  hairline:     '#E8E2D0',
  textPrimary:  '#3D3935',
  textSecondary:'#6B6660',
};

// en: 영문·숫자 디스플레이 세리프 — iOS Georgia / Android 내장 세리프. fontWeight 정상 동작.
// brand: "Dear Golf" 워드마크 전용 이탤릭 — 번들 폰트 Lora Italic.
// sys 계열: 한글 본문 — Pretendard 정적 굵기 파일. RN은 가변 폰트의 fontWeight를
//   살리지 못하므로 굵기별 패밀리를 따로 둔다. fontWeight 대신 아래 패밀리명을 쓸 것.
//   sys=Regular(400) / sysM=Medium(500) / sysSb=SemiBold(600) / sysB=Bold(700)
export const F = {
  en: 'PlayfairDisplay_700Bold',  // 영문·숫자 표시 — OS 간 일관 (Georgia/serif 대신)
  enItalic: 'PlayfairDisplay_700Bold_Italic',  // en의 이탤릭 변형 — fontStyle:'italic' 합성 대신 전용 폰트(안드 폴백 방지)
  brand: 'Lora_500Medium_Italic',
  serifKR: 'Pretendard-Regular',
  sys:   'Pretendard-Regular',
  sysM:  'Pretendard-Medium',
  sysSb: 'Pretendard-SemiBold',
  sysB:  'Pretendard-Bold',
};

// 앱 전체 글씨 크기 조정 노브 — 모든 fontSize는 fs()를 거친다.
//  BODY_BUMP : 본문(11~13px)을 그만큼 키움 (0=원본 / 1·2·3=단계).
//  MIN_SIZE  : 최소 글씨 크기 하한선 — 이보다 작게 렌더되는 글씨는 앱에 없음 (중장년 가독성).
//  ANDROID_ADJUST : Android는 같은 fontSize라도 시각적으로 1~2pt 더 크게 보이는 metrics 차이가 있어
//                   -1pt 보정해 iOS와 시각적 일치. MIN_SIZE 가드는 그대로 유지.
export const BODY_BUMP = 3;
export const MIN_SIZE = 12;
const ANDROID_ADJUST = Platform.OS === 'android' ? -1 : 0;
export function fs(size) {
  if (typeof size !== 'number') return size;
  const bumped = size >= 11 && size <= 13 ? size + BODY_BUMP : size;
  return Math.max(bumped + ANDROID_ADJUST, MIN_SIZE);
}
