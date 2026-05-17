import React from 'react';
import { View } from 'react-native';
import { C } from '../../constants/colors';

export const TripleStripe = ({ height = 2, style }) => (
  <View style={[{ flexDirection: 'row', height }, style]}>
    <View style={{ flex: 1, backgroundColor: C.butter }} />
    <View style={{ flex: 1, backgroundColor: C.paleSky }} />
    <View style={{ flex: 1, backgroundColor: C.burgundy }} />
  </View>
);
