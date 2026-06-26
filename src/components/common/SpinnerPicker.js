import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F, fs } from '../../constants/colors';

// @react-native-community/datetimepicker 'spinner' 플랫폼 차이 흡수 — 공용.
//   ★기존 버그: onChange에서 매 변경마다 picker를 닫아(setShow(false)), iOS 인라인 스피너가 한 칸만 굴리면
//     바로 닫혀 스크롤이 사실상 안 됐다(테스터 '날짜 스크롤 안 됨' 2026-06-26).
//   ▸ iOS: 인라인 스피너 유지 — onChange는 값만 갱신(닫지 않음) + 아래 '완료' 버튼으로 닫는다.
//   ▸ Android: 네이티브 다이얼로그라 onChange가 확정/취소 시 1회 발화 → 그 때 닫고 값 반영(dismissed면 값 X).
//   onPick(date): 선택된 Date를 호출부가 받아 자기 로직(setDate/clamp/시·분 분해 등)을 수행.
export function SpinnerPicker({ visible, value, mode = 'date', onPick, onClose, minimumDate, maximumDate, is24Hour }) {
  if (!visible) return null;
  const base = { value, mode, display: 'spinner', minimumDate, maximumDate, is24Hour, locale: 'ko' };
  if (Platform.OS === 'android') {
    return (
      <DateTimePicker {...base}
        onChange={(e, d) => { onClose && onClose(); if (e?.type !== 'dismissed' && d) onPick && onPick(d); }} />
    );
  }
  return (
    <View>
      <DateTimePicker {...base} onChange={(e, d) => { if (d) onPick && onPick(d); }} />
      <TouchableOpacity onPress={onClose} activeOpacity={0.85}
        style={{ alignSelf: 'center', marginTop: 2, marginBottom: 8, paddingHorizontal: 30, paddingVertical: 9,
          borderRadius: 10, backgroundColor: C.charcoal }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>완료</Text>
      </TouchableOpacity>
    </View>
  );
}
