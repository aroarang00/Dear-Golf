import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F } from '../constants/colors';
import { searchGolfCourses } from '../utils/kakao';
import { mS } from '../styles/mS';

const SCOPES = [
  ['all', '전체공개'],
  ['friends', '친구공개'],
  ['select', '친구지정'],
];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 라운딩 모집글 작성 — 확정형/오픈형, 코스 검색, 날짜·시간, 인원, 공개범위, 한마디
export function RoundupCreateModal({ visible, onClose, onCreate }) {
  const [type, setType] = useState('fixed');         // fixed | open
  const [courseQuery, setCourseQuery] = useState('');
  const [course, setCourse] = useState(null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(7, 0, 0, 0); return d; });
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [members, setMembers] = useState('4');
  const [scope, setScope] = useState('all');
  const [word, setWord] = useState('');
  const debounceRef = useRef(null);

  const fmtDate = (d) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  const fmtTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // 골프장 검색 debounce (확정형에서만)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (type !== 'fixed' || !courseQuery || (course && courseQuery === course.name)) {
      setResults([]); setSearching(false); return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchGolfCourses(courseQuery);
      setResults(r || []); setSearching(false);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [courseQuery, course, type]);

  const reset = () => {
    setType('fixed'); setCourseQuery(''); setCourse(null); setResults([]); setSearching(false);
    const d = new Date(); d.setHours(7, 0, 0, 0); setDate(d);
    setMembers('4'); setScope('all'); setWord('');
  };
  const close = () => { reset(); onClose(); };

  const handleSubmit = () => {
    const courseName = course?.name || courseQuery.trim();
    if (type === 'fixed' && !courseName) return; // 확정형은 골프장 필수
    onCreate({
      type,
      course: type === 'fixed' ? courseName : null,
      date: type === 'fixed' ? fmtDate(date) : null,
      day: type === 'fixed' ? DAYS[date.getDay()] : null,
      time: type === 'fixed' ? fmtTime(date) : null,
      capacity: parseInt(members, 10) || 4,
      scope,
      word: word.trim(),
    });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={mS.sheet}>
          <View style={mS.handle} />
          <ScrollView style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <Text style={mS.title}>라운딩 모집글 작성</Text>

            {/* 확정형 / 오픈형 */}
            <Text style={mS.label}>모집 형태</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['fixed', '확정형'], ['open', '오픈형']].map(([k, l]) => (
                <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setType(k)}
                  style={[mS.chip, type === k && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                  <Text style={[mS.chipTxt, type === k && mS.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 6 }}>
              {type === 'fixed'
                ? '골프장·날짜·시간을 정해서 모집해요'
                : '날짜·장소는 미정 — 함께 정할 동반자를 먼저 모아요'}
            </Text>

            {type === 'fixed' && (
              <>
                <Text style={mS.label}>골프장</Text>
                <TextInput style={mS.input} placeholder="카카오 검색으로 골프장 찾기..."
                  placeholderTextColor={C.warmGrayLight} value={courseQuery}
                  autoCorrect={false} autoCapitalize="none"
                  onChangeText={t => { setCourseQuery(t); setCourse(null); }} />
                {searching && (
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 6 }}>검색 중...</Text>
                )}
                {!searching && results.length > 0 && (
                  <View style={mS.searchDrop}>
                    {results.map(r => (
                      <TouchableOpacity key={r.kakaoId} style={mS.searchItem}
                        onPress={() => { setCourse(r); setCourseQuery(r.name); setResults([]); }}>
                        <Text style={mS.searchName}>{r.name}</Text>
                        <Text style={mS.searchLoc}>{r.loc}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={mS.label}>날짜</Text>
                <TouchableOpacity style={mS.input} onPress={() => setShowDate(true)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}>
                    {fmtDate(date)} ({DAYS[date.getDay()]})
                  </Text>
                </TouchableOpacity>
                {showDate && (
                  <DateTimePicker value={date} mode="date" display="spinner" minimumDate={new Date()} locale="ko"
                    onChange={(e, d) => {
                      setShowDate(false);
                      if (d) { const nd = new Date(date); nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setDate(nd); }
                    }} />
                )}

                <Text style={mS.label}>티오프 시간</Text>
                <TouchableOpacity style={mS.input} onPress={() => setShowTime(true)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}>{fmtTime(date)}</Text>
                </TouchableOpacity>
                {showTime && (
                  <DateTimePicker value={date} mode="time" display="spinner" is24Hour
                    onChange={(e, t) => {
                      setShowTime(false);
                      if (t) { const nd = new Date(date); nd.setHours(t.getHours(), t.getMinutes(), 0, 0); setDate(nd); }
                    }} />
                )}
              </>
            )}

            <Text style={mS.label}>모집 인원</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['2', '3', '4'].map(n => (
                <TouchableOpacity key={n} style={[mS.chip, members === n && mS.chipOn]} onPress={() => setMembers(n)}>
                  <Text style={[mS.chipTxt, members === n && mS.chipTxtOn]}>{n}명</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={mS.label}>공개 범위</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SCOPES.map(([k, l]) => (
                <TouchableOpacity key={k} style={[mS.chip, scope === k && mS.chipOn, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setScope(k)}>
                  <Text style={[mS.chipTxt, scope === k && mS.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={mS.label}>한마디 <Text style={{ fontSize: 10, color: C.warmGrayLight }}>(선택)</Text></Text>
            <TextInput style={[mS.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline
              placeholder="동반자에게 남길 한마디를 적어주세요" placeholderTextColor={C.warmGrayLight}
              value={word} onChangeText={setWord} maxLength={120} />

            <TouchableOpacity style={mS.saveBtn} onPress={handleSubmit}>
              <Text style={mS.saveBtnTxt}>모집글 등록</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
