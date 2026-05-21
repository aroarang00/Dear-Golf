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

// en: 영문·숫자 디스플레이 세리프 — iOS는 Georgia, Android는 내장 세리프(Noto Serif)
// brand: "Dear Golf" 워드마크 전용 이탤릭 — 번들 폰트 Lora Italic (양 기기 동일, f 안 잘림)
// serifKR / sys: 한글 헤더·본문 — 번들 폰트 Pretendard (iOS·Android 동일하게 표시)
export const F = {
  en: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  brand: 'Lora_500Medium_Italic',
  serifKR: 'Pretendard',
  sys: 'Pretendard',
};
