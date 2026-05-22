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
  en: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
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
export const BODY_BUMP = 3;
export const MIN_SIZE = 12;
export function fs(size) {
  if (typeof size !== 'number') return size;
  const bumped = size >= 11 && size <= 13 ? size + BODY_BUMP : size;
  return Math.max(bumped, MIN_SIZE);
}
