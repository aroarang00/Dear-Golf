import { StyleSheet } from 'react-native';
import { C, F } from '../constants/colors';

export const myS = StyleSheet.create({
  mask:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: C.bgPrimary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' },
  handle:       { width: 32, height: 3, backgroundColor: C.hairline, borderRadius: 2, alignSelf: 'center', margin: 12 },
  profileArea:  { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 16 },
  avatar:       { width: 56, height: 56, borderRadius: 28, backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.butter },
  avatarTxt:    { fontFamily: F.en, fontSize: 24, color: '#fff', fontStyle: 'italic' },
  nickname:     { fontFamily: F.en, fontSize: 20, color: C.charcoal, fontStyle: 'italic' },
  realName:     { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 },
  nickInput:    { fontFamily: F.en, fontSize: 20, color: C.charcoal, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2 },
  section:      { paddingHorizontal: 20, paddingVertical: 14 },
  sectionLabel: { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 2, marginBottom: 12 },
  statsRow:     { flexDirection: 'row', gap: 8 },
  statBox:      { flex: 1, backgroundColor: C.bgSecondary, borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: C.hairline },
  statVal:      { fontFamily: F.en, fontSize: 22, color: C.charcoal, lineHeight: 26 },
  statLabel:    { fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 },
  divider:      { height: 0.5, backgroundColor: C.hairline, marginHorizontal: 20 },
  menuRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: C.hairline },
  menuIcon:     { fontSize: 18, width: 32 },
  menuLabel:    { fontFamily: F.sys, fontSize: 13, color: C.textPrimary, flex: 1 },
  menuValue:    { fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight },
});
