import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { C, F } from '../constants/colors';
import { COURSE_TAGS, COURSE_TAG_COLORS, WEEKDAYS } from '../constants/data';
import { searchGolfCourses } from '../utils/kakao';
import { addUserCourse, findUserCourseById } from '../utils/userCourses';
import { mS } from '../styles/mS';
import { UserContext } from '../contexts/UserContext';
import { persistPhotos, resolvePhotoUri } from '../utils/photoStorage';

const COST_ITEMS = [
  ['green', '그린피'],
  ['caddie', '캐디피'],
  ['cart', '카트피'],
  ['meal', '식사비'],
  ['etc', '기타'],
];

// '더 기록하기' 예시 칩 — 누르면 입력칸에 항목이 삽입돼 글쓰기 시작점이 된다
const GUIDE_CHIPS = ['MVP 샷', '아쉬웠던 홀', '코스·잔디 상태', '동반자 소감', '다음에 기억할 것'];

export function DiaryAddModal({ visible, onClose, onSave, initial, isEdit }) {
  const insets = useSafeAreaInsets();
  const { userProfile } = React.useContext(UserContext);
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedCourseObj, setSelectedCourseObj] = useState(null); // USER_COURSES 항목
  const [kakaoResults, setKakaoResults] = useState([]);
  const [kakaoSearching, setKakaoSearching] = useState(false);
  const debounceRef = useRef(null);
  const detailMemoRef = useRef(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [date, setDate] = useState(new Date());
  const [score, setScore] = useState('');
  const [scoreCardOption, setScoreCardOption] = useState('later');
  const [showCost, setShowCost] = useState(false);
  const [costs, setCosts] = useState({ green: '', caddie: '', cart: '', meal: '', etc: '' });
  const [weather, setWeather] = useState('맑음');
  const [memo, setMemo] = useState('');
  const [birdieCount, setBirdieCount] = useState(0);
  const [privacy, setPrivacy] = useState('friends');
  const [starRating, setStarRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [detailMemo, setDetailMemo] = useState('');
  const [overseas, setOverseas] = useState(false); // 국내/해외 라운딩
  const [country, setCountry] = useState('');      // 해외일 때 국가·지역

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  // 예시 칩 탭 → '더 기록하기' 입력칸에 '라벨: ' 삽입 + 포커스
  const insertGuideChip = (label) => {
    setDetailMemo(prev => {
      const sep = prev && !prev.endsWith('\n') ? '\n' : '';
      const next = `${prev}${sep}${label}: `;
      return next.length <= 1000 ? next : prev;
    });
    detailMemoRef.current?.focus();
  };
  const [special, setSpecial] = useState(null);
  const [specialHole, setSpecialHole] = useState('');
  const [specialPar, setSpecialPar] = useState('3');
  const [specialDist, setSpecialDist] = useState('');
  const [specialBall, setSpecialBall] = useState('');
  const [specialMemo, setSpecialMemo] = useState('');
  const [addPhotos, setAddPhotos] = useState([]);
  const [companions, setCompanions] = useState([]);
  const [companionInput, setCompanionInput] = useState('');

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      const rawItems = result.assets.map(a =>
        a.type === 'video' ? { uri: a.uri, type: 'video' } : a.uri
      );
      // 선택 직후 영구 폴더로 복사 — 앱 업데이트 후에도 사진이 유지되도록
      const items = await persistPhotos(rawItems);
      setAddPhotos(prev => [...prev, ...items]);
    }
  };

  // 동반자 추가 — 공백·쉼표로 여러 명 한 번에 입력 가능 (최대 3명)
  const handleAddCompanions = () => {
    if (companions.length >= 3) return;
    const names = companionInput.trim().split(/[\s,]+/).filter(Boolean);
    if (!names.length) return;
    setCompanions(prev => [...prev, ...names].slice(0, 3));
    setCompanionInput('');
  };

  const DAYS = WEEKDAYS;
  const formatDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const formatDay = (d) => DAYS[d.getDay()];

  // 카카오 API debounce 검색
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (overseas || !courseSearch || courseSearch === selectedCourse) {
      setKakaoResults([]);
      setKakaoSearching(false);
      return;
    }
    setKakaoSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchGolfCourses(courseSearch);
      setKakaoResults(results);
      setKakaoSearching(false);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [courseSearch, selectedCourse, overseas]);

  const handleSelectKakaoResult = async (r) => {
    const saved = await addUserCourse({ name: r.name, loc: r.loc, x: r.x, y: r.y, kakaoId: r.kakaoId });
    setSelectedCourseObj(saved);
    setSelectedCourse(saved.name);
    setCourseSearch(saved.name);
    setKakaoResults([]);
  };

  const handleSelectManual = async () => {
    const name = courseSearch.trim();
    if (!name) return;
    const saved = await addUserCourse({ name, loc: '', x: null, y: null, kakaoId: null });
    setSelectedCourseObj(saved);
    setSelectedCourse(saved.name);
    setKakaoResults([]);
  };

  const reset = () => {
    setCourseSearch(''); setSelectedCourse(''); setSelectedCourseObj(null); setKakaoResults([]);
    setDate(new Date());
    setScore(''); setWeather('맑음'); setMemo(''); setBirdieCount(0);
    setSpecial(null); setSpecialHole(''); setSpecialPar('3');
    setSpecialDist(''); setSpecialBall(''); setSpecialMemo('');
    setScoreCardOption('later');
    setShowCost(false); setCosts({ green: '', caddie: '', cart: '', meal: '', etc: '' });
    setAddPhotos([]);
    setStarRating(0); setSelectedTags([]);
    setDetailMemo('');
    setPrivacy('friends');
    setCompanions([]); setCompanionInput('');
    setOverseas(false); setCountry('');
  };

  useEffect(() => {
    if (!visible) return;
    if (isEdit && initial) {
      setCourseSearch(initial.course || '');
      setSelectedCourse(initial.course || '');
      if (initial.courseId) {
        findUserCourseById(initial.courseId).then(c => { if (c) setSelectedCourseObj(c); });
      }
      const dParts = (initial.date || '').split('.').map(Number);
      if (dParts.length === 3 && dParts.every(Number.isFinite)) {
        setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
      }
      setScore(String(initial.score || ''));
      setWeather(initial.weather || '맑음');
      setMemo(initial.memo || '');
      setDetailMemo(initial.detailMemo || '');
      setBirdieCount(initial.birdieCount || 0);
      setSpecial(initial.special || null);
      setSpecialHole(String(initial.specialHole || ''));
      setSpecialPar(String(initial.specialPar || '3'));
      setSpecialDist(initial.specialDist || '');
      setSpecialBall(initial.specialBall || '');
      setSpecialMemo(initial.specialMemo || '');
      setStarRating(initial.starRating || 0);
      setSelectedTags(initial.tags || []);
      setAddPhotos(initial.photos || []);
      setPrivacy(initial.privacy || 'friends');
      setCompanions(
        (initial.companions || [])
          .filter(c => !c.isMe)
          .map(c => c.name)
      );
      setCompanionInput('');
      setOverseas(!!initial.overseas);
      setCountry(initial.country || '');
      if (initial.cost) {
        setCosts({
          green: initial.cost.green ? String(initial.cost.green) : '',
          caddie: initial.cost.caddie ? String(initial.cost.caddie) : '',
          cart: initial.cost.cart ? String(initial.cost.cart) : '',
          meal: initial.cost.meal ? String(initial.cost.meal) : '',
          etc: initial.cost.etc ? String(initial.cost.etc) : '',
        });
        setShowCost(true);
      }
    } else {
      reset();
      // 일정 캘린더·내 코스기록에서 넘어온 날짜·골프장 미리 채움
      if (initial?.date) {
        const dParts = String(initial.date).split('.').map(Number);
        if (dParts.length === 3 && dParts.every(Number.isFinite)) {
          setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
        }
      }
      if (initial?.course) {
        setCourseSearch(initial.course);
        setSelectedCourse(initial.course);
      }
      if (initial?.courseId) {
        findUserCourseById(initial.courseId).then(c => { if (c) setSelectedCourseObj(c); });
      }
      if (initial?.overseas) { setOverseas(true); setCountry(initial.country || ''); }
    }
  }, [visible, isEdit, initial]);

  const [saveError, setSaveError] = useState('');

  const finalCourseLive = selectedCourse || courseSearch.trim();
  const canSave = !!finalCourseLive && !!score && !isNaN(parseInt(score)) && parseInt(score) > 0 && !!memo.trim();

  const costTotal = COST_ITEMS.reduce((sum, [k]) => sum + (parseInt(costs[k]) || 0), 0);
  const won = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const handleSave = () => {
    const finalCourse = selectedCourse || courseSearch.trim();
    if (!finalCourse) {
      setSaveError('골프장을 입력해주세요');
      return;
    }
    if (!score || isNaN(parseInt(score)) || parseInt(score) <= 0) {
      setSaveError('스코어를 입력해주세요');
      return;
    }
    if (!memo.trim()) {
      setSaveError('한줄 메모를 입력해주세요');
      return;
    }
    setSaveError('');
    const payload = {
      course: finalCourse, date: formatDate(date), day: formatDay(date),
      score: parseInt(score) || 0, weather, memo, birdieCount, privacy,
      special, specialHole: parseInt(specialHole),
      specialPar: parseInt(specialPar) || null,
      specialDist, specialBall, specialMemo,
      photos: addPhotos,
      starRating,
      tags: selectedTags,
      detailMemo,
      cost: costTotal > 0 ? {
        green: parseInt(costs.green) || 0,
        caddie: parseInt(costs.caddie) || 0,
        cart: parseInt(costs.cart) || 0,
        meal: parseInt(costs.meal) || 0,
        etc: parseInt(costs.etc) || 0,
        total: costTotal,
      } : null,
      companions: [
        { name: userProfile.nickname, isMe: true },
        ...companions.map(name => ({ name, isMe: false })),
      ],
      courseId: selectedCourseObj?.id || (initial && initial.courseId) || null,
      overseas,
      country: overseas ? country.trim() : '',
    };
    if (isEdit) {
      onSave('diary-edit', { id: initial.id, ...payload });
    } else {
      onSave('diary', payload);
    }
    reset(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
        <View style={mS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} activeOpacity={0.7}
              style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={mS.handle} />
            </TouchableOpacity>
            <ScrollView style={{ flexShrink: 1, padding: 20, paddingTop: 0 }} showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
              <Text style={mS.title}>{isEdit ? '라운딩 기록 수정' : '라운딩 기록 추가'}</Text>
              {/* 국내 / 해외 */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {[['국내', false], ['해외', true]].map(([l, v]) => (
                  <TouchableOpacity key={l} activeOpacity={0.7}
                    onPress={() => { setOverseas(v); setKakaoResults([]); }}
                    style={[mS.chip, overseas === v && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                    <Text style={[mS.chipTxt, overseas === v && mS.chipTxtOn]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={mS.label}>골프장 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={mS.input}
                placeholder={overseas ? '골프장 이름 입력' : '카카오로 골프장 검색 또는 직접 입력...'}
                placeholderTextColor={C.warmGrayLight} value={courseSearch}
                autoCorrect={false} autoCapitalize="none"
                onChangeText={t => { setCourseSearch(t); setSelectedCourse(''); setSelectedCourseObj(null); }} />
              {!overseas && kakaoSearching && (
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 4 }}>검색 중...</Text>
              )}
              {overseas && (
                <>
                  <Text style={mS.label}>국가 · 지역</Text>
                  <TextInput style={mS.input} placeholder="예: 일본 오키나와 / 베트남 다낭"
                    placeholderTextColor={C.warmGrayLight} value={country} onChangeText={setCountry}
                    autoCorrect={false} />
                </>
              )}
              {!overseas && courseSearch.length > 0 && courseSearch !== selectedCourse && !kakaoSearching && (
                <View style={mS.searchDrop}>
                  {kakaoResults.map(r => (
                    <TouchableOpacity key={r.kakaoId} style={mS.searchItem}
                      onPress={() => handleSelectKakaoResult(r)}>
                      <Text style={mS.searchName}>{r.name}</Text>
                      <Text style={mS.searchLoc}>{r.loc}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[mS.searchItem, { borderBottomWidth: 0, backgroundColor: C.butter + '33' }]}
                    onPress={handleSelectManual}>
                    <Text style={[mS.searchName, { color: C.burgundy }]}>+ "{courseSearch.trim()}" 직접 입력</Text>
                    <Text style={mS.searchLoc}>목록에 없는 골프장도 등록 가능</Text>
                  </TouchableOpacity>
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
                  maximumDate={new Date()} locale="ko" />
              )}
              <Text style={mS.label}>스코어 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={mS.input} placeholder="타수 입력"
                placeholderTextColor={C.warmGrayLight} value={score}
                onChangeText={setScore} keyboardType="numeric" />

              {score !== '' && (
                <View style={{ marginTop: 14 }}>
                  <Text style={mS.label}>스코어카드 등록할까요?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { key: 'photo', label: '사진으로 등록' },
                      { key: 'later', label: '나중에' },
                    ].map(opt => (
                      <TouchableOpacity key={opt.key}
                        style={[mS.chip, scoreCardOption === opt.key && mS.chipOn]}
                        onPress={() => setScoreCardOption(opt.key)}>
                        <Text style={[mS.chipTxt, scoreCardOption === opt.key && mS.chipTxtOn]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {scoreCardOption === 'photo' && (
                    <View style={{ marginTop: 8, padding: 12, backgroundColor: C.paleSky + '22', borderRadius: 10, borderWidth: 0.5, borderColor: C.paleSky + '60' }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, lineHeight: 18 }}>
                        📷 스코어카드를 사진으로 찍으면 홀별 타수를 자동으로 인식하는 기능이에요.{'\n'}아직 준비 중이며 곧 추가될 예정이에요.
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <Text style={mS.label}>한줄 메모 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={mS.input} placeholder="오늘 라운딩은..." placeholderTextColor={C.warmGrayLight}
                value={memo} onChangeText={setMemo} />
              <Text style={mS.label}>
                동반자
                <Text style={{ fontSize: 10, color: '#8B8680' }}> (선택 · 탭하여 삭제)</Text>
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput
                  style={[mS.input, { flex: 1 }]}
                  placeholder="이름 입력 (공백으로 여러 명)"
                  placeholderTextColor={C.warmGrayLight}
                  value={companionInput}
                  onChangeText={setCompanionInput}
                  returnKeyType="done"
                  onSubmitEditing={handleAddCompanions}
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: C.charcoal,
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    justifyContent: 'center',
                  }}
                  onPress={handleAddCompanions}>
                  <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter }}>추가</Text>
                </TouchableOpacity>
              </View>
              {companions.length === 0 && (
                <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginBottom: 8 }}>
                  이름을 공백으로 띄우면 여러 명을 한 번에 추가할 수 있어요 (최대 3명)
                </Text>
              )}
              {companions.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {companions.map((name, i) => (
                    <TouchableOpacity key={i}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: C.charcoal,
                        borderRadius: 20,
                        paddingHorizontal: 10, paddingVertical: 5,
                      }}
                      onPress={() => setCompanions(prev => prev.filter((_, idx) => idx !== i))}>
                      <Text style={{ fontSize: 12, color: C.butter }}>{name}</Text>
                      <Text style={{ fontSize: 10, color: 'rgba(245,230,168,0.5)' }}>✕</Text>
                    </TouchableOpacity>
                  ))}
                  {companions.length < 3 && (
                    <Text style={{ fontSize: 10, color: C.warmGrayLight, alignSelf: 'center' }}>
                      최대 3명 (나 포함 4명)
                    </Text>
                  )}
                </View>
              )}
              <Text style={mS.label}>날씨</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['맑음','흐림','바람','비'].map(w => (
                  <TouchableOpacity key={w} style={[mS.chip, weather === w && mS.chipOn]} onPress={() => setWeather(w)}>
                    <Text style={[mS.chipTxt, weather === w && mS.chipTxtOn]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={mS.label}>버디</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => setBirdieCount(Math.max(0, birdieCount - 1))} style={mS.countBtn}>
                  <Text style={mS.countBtnTxt}>−</Text>
                </TouchableOpacity>
                <Text style={mS.countVal}>{birdieCount}개</Text>
                <TouchableOpacity onPress={() => setBirdieCount(Math.min(18, birdieCount + 1))} style={mS.countBtn}>
                  <Text style={mS.countBtnTxt}>+</Text>
                </TouchableOpacity>
                {birdieCount === 0 && <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>버디 없음</Text>}
              </View>
              <Text style={mS.label}>특별한 순간</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['HOLE IN ONE','EAGLE','ALBATROSS','없음'].map(s => (
                  <TouchableOpacity key={s}
                    style={[mS.chip, (special === s || (s === '없음' && !special)) && mS.chipOn]}
                    onPress={() => setSpecial(s === '없음' ? null : s)}>
                    <Text style={[mS.chipTxt, (special === s || (s === '없음' && !special)) && mS.chipTxtOn]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {special && (
                <View style={mS.specialBox}>
                  <Text style={mS.specialBoxTitle}>{special} 기록</Text>
                  <Text style={mS.label}>몇번 홀?</Text>
                  <TextInput style={mS.input} placeholder="7" placeholderTextColor={C.warmGrayLight}
                    value={specialHole} onChangeText={setSpecialHole} keyboardType="numeric" />
                  <Text style={mS.label}>파(Par)?</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['3','4','5'].map(p => (
                      <TouchableOpacity key={p} style={[mS.chip, specialPar === p && mS.chipOn]} onPress={() => setSpecialPar(p)}>
                        <Text style={[mS.chipTxt, specialPar === p && mS.chipTxtOn]}>파{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={mS.label}>거리</Text>
                  <TextInput style={mS.input} placeholder="156m" placeholderTextColor={C.warmGrayLight}
                    value={specialDist} onChangeText={setSpecialDist} />
                  <Text style={mS.label}>사용한 볼</Text>
                  <TextInput style={mS.input} placeholder="Titleist Pro V1" placeholderTextColor={C.warmGrayLight}
                    value={specialBall} onChangeText={setSpecialBall} />
                  <Text style={mS.label}>한마디</Text>
                  <TextInput style={mS.input} placeholder="그 순간을 기억하며..." placeholderTextColor={C.warmGrayLight}
                    value={specialMemo} onChangeText={setSpecialMemo} />
                </View>
              )}
              <Text style={mS.label}>코스 별점 <Text style={{ color: '#8B8680', fontSize: 10 }}> (이 골프장이 얼마나 좋았나요?)</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <TouchableOpacity key={i} onPress={() => setStarRating(i)} activeOpacity={0.6}>
                    <Text style={{ fontSize: 28, color: i <= starRating ? '#C9A84C' : '#E8E2D0' }}>★</Text>
                  </TouchableOpacity>
                ))}
                {starRating > 0 && <Text style={{ fontSize: 12, color: '#8B8680' }}>{starRating}점</Text>}
              </View>

              <Text style={mS.label}>코스 태그 <Text style={{ color: '#8B8680', fontSize: 10 }}> (선택 · 중복 가능)</Text></Text>
              {Object.entries(COURSE_TAGS).map(([category, tags]) => {
                const catColor = COURSE_TAG_COLORS[category];
                return (
                  <View key={category} style={{ marginBottom: 10 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: '#8B8680', marginBottom: 6, letterSpacing: 1 }}>{category}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {tags.map(tag => {
                        const on = selectedTags.includes(tag);
                        return (
                          <TouchableOpacity key={tag} activeOpacity={0.7}
                            style={{
                              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                              backgroundColor: on ? catColor.bg : C.bgSecondary,
                              borderWidth: 0.5,
                              borderColor: on ? catColor.bg : C.hairline,
                            }}
                            onPress={() => toggleTag(tag)}>
                            <Text style={{ fontFamily: F.sys, fontSize: 12, color: on ? catColor.text : C.warmGrayLight }}>{tag}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={{ marginTop: 6 }}>
                <Text style={mS.label}>
                  더 기록하기
                  <Text style={{ color: '#8B8680', fontSize: 10 }}> (선택 · 최대 1000자)</Text>
                </Text>
                {/* 예시 칩 — 누르면 입력칸에 항목이 추가돼 글쓰기 시작점이 된다 */}
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 6 }}>
                  뭘 쓸지 막막하면 눌러서 시작해보세요
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {GUIDE_CHIPS.map(c => (
                    <TouchableOpacity key={c} onPress={() => insertGuideChip(c)} activeOpacity={0.7}
                      style={{ backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline,
                        borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, fontWeight: '600' }}>+ {c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{
                  backgroundColor: C.bgSecondary,
                  borderWidth: 0.5, borderColor: C.hairline,
                  borderRadius: 12, padding: 14,
                  minHeight: 140,
                }}>
                  <TextInput
                    ref={detailMemoRef}
                    style={{
                      fontFamily: F.sys, fontSize: 13,
                      color: C.textPrimary,
                      // multiline TextInput에 lineHeight를 주면 첫 줄이 밀리는 버그가 있어 미지정
                      minHeight: 100, textAlignVertical: 'top',
                    }}
                    placeholder="그날의 라운딩을 자유롭게 남겨보세요"
                    placeholderTextColor={C.warmGrayLight}
                    value={detailMemo}
                    onChangeText={(t) => { if (t.length <= 1000) setDetailMemo(t); }}
                    multiline
                    textAlignVertical="top"
                    maxLength={1000}
                  />
                  <Text style={{ fontSize: 10, color: C.warmGrayLight, textAlign: 'right', marginTop: 8 }}>
                    {detailMemo.length} / 1000
                  </Text>
                </View>
              </View>

              {/* 비용 기록 — 접기/펼치기 (선택) */}
              <TouchableOpacity
                onPress={() => setShowCost(v => !v)}
                activeOpacity={0.7}
                style={{
                  marginTop: 14,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: C.bgSecondary,
                  borderWidth: 0.5, borderColor: C.hairline,
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary, fontWeight: '600' }}>
                  💰 비용 기록하기 <Text style={{ color: '#8B8680', fontSize: 10, fontWeight: '400' }}>(선택)</Text>
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: 18, color: C.warmGray }}>{showCost ? '−' : '+'}</Text>
              </TouchableOpacity>
              {showCost && (
                <View style={{
                  marginTop: 8, backgroundColor: C.bgSecondary,
                  borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, padding: 14,
                }}>
                  {COST_ITEMS.map(([key, label]) => (
                    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textSecondary, width: 64 }}>{label}</Text>
                      <TextInput
                        style={{
                          flex: 1, backgroundColor: C.bgPrimary,
                          borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8,
                          paddingHorizontal: 12, paddingVertical: 8,
                          fontFamily: F.sys, fontSize: 13, color: C.textPrimary, textAlign: 'right',
                        }}
                        placeholder="0"
                        placeholderTextColor={C.warmGrayLight}
                        keyboardType="numeric"
                        value={costs[key]}
                        onChangeText={(t) => setCosts(prev => ({ ...prev, [key]: t.replace(/[^0-9]/g, '') }))}
                      />
                      <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, marginLeft: 8 }}>원</Text>
                    </View>
                  ))}
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    borderTopWidth: 0.5, borderTopColor: C.hairline, paddingTop: 12, marginTop: 2,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary, fontWeight: '600' }}>합계</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 16, color: C.burgundy, fontWeight: '700' }}>
                      {won(costTotal)}원
                    </Text>
                  </View>
                </View>
              )}

              <Text style={mS.label}>공개 범위</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[mS.chip, privacy === 'friends' && mS.chipOn]} onPress={() => setPrivacy('friends')}>
                  <Text style={[mS.chipTxt, privacy === 'friends' && mS.chipTxtOn]}>친구공개</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[mS.chip, privacy === 'private' && mS.chipOn]} onPress={() => setPrivacy('private')}>
                  <Text style={[mS.chipTxt, privacy === 'private' && mS.chipTxtOn]}>나만보기</Text>
                </TouchableOpacity>
              </View>
              <View style={{ marginTop: 16, marginBottom: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, marginBottom: 8 }}>
                  사진 · 영상 (선택)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {addPhotos.map((item, i) => (
                    <AddPhotoThumb key={i} item={item}
                      onRemove={() => setAddPhotos(prev => prev.filter((_, idx) => idx !== i))} />
                  ))}
                  <TouchableOpacity onPress={pickPhoto}
                    style={{ width: 80, height: 80, borderRadius: 8, backgroundColor: C.bgSecondary,
                      borderWidth: 0.5, borderColor: C.hairline,
                      alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 24, color: C.warmGrayLight }}>+</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
              {saveError ? (
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#6B1E2A', textAlign: 'center', marginTop: 8, fontWeight: '500' }}>{saveError}</Text>
              ) : null}
              <TouchableOpacity
                style={[mS.saveBtn, { backgroundColor: !canSave ? '#B8B3AB' : (isEdit ? C.charcoal : C.burgundy) }]}
                onPress={handleSave}
                disabled={!canSave}>
                <Text style={mS.saveBtnTxt}>{isEdit ? '수정 완료' : '저장하기'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
    </Modal>
  );
}

function AddPhotoThumb({ item, onRemove }) {
  const isVideo = typeof item === 'object' && item?.type === 'video';
  const src = resolvePhotoUri(typeof item === 'object' ? item.uri : item);
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!isVideo) return;
    (async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(src, { time: 0, quality: 0.6 });
        if (!cancelled) setThumb(uri);
      } catch (e) {
        if (!cancelled) console.warn('thumbnail failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isVideo, src]);

  const imgStyle = { width: 80, height: 80, borderRadius: 8 };

  return (
    <View style={{ width: 80, height: 80, marginRight: 8 }}>
      {isVideo ? (
        <View style={imgStyle}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={imgStyle} />
          ) : (
            <View style={[imgStyle, { backgroundColor: '#2A2622' }]} />
          )}
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: '#fff', fontSize: 12, marginLeft: 2 }}>▶</Text>
            </View>
          </View>
        </View>
      ) : (
        <Image source={{ uri: src }} style={imgStyle} />
      )}
      {onRemove && (
        <TouchableOpacity onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            position: 'absolute', top: 3, right: 3,
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: 'rgba(0,0,0,0.78)',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Text style={{ color: '#fff', fontSize: 11, lineHeight: 13 }}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
