import { StyleSheet } from 'react-native';
import { C, F } from '../constants/colors';

export const tabS = StyleSheet.create({
  bar:              { backgroundColor: C.bgPrimary, borderTopWidth: 0.5, borderTopColor: C.hairline },
  stripeRow:        { flexDirection: 'row', height: 8, alignItems: 'flex-start' },
  stripeSegment:    { flex: 1, height: 2, opacity: 0.35 },
  stripeSegmentOn:  { opacity: 1, height: 8 },
  tabRow:           { flexDirection: 'row', paddingTop: 12, paddingBottom: 4 },
  tab:              { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  label:            { fontFamily: F.sys, marginTop: 2 },
  labelOn:          { fontSize: 16, fontWeight: '600', color: C.charcoal },
  labelOff:         { fontSize: 13, fontWeight: '400', color: C.charcoal, opacity: 0.5 },
});
