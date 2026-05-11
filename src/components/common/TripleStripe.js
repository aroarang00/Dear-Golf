import React from 'react';
import { View } from 'react-native';
import { C } from '../../constants/colors';

export const TripleStripe = ({ height = 2 }) => (
  <View style={{ flexDirection: 'row', height }}>
    <View style={{ flex: 1, backgroundColor: C.butter }} />
    <View style={{ flex: 1, backgroundColor: C.paleSky }} />
    <View style={{ flex: 1, backgroundColor: C.burgundy }} />
  </View>
);
