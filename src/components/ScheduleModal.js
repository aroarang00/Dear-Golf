import React, { useState, useEffect, useRef, useContext } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { OverlayAlert } from './common/OverlayAlert';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F, fs } from '../constants/colors';
import { searchGolfCourses } from '../utils/golfCourses';
import { geocodeCity } from '../utils/openweather';
import { addUserCourse, findUserCourseById, updateUserCourse } from '../utils/userCourses';
import { getRecentCourses, addRecentCourse } from '../utils/recentCourses';
import { loadMyFriendsEnriched } from '../utils/friends';
import { FriendSelectModal } from './FriendSelectModal';
import { mS } from '../styles/mS';
import { WEEKDAYS } from '../constants/data';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserContext } from '../contexts/UserContext';

export function ScheduleModal({ visible, onClose, onSave, initial }) {
  const insets = useSafeAreaInsets();
  const { userProfile } = useContext(UserContext);
  // initial에 id가 있으면 기존 일정 수정, 없으면(날짜만 채워진 경우) 새 일정 추가
  const isEdit = !!(initial && initial.id);
  // 일정 전파(공유) 수정 잠금 — 구장·날짜는 여파가 커 '삭제 후 재생성'으로만(시간·인원·예약자·세부코스는 제자리 수정).
  //   ★일정 전파(groupId)만 해당. 나홀로 일정·라운지 모집은 잠그지 않음(라운지는 애초에 라운지에서만 관리). ([[schedule-propagation-spec]])
  const sharedLock = isEdit && !!(initial && initial.groupId) && !(initial && initial.roundupId);
  const [courseSearch, setCourseSearch] = useState('');
  const [selected, setSelected] = useState(null); // { id, name, loc, x, y, kakaoId } — USER_COURSES 항목
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [date, setDate] = useState(new Date());
  const [hourText, setHourText] = useState('07'); // 티오프 시 (직접입력)
  const [minText, setMinText] = useState('00');   // 티오프 분 (직접입력)
  const [members, setMembers] = useState('4');
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [recentCourses, setRecentCourses] = useState([]); // 최근 검색한 골프장
  const [overlay, setOverlay] = useState(null); // 모달 안 커스텀 알럿(검증 등) — 네이티브 Alert 대신
  const debounceRef = useRef(null);
  // 해외 라운딩 — 국내/해외 + 도시(날씨 조회용)
  const [overseas, setOverseas] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState([]);
  const [citySearching, setCitySearching] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null); // { name, enName, country, lat, lon }
  const cityDebounce = useRef(null);
  // 동반자 — [{ name, friendUid? }]. 친구 목록에서 선택(친구) + 자유 입력(이름). 친구 선택 시 본명 마스킹은 선택 모달에서 표시.
  const [companions, setCompanions] = useState([]);
  const [companionInput, setCompanionInput] = useState('');
  const [friends, setFriends] = useState([]);
  const [showCompanionPicker, setShowCompanionPicker] = useState(false);
  // 예약자 — 프론트 체크인 이름. 자유 입력(법인명·양도·대리예약 등) + 빠른 채우기(나/동반자) ([[schedule-booker]])
  const [booker, setBooker] = useState('');
  // 코스 — 골프장 내 세부코스 라벨(레이크/동→서 등). 구장 매칭과 무관·자유 입력, 공유 카드 표시·기록 자동채움용 ([[schedule-booker]])
  const [subCourse, setSubCourse] = useState('');

  const DAYS = WEEKDAYS;
  const formatDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const formatDay = (d) => DAYS[d.getDay()];
  const pad2 = (n) => String(n).padStart(2, '0');
  const clampNum = (s, max) => {
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : Math.min(Math.max(n, 0), max);
  };
  // 티오프 시간 — 시/분 직접입력값을 정규화한 최종 "HH:MM"
  const resolvedTime = () => `${pad2(clampNum(hourText, 23))}:${pad2(clampNum(minText, 59))}`;

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
        setHourText(pad2(tParts[0]));
        setMinText(pad2(tParts[1]));
      }
      setMembers(String(initial.members || '4'));
      // 옛 데이터 호환 — 문자열 동반자('홍길동')를 {name, friendUid:null}로 정규화.
      //   문자열인 채 두면 c.name이 undefined라 표시·중복제거(onPickFriends freeText)가 깨짐.
      setCompanions(Array.isArray(initial.companions)
        ? initial.companions
            .map(c => (typeof c === 'string' ? { name: c, friendUid: null } : c))
            .filter(c => c && c.name)
        : []);
      setCompanionInput('');
      setBooker(initial.booker || '');
      setSubCourse(initial.subCourse || '');
      setOverseas(!!initial.overseas);
      if (initial.overseas && initial.city) {
        setCityQuery(initial.city);
        setSelectedCity(typeof initial.cityLat === 'number'
          ? { name: initial.city, country: initial.cityCountry || '', lat: initial.cityLat, lon: initial.cityLon }
          : null);
      } else {
        setCityQuery(''); setSelectedCity(null);
      }
    }
    if (!visible) {
      setSearchResults([]);
      setEditingName(false);
    }
  }, [visible, initial]);

  // 일정 등록 화면 열릴 때 — 최근 검색한 골프장 + 친구 목록(동반자 선택용) 로드
  useEffect(() => {
    if (!visible) return;
    getRecentCourses().then(r => setRecentCourses(r || []));
    loadMyFriendsEnriched().then(f => setFriends(f || [])).catch(() => {});
  }, [visible]);

  // 검색어 debounce (300ms) → 카카오 API 호출
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // 골프장이 이미 선택된 상태에서 input 텍스트가 같으면 검색 안 함
    if (overseas || !courseSearch || (selected && courseSearch === selected.name)) {
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
  }, [courseSearch, selected, overseas]);

  // 해외 — 도시명 debounce 지오코딩 (OpenWeather)
  useEffect(() => {
    if (cityDebounce.current) clearTimeout(cityDebounce.current);
    if (!overseas || !cityQuery || (selectedCity && cityQuery === selectedCity.name)) {
      setCityResults([]);
      setCitySearching(false);
      return;
    }
    setCitySearching(true);
    cityDebounce.current = setTimeout(async () => {
      const r = await geocodeCity(cityQuery);
      setCityResults(r);
      setCitySearching(false);
    }, 400);
    return () => cityDebounce.current && clearTimeout(cityDebounce.current);
  }, [cityQuery, overseas, selectedCity]);

  const handleSelectResult = async (r) => {
    // USER_COURSES에 등록 (중복이면 기존 항목 반환)
    const saved = await addUserCourse({
      name: r.name, loc: r.loc, x: r.x, y: r.y, kakaoId: r.kakaoId,
    });
    setSelected(saved);
    setCourseSearch(saved.name);
    setSearchResults([]);
    // 최근 검색 이력에 기록
    addRecentCourse({ name: r.name, loc: r.loc, x: r.x, y: r.y, kakaoId: r.kakaoId })
      .then(list => setRecentCourses(list || []));
  };

  // 최근 검색한 골프장 탭 → 바로 자동 입력
  const handleSelectRecent = async (rc) => {
    const saved = await addUserCourse({
      name: rc.name, loc: rc.loc, x: rc.x, y: rc.y, kakaoId: rc.kakaoId,
    });
    setSelected(saved);
    setCourseSearch(saved.name);
    setSearchResults([]);
    addRecentCourse(rc).then(list => setRecentCourses(list || []));
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
    setDate(new Date()); setHourText('07'); setMinText('00'); setMembers('4');
    setEditingName(false); setEditName('');
    setCompanions([]); setCompanionInput('');
    setBooker(''); setSubCourse('');
    setOverseas(false); setCityQuery(''); setCityResults([]); setCitySearching(false); setSelectedCity(null);
  };

  // 동반자 — 자유 입력 추가(공백·쉼표 여러 명) / 삭제 / 친구 선택 반영
  const addCompanionText = () => {
    const names = companionInput.trim().split(/[\s,]+/).filter(Boolean);
    if (!names.length) return;
    setCompanions(prev => [...prev, ...names.map(name => ({ name }))]);
    setCompanionInput('');
  };
  const removeCompanion = (i) => setCompanions(prev => prev.filter((_, idx) => idx !== i));
  const onPickFriends = ({ selectedUids }) => {
    const fromFriends = (selectedUids || []).map(uid => {
      const fr = friends.find(f => f.id === uid);
      return { name: fr?.name || '친구', friendUid: uid };
    });
    // 자유 입력 중 친구로 고른 사람과 이름이 겹치면 제외(같은 사람 중복 방지)
    const pickedNames = new Set(fromFriends.map(c => c.name));
    const freeText = companions.filter(c => !c.friendUid && !pickedNames.has(c.name));
    setCompanions([...fromFriends, ...freeText]);
  };

  const handleSave = () => {
    const finalCourse = selected ? selected.name : courseSearch.trim();
    if (!finalCourse) {
      setOverlay({ title: '골프장을 입력해주세요', message: '저장하려면 골프장을 먼저 입력하거나 검색해 선택해주세요.' });
      return;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const dDay = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    const payload = {
      course: finalCourse,
      courseId: overseas ? null : (selected ? selected.id : null),
      courseLoc: overseas ? null : (selected?.loc || null), // 코스 주소 동봉 — 지역탭 분류용([[region-classification]])
      // 카카오 식별자도 저장 — 코스 식별이 로컬 userCourses에만 의존하지 않게(타기기·프레시설치에서도 코스 열림).
      //   홈 카드 '코스 가기'가 id 없을 때 이 kakaoId/이름으로 GuideScreen을 연다 ([[course-name-input]]).
      courseKakaoId: overseas ? null : (selected?.kakaoId || null),
      overseas,
      city: overseas ? (selectedCity?.name || cityQuery.trim()) : '',
      cityCountry: overseas ? (selectedCity?.country || '') : '',
      cityLat: overseas ? (selectedCity?.lat ?? null) : null,
      cityLon: overseas ? (selectedCity?.lon ?? null) : null,
      date: formatDate(date),
      day: formatDay(date),
      time: resolvedTime(),
      members: parseInt(members) || 4,
      // 동반자 — 기존 선택 + 입력칸에 남은 이름(추가 미클릭 유실 방지, 공백·쉼표 분리)
      companions: [
        ...companions,
        ...companionInput.trim().split(/[\s,]+/).filter(Boolean).map(name => ({ name })),
      ],
      booker: (booker || '').trim(),  // 예약자(체크인 이름) — 선택 입력
      subCourse: (subCourse || '').trim(), // 코스(세부코스 라벨) — 선택 입력, 구장 매칭과 무관
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
    <Modal visible={visible} transparent animationType="slide"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={() => { reset(); onClose(); }}>
      {/* KeyboardProvider — RN Modal은 별도 네이티브 윈도우라 모달 안 KAS는 자체 Provider 필요 */}
      <KeyboardProvider>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
        <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={mS.handle} />
          {/* flexShrink:1 — 시트 maxHeight(92%)에 맞춰 스크롤뷰가 줄어들어 스크롤 가능해짐 */}
          {/* KeyboardAwareScrollView — 포커스된 입력칸을 키보드 위로 자동 스크롤(iOS·안드 공통).
              안드는 기존 KeyboardAvoidingView(behavior undefined)가 무효라 동반자 입력칸이 가려졌었음. */}
          <KeyboardAwareScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            bottomOffset={24}>
              <Text style={[mS.title, { fontSize: fs(21) }]}>{isEdit ? '예정 라운딩 수정' : '예정 라운딩 추가'}</Text>

              {/* 국내 / 해외 — 전파 일정 잠금 시 비활성(구장 정체성의 일부) */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, opacity: sharedLock ? 0.45 : 1 }}>
                {[['국내', false], ['해외', true]].map(([l, v]) => (
                  <TouchableOpacity key={l} activeOpacity={0.7} disabled={sharedLock}
                    onPress={() => { setOverseas(v); setSearchResults([]); setCityResults([]); }}
                    style={[mS.chip, overseas === v && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                    <Text style={[mS.chipTxt, overseas === v && mS.chipTxtOn]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 전파(공유) 일정 잠금 안내 — 구장·날짜는 삭제 후 재생성으로만 */}
              {sharedLock && (
                <View style={{ marginTop: 12, backgroundColor: 'rgba(122,156,108,0.10)', borderWidth: 0.5, borderColor: 'rgba(122,156,108,0.35)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                    🔒 동반자에게 전파한 일정이라 <Text style={{ fontFamily: F.sysSb }}>구장·날짜는 바꿀 수 없어요</Text>.{'\n'}바꾸려면 일정을 삭제하고 새로 만들어 전파해주세요.{'\n'}(시간·인원·예약자·코스는 수정 가능 — 동반자에게 반영 여부를 물어봐요)
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
                <Text style={[mS.label, { marginTop: 0, marginBottom: 0, fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>골프장</Text>
                {selected && !editingName && !sharedLock && (
                  <TouchableOpacity onPress={() => { setEditName(selected.name); setEditingName(true); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.burgundy }}>이름 수정</Text>
                  </TouchableOpacity>
                )}
              </View>

              {editingName ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <AppTextInput
                    style={[mS.input, { flex: 1 }]}
                    value={editName} onChangeText={setEditName}
                    placeholder="골프장 이름" placeholderTextColor={C.warmGrayLight}
                    autoFocus />
                  <TouchableOpacity onPress={handleRenameSave}
                    style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: fs(13) }}>저장</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingName(false)}
                    style={{ borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 0.5, borderColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sys, color: C.warmGray, fontSize: fs(13) }}>취소</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }, sharedLock && { color: C.warmGray, opacity: 0.7 }]}
                  placeholder={overseas ? '골프장 이름 입력' : '골프장 이름으로 검색...'}
                  placeholderTextColor={C.warmGrayLight} value={courseSearch}
                  editable={!sharedLock}
                  autoCorrect={false} autoCapitalize="none"
                  onChangeText={t => { setCourseSearch(t); setSelected(null); }} />
              )}
              {!overseas && !selected && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                  💡 검색 결과에서 선택하면 날씨·교통이 정확해져요
                </Text>
              )}

              {selected && !editingName && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>
                  📍 {selected.loc || '주소 정보 없음'}
                </Text>
              )}

              {!overseas && searching && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>검색 중...</Text>
              )}

              {!overseas && !searching && searchResults.length > 0 && (
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

              {/* 입력 전 — 최근 검색한 골프장 바로 선택 */}
              {!overseas && !selected && !courseSearch && recentCourses.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginBottom: 6 }}>🕘 최근 검색</Text>
                  <View style={mS.searchDrop}>
                    {recentCourses.slice(0, 3).map((rc, i) => (
                      <TouchableOpacity key={rc.kakaoId || `${rc.name}_${i}`} style={mS.searchItem}
                        onPress={() => handleSelectRecent(rc)}>
                        <Text style={mS.searchName}>{rc.name}</Text>
                        {!!rc.loc && <Text style={mS.searchLoc}>{rc.loc}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {overseas && (
                <>
                  <Text style={[mS.label, { fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>도시 <Text style={{ fontSize: fs(11), fontFamily: F.sys, color: C.warmGray }}>(현지 날씨 조회용)</Text></Text>
                  <AppTextInput style={[mS.input, sharedLock && { color: C.warmGray, opacity: 0.7 }]} placeholder="예: Okinawa / Da Nang / 다낭"
                    placeholderTextColor={C.warmGrayLight} value={cityQuery} editable={!sharedLock}
                    autoCorrect={false} autoCapitalize="none"
                    onChangeText={t => { setCityQuery(t); setSelectedCity(null); }} />
                  {citySearching && (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>도시 검색 중...</Text>
                  )}
                  {!citySearching && cityResults.length > 0 && (
                    <View style={mS.searchDrop}>
                      {cityResults.map((c, i) => (
                        <TouchableOpacity key={`${c.lat}_${c.lon}_${i}`} style={mS.searchItem}
                          onPress={() => { setSelectedCity(c); setCityQuery(c.name); setCityResults([]); }}>
                          <Text style={mS.searchName}>{c.name}{c.enName && c.enName !== c.name ? ` (${c.enName})` : ''}</Text>
                          <Text style={mS.searchLoc}>{[c.state, c.country].filter(Boolean).join(' · ') || '위치'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {selectedCity && (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#3C7D4F', marginTop: 4 }}>
                      ✓ {selectedCity.name} — 현지 날씨를 보여드려요
                    </Text>
                  )}
                </>
              )}

              {/* 코스 (선택) — 골프장 내 세부코스 라벨. 구장 검색·매칭과 무관한 자유 입력. 공유 카드 표시·기록 자동채움 ([[schedule-booker]]) */}
              <Text style={[mS.label, { fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>코스 (선택)</Text>
              <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} value={subCourse} onChangeText={setSubCourse}
                placeholder="예: 레이크코스 / 동→서" placeholderTextColor={C.warmGrayLight} autoCorrect={false} />

              <Text style={[mS.label, { fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>날짜{sharedLock ? ' 🔒' : ''}</Text>
              <TouchableOpacity style={[mS.input, sharedLock && { opacity: 0.6 }]} disabled={sharedLock} onPress={() => setShowDatePicker(true)}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: sharedLock ? C.warmGray : C.textPrimary }}>
                  {formatDate(date)} ({formatDay(date)})
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker value={date} mode="date" display="spinner"
                  onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                  minimumDate={new Date()} locale="ko" />
              )}
              <Text style={[mS.label, { fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>티오프 시간</Text>
              {/* 안드로이드는 숫자 키보드가 입력칸을 가려서 직접입력 제거 — 휠 선택기만.
                  iOS는 키보드 회피가 정상이라 직접입력 + 휠 둘 다 유지. */}
              {Platform.OS === 'android' ? (
                <TouchableOpacity
                  onPress={() => setShowTimePicker(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                    paddingVertical: 12, borderRadius: 10, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(17), color: C.textPrimary }}>
                    {pad2(clampNum(hourText, 23))} : {pad2(clampNum(minText, 59))}
                  </Text>
                  <Text style={{ fontSize: fs(18) }}>🕐</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AppTextInput
                    style={[mS.input, { flex: 1, textAlign: 'center', fontSize: fs(15), fontFamily: F.sysSb }]}
                    value={hourText}
                    onChangeText={(v) => setHourText(v.replace(/[^0-9]/g, '').slice(0, 2))}
                    onBlur={() => setHourText(pad2(clampNum(hourText, 23)))}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="시"
                    placeholderTextColor={C.warmGrayLight}
                  />
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: C.textPrimary }}>:</Text>
                  <AppTextInput
                    style={[mS.input, { flex: 1, textAlign: 'center', fontSize: fs(15), fontFamily: F.sysSb }]}
                    value={minText}
                    onChangeText={(v) => setMinText(v.replace(/[^0-9]/g, '').slice(0, 2))}
                    onBlur={() => setMinText(pad2(clampNum(minText, 59)))}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="분"
                    placeholderTextColor={C.warmGrayLight}
                  />
                  <TouchableOpacity
                    onPress={() => setShowTimePicker(true)}
                    style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                    <Text style={{ fontSize: fs(18) }}>🕐</Text>
                  </TouchableOpacity>
                </View>
              )}
              {showTimePicker && (
                <DateTimePicker
                  value={(() => { const d = new Date(); d.setHours(clampNum(hourText, 23), clampNum(minText, 59), 0, 0); return d; })()}
                  mode="time" display="spinner" is24Hour
                  onChange={(e, t) => {
                    setShowTimePicker(false);
                    if (t) { setHourText(pad2(t.getHours())); setMinText(pad2(t.getMinutes())); }
                  }} />
              )}
              <Text style={[mS.label, { fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>인원</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['2','3','4'].map(n => (
                  <TouchableOpacity key={n} style={[mS.chip, members === n && mS.chipOn]} onPress={() => setMembers(n)}>
                    <Text style={[mS.chipTxt, members === n && mS.chipTxtOn, { fontSize: fs(13) }]}>{n}명</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 동반자 (선택) — 친구에서 선택 + 자유 입력. 친구 선택 화면은 본명 마스킹 표시 ([[realname-policy]]) */}
              <Text style={[mS.label, { fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>동반자 (선택)</Text>
              {companions.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {companions.map((c, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgSecondary,
                      borderWidth: 0.5, borderColor: C.hairline, borderRadius: 14, paddingLeft: 10, paddingRight: 6, paddingVertical: 5 }}>
                      {/* 친구 동반자는 화면에서만 별명으로 표시(저장은 닉네임). 별명 없으면 저장된 이름 ([[friend_groups]]) */}
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal }}>{c.friendUid ? '👤 ' : ''}{c.friendUid ? (friends.find(f => f.id === c.friendUid)?.customName || c.name) : c.name}</Text>
                      <TouchableOpacity onPress={() => removeCompanion(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={{ fontSize: fs(12), color: C.warmGray }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <AppTextInput style={[mS.input, { flex: 1, marginBottom: 0 }]} value={companionInput} onChangeText={setCompanionInput}
                  placeholder="이름 직접 입력" placeholderTextColor={C.warmGrayLight} onSubmitEditing={addCompanionText} returnKeyType="done" blurOnSubmit={false} />
                <TouchableOpacity onPress={addCompanionText} style={{ paddingHorizontal: 14, paddingVertical: 11, backgroundColor: C.charcoal, borderRadius: 10 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>추가</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => setShowCompanionPicker(true)} activeOpacity={0.7}
                style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.burgundy }}>👥 친구에서 선택</Text>
                {friends.length === 0 && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight }}>(친구를 추가하면 골라서 넣을 수 있어요)</Text>
                )}
              </TouchableOpacity>

              {/* 예약자 (선택) — 프론트 체크인 이름. 빠른 채우기(나/동반자) + 자유 입력(법인명·양도·대리예약 등) ([[schedule-booker]]) */}
              <Text style={[mS.label, { fontSize: fs(11), fontFamily: F.sysSb, color: C.warmGray }]}>예약자 (선택)</Text>
              {(() => {
                const chips = [];
                const seenVal = new Set();
                const me = (userProfile?.realName || userProfile?.nickname || '').trim();
                if (me) { chips.push({ label: '나', value: me }); seenVal.add(me); }
                companions.forEach(c => {
                  const val = (c?.name || '').trim();
                  if (!val || seenVal.has(val)) return;
                  seenVal.add(val);
                  const label = c.friendUid ? (friends.find(f => f.id === c.friendUid)?.customName || c.name) : c.name;
                  chips.push({ label, value: val });
                });
                if (!chips.length) return null;
                return (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {chips.map((ch, i) => {
                      const on = booker.trim() === ch.value;
                      return (
                        <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => setBooker(ch.value)}
                          style={[mS.chip, on && mS.chipOn, { paddingHorizontal: 12 }]}>
                          <Text style={[mS.chipTxt, on && mS.chipTxtOn, { fontSize: fs(12) }]}>{ch.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}
              <AppTextInput style={[mS.input, { marginBottom: 0, fontSize: fs(16), fontFamily: F.sysSb }]} value={booker} onChangeText={setBooker}
                placeholder="예약자 이름 (법인명·양도 등도 입력)" placeholderTextColor={C.warmGrayLight} />
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                💡 프론트 체크인 때 보여줄 예약자 이름이에요
              </Text>

              <TouchableOpacity style={mS.saveBtn} onPress={handleSave}>
                <Text style={mS.saveBtnTxt}>{isEdit ? '수정 완료' : '저장하기'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </KeyboardAwareScrollView>
        </View>
        {/* 모달 안 커스텀 알럿(검증 등) — 네이티브 Alert 대신 오버레이 View(모달 위 모달 터치충돌 회피) */}
        <OverlayAlert data={overlay} onClose={() => setOverlay(null)} />
      </View>
      </KeyboardProvider>
      {/* 동반자 친구 선택 — 본명 마스킹 표시, 다중선택 */}
      <FriendSelectModal
        visible={showCompanionPicker}
        mode="companion"
        friends={friends}
        initial={{ selectedUids: companions.filter(c => c.friendUid).map(c => c.friendUid) }}
        onClose={() => setShowCompanionPicker(false)}
        onConfirm={onPickFriends}
      />
    </Modal>
  );
}
