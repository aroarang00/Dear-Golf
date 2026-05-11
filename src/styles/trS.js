import { StyleSheet } from 'react-native';
import { C, F } from '../constants/colors';

export const trS = StyleSheet.create({
  // Cream section (header → route card)
  creamSection: { backgroundColor: '#FAF6EC', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
  trCourse:     { fontFamily: F.sys, fontSize: 20, color: '#3D3935', fontWeight: '700', marginBottom: 4 },
  trDate:       { fontFamily: F.sys, fontSize: 13, color: '#8B8680', marginBottom: 16 },
  // 추천 출발 박스 (charcoal 카드)
  recoBox:      { backgroundColor: '#3D3935', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, marginBottom: 16 },
  recoLabel:    { fontFamily: F.sys, fontSize: 9, color: 'rgba(245,230,168,0.55)', letterSpacing: 2, marginBottom: 4 },
  recoTime:     { fontFamily: F.en, fontSize: 44, color: '#F5E6A8', letterSpacing: -1, lineHeight: 48 },
  recoSub:      { fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  // 출발시간 테이블 (흰 카드)
  tblCard:      { backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: '#E8E2D0', overflow: 'hidden', marginBottom: 16 },
  tblHdr:       { flexDirection: 'row', backgroundColor: '#F5F3EE', paddingVertical: 9, paddingHorizontal: 14 },
  tblHdrCell:   { fontFamily: F.sys, fontSize: 12, color: '#8B8680', fontWeight: '600', letterSpacing: 0.5 },
  tblRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: '#F0EAD8' },
  tblTime:      { fontFamily: F.en, fontSize: 14, color: '#3D3935' },
  tblDur:       { fontFamily: F.sys, fontSize: 12, color: '#3D3935' },
  congBadge:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  congBadgeTxt: { fontFamily: F.sys, fontSize: 11, fontWeight: '500' },
  recoTagBadge: { backgroundColor: '#3D3935', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  recoTagTxt:   { fontFamily: F.sys, fontSize: 11, color: '#F5E6A8', fontWeight: '500' },
  // 골프장 이동경로 카드 (흰 카드)
  routeCard:    { backgroundColor: '#fff', borderRadius: 12, borderWidth: 0.5, borderColor: '#E8E2D0', padding: 14 },
  routeFlow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  routeOrigin:  { fontFamily: F.sys, fontSize: 13, color: '#8B8680' },
  routeArrow:   { fontFamily: F.sys, fontSize: 14, color: '#B8B3AB', marginHorizontal: 8 },
  routeDest:    { fontFamily: F.sys, fontSize: 14, color: '#3D3935', fontWeight: '700', flex: 1 },
  routeMidTxt:  { fontFamily: F.sys, fontSize: 12, color: '#8B8680', marginBottom: 10 },
  routeBtnRow:  { flexDirection: 'row', gap: 8 },
  routeBtn:     { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  routeBtnTxt:  { fontFamily: F.sys, fontSize: 14, fontWeight: '500' },
  // 대리운전 + 공유 섹션 (크림)
  charcoalSection:{ backgroundColor: '#FAF6EC', paddingHorizontal: 18, paddingVertical: 16 },
  darkLabel:    { fontFamily: F.sys, fontSize: 13, color: '#3D3935', letterSpacing: 0.5, marginBottom: 10 },
  daeriRow:     { flexDirection: 'row', gap: 8 },
  daeriBtn:     { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daeriBtnTxt:  { fontFamily: F.sys, fontSize: 13, fontWeight: '500' },
  shareBtn:     { backgroundColor: '#6B1E2A', height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  shareBtnTxt:  { fontFamily: F.sys, fontSize: 14, color: '#F5E6A8', fontWeight: '700' },
});
