import { StyleSheet } from 'react-native';
import { C, F, fs } from '../constants/colors';

export const myS = StyleSheet.create({
  mask:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
  handle:       { width: 32, height: 3, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', margin: 12 },
  profileArea:  { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 16 },
  avatar:       { width: 56, height: 56, borderRadius: 28, backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.butter },
  // 아바타 이니셜·닉네임은 한글이 들어가므로 영문 전용 F.en 대신 Pretendard Bold
  //  (F.en=PlayfairDisplay는 한글 글리프 없어 안드서 시스템폰트로 폴백됨 [[avatar-initial-font]])
  avatarTxt:    { fontFamily: F.sysB, fontSize: fs(24), color: '#fff' },
  nickname:     { fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal },
  realName:     { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 },
  nickInput:    { fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2 },
  // 섹션 카드 — 크림 시트 배경(bgPrimary) 위 흰 카드(bgSecondary) + 가는 테두리로 그룹 분리(iOS 설정앱식, 2026-06-24).
  //   divider는 무력화(height 0)하고 카드 marginTop으로 그룹 간 여백을 줌.
  section:      { backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, marginHorizontal: 12, marginTop: 10, paddingHorizontal: 16, paddingVertical: 6 },
  // 통계 섹션 — 카드 박스 없이 크림 배경에 그대로(사용자 2026-06-24). 프로필 바로 아래 자연스럽게.
  sectionPlain: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  sectionLabel: { fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal, letterSpacing: 1.5, marginTop: 8, marginBottom: 8 },
  statsRow:     { flexDirection: 'row', gap: 8 },
  // 통계 박스 — 크림 시트 배경 위에 놓이므로 흰색(bgSecondary)으로 대비.
  statBox:      { flex: 1, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: C.hairline },
  statVal:      { fontFamily: F.en, fontSize: fs(22), color: C.charcoal, lineHeight: 26 },
  statLabel:    { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 },
  divider:      { height: 0 },
  menuRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  menuIcon:     { fontSize: fs(18), width: 32 },
  menuLabel:    { fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, flex: 1 },
  menuValue:    { fontFamily: F.sys, fontSize: fs(12), color: C.warmGray },
});
