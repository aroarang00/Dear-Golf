import { StyleSheet } from 'react-native';
import { C, F, fs } from '../constants/colors';

export const homeS = StyleSheet.create({
  hdr:             { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 10 },
  hdrSub:          { fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginTop: 6, marginBottom: 4 },
  // lineHeight fs(64) — 안드로이드에서 Lora Italic 'f' 디센더 잘림 fix (fs(48)에 fs(52)는 부족, 안드로이드 'Golf'의 f·G 잘림 발생)
  // paddingHorizontal — 이탤릭 글자 좌우 여유 (안드로이드 컷 방지)
  hdrTitle:        { fontFamily: F.brand, fontSize: fs(48), lineHeight: fs(64), color: '#fff', paddingHorizontal: 4, marginBottom: 0, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  hdrGreeting:     { fontFamily: F.sys, fontSize: fs(15), color: 'rgba(255,255,255,0.75)' },
  hdrGreetingName: { fontFamily: F.sysSb, color: C.butter },
  bottomArea:      { paddingBottom: 0 },
  secLabel:        { fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.6)', letterSpacing: 2, paddingHorizontal: 22, marginBottom: 8 },
  mainCard:        { width: 232, height: 234, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 16 },
  cardCourse:      { fontFamily: F.sysB, fontSize: fs(16), color: '#fff', marginBottom: 6, lineHeight: 21, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  cardDate:        { fontFamily: F.sysM, fontSize: fs(11), color: 'rgba(255,255,255,0.85)' },
  cardDDay:        { fontFamily: F.en, fontSize: fs(66), color: C.butter, lineHeight: 70, letterSpacing: -1 },
  subCard:         { width: 110, height: 234, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 12, justifyContent: 'space-between' },
  subCourse:       { fontFamily: F.sysM, fontSize: fs(11), color: '#fff', lineHeight: 15 },
  subDate:         { fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  subDDay:         { fontFamily: F.en, fontSize: fs(28), color: 'rgba(245,230,168,0.8)', lineHeight: 30 },
  memoCard:        { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 14, overflow: 'hidden', minHeight: 90 },
  memoCardFirst:   { borderColor: 'rgba(200,217,230,0.2)', backgroundColor: 'rgba(200,217,230,0.08)' },
  memoCardTop:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' },
  memoCardBottom:  { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, position: 'relative', overflow: 'hidden' },
  memoBadgeFirst:  { backgroundColor: '#6B1E2A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  memoBadgeVisit:  { backgroundColor: '#3D3935', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  memoBadgeComment:{ backgroundColor: C.navy, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  memoBadgeTxt:    { fontFamily: F.sys, fontSize: fs(9), color: '#F5E6A8', letterSpacing: 1 },
  memoCardCourse:  { fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.4)' },
  memoMain:        { fontFamily: F.sysSb, fontSize: fs(14), color: 'rgba(255,255,255,0.85)', marginBottom: 3 },
  memoSub:         { fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)' },
  memoScore:       { fontFamily: F.sys, fontSize: fs(11), color: 'rgba(245,230,168,0.6)', marginBottom: 5 },
  memoTxt:         { fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.75)', borderLeftWidth: 2, borderLeftColor: 'rgba(107,30,42,0.6)', paddingLeft: 8, lineHeight: 18 },
  commentCard:     { marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, overflow: 'hidden', minHeight: 90 },
  commentTxt:      { fontFamily: F.sysM, fontSize: fs(12), color: '#fff', borderLeftWidth: 2, borderLeftColor: 'rgba(200,217,230,0.3)', paddingLeft: 8, lineHeight: 18 },
  commentWho:      { fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.4)', marginTop: 6, marginLeft: 10 },
});
