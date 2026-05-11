import { StyleSheet } from 'react-native';
import { C, F } from '../constants/colors';

export const tabS = StyleSheet.create({
  bar:              { backgroundColor: C.bgPrimary, borderTopWidth: 0.5, borderTopColor: C.hairline, paddingBottom: 28 },
  stripeRow:        { flexDirection: 'row', height: 8, alignItems: 'flex-start' },
  stripeSegment:    { flex: 1, height: 2, opacity: 0.35 },
  stripeSegmentOn:  { opacity: 1, height: 8 },
  tabRow:           { flexDirection: 'row', paddingTop: 12, paddingBottom: 4 },
  tab:              { flex: 1, alignItems: 'center', paddingVertical: 6 },
  label:            { fontFamily: F.sys, fontSize: 15, marginTop: 2 },
  labelOn:          { color: C.charcoal, fontWeight: '700' },
  labelOff:         { color: C.warmGrayLight, fontWeight: '400' },
});
