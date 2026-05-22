import { StyleSheet } from 'react-native';
import { C, F, fs } from '../constants/colors';

export const obS = StyleSheet.create({
  stepLabel:  { fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight, letterSpacing: 2, marginBottom: 20 },
  label:      { fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight, letterSpacing: 1.5, marginTop: 16, marginBottom: 6 },
  input:      { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontFamily: F.sys, fontSize: fs(16), color: C.textPrimary },
  nextBtn:    { flex: 1, backgroundColor: C.charcoal, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 28 },
  nextBtnTxt: { fontFamily: F.sys, fontSize: fs(15), color: C.butter, letterSpacing: 1 },
});
