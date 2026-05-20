// 매너 등급 이모지 뱃지 — 점수(0~100)는 내부 데이터로만 유지하고
// UI에는 등급 이모지(😊/🙂/😐/⚠️/🚫)만 노출.
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { getMannerGrade } from '../../constants/mannerGrade';

export function MannerBadge({ score, size = 14, onPress }) {
  const g = getMannerGrade(score);
  if (!g) return null;
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
        <Text style={{ fontSize: size }}>{g.emoji}</Text>
      </TouchableOpacity>
    );
  }
  return <Text style={{ fontSize: size }}>{g.emoji}</Text>;
}
