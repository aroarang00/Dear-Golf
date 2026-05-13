import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F } from '../constants/colors';
import { searchGolfCourses } from '../utils/kakao';
import { addUserCourse, findUserCourseById, updateUserCourse } from '../utils/userCourses';
import { mS } from '../styles/mS';

export function ScheduleModal({ visible, onClose, onSave, initial }) {
  const isEdit = !!initial;
  const [courseSearch, setCourseSearch] = useState('');
  const [selected, setSelected] = useState(null); // { id, name, loc, x, y, kakaoId } — USER_COURSES 항목
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [members, setMembers] = useState('4');
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const debounceRef = useRef(null);

  const DAYS = ['일','월','화','수','목','금','토'];
  const formatDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const formatDay = (d) => DAYS[d.getDay()];
  const formatTime = (t) => `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;

  useEffect(() => {
    if (visible && initial) {
      setCourseSearch(initial.course || '');
      // 기존 일정에 courseId가 있으면 USER_COURSES에서 로드
      if (initial.courseId) {
        findUserCourseById(initial.courseId).then(c => {
          if (c) setSelected(c);
        });
      } else {
        setSelected(null);
      }
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
    if (!visible) {
      setSearchResults([]);
      setEditingName(false);
    }
  }, [visible, initial]);

  // 검색어 debounce (300ms) → 카카오 API 호출
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // 골프장이 이미 선택된 상태에서 input 텍스트가 같으면 검색 안 함
    if (!courseSearch || (selected && courseSearch === selected.name)) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchGolfCourses(courseSearch);
      setSearchResults(results);
      setSearching(false);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [courseSearch, selected]);

  const handleSelectResult = async (r) => {
    // USER_COURSES에 등록 (중복이면 기존 항목 반환)
    const saved = await addUserCourse({
      name: r.name, loc: r.loc, x: r.x, y: r.y, kakaoId: r.kakaoId,
    });
    setSelected(saved);
    setCourseSearch(saved.name);
    setSearchResults([]);
  };

  const handleRenameSave = async () => {
    const trimmed = (editName || '').trim();
    if (!trimmed || !selected) { setEditingName(false); return; }
    const updated = await updateUserCourse(selected.id, { name: trimmed });
    if (updated) {
      setSelected(updated);
      setCourseSearch(updated.name);
    }
    setEditingName(false);
  };

  const reset = () => {
    setCourseSearch(''); setSelected(null); setSearchResults([]);
    setDate(new Date()); setTime(new Date()); setMembers('4');
    setEditingName(false); setEditName('');
  };

  const handleSave = () => {
    const finalCourse = selected ? selected.name : courseSearch.trim();
    if (!finalCourse) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const dDay = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    const payload = {
      course: finalCourse,
      courseId: selected ? selected.id : null,
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
            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={mS.title}>{isEdit ? '예정 라운딩 수정' : '예정 라운딩 추가'}</Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
                <Text style={[mS.label, { marginTop: 0, marginBottom: 0 }]}>골프장</Text>
                {selected && !editingName && (
                  <TouchableOpacity onPress={() => { setEditName(selected.name); setEditingName(true); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>이름 수정</Text>
                  </TouchableOpacity>
                )}
              </View>

              {editingName ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TextInput
                    style={[mS.input, { flex: 1 }]}
                    value={editName} onChangeText={setEditName}
                    placeholder="골프장 이름" placeholderTextColor={C.warmGrayLight}
                    autoFocus />
                  <TouchableOpacity onPress={handleRenameSave}
                    style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: 13 }}>저장</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingName(false)}
                    style={{ borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 0.5, borderColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sys, color: C.warmGray, fontSize: 13 }}>취소</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TextInput style={mS.input} placeholder="카카오 검색으로 골프장 찾기..."
                  placeholderTextColor={C.warmGrayLight} value={courseSearch}
                  autoCorrect={false} autoCapitalize="none"
                  onChangeText={t => { setCourseSearch(t); setSelected(null); }} />
              )}

              {selected && !editingName && (
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>
                  📍 {selected.loc || '주소 정보 없음'}
                </Text>
              )}

              {searching && (
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 6 }}>검색 중...</Text>
              )}

              {!searching && searchResults.length > 0 && (
                <View style={mS.searchDrop}>
                  {searchResults.map(r => (
                    <TouchableOpacity key={r.kakaoId} style={mS.searchItem}
                      onPress={() => handleSelectResult(r)}>
                      <Text style={mS.searchName}>{r.name}</Text>
                      <Text style={mS.searchLoc}>{r.loc}</Text>
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
