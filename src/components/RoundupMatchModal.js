import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F } from '../constants/colors';
import { mS } from '../styles/mS';
import { REGION_OPTIONS } from '../constants/roundup';

const DAY_OPTIONS = [['weekend', '주말'], ['weekday', '평일'], ['any', '상관없음']];
const REGION_CHIPS = REGION_OPTIONS.filter(([k]) => k !== 'all'); // 구체 지역만

const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const parseDate = (s) => {
  if (!s) return new Date();
  const [y, m, d] = s.split('.').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// 라운지 맞춤 모집 알림 — 관심 지역·요일·특정 날짜 설정 시트
export function RoundupMatchModal({ visible, initial, onClose, onSave }) {
  const [regions, setRegions] = useState([]);
  const [dayType, setDayType] = useState('any');
  const [date, setDate] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setRegions(initial?.regions || []);
      setDayType(initial?.dayType || 'any');
      setDate(initial?.date || null);
      setShowPicker(false);
    }
  }, [visible]);

  const toggleRegion = (k) =>
    setRegions(prev => (prev.includes(k) ? prev.filter(r => r !== k) : [...prev, k]));

  const sectionLabel = { fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, letterSpacing: 1, marginTop: 20, marginBottom: 10 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={mS.sheet}>
          <View style={mS.handle} />
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <Text style={{ fontFamily: F.sys, fontSize: 17, fontWeight: '700', color: C.charcoal }}>맞춤 모집 알림</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, marginTop: 6, lineHeight: 18 }}>
              조건에 맞는 새 모집을 라운지에서 모아 보여드려요.
            </Text>

            {/* 관심 지역 — 다중 선택 */}
            <Text style={sectionLabel}>관심 지역 (여러 곳 선택 가능)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REGION_CHIPS.map(([k, l]) => {
                const on = regions.includes(k);
                return (
                  <TouchableOpacity key={k} onPress={() => toggleRegion(k)} activeOpacity={0.7}
                    style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
                      backgroundColor: on ? C.burgundy : C.bgSecondary,
                      borderWidth: 0.5, borderColor: on ? C.burgundy : C.hairline }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: on ? '700' : '500',
                      color: on ? C.butter : C.warmGray }}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 요일 — 3택 */}
            <Text style={sectionLabel}>요일</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {DAY_OPTIONS.map(([k, l]) => {
                const on = dayType === k;
                return (
                  <TouchableOpacity key={k} onPress={() => setDayType(k)} activeOpacity={0.7}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10,
                      backgroundColor: on ? C.burgundy : C.bgSecondary,
                      borderWidth: 0.5, borderColor: on ? C.burgundy : C.hairline }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: on ? '700' : '500',
                      color: on ? C.butter : C.warmGray }}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 특정 날짜 — 선택 사항 */}
            <Text style={sectionLabel}>특정 날짜 (선택 — 시간 나는 날이 있다면)</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setShowPicker(true)} activeOpacity={0.7}
                style={{ flex: 1, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10,
                  backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: date ? C.charcoal : C.warmGrayLight }}>
                  {date || '날짜 선택 안 함'}
                </Text>
              </TouchableOpacity>
              {date && (
                <TouchableOpacity onPress={() => setDate(null)} activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>지우기</Text>
                </TouchableOpacity>
              )}
            </View>
            {showPicker && (
              <DateTimePicker
                value={parseDate(date)}
                mode="date"
                minimumDate={new Date()}
                onChange={(e, d) => {
                  setShowPicker(Platform.OS === 'ios');
                  if (e.type === 'set' && d) setDate(fmtDate(d));
                }}
              />
            )}

            {/* 저장 */}
            <TouchableOpacity onPress={() => { onSave({ regions, dayType, date }); onClose(); }} activeOpacity={0.85}
              style={{ marginTop: 24, backgroundColor: C.burgundy, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.butter, fontWeight: '700' }}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
