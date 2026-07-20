import { StyleSheet } from 'react-native';
import { C, F, fs } from '../constants/colors';

// 플로팅 유리(glass) 탭바 — 화면 위에 떠서 뒤 배경(홈 이미지 등)이 비치는 프로스티드 알약.
//   wrap: position:absolute로 씬 위에 겹침(→ 씬이 전체 높이로 깔려 뒤 배경이 바 뒤까지 비침). 좌우·하단 여백.
//   pillShadow: 그림자+둥글기(overflow 안 함 → 그림자 보임). pillBlur: BlurView 본체(overflow hidden 클립 + 반투명 흰 틴트).
// TAB_BAR_HEIGHT: 인셋 제외 바 콘텐츠 높이 — 각 화면이 하단 콘텐츠에 (insets.bottom + 이 값)만큼 여백 줘서 바에 안 가리게.
export const TAB_BAR_HEIGHT = 56;   // 라벨 제거(아이콘만) → 바 높이 축소
export const tabS = StyleSheet.create({
  wrap:        { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', paddingHorizontal: 14, paddingTop: 6 },
  pillShadow:  {
    borderRadius: 26,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 10,
  },
  // 배경색·테두리색은 TabBar가 활성 화면(홈/그외)에 맞춰 인라인으로 주입(THEME_HOME/THEME_LIGHT).
  pill:        {
    flexDirection: 'row', borderRadius: 26, overflow: 'hidden',
    borderWidth: 0.5, paddingVertical: 9, paddingHorizontal: 4,
  },
  tab:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap:    { width: 46, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },   // 가로 타원(캡슐) — 선택 시 배경 칩. overflow:hidden으로 안드 둥근모서리 강제
  iconWrapOn:  { backgroundColor: 'rgba(255,255,255,0.18)' },   // 선택 탭 — 어두운 바 위 밝은 하이라이트 칩
});
