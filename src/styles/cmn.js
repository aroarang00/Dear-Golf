import { StyleSheet } from 'react-native';
import { C, F } from '../constants/colors';

export const cmn = StyleSheet.create({
  hdr: {
    backgroundColor: C.bgPrimary,
    paddingHorizontal: 20, paddingVertical: 13,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 0.5, borderBottomColor: C.hairline,
  },
  hdrSub:   { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 2, marginBottom: 2 },
  hdrTitle: { fontFamily: F.en,  fontSize: 24, color: C.charcoal, fontStyle: 'italic' },
  circleBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.charcoal, alignItems: 'center', justifyContent: 'center' },
  circleBtnIcon: { fontFamily: F.en, fontSize: 18, color: C.charcoal, lineHeight: 22 },
});
