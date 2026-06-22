import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform, ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { mS } from '../styles/mS';
import { TEE_DAYTYPES, TEE_PARTS, TEE_PART_HINT } from '../constants/roundup';

const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const parseDate = (s) => {
  if (!s) return new Date();
  const [y, m, d] = s.split('.').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// 라운지 맞춤 모집 알림 — 시간대(주중/주말×1·2·3부)·특정 기간 설정 시트 ([[roundup-friend-redesign]]).
// 친구모집 전환으로 지역·동반자 조건은 폐기. 차별 축은 "언제 라운딩이냐"(시간대).
export function RoundupMatchModal({ visible, initial, onClose, onSave }) {
  const insets = useSafeAreaInsets();
  const [slots, setSlots] = useState([]);   // ['weekday-1','weekend-3' ...]
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [showPicker, setShowPicker] = useState(null); // null | 'from' | 'to'

  useEffect(() => {
    if (visible) {
      // 처음 열 때 아무것도 안 골라져 있으면 '선택해야 하는지' 모를 수 있어 기본 1개(주말 1부) 선택해 보여줌.
      // 저장 전엔 영향 없고, 원하면 해제 가능.
      setSlots(initial?.slots?.length ? initial.slots : ['weekend-1']);
      setDateFrom(initial?.dateFrom || null);
      setDateTo(initial?.dateTo || null);
      setShowPicker(null);
    }
  }, [visible]);

  const toggleSlot = (key) =>
    setSlots(prev => (prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]));

  const sectionLabel = { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, letterSpacing: 1, marginTop: 20, marginBottom: 10 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={mS.handle} />
          {/* 확대·날짜피커 표시 시 내용이 시트(92%)를 넘쳐 저장 버튼 잘리던 것 방지 — 스크롤 */}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }}>맞춤 모집 알림</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, lineHeight: 18 }}>
              조건에 맞는 새 모집을 라운지에서 모아 보여드려요.
            </Text>

            {/* 시간대 — 주중/주말 × 1·2·3부 (선택 안 하면 시간대 무관) */}
            <Text style={sectionLabel}>시간대 (여러 개 선택 가능)</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginBottom: 10, lineHeight: 16 }}>
              1부 {TEE_PART_HINT['1']} · 2부 {TEE_PART_HINT['2']} · 3부 {TEE_PART_HINT['3']}
            </Text>
            {TEE_DAYTYPES.map(([dk, dl]) => (
              <View key={dk} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ width: 40, fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{dl}</Text>
                {TEE_PARTS.map(([pk, pl]) => {
                  const key = `${dk}-${pk}`;
                  const on = slots.includes(key);
                  return (
                    <TouchableOpacity key={pk} onPress={() => toggleSlot(key)} activeOpacity={0.7}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10,
                        backgroundColor: on ? C.burgundy : C.bgSecondary,
                        borderWidth: 0.5, borderColor: on ? C.burgundy : C.hairline }}>
                      <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(13),
                        color: on ? C.butter : C.warmGray }}>{pl}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* 특정 기간 — 선택 사항 (시작~끝) */}
            <Text style={sectionLabel}>특정 기간 (선택 — 시간 나는 날이 있다면)</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setShowPicker('from')} activeOpacity={0.7}
                style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10,
                  backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: dateFrom ? C.charcoal : C.warmGrayLight }}>
                  {dateFrom || '시작 날짜'}
                </Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>~</Text>
              <TouchableOpacity onPress={() => setShowPicker('to')} activeOpacity={0.7}
                style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10,
                  backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: dateTo ? C.charcoal : C.warmGrayLight }}>
                  {dateTo || '끝 날짜'}
                </Text>
              </TouchableOpacity>
              {(dateFrom || dateTo) && (
                <TouchableOpacity onPress={() => { setDateFrom(null); setDateTo(null); }} activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ paddingHorizontal: 6, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>지우기</Text>
                </TouchableOpacity>
              )}
            </View>
            {showPicker && (
              <DateTimePicker
                value={parseDate(showPicker === 'from' ? dateFrom : dateTo)}
                mode="date"
                display="spinner"
                locale="ko"
                minimumDate={showPicker === 'to' && dateFrom ? parseDate(dateFrom) : new Date()}
                onChange={(e, d) => {
                  setShowPicker(Platform.OS === 'ios' ? showPicker : null);
                  if (e.type === 'set' && d) {
                    const v = fmtDate(d);
                    if (showPicker === 'from') {
                      setDateFrom(v);
                      if (dateTo && v > dateTo) setDateTo(v); // 시작이 끝보다 늦으면 끝도 맞춤
                    } else {
                      setDateTo(v);
                    }
                  }
                }}
              />
            )}

            {/* 저장 */}
            <TouchableOpacity onPress={() => { onSave({ slots, dateFrom, dateTo }); onClose(); }} activeOpacity={0.85}
              style={{ marginTop: 24, backgroundColor: C.burgundy, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>저장</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
