import { StyleSheet } from 'react-native';
import { C, F, fs } from '../constants/colors';

export const mS = StyleSheet.create({
  mask:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: 20 },
  handle:      { width: 32, height: 3, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', margin: 12 },
  title:       { fontFamily: F.en, fontSize: fs(20), color: C.charcoal, marginBottom: 4 },
  label:       { fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginTop: 14, marginBottom: 6 },
  input:       { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.sys, fontSize: fs(14), color: C.textPrimary },
  searchDrop:  { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  searchItem:  { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  searchName:  { fontFamily: F.sysSb, fontSize: fs(16), color: C.textPrimary },
  searchLoc:   { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 },
  chip:        { borderWidth: 0.5, borderColor: C.hairline, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.bgSecondary },
  chipOn:      { backgroundColor: C.charcoal, borderColor: C.charcoal },
  chipTxt:     { fontFamily: F.sys, fontSize: fs(12), color: C.warmGray },
  chipTxtOn:   { color: C.butter },
  specialBox:  { backgroundColor: '#F5F0E4', borderRadius: 12, padding: 14, marginTop: 10, borderWidth: 1, borderColor: '#C9A84C44' },
  specialBoxTitle: { fontFamily: F.en, fontSize: fs(14), color: '#8B6914', letterSpacing: 2, marginBottom: 4 },
  saveBtn:     { backgroundColor: C.charcoal, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  saveBtnTxt:  { fontFamily: F.sys, fontSize: fs(15), color: C.butter, letterSpacing: 1 },
  countBtn:    { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.hairline, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgSecondary },
  countBtnTxt: { fontFamily: F.sys, fontSize: fs(20), color: C.charcoal, lineHeight: 24 },
  countVal:    { fontFamily: F.en, fontSize: fs(20), color: C.charcoal, minWidth: 36, textAlign: 'center' },
});
