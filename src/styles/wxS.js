import { StyleSheet } from 'react-native';
import { F } from '../constants/colors';

// 날씨 팝업 전용 스타일 — 다크 그린(#0a1e10) 배경 기준
export const wxS = StyleSheet.create({
  // 헤더 (← + 탭)
  shellRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  backBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow:     { fontSize: 22, color: 'rgba(255,255,255,0.45)' },
  pillTabs:      { flexDirection: 'row', gap: 6 },
  pillTab:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  pillTabOn:     { backgroundColor: '#6B1E2A' },
  pillTabOff:    { borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' },
  pillTxtOn:     { fontFamily: F.sys, fontSize: 12, color: '#F5E6A8', fontWeight: '600' },
  pillTxtOff:    { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  // 섹션 레이블 ("라운딩 컨디션", "10일 예보" 등)
  sectionLabel:  { fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },

  // ① 구장명 + 날짜
  wxHeader:      { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  wxCourse:      { fontFamily: F.sys, fontSize: 20, color: '#fff', fontWeight: '600', marginBottom: 4 },
  wxDate:        { fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.4)' },

  // ② 기온 히어로
  tempHero:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  tempEmoji:     { fontSize: 44, marginRight: 10 },
  tempBig:       { fontFamily: F.en, fontSize: 68, color: '#fff', lineHeight: 72, letterSpacing: -3 },
  tempRight:     { marginLeft: 'auto', alignItems: 'flex-end' },
  tempSky:       { fontFamily: F.sys, fontSize: 15, color: '#F5E6A8', marginBottom: 4 },
  tempSub:       { fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 16 },

  // ③ 4칸 카드
  gridCard:      { marginHorizontal: 20, flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden' },
  gridCell:      { flex: 1, paddingVertical: 14, alignItems: 'center' },
  gridCellBorder:{ borderRightWidth: 0.5, borderRightColor: 'rgba(255,255,255,0.1)' },
  gridLabel:     { fontFamily: F.sys, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, marginBottom: 6 },
  gridValue:     { fontFamily: F.sys, fontSize: 13, color: '#fff', fontWeight: '600' },
  gridSub:       { fontFamily: F.sys, fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 4 },

  // ④ 골프 지수 카드
  gIdxCard:      { marginHorizontal: 20, marginTop: 16, padding: 16, backgroundColor: 'rgba(245,230,168,0.07)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.2)', borderRadius: 14 },
  gIdxHeadRow:   { flexDirection: 'row', alignItems: 'baseline' },
  gIdxBig:       { fontFamily: F.en, fontSize: 28, fontStyle: 'italic', color: '#F5E6A8' },
  gIdxScore:     { marginLeft: 10, fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  gIdxBar:       { height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  gIdxBarFill:   { height: '100%', backgroundColor: '#F5E6A8', borderRadius: 3 },
  gIdxBadgeRow:  { flexDirection: 'row', gap: 6, marginTop: 14 },
  gIdxBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  gIdxBadgeTxt:  { fontFamily: F.sys, fontSize: 10, fontWeight: '600' },

  // ⑤ 라운딩 컨디션
  condWrap:      { marginHorizontal: 20, marginTop: 28 },
  condRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.04)' },
  condRowTee:    { backgroundColor: 'rgba(245,230,168,0.09)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.25)' },
  condTime:      { width: 52, fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  condIcon:      { fontSize: 18, marginRight: 12 },
  condDots:      { flexDirection: 'row', gap: 4 },
  condDot:       { width: 8, height: 8, borderRadius: 4 },
  condLabel:     { marginLeft: 'auto', fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  teeBadge:      { marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(107,30,42,0.7)', borderRadius: 4 },
  teeBadgeTxt:   { fontFamily: F.sys, fontSize: 8, color: '#F5E6A8', fontWeight: '600' },

  // ⑥ 10일 예보
  fcWrap:        { marginHorizontal: 20, marginTop: 28 },
  fcCard:        { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  fcRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)' },
  fcRowLast:     { borderBottomWidth: 0 },
  fcRowToday:    { backgroundColor: 'rgba(245,230,168,0.06)', marginHorizontal: -14, paddingHorizontal: 14 },
  fcDayBox:      { width: 56 },
  fcDay:         { fontFamily: F.sys, fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  fcDayToday:    { color: '#F5E6A8', fontWeight: '700' },
  fcDate:        { fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 },
  fcIcon:        { fontSize: 20, marginRight: 8 },
  fcMain:        { flex: 1 },
  fcSkyRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  fcSky:         { fontFamily: F.sys, fontSize: 12, color: '#fff' },
  fcSub:         { fontFamily: F.sys, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  fcTempMin:     { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  fcTempMax:     { fontFamily: F.sys, fontSize: 12, color: '#fff', fontWeight: '600' },
  roundBadge:    { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#6B1E2A', borderRadius: 4 },
  roundBadgeTxt: { fontFamily: F.sys, fontSize: 8, color: '#F5E6A8', fontWeight: '600' },

  // ⑦ 네이버 버튼
  naverBtn:      { marginHorizontal: 20, marginTop: 24, paddingVertical: 13, backgroundColor: 'rgba(3,199,90,0.07)', borderWidth: 0.5, borderColor: 'rgba(3,199,90,0.25)', borderRadius: 12, alignItems: 'center' },
  naverBtnTxt:   { fontFamily: F.sys, fontSize: 13, color: '#03C75A', fontWeight: '500' },

  // 배경 라디얼 효과 (큰 원형 View 흉내)
  glowTopRight:  { position: 'absolute', top: -120, right: -120, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(245,230,168,0.08)' },
  glowBotLeft:   { position: 'absolute', bottom: -120, left: -120, width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(200,217,230,0.06)' },
});
