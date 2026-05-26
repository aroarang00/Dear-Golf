import React, { useState, useEffect, useRef, useContext } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F, fs } from '../constants/colors';
import { searchGolfCourses } from '../utils/kakao';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { COMPANION_OPTIONS, SKILL_OPTIONS, TAG_OPTIONS, REGION_OPTIONS, regionFromAddress } from '../constants/roundup';
import { mS } from '../styles/mS';
import { WEEKDAYS } from '../constants/data';
import { UserContext } from '../contexts/UserContext';

const SCOPES_ALL = [
  ['all', '전체공개'],
  ['friends', '친구공개'],
  ['select', '친구지정'],
];
// hideStrangerRoundups가 true면 전체공개 옵션 자체를 숨김 — 본인 모집도 친구 한정으로 일관성 유지
const SCOPES_FRIENDS_ONLY = [
  ['friends', '친구공개'],
  ['select', '친구지정'],
];
const DAYS = WEEKDAYS;

// 라운딩 모집글 작성 — 확정형/오픈형, 코스 검색, 날짜·시간, 인원, 공개범위, 한마디
export function RoundupCreateModal({ visible, onClose, onCreate }) {
  const insets = useSafeAreaInsets();
  const { userProfile } = useContext(UserContext);
  // 본인이 마이페이지에서 "친구 모집만 보기" 켜두면 작성 시에도 전체공개 옵션 숨김 (일관성)
  const hideStranger = !!userProfile?.hideStrangerRoundups;
  const SCOPES = hideStranger ? SCOPES_FRIENDS_ONLY : SCOPES_ALL;
  const [type, setType] = useState('fixed');         // fixed | open
  const [courseQuery, setCourseQuery] = useState('');
  const [course, setCourse] = useState(null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(7, 0, 0, 0); return d; });
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [groupMode, setGroupMode] = useState('single'); // single(개별) | team(단체)
  const [members, setMembers] = useState(3);            // 개별: 주최자 외 모집 자리 수 1~3 (총 정원 = members + 1)
  const [teams, setTeams] = useState(2);                // 단체: 팀 수 2~4 (1팀=4명)
  // 동반자(앱 미사용자) 입력 기능은 2026-05-26 폐기 — 앱 사용자끼리 모집이 본질.
  // 지인 데려가는 경우는 주최자가 모집 진행 중 인원 변경으로 처리 (Phase 2 [[phase2-master-plan]] §7-7-3).
  const [scope, setScope] = useState(hideStranger ? 'friends' : 'all');
  const [word, setWord] = useState('');
  // hideStranger 토글 변경 시 scope이 'all'이면 자동 보정
  useEffect(() => {
    if (hideStranger && scope === 'all') setScope('friends');
  }, [hideStranger]); // eslint-disable-line react-hooks/exhaustive-deps
  // 동반자 조건 필터 — 구성·실력 단일 선택, 태그 다중 선택. 전체공개에서만 노출.
  const [companion, setCompanion] = useState('any');
  const [skill, setSkill] = useState('any');
  const [tags, setTags] = useState([]);
  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  // 오픈형 모집의 지역 — 골프장 미정이라 사용자가 직접 선택. 확정형은 골프장 주소에서 자동 추출.
  const [openRegion, setOpenRegion] = useState('capital');
  // 오픈형 모집의 희망 시기 — 멀티 선택. [] 또는 둘 다 선택 = 상관없음(표시 X), 하나만 선택 = 표시.
  const [openTime, setOpenTime] = useState([]);
  const toggleOpenTime = (k) => setOpenTime(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
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
    setGroupMode('single'); setMembers(3); setTeams(2); setScope(hideStranger ? 'friends' : 'all'); setWord(''); setOpenTime([]);
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
    // 친구공개·친구지정에서는 동반자 조건/태그가 의미 없으므로 저장도 안 함
    const isPublic = scope === 'all';
    onCreate({
      type,
      course: type === 'fixed' ? courseName : null,
      region,
      date: type === 'fixed' ? fmtDate(date) : null,
      day: type === 'fixed' ? DAYS[date.getDay()] : null,
      time: type === 'fixed' ? fmtTime(date) : null,
      teams: isTeam ? teams : 1,
      // members(chip)는 주최자 외 모집 자리 수(1~3). 총 정원 = members + 1.
      capacity: isTeam ? teams * 4 : (members + 1),
      // 동반자(앱 미사용자) 입력 폐기 — companions는 항상 빈 배열로 저장 (옛 데이터 호환용)
      companions: [],
      // 오픈형 희망 시기 — 0개·2개 모두 선택 시 '상관없음'으로 간주 (배열로 저장, 표시는 length===1만)
      openTime: type === 'open' ? openTime : [],
      scope,
      word: word.trim(),
      // 동반자 조건 — 전체공개일 때만 의미. 친구공개·친구지정은 'any'/[]로 저장
      companion: isPublic ? companion : 'any',
      skill: isPublic ? skill : 'any',
      tags: isPublic ? tags : [],
    });
    reset(); onClose();
  };


  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom }]}>
          {/* handle 영역 자체를 탭 가능한 닫기로 — 마스크 영역이 좁아 안 닫히는 문제 해결 */}
          <TouchableOpacity onPress={close} activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 60, right: 60 }}
            style={{ alignSelf: 'center', paddingVertical: 8 }}>
            <View style={mS.handle} />
          </TouchableOpacity>
          <ScrollView style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 0, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets>
            {/* 타이틀 줄 — 우측에 명시적 ✕ 닫기 버튼 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[mS.title, { flex: 1, marginBottom: 0, fontSize: fs(21) }]}>라운딩 모집글 작성</Text>
              <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.bgSecondary }}>
                <Text style={{ fontSize: fs(16), color: C.warmGray, fontWeight: '600', lineHeight: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 모집 형태 안내 툴팁 — 처음 1회만 */}
            {showTip && (
              <View style={{ backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#E2D2A8',
                borderRadius: 12, padding: 13, marginTop: 10 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#8B6914', marginBottom: 6 }}>
                  💡 모집 형태 안내
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.charcoal, lineHeight: 19 }}>
                  <Text style={{ fontFamily: F.sysB }}>확정형</Text> — 골프장·날짜가 정해진 모집{'\n'}
                  <Text style={{ fontFamily: F.sysB }}>오픈형</Text> — 날짜·장소 미정, 동반자를 먼저 모으는 모집
                </Text>
                <TouchableOpacity onPress={dismissTip} activeOpacity={0.7} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#8B6914' }}>알겠어요</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 확정형 / 오픈형 */}
            <Text style={mS.bigLabel}>모집 형태</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['fixed', '확정형'], ['open', '오픈형']].map(([k, l]) => (
                <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setType(k)}
                  style={[mS.chip, type === k && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                  <Text style={[mS.chipTxt, type === k && mS.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6 }}>
              {type === 'fixed'
                ? '골프장·날짜·시간을 정해서 모집해요'
                : '날짜·장소는 미정 — 함께 정할 동반자를 먼저 모아요'}
            </Text>

            {type === 'fixed' && (
              <>
                <Text style={mS.bigLabel}>골프장</Text>
                <TextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="카카오 검색으로 골프장 찾기..."
                  placeholderTextColor={C.warmGrayLight} value={courseQuery}
                  autoCorrect={false} autoCapitalize="none"
                  onChangeText={t => { setCourseQuery(t); setCourse(null); }} />
                {!course && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                    💡 검색 결과에서 선택하면 라운지 지역 필터·100대 코스가 정확해져요
                  </Text>
                )}
                {searching && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6 }}>검색 중...</Text>
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
                {/* 직접 입력 폴백 안내 ([[course-name-input]] 옵션 B):
                    사용자가 검색 결과 미선택 + 텍스트만 있을 때 매칭 한계 안내 */}
                {!searching && results.length === 0 && !course && courseQuery.trim().length > 0 && (
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.textSecondary, marginTop: 8, lineHeight: 17 }}>
                    💡 직접 입력한 코스는 일정 자동 연동·100대 코스 체크가 제한될 수 있어요.
                  </Text>
                )}

                <Text style={mS.bigLabel}>날짜</Text>
                <TouchableOpacity style={mS.input} onPress={() => setShowDate(true)}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textPrimary }}>
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

                <Text style={mS.bigLabel}>티오프 시간</Text>
                <TouchableOpacity style={mS.input} onPress={() => setShowTime(true)}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textPrimary }}>{fmtTime(date)}</Text>
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
                <Text style={mS.bigLabel}>희망 지역</Text>
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
                {/* 희망 시기 — 멀티 선택, 미선택/둘다선택은 상관없음 */}
                <Text style={mS.bigLabel}>희망 시기 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>(선택)</Text></Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[['weekday', '주중 선호'], ['weekend', '주말 선호']].map(([k, l]) => {
                    const on = openTime.includes(k);
                    return (
                      <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => toggleOpenTime(k)}
                        style={[mS.chip, on && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                        <Text style={[mS.chipTxt, on && mS.chipTxtOn]}>{l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                  선택 안 하거나 둘 다 선택하면 '상관없음'으로 표시돼요
                </Text>
              </>
            )}

            <Text style={mS.bigLabel}>모집 인원 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>(주최자 외)</Text></Text>
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
                {[1, 2, 3].map(n => {
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
                      <Text style={[mS.chipTxt, on && mS.chipTxtOn, { fontSize: fs(13), fontFamily: F.sysB }]}>{n}팀</Text>
                      <Text style={[mS.chipTxt, on && mS.chipTxtOn, { fontSize: fs(10), marginTop: 1 }]}>{n * 4}명</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {/* 동반자(앱 미사용자) 입력 섹션 폐기 (2026-05-26) — 앱 사용자끼리의 모집이 본질.
                지인 데려가기는 주최자가 모집 진행 중 인원 변경으로 처리 (Phase 2). */}
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6 }}>
              {groupMode === 'single'
                ? '함께 칠 동반자를 모아요 (최대 한 팀 4명)'
                : '여러 팀이 함께하는 단체 모집이에요 (한 팀 4명)'}
            </Text>

            <Text style={mS.bigLabel}>공개 범위</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SCOPES.map(([k, l]) => (
                <TouchableOpacity key={k} style={[mS.chip, scope === k && mS.chipOn, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setScope(k)}>
                  <Text style={[mS.chipTxt, scope === k && mS.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 동반자 조건·태그 — 전체공개에서만 의미. 친구공개·친구지정은 어차피 친구라 숨김 */}
            {scope === 'all' && (
              <>
                <Text style={mS.bigLabel}>동반자 구성</Text>
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

                <Text style={mS.bigLabel}>실력 <Text style={{ fontSize: fs(10), fontFamily: F.sys, color: C.warmGray }}>(평균 타수)</Text></Text>
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

                <Text style={mS.bigLabel}>태그 <Text style={{ fontSize: fs(10), fontFamily: F.sys, color: C.warmGray }}>(중복 선택 가능)</Text></Text>
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

            <Text style={mS.bigLabel}>한마디 <Text style={{ fontSize: fs(10), fontFamily: F.sys, color: C.warmGray }}>(선택)</Text></Text>
            <TextInput style={[mS.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline
              placeholder="동반자에게 남길 한마디를 적어주세요" placeholderTextColor={C.warmGrayLight}
              value={word} onChangeText={setWord} maxLength={120} />

            <TouchableOpacity style={mS.saveBtn} onPress={handleSubmit}>
              <Text style={[mS.saveBtnTxt, { fontSize: fs(17) }]}>모집글 등록</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
