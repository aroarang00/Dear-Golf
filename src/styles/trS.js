import { StyleSheet } from 'react-native';
import { C, F } from '../constants/colors';

export const trS = StyleSheet.create({
  // Cream section (header → route card)
  creamSection: { backgroundColor: '#0e1f16', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
  trCourse:     { fontFamily: F.sys, fontSize: 20, color: '#fff', fontWeight: '700', marginBottom: 4 },
  trDate:       { fontFamily: F.sys, fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16 },
  // 추천 출발 박스 (charcoal 카드)
  recoBox:      { backgroundColor: 'rgba(245,230,168,0.15)', borderWidth: 1, borderColor: 'rgba(245,230,168,0.4)', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, marginBottom: 16 },
  recoLabel:    { fontFamily: F.sys, fontSize: 14, color: 'rgba(245,230,168,0.7)', letterSpacing: 2, marginBottom: 4 },
  recoTime:     { fontFamily: F.en, fontSize: 44, color: '#F5E6A8', letterSpacing: -1, lineHeight: 48 },
  recoSub:      { fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8 },
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
  // ── 갈 때/올 때 2-섹션 레이아웃 ──────────────────────────
  // 섹션 간격은 컴팩트하게 — Android는 폰트 줄높이가 커서 콘텐츠가 길어지므로
  twoSection:   { paddingHorizontal: 20, marginBottom: 16 },
  twoLabel:     { fontFamily: F.sys, fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600', letterSpacing: 0.5, marginBottom: 10 },
  // 출발/도착 row
  slotRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  slotKindTxt:  { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.5)', width: 32 },
  slotLocTxt:   { fontFamily: F.sys, fontSize: 14, color: '#fff', flex: 1 },
  slotLocPh:    { fontFamily: F.sys, fontSize: 14, color: 'rgba(255,255,255,0.35)', flex: 1 },
  slotChevTxt:  { fontFamily: F.sys, fontSize: 11, color: 'rgba(245,230,168,0.7)', marginLeft: 8 },
  // 모드 선택 영역
  slotPicker:   { marginTop: -4, marginBottom: 8, paddingHorizontal: 4 },
  pickerRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  pickerPill:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 0.5 },
  pickerPillOff:{ backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.25)' },
  pickerPillOn: { backgroundColor: '#F5E6A8', borderColor: '#F5E6A8' },
  pickerPillTxtOff: { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  pickerPillTxtOn:  { fontFamily: F.sys, fontSize: 12, color: '#3A2000', fontWeight: '600' },
  customInput:  { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontFamily: F.sys, fontSize: 13, color: '#fff' },
  // 예상 종료시간 ± 30분 row
  endTimeRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  endLabel:     { fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  endValue:     { fontFamily: F.en, fontSize: 20, color: '#F5E6A8', fontWeight: '700', marginHorizontal: 14, minWidth: 70, textAlign: 'center' },
  endBtn:       { width: 32, height: 32, borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.5)', alignItems: 'center', justifyContent: 'center' },
  endBtnTxt:    { fontFamily: F.sys, fontSize: 18, color: '#F5E6A8', lineHeight: 20 },
  // 딥링크 버튼
  linkBtnRow:   { flexDirection: 'row', gap: 8, marginTop: 8 },
  linkBtn:      { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  linkBtnTxt:   { fontFamily: F.sys, fontSize: 14, fontWeight: '500' },

  // 대리운전 + 공유 섹션 (크림)
  charcoalSection:{ backgroundColor: '#0e1f16', paddingHorizontal: 18, paddingVertical: 16 },
  darkLabel:    { fontFamily: F.sys, fontSize: 13, color: '#fff', letterSpacing: 0.5, marginBottom: 10 },
  daeriRow:     { flexDirection: 'row', gap: 8 },
  daeriBtn:     { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daeriBtnTxt:  { fontFamily: F.sys, fontSize: 13, fontWeight: '500' },
  shareBtn:     { backgroundColor: '#6B1E2A', height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  shareBtnTxt:  { fontFamily: F.sys, fontSize: 14, color: '#F5E6A8', fontWeight: '700' },
});
