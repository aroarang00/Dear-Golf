import { StyleSheet } from 'react-native';
import { C, F } from '../constants/colors';

export const wxS = StyleSheet.create({
  // Shell (close + pill tabs row)
  shellRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  shellRowDark:  { backgroundColor: C.charcoal },
  shellRowLight: { backgroundColor: C.bgPrimary },
  closeLight:    { fontFamily: F.sys, fontSize: 14, color: '#fff' },
  closeDark:     { fontFamily: F.sys, fontSize: 14, color: 'rgba(61,57,53,0.5)' },
  pillTabs:      { flexDirection: 'row', gap: 6 },
  pillTab:       { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: 'transparent' },
  pillTabOn:     { backgroundColor: C.burgundy },
  pillTxtOn:     { fontFamily: F.sys, fontSize: 13, color: '#fff', fontWeight: '600' },
  pillTxtLight:  { fontFamily: F.sys, fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  pillTxtDark:   { fontFamily: F.sys, fontSize: 13, color: 'rgba(61,57,53,0.5)' },
  // Weather header (charcoal)
  wxHeader:      { backgroundColor: C.charcoal, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 18 },
  wxCourse:      { fontFamily: F.sys, fontSize: 20, color: '#fff', fontWeight: '700', marginBottom: 4 },
  wxDate:        { fontFamily: F.sys, fontSize: 13, color: 'rgba(255,255,255,0.65)' },
  // 기온 영역
  tempRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20, backgroundColor: C.bgPrimary },
  tempEmoji:     { fontSize: 52 },
  tempBig:       { fontFamily: F.en, fontSize: 54, color: C.charcoal, lineHeight: 60, letterSpacing: -2 },
  tempSky:       { fontFamily: F.sys, fontSize: 14, color: C.charcoal, marginTop: 4 },
  tempSub:       { fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 4 },
  // 4-grid
  gridWrap:      { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.hairline },
  gridCell:      { width: '50%', backgroundColor: C.bgPrimary, paddingVertical: 14, paddingHorizontal: 16 },
  gridLabel:     { fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginBottom: 4 },
  gridValue:     { fontFamily: F.sys, fontSize: 17, color: C.charcoal, fontWeight: '500' },
  gridSubOK:     { fontFamily: F.sys, fontSize: 11, color: C.burgundy, marginTop: 2 },
  gridSubWarn:   { fontFamily: F.sys, fontSize: 11, color: '#C9A84C', marginTop: 2 },
  // 24h chart
  chartCard:     { backgroundColor: C.bgPrimary, marginTop: 8, paddingHorizontal: 20, paddingVertical: 16 },
  cardLabel:     { fontFamily: F.sys, fontSize: 11, color: C.warmGray, letterSpacing: 1, marginBottom: 12 },
  barRow:        { flexDirection: 'row', alignItems: 'flex-end', height: 120 },
  barCol:        { alignItems: 'center', width: 32 },
  barTemp:       { fontFamily: F.en, fontSize: 10, color: C.charcoal, marginBottom: 4 },
  bar:           { width: 16, borderRadius: 4 },
  barHour:       { fontFamily: F.sys, fontSize: 9, color: C.warmGray, marginTop: 4 },
  // Golf index
  gIdxCard:      { backgroundColor: '#fff', marginTop: 8, paddingHorizontal: 20, paddingVertical: 18, borderTopWidth: 0.5, borderTopColor: C.hairline },
  gIdxBig:       { fontFamily: F.en, fontSize: 28, color: C.charcoal, fontStyle: 'italic', marginBottom: 2 },
  gIdxScore:     { fontFamily: F.sys, fontSize: 13, color: C.warmGray, marginBottom: 10 },
  gIdxBar:       { height: 8, borderRadius: 4, backgroundColor: C.hairline, overflow: 'hidden', marginBottom: 14 },
  gIdxBarFill:   { height: '100%', backgroundColor: C.burgundy, borderRadius: 4 },
  badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge:         { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  badgeTxt:      { fontFamily: F.sys, fontSize: 12, fontWeight: '500' },
  // Forecast
  fcCard:        { backgroundColor: '#fff', marginTop: 8, paddingHorizontal: 20, paddingVertical: 16 },
  fcRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  fcRowBorder:   { borderBottomWidth: 0.5, borderBottomColor: '#F0EAD8' },
  fcRowRound:    { backgroundColor: '#FDF5F5', borderLeftWidth: 3, borderLeftColor: C.burgundy, paddingHorizontal: 10, marginHorizontal: -4 },
  fcDay:         { fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '500' },
  fcDate:        { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 1 },
  fcIcon:        { fontSize: 22, width: 32, textAlign: 'center' },
  fcSky:         { fontFamily: F.sys, fontSize: 13, color: C.charcoal },
  fcSkyRound:    { color: C.burgundy, fontWeight: '700' },
  fcSub:         { fontFamily: F.sys, fontSize: 10, color: C.textSecondary, marginTop: 2 },
  fcTemp:        { fontFamily: F.en, fontSize: 14, color: C.warmGrayLight },
  roundBadge:    { marginLeft: 6, backgroundColor: C.burgundy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  roundBadgeTxt: { fontFamily: F.sys, fontSize: 10, color: C.butter, fontWeight: '600' },
  // KMA button
  kmaBtn:        { marginTop: 12, marginHorizontal: 20, marginBottom: 12, backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy, borderRadius: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  kmaBtnTxt:     { fontFamily: F.sys, fontSize: 13, color: C.burgundy, fontWeight: '500' },
});
