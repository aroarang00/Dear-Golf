import { StyleSheet, Platform } from 'react-native';
import { C, F, fs } from '../constants/colors';

// Android는 같은 픽셀에도 화면 비율 차로 더 크게 보임 — 카드 height/폰트 약간 작게 보정
const isAndroid = Platform.OS === 'android';

// ★카드 높이·패딩 단일 소스 — D-day 메인/서브/D-0(전폭) 카드가 '항상 같은 높이'여야 한다.
//   값이 곳곳에 흩어지면 한쪽만 수정돼 높이가 어긋남(실제로 D-0만 234 하드코딩돼 안드서 14px 컸음, 2026-06-20).
//   이 상수만 바꾸면 모든 카드가 함께 따라오게 — homeS.mainCard/subCard + HomeScreen의 D-0 인라인 모두 사용.
export const CARD_H = isAndroid ? 220 : 234;   // 모든 D-day 카드 공통 높이
export const CARD_PAD = isAndroid ? 13 : 16;   // 전폭 카드(메인·D-0) 내부 패딩

export const homeS = StyleSheet.create({
  hdr:             { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 6 },
  hdrSub:          { fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginTop: 4, marginBottom: 2, includeFontPadding: false },
  // lineHeight fs(54) — 안드로이드 Lora Italic 'f' 디센더 잘림 방지 + 헤더 컴팩트화
  // paddingHorizontal — 이탤릭 글자 좌우 여유
  // flexShrink:0 + numberOfLines={1}(컴포넌트에서) — 안드로이드 row 안 'Golf' wrap 방지
  // includeFontPadding:false — 안드로이드 Text 기본 폰트 위/아래 패딩 제거 (iOS 일관성)
  // fontSize/lineHeight를 iOS만 키움 — 안드로이드는 fs(40)/fs(54) 그대로 (화면 비율 차 보정 유지)
  hdrTitle:        { fontFamily: F.brand, fontSize: isAndroid ? fs(43) : fs(46), lineHeight: isAndroid ? fs(58) : fs(62), color: '#fff', paddingHorizontal: 4, marginBottom: 0, flexShrink: 0, includeFontPadding: false, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  hdrGreeting:     { fontFamily: F.sys, fontSize: fs(14), color: 'rgba(255,255,255,0.75)', marginTop: 6, includeFontPadding: false },
  hdrGreetingName: { fontFamily: F.sysSb, color: C.butter },
  bottomArea:      { paddingBottom: 0 },
  secLabel:        { fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.6)', letterSpacing: 2, paddingHorizontal: 22, marginBottom: 8 },
  mainCard:        { width: isAndroid ? 210 : 232, height: CARD_H, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: CARD_PAD },
  // D-0 카드 내부 박스(정보·날씨교통·함께식사 공용) — 카드 안에 또렷한 박스로 구분
  cardBox:         { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11 },
  cardCourse:      { fontFamily: F.sysB, fontSize: fs(16), color: '#fff', marginBottom: 4, lineHeight: 21, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4, includeFontPadding: false },
  cardDate:        { fontFamily: F.sysM, fontSize: fs(11), color: 'rgba(255,255,255,0.85)', includeFontPadding: false },
  cardDDay:        { fontFamily: F.en, fontSize: isAndroid ? fs(62) : fs(66), color: C.butter, lineHeight: isAndroid ? 66 : 70, letterSpacing: -1, includeFontPadding: false },
  subCard:         { width: isAndroid ? 100 : 110, height: CARD_H, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: isAndroid ? 11 : 12, justifyContent: 'space-between' },
  subCourse:       { fontFamily: F.sysM, fontSize: fs(11), color: '#fff', lineHeight: 15, includeFontPadding: false },
  subDate:         { fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(255,255,255,0.75)', marginTop: 2, includeFontPadding: false },
  subDDay:         { fontFamily: F.en, fontSize: isAndroid ? fs(24) : fs(28), color: 'rgba(245,230,168,0.8)', lineHeight: isAndroid ? 26 : 30, includeFontPadding: false },
  memoCard:        { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 14, overflow: 'hidden', minHeight: isAndroid ? 62 : 90 },
  memoCardFirst:   { borderColor: 'rgba(200,217,230,0.2)', backgroundColor: 'rgba(200,217,230,0.08)' },
  memoCardTop:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: isAndroid ? 11 : 14, paddingVertical: isAndroid ? 5 : 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  memoCardBottom:  { paddingHorizontal: isAndroid ? 11 : 14, paddingTop: isAndroid ? 5 : 8, paddingBottom: isAndroid ? 6 : 10, position: 'relative', overflow: 'hidden' },
  memoBadgeFirst:  { backgroundColor: '#6B1E2A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  memoBadgeVisit:  { backgroundColor: '#3D3935', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  memoBadgeComment:{ backgroundColor: C.navy, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  memoBadgeTxt:    { fontFamily: F.sys, fontSize: fs(9), color: '#F5E6A8', letterSpacing: 1 },
  memoCardCourse:  { fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.6)' },
  memoMain:        { fontFamily: F.sysSb, fontSize: fs(14), color: 'rgba(255,255,255,0.85)', marginBottom: 3 },
  memoSub:         { fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)' },
  memoScore:       { fontFamily: F.sys, fontSize: fs(11), color: 'rgba(245,230,168,0.6)', marginBottom: 5 },
  memoTxt:         { fontFamily: F.sysM, fontSize: fs(12), color: '#fff', borderLeftWidth: 2, borderLeftColor: 'rgba(107,30,42,0.6)', paddingLeft: 8, lineHeight: isAndroid ? 15 : 18 },
  commentCard:     { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', minHeight: isAndroid ? 52 : 90 },
  commentTxt:      { fontFamily: F.sysM, fontSize: fs(12), color: '#fff', borderLeftWidth: 2, borderLeftColor: 'rgba(200,217,230,0.3)', paddingLeft: 8, lineHeight: isAndroid ? 15 : 18 },
  commentWho:      { fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.4)', marginTop: isAndroid ? 4 : 6, marginLeft: 10 },
});
