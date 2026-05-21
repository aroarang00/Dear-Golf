import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F } from '../constants/colors';
import { searchGolfCourses } from '../utils/kakao';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { COMPANION_OPTIONS, SKILL_OPTIONS, TAG_OPTIONS, REGION_OPTIONS, regionFromAddress } from '../constants/roundup';
import { mS } from '../styles/mS';
import { WEEKDAYS } from '../constants/data';

const SCOPES = [
  ['all', '전체공개'],
  ['friends', '친구공개'],
  ['select', '친구지정'],
];
const DAYS = WEEKDAYS;

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
  const [groupMode, setGroupMode] = useState('single'); // single(개별) | team(단체)
  const [members, setMembers] = useState(4);            // 개별: 총 모집 인원 2~4
  const [teams, setTeams] = useState(2);                // 단체: 팀 수 2~4 (1팀=4명)
  const [scope, setScope] = useState('all');
  const [word, setWord] = useState('');
  const scrollRef = useRef(null);
  // 동반자 조건 필터 — 구성·실력 단일 선택, 태그 다중 선택. 전체공개에서만 노출.
  const [companion, setCompanion] = useState('any');
  const [skill, setSkill] = useState('any');
  const [tags, setTags] = useState([]);
  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  // 오픈형 모집의 지역 — 골프장 미정이라 사용자가 직접 선택. 확정형은 골프장 주소에서 자동 추출.
  const [openRegion, setOpenRegion] = useState('capital');
  const [showTip, setShowTip] = useState(false);     // 모집 형태 안내 툴팁 (1회)
  const debounceRef = useRef(null);

  // 처음 작성 화면을 열 때 1회 툴팁 표시
  useEffect(() => {
    if (!visible) return;
    storage.load(STORAGE_KEYS.roundupTipDone, false).then(done => { if (!done) setShowTip(true); });
  }, [visible]);

  const dismissTip = () => {
    setShowTip(false);
    storage.save(STORAGE_KEYS.roundupTipDone, true);
  };

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
    setGroupMode('single'); setMembers(4); setTeams(2); setScope('all'); setWord('');
    setCompanion('any'); setSkill('any'); setTags([]);
    setOpenRegion('capital');
  };
  const close = () => { reset(); onClose(); };

  const handleSubmit = () => {
    const courseName = course?.name || courseQuery.trim();
    if (type === 'fixed' && !courseName) return; // 확정형은 골프장 필수
    const isTeam = groupMode === 'team';
    // 지역(region): 확정형은 골프장 주소에서 자동 추출, 오픈형은 사용자가 선택한 권역 사용
    const region = type === 'fixed' ? regionFromAddress(course?.loc) : openRegion;
    // 친구공개·친구지정에서는 동반자 조건/태그/오픈채팅 URL이 의미 없으므로 저장도 안 함
    const isPublic = scope === 'all';
    onCreate({
      type,
      course: type === 'fixed' ? courseName : null,
      region,
      date: type === 'fixed' ? fmtDate(date) : null,
      day: type === 'fixed' ? DAYS[date.getDay()] : null,
      time: type === 'fixed' ? fmtTime(date) : null,
      teams: isTeam ? teams : 1,
      capacity: isTeam ? teams * 4 : members,
      scope,
      word: word.trim(),
      // 오픈채팅 URL은 모집글 작성에서 입력 안 받음. 추후 별도 카카오 SDK 연동 시 채워질 수 있음.
      kakaoOpenChatUrl: null,
      // 동반자 조건 — 전체공개일 때만 의미. 친구공개·친구지정은 'any'/[]로 저장
      companion: isPublic ? companion : 'any',
      skill: isPublic ? skill : 'any',
      tags: isPublic ? tags : [],
    });
    reset(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <View style={mS.sheet}>
          {/* handle 영역 자체를 탭 가능한 닫기로 — 마스크 영역이 좁아 안 닫히는 문제 해결 */}
          <TouchableOpacity onPress={close} activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 60, right: 60 }}
            style={{ alignSelf: 'center', paddingVertical: 8 }}>
            <View style={mS.handle} />
          </TouchableOpacity>
          <ScrollView ref={scrollRef} style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 0, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets>
            {/* 타이틀 줄 — 우측에 명시적 ✕ 닫기 버튼 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[mS.title, { flex: 1, marginBottom: 0 }]}>라운딩 모집글 작성</Text>
              <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.bgSecondary }}>
                <Text style={{ fontSize: 16, color: C.warmGray, fontWeight: '600', lineHeight: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 모집 형태 안내 툴팁 — 처음 1회만 */}
            {showTip && (
              <View style={{ backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#E2D2A8',
                borderRadius: 12, padding: 13, marginTop: 10 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#8B6914', fontWeight: '700', marginBottom: 6 }}>
                  💡 모집 형태 안내
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.charcoal, lineHeight: 19 }}>
                  <Text style={{ fontWeight: '700' }}>확정형</Text> — 골프장·날짜가 정해진 모집{'\n'}
                  <Text style={{ fontWeight: '700' }}>오픈형</Text> — 날짜·장소 미정, 동반자를 먼저 모으는 모집
                </Text>
                <TouchableOpacity onPress={dismissTip} activeOpacity={0.7} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#8B6914', fontWeight: '700' }}>알겠어요</Text>
                </TouchableOpacity>
              </View>
            )}

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

            {/* 오픈형 — 골프장 미정이라 사용자가 권역을 직접 선택 (라운지 지역 필터 매칭용) */}
            {type === 'open' && (
              <>
                <Text style={mS.label}>희망 지역</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {REGION_OPTIONS.filter(([k]) => k !== 'all').map(([k, l]) => {
                    const on = openRegion === k;
                    return (
                      <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setOpenRegion(k)}
                        style={[mS.chip, on && mS.chipOn, { alignItems: 'center' }]}>
                        <Text style={[mS.chipTxt, on && mS.chipTxtOn]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={mS.label}>모집 인원</Text>
            {/* 개별 / 단체 선택 */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['single', '개별 모집'], ['team', '단체 모집']].map(([k, l]) => (
                <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setGroupMode(k)}
                  style={[mS.chip, groupMode === k && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                  <Text style={[mS.chipTxt, groupMode === k && mS.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {groupMode === 'single' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {[2, 3, 4].map(n => {
                  const on = members === n;
                  return (
                    <TouchableOpacity key={n} activeOpacity={0.7} onPress={() => setMembers(n)}
                      style={[mS.chip, on && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                      <Text style={[mS.chipTxt, on && mS.chipTxtOn]}>{n}명</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {[2, 3, 4].map(n => {
                  const on = teams === n;
                  return (
                    <TouchableOpacity key={n} activeOpacity={0.7} onPress={() => setTeams(n)}
                      style={[mS.chip, on && mS.chipOn, { flex: 1, alignItems: 'center', paddingVertical: 9 }]}>
                      <Text style={[mS.chipTxt, on && mS.chipTxtOn, { fontSize: 13, fontWeight: '700' }]}>{n}팀</Text>
                      <Text style={[mS.chipTxt, on && mS.chipTxtOn, { fontSize: 10, marginTop: 1 }]}>{n * 4}명</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 6 }}>
              {groupMode === 'single'
                ? '함께 칠 동반자를 모아요 (최대 한 팀 4명)'
                : '여러 팀이 함께하는 단체 모집이에요 (한 팀 4명)'}
            </Text>

            <Text style={mS.label}>공개 범위</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SCOPES.map(([k, l]) => (
                <TouchableOpacity key={k} style={[mS.chip, scope === k && mS.chipOn, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setScope(k)}>
                  <Text style={[mS.chipTxt, scope === k && mS.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 동반자 조건·태그·오픈채팅 URL — 전체공개에서만 의미. 친구공개·친구지정은 어차피 친구라 숨김 */}
            {scope === 'all' && (
              <>
                <Text style={mS.label}>동반자 구성</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {COMPANION_OPTIONS.map(([k, l]) => {
                    const on = companion === k;
                    return (
                      <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setCompanion(k)}
                        style={[mS.chip, on && mS.chipOn, { alignItems: 'center' }]}>
                        <Text style={[mS.chipTxt, on && mS.chipTxtOn]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={mS.label}>실력 <Text style={{ fontSize: 10, color: C.warmGrayLight }}>(평균 타수)</Text></Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SKILL_OPTIONS.map(([k, l]) => {
                    const on = skill === k;
                    return (
                      <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setSkill(k)}
                        style={[mS.chip, on && mS.chipOn, { alignItems: 'center' }]}>
                        <Text style={[mS.chipTxt, on && mS.chipTxtOn]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={mS.label}>태그 <Text style={{ fontSize: 10, color: C.warmGrayLight }}>(중복 선택 가능)</Text></Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {TAG_OPTIONS.map(t => {
                    const on = tags.includes(t);
                    return (
                      <TouchableOpacity key={t} activeOpacity={0.7} onPress={() => toggleTag(t)}
                        style={[mS.chip, on && mS.chipOn, { alignItems: 'center' }]}>
                        <Text style={[mS.chipTxt, on && mS.chipTxtOn]}>#{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

              </>
            )}

            <Text style={mS.label}>한마디 <Text style={{ fontSize: 10, color: C.warmGrayLight }}>(선택)</Text></Text>
            <TextInput style={[mS.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline
              placeholder="동반자에게 남길 한마디를 적어주세요" placeholderTextColor={C.warmGrayLight}
              value={word} onChangeText={setWord} maxLength={120}
              onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)} />

            <TouchableOpacity style={mS.saveBtn} onPress={handleSubmit}>
              <Text style={mS.saveBtnTxt}>모집글 등록</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
