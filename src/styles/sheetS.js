import { StyleSheet } from 'react-native';
import { C, F, fs } from '../constants/colors';

export const sheetS = StyleSheet.create({
  mask:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 20 },
  handle:      { width: 36, height: 4, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  course:      { fontFamily: F.sysSb, fontSize: fs(17), color: C.charcoal },
  courseArrow: { fontSize: fs(14), color: C.warmGrayLight, fontWeight: '400' },
  meta:        { fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: 6 },
  dday:        { fontFamily: F.en, fontSize: fs(38), color: C.burgundy, letterSpacing: -0.5, lineHeight: 40 },
  ddayLabel:   { fontFamily: F.sys, fontSize: fs(13), color: C.charcoal },
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 22, gap: 14 },
  rowBorder:   { borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  rowEmoji:    { fontSize: fs(18), width: 22, textAlign: 'center' },
  rowText:     { fontFamily: F.sys, fontSize: fs(15), color: C.charcoal },
  rowDanger:   { color: '#D32F2F' },
});
