import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { F } from '../constants/colors';

export function WeatherMiniBar({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 }}>
      <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#fff' }}>☀️ 18° 맑음</Text>
    </TouchableOpacity>
  );
}
