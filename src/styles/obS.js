import { StyleSheet } from 'react-native';
import { C, F, fs } from '../constants/colors';

export const obS = StyleSheet.create({
  // 단계 히어로(아이콘 + 키커 + 제목 + 부제) — 크림+차콜만이라 밋밋하던 것에 색·위계 추가(사용자 2026-07-27).
  //   ★입력칸 테두리는 유지: 배경이 크림(#FAF6EC)이라 흰 입력칸이 테두리 없으면 묻힘(저대비 예외, [[feedback_minimal_borders]]).
  stepLabel:  { fontFamily: F.sysSb, fontSize: fs(11.5), color: C.burgundy, letterSpacing: 1.5, marginBottom: 6 },
  stepTitle:  { fontFamily: F.sysB, fontSize: fs(21), color: C.charcoal, letterSpacing: -0.2, textAlign: 'center' },
  stepSub:    { fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 6, textAlign: 'center', lineHeight: fs(19) },
  label:      { fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, letterSpacing: 0.2, marginTop: 20, marginBottom: 9 },
  input:      { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 15, fontFamily: F.sysM, fontSize: fs(17), color: C.charcoal },
  nextBtn:    { flex: 1, backgroundColor: C.burgundy, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  nextBtnTxt: { fontFamily: F.sys, fontSize: fs(15), color: C.butter, letterSpacing: 1 },
});
