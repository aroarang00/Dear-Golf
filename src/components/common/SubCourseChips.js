import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../../constants/colors';

// 세부코스 선택 칩 — 구장 마스터에 시드된 세부코스 라벨(동/서/레이크 등)을 칩으로 제시. 탭하면 입력값 채움.
//   options가 비면 아무것도 안 그림(=기존 자유입력 그대로, 무위험). 현재 값과 같은 칩은 강조, 다시 탭하면 해제.
//   data는 관리자 시드(golfCourses.subCourses)에서 옴 — 시드 전엔 [] → 칩 미표시. ([[course-subcourse-plan]])
export function SubCourseChips({ options, value, onPick }) {
  const list = Array.isArray(options) ? options.filter(Boolean) : [];
  if (!list.length) return null;
  const cur = (value || '').trim();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {list.map((opt) => {
        const on = cur === opt;
        return (
          <TouchableOpacity key={opt} onPress={() => onPick(on ? '' : opt)} activeOpacity={0.8}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
              backgroundColor: on ? C.navy : C.bgSecondary, borderWidth: on ? 0 : 1, borderColor: C.hairline }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: on ? '#fff' : C.charcoal }}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
