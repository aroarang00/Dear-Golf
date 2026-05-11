import React from 'react';
import { View, Text } from 'react-native';
import { cmn } from '../../styles/cmn';

export const LightHeader = ({ sub, title, right }) => (
  <View style={cmn.hdr}>
    <View>
      <Text style={cmn.hdrSub}>{sub}</Text>
      <Text style={cmn.hdrTitle}>{title}</Text>
    </View>
    {right}
  </View>
);
