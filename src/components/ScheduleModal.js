import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F } from '../constants/colors';
import { GOLF_DB } from '../constants/data';
import { mS } from '../styles/mS';

export function ScheduleModal({ visible, onClose, onSave, initial }) {
  const isEdit = !!initial;
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [members, setMembers] = useState('4');

  const DAYS = ['일','월','화','수','목','금','토'];
  const formatDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const formatDay = (d) => DAYS[d.getDay()];
  const formatTime = (t) => `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;

  useEffect(() => {
    if (visible && initial) {
      setCourseSearch(initial.course || '');
      setSelectedCourse(initial.course || '');
      const dParts = (initial.date || '').split('.').map(Number);
      if (dParts.length === 3 && !isNaN(dParts[0])) {
        setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
      }
      const tParts = (initial.time || '').split(':').map(Number);
      if (tParts.length === 2 && !isNaN(tParts[0])) {
        const t = new Date(); t.setHours(tParts[0], tParts[1], 0, 0);
        setTime(t);
      }
      setMembers(String(initial.members || '4'));
    }
  }, [visible, initial]);

  const searchResults = courseSearch.length > 0 && courseSearch !== selectedCourse
    ? GOLF_DB.filter(g => g.name.includes(courseSearch) || g.loc.includes(courseSearch)).slice(0, 5)
    : [];

  const reset = () => {
    setCourseSearch(''); setSelectedCourse('');
    setDate(new Date()); setTime(new Date()); setMembers('4');
  };

  const handleSave = () => {
    const finalCourse = selectedCourse || courseSearch.trim();
    if (!finalCourse) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const dDay = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    const payload = {
      course: finalCourse,
      date: formatDate(date),
      day: formatDay(date),
      time: formatTime(time),
      members: parseInt(members) || 4,
      dDay: Math.max(0, dDay),
    };
    if (isEdit) {
      onSave('schedule-edit', { id: initial.id, ...payload });
    } else {
      onSave('schedule', payload);
    }
    reset(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={mS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={mS.sheet}>
            <View style={mS.handle} />
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={mS.title}>{isEdit ? '예정 라운딩 수정' : '예정 라운딩 추가'}</Text>
              <Text style={mS.label}>골프장</Text>
              <TextInput style={mS.input} placeholder="골프장 이름 검색..."
                placeholderTextColor={C.warmGrayLight} value={courseSearch}
                onChangeText={t => { setCourseSearch(t); setSelectedCourse(''); }} />
              {searchResults.length > 0 && (
                <View style={mS.searchDrop}>
                  {searchResults.map(g => (
                    <TouchableOpacity key={g.id} style={mS.searchItem}
                      onPress={() => { setSelectedCourse(g.name); setCourseSearch(g.name); }}>
                      <Text style={mS.searchName}>{g.name}</Text>
                      <Text style={mS.searchLoc}>{g.loc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={mS.label}>날짜</Text>
              <TouchableOpacity style={mS.input} onPress={() => setShowDatePicker(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}>
                  {formatDate(date)} ({formatDay(date)})
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker value={date} mode="date" display="spinner"
                  onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                  minimumDate={new Date()} locale="ko" />
              )}
              <Text style={mS.label}>티오프 시간</Text>
              <TouchableOpacity style={mS.input} onPress={() => setShowTimePicker(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}>{formatTime(time)}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker value={time} mode="time" display="spinner" is24Hour
                  onChange={(e, t) => { setShowTimePicker(false); if (t) setTime(t); }} />
              )}
              <Text style={mS.label}>인원</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['2','3','4'].map(n => (
                  <TouchableOpacity key={n} style={[mS.chip, members === n && mS.chipOn]} onPress={() => setMembers(n)}>
                    <Text style={[mS.chipTxt, members === n && mS.chipTxtOn]}>{n}명</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={mS.saveBtn} onPress={handleSave}>
                <Text style={mS.saveBtnTxt}>{isEdit ? '수정 완료' : '저장하기'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
