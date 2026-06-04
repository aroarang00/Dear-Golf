import React, { useState, useEffect, useRef, useContext } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Platform, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F, fs } from '../constants/colors';
import { searchGolfCourses } from '../utils/kakao';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { COMPANION_OPTIONS, AGEGROUP_OPTIONS, SKILL_OPTIONS, TAG_OPTIONS, tagStyle, INVITE_SAMPLES, REGION_OPTIONS, ROUNDUP_PUBLIC_ENABLED, regionFromAddress } from '../constants/roundup';
import { mS } from '../styles/mS';
import { WEEKDAYS } from '../constants/data';
import { UserContext } from '../contexts/UserContext';
import { OverlayAlert } from './common/OverlayAlert';
import { FriendSelectModal } from './FriendSelectModal';

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

// 라운딩 모집글 작성·수정 — 확정형/오픈형, 코스 검색, 날짜·시간, 인원, 공개범위, 한마디.
// initialPost 있으면 수정 모드 (prefill + 타이틀·버튼 변경). 부모에서 id 매칭으로 분기.
// friends — 친구지정 모달용 친구 목록 [{ id, name(닉네임), realName }]. RoundupTab이 friendships 컬렉션에서 실제 로드해 주입.
export function RoundupCreateModal({ visible, onClose, onCreate, initialPost = null, friends = [] }) {
  const insets = useSafeAreaInsets();
  const { userProfile } = useContext(UserContext);
  // 안드: 투명 Modal 안에선 키보드로 윈도우 리사이즈가 안 먹어 하단 입력창(한마디)이 가려짐.
  // 키보드 높이만큼 시트를 띄운다. iOS는 automaticallyAdjustKeyboardInsets로 처리되므로 미적용.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', e => setKbHeight(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  // 본인이 마이페이지에서 "친구 모집만 보기" 켜두면 작성 시에도 전체공개 옵션 숨김 (일관성)
  // ROUNDUP_PUBLIC_ENABLED=false면 앱 전역으로 전체공개 비활성화 ([[roundup-public-disabled]])
  const hideStranger = !ROUNDUP_PUBLIC_ENABLED || !!userProfile?.hideStrangerRoundups;
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
  // 친구지정(scope='select') 상세 — selectMode + selectedUids ([[roundup-visibility-design]])
  const [selectMode, setSelectMode] = useState('include');
  const [selectedUids, setSelectedUids] = useState([]);
  const [inviteStyle, setInviteStyle] = useState('casual'); // 친구지정 초대장 톤: 'casual'(보딩패스) | 'formal'(격식) ([[roundup-invitation]])
  const [showFriendSelect, setShowFriendSelect] = useState(false);
  const [word, setWord] = useState('');
  // hideStranger 토글 변경 시 scope이 'all'이면 자동 보정
  useEffect(() => {
    if (hideStranger && scope === 'all') setScope('friends');
  }, [hideStranger]); // eslint-disable-line react-hooks/exhaustive-deps
  // 동반자 조건 필터 — 구성·연령대·실력 단일 선택, 태그 다중 선택. 전체공개에서만 노출.
  const [companion, setCompanion] = useState('any');
  const [ageGroup, setAgeGroup] = useState('any');
  const [skill, setSkill] = useState('any');
  const [tags, setTags] = useState([]);
  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  // 오픈형 모집의 지역 — 골프장 미정이라 사용자가 직접 선택. 확정형은 골프장 주소에서 자동 추출.
  const [openRegion, setOpenRegion] = useState('capital');
  // 오픈형 모집의 희망 시기 — 멀티 선택. [] 또는 둘 다 선택 = 상관없음(표시 X), 하나만 선택 = 표시.
  const [openTime, setOpenTime] = useState([]);
  const toggleOpenTime = (k) => setOpenTime(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  const [showTip, setShowTip] = useState(false);     // 모집 형태 안내 툴팁 (1회)
  const [alert, setAlert] = useState(null);          // 수정 모드 주요 변경 확인용
  const debounceRef = useRef(null);

  // 처음 작성 화면을 열 때 1회 툴팁 표시 (수정 모드에선 안 띄움)
  useEffect(() => {
    if (!visible || initialPost) return;
    storage.load(STORAGE_KEYS.roundupTipDone, false).then(done => { if (!done) setShowTip(true); });
  }, [visible, initialPost]);

  // 신규 작성 모드로 열릴 때 — 이전 수정 데이터가 남아있을 수 있으니 reset
  useEffect(() => {
    if (visible && !initialPost) reset();
  }, [visible, initialPost]); // eslint-disable-line react-hooks/exhaustive-deps

  // 오픈형 친구지정 모집이 만석이면, 수정은 '확정형으로 전환'만 허용 (오픈형 잠금) — 일정 확정 동선
  const isEdit = !!initialPost;
  const editFull = isEdit && ((initialPost.teams || 1) > 1
    ? (Array.isArray(initialPost.teamJoined) && initialPost.teamJoined.every(c => c >= 4))
    : (initialPost.joined || 0) >= (initialPost.capacity || 4));
  const lockToFixed = isEdit && initialPost.scope === 'select' && initialPost.type === 'open' && editFull;

  // 수정 모드 — initialPost로 모든 state prefill
  useEffect(() => {
    if (!visible || !initialPost) return;
    setType(lockToFixed ? 'fixed' : (initialPost.type || 'fixed'));
    setCourseQuery(initialPost.course || '');
    setCourse(initialPost.course ? { name: initialPost.course, loc: null } : null);
    if (initialPost.date && initialPost.time) {
      const [y, m, d] = initialPost.date.split('.').map(Number);
      const [hh, mm] = initialPost.time.split(':').map(Number);
      const dd = new Date(y, m - 1, d, hh, mm, 0, 0);
      if (!isNaN(dd)) setDate(dd);
    }
    const isTeam = (initialPost.teams || 1) > 1;
    setGroupMode(isTeam ? 'team' : 'single');
    setMembers(Math.max(1, Math.min(3, (initialPost.capacity || 4) - 1)));
    setTeams(Math.max(2, Math.min(4, initialPost.teams || 2)));
    setScope(initialPost.scope || 'all');
    setWord(initialPost.word || '');
    setCompanion(initialPost.companion || 'any');
    setAgeGroup(initialPost.ageGroup || 'any');
    setSkill(initialPost.skill || 'any');
    setTags(Array.isArray(initialPost.tags) ? initialPost.tags : []);
    setOpenRegion(initialPost.region || 'capital');
    setOpenTime(Array.isArray(initialPost.openTime) ? initialPost.openTime : []);
    setSelectMode(initialPost.selectMode || 'include');
    setSelectedUids(Array.isArray(initialPost.selectedUids) ? initialPost.selectedUids : []);
    setInviteStyle(initialPost.inviteStyle || 'casual');
  }, [visible, initialPost]);

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

  // 신규 작성 모드일 때만 reset. 수정 모드는 닫을 때 자체 prefill로 유지(다음 visible에 useEffect로 재적용).
  const reset = () => {
    setType('fixed'); setCourseQuery(''); setCourse(null); setResults([]); setSearching(false);
    const d = new Date(); d.setHours(7, 0, 0, 0); setDate(d);
    setGroupMode('single'); setMembers(3); setTeams(2); setScope(hideStranger ? 'friends' : 'all'); setWord(''); setOpenTime([]);
    setCompanion('any'); setAgeGroup('any'); setSkill('any'); setTags([]);
    setOpenRegion('capital');
    setSelectMode('include'); setSelectedUids([]); setShowFriendSelect(false);
  };
  const close = () => { if (!initialPost) reset(); onClose(); };
  // 안드로이드 뒤로가기 — 확인창(OverlayAlert)이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  // (RN Modal 안에서 BackHandler는 onRequestClose보다 불안정 → 여기 한 곳에서 우선순위로 처리)
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    close();
  };

  // 최종 데이터 빌드
  const buildPayload = () => {
    const courseName = course?.name || courseQuery.trim();
    const isTeam = groupMode === 'team';
    const region = type === 'fixed' ? regionFromAddress(course?.loc) : openRegion;
    const isPublic = scope === 'all';
    return {
      type,
      course: type === 'fixed' ? courseName : null,
      courseLoc: type === 'fixed' ? (course?.loc || null) : null,         // 주소 — 확정 시 일정/지역탭으로 전달([[region-classification]])
      courseKakaoId: type === 'fixed' ? (course?.kakaoId || null) : null, // 코스 가기 매칭용
      region,
      date: type === 'fixed' ? fmtDate(date) : null,
      day: type === 'fixed' ? DAYS[date.getDay()] : null,
      time: type === 'fixed' ? fmtTime(date) : null,
      teams: isTeam ? teams : 1,
      capacity: isTeam ? teams * 4 : (members + 1),
      companions: [],
      openTime: type === 'open' ? openTime : [],
      scope,
      // 친구지정 — select일 때만 저장, 그 외 null/[]
      //   selectMode·selectedUids = 원래 선택(수정 복원용)
      //   audienceUids = 작성 시점 해석된 실제 수신자 — include면 선택친구, exclude면 (내친구 전체 − 선택친구)
      //   ([[roundup-visibility-design]] 2026-06-01: Firestore "규칙은 필터 아님" 제약 회피용 해석 필드)
      selectMode: scope === 'select' ? selectMode : null,
      selectedUids: scope === 'select' ? selectedUids : [],
      audienceUids: scope === 'select'
        ? (selectMode === 'exclude'
            ? friends.map(f => f.id).filter(Boolean).filter(id => !selectedUids.includes(id))
            : selectedUids)
        : [],
      // 초대장 톤(격식/편안) — select일 때만 ([[roundup-invitation]])
      inviteStyle: scope === 'select' ? inviteStyle : null,
      word: word.trim(),
      companion: isPublic ? companion : 'any',
      ageGroup: isPublic ? ageGroup : 'any',
      skill: isPublic ? skill : 'any',
      tags, // 성격 태그는 모든 공개범위에서 저장(친구모집/지정 포함)
    };
  };

  const doSubmit = () => {
    onCreate(buildPayload());
    if (!initialPost) reset();
    onClose();
  };

  const handleSubmit = () => {
    const courseName = course?.name || courseQuery.trim();
    if (type === 'fixed' && !courseName) return; // 확정형은 골프장 필수

    // 친구지정 가드 — include + 0명 차단 (아무도 못 봄), exclude + 0명은 친구공개 동등이라 허용
    if (scope === 'select' && selectMode === 'include' && selectedUids.length === 0) {
      setAlert({
        title: '친구를 선택해주세요',
        message: '한 명도 선택하지 않으면 아무도 모집글을 볼 수 없어요.\n친구지정 화면에서 친구를 골라주세요.',
        buttons: [
          { text: '취소', style: 'cancel' },
          { text: '친구 선택', onPress: () => setShowFriendSelect(true) },
        ],
      });
      return;
    }

    // 수정 모드 — 주요 변경(date/course/time) + 참여자 1+ 시 재확인 모달 ([[roundup-edit-policy]] §4-1)
    if (initialPost) {
      const payload = buildPayload();
      const majorChanged =
        payload.date !== (initialPost.date || null) ||
        payload.course !== (initialPost.course || null) ||
        payload.time !== (initialPost.time || null);
      const otherCount = Math.max(0, (initialPost.joined || 1) - 1);
      if (majorChanged && otherCount > 0) {
        setAlert({
          title: '주요 변경 사항이 있어요',
          message: `참여자 ${otherCount}명에게 변경 알림이 가요.\n계속 진행할까요?`,
          buttons: [
            { text: '취소', style: 'cancel' },
            { text: '수정하기', onPress: () => doSubmit() },
          ],
        });
        return;
      }
    }
    doSubmit();
  };


  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRequestClose}>
      <View style={[mS.mask, kbHeight ? { paddingBottom: kbHeight } : null]}>
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
              <Text style={[mS.title, { flex: 1, marginBottom: 0, fontSize: fs(21) }]}>
                {initialPost ? '라운딩 모집글 수정' : '라운딩 모집글 작성'}
              </Text>
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
              {[['fixed', '확정형'], ['open', '오픈형']].map(([k, l]) => {
                const disabled = lockToFixed && k === 'open';   // 만석 오픈형 친구지정 수정 — 오픈형 잠금
                return (
                  <TouchableOpacity key={k} activeOpacity={0.7} disabled={disabled} onPress={() => setType(k)}
                    style={[mS.chip, type === k && mS.chipOn, { flex: 1, alignItems: 'center' }, disabled && { opacity: 0.4 }]}>
                    <Text style={[mS.chipTxt, type === k && mS.chipTxtOn]}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6 }}>
              {lockToFixed
                ? '인원이 다 찼어요. 일정을 정해 확정형으로 전환해주세요.'
                : type === 'fixed'
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
            {/* 개별 / 단체 선택 — 단체 모집은 친구공개·친구지정에서만 (전체공개 단체는 비현실적) */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['single', '개별 모집'], ['team', '단체 모집']].map(([k, l]) => (
                <TouchableOpacity key={k} activeOpacity={0.7}
                  onPress={() => {
                    setGroupMode(k);
                    if (k === 'team' && scope === 'all') {
                      setScope('friends');
                      setAlert({
                        title: '단체 모집은 친구 대상으로만 가능해요',
                        message: '단체 모집은\n친구공개·친구지정에서만 운영돼요.\n\n공개 범위를 친구공개로 바꿔뒀어요.',
                        buttons: [{ text: '확인' }],
                      });
                    }
                  }}
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
              {SCOPES.map(([k, l]) => {
                // 단체 모집은 전체공개 불가 — 칩 비활성 + 안내
                const blocked = k === 'all' && groupMode === 'team';
                return (
                  <TouchableOpacity key={k}
                    style={[mS.chip, scope === k && mS.chipOn, blocked && { opacity: 0.4 }, { flex: 1, alignItems: 'center' }]}
                    onPress={() => {
                      if (blocked) {
                        setAlert({
                          title: '단체 모집은 전체공개로 못 해요',
                          message: '단체 모집은\n친구공개·친구지정에서만 가능해요.\n\n개별 모집으로 바꾸면\n전체공개를 선택할 수 있어요.',
                          buttons: [{ text: '확인' }],
                        });
                        return;
                      }
                      setScope(k);
                      // 친구지정 선택 시 친구 선택 모달 자동 노출
                      if (k === 'select') setShowFriendSelect(true);
                    }}>
                    <Text style={[mS.chipTxt, scope === k && mS.chipTxtOn]}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 친구지정 상태 — 모드·인원 표시 + 다시 선택 진입 */}
            {scope === 'select' && (
              <View style={{ marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal }}>
                  {selectMode === 'include' ? '포함' : '제외'} · {selectedUids.length}명
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, flex: 1 }}>
                  {selectMode === 'include' ? '선택한 친구에게만 보여요' : '선택한 친구만 안 보여요'}
                </Text>
                <TouchableOpacity onPress={() => setShowFriendSelect(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.burgundy }}>
                    {selectedUids.length === 0 ? '친구 선택' : '다시 선택'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 초대장 스타일 — 친구지정만. 격식(클래식)/편안(보딩패스) ([[roundup-invitation]]) */}
            {scope === 'select' && (
              <View style={{ marginTop: 12 }}>
                <Text style={mS.bigLabel}>초대장 스타일</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[['casual', '편안 · 보딩패스'], ['formal', '격식 · 클래식']].map(([k, l]) => (
                    <TouchableOpacity key={k} activeOpacity={0.8} onPress={() => setInviteStyle(k)}
                      style={[mS.chip, inviteStyle === k && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                      <Text style={[mS.chipTxt, inviteStyle === k && mS.chipTxtOn]}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

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

                <Text style={mS.bigLabel}>연령대</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {AGEGROUP_OPTIONS.map(([k, l]) => {
                    const on = ageGroup === k;
                    return (
                      <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setAgeGroup(k)}
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

              </>
            )}

            {/* 라운딩 성격 태그 — 모든 공개범위 노출(친구모집/지정 포함). 카드를 풍성하게 + 친구가 분위기 보고 합류 판단 */}
            <Text style={mS.bigLabel}>라운딩 성격 <Text style={{ fontSize: fs(10), fontFamily: F.sys, color: C.warmGray }}>(중복 선택 · 선택)</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {TAG_OPTIONS.map(t => {
                const on = tags.includes(t);
                const ts = tagStyle(t);
                return (
                  <TouchableOpacity key={t} activeOpacity={0.7} onPress={() => toggleTag(t)}
                    style={{ borderRadius: 16, paddingHorizontal: 13, paddingVertical: 7, alignItems: 'center',
                      backgroundColor: on ? ts.deep : ts.soft,
                      borderWidth: 0.5, borderColor: on ? ts.deep : 'transparent' }}>
                    <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(13), color: on ? '#fff' : ts.deep }}>#{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={mS.bigLabel}>한마디 <Text style={{ fontSize: fs(10), fontFamily: F.sys, color: C.warmGray }}>(선택 · 40자)</Text></Text>
            {/* 친구지정 — 초대장 톤(격식/편안)별 예시 멘트. 탭하면 자동입력, 직접 입력도 가능 */}
            {scope === 'select' && (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 6 }}>예시 — 탭하면 자동 입력</Text>
                {(INVITE_SAMPLES[inviteStyle] || INVITE_SAMPLES.casual).map((s, i) => {
                  const on = word === s;
                  return (
                    <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => setWord(s)}
                      style={{ backgroundColor: on ? C.burgundy : C.bgSecondary, borderRadius: 10,
                        borderWidth: 0.5, borderColor: on ? C.burgundy : C.hairline,
                        paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: on ? C.butter : C.charcoal }}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <TextInput style={[mS.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline
              placeholder="동반자에게 남길 한마디를 적어주세요" placeholderTextColor={C.warmGrayLight}
              value={word} onChangeText={setWord} maxLength={40} />

            <TouchableOpacity style={mS.saveBtn} onPress={handleSubmit}>
              <Text style={[mS.saveBtnTxt, { fontSize: fs(17) }]}>
                {initialPost ? '수정 저장' : '모집글 등록'}
              </Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
      <OverlayAlert data={alert} onClose={() => setAlert(null)} />
      <FriendSelectModal
        visible={showFriendSelect}
        friends={friends}
        initial={{ selectMode, selectedUids }}
        onClose={() => setShowFriendSelect(false)}
        onConfirm={({ selectMode: m, selectedUids: u }) => { setSelectMode(m); setSelectedUids(u); }} />
    </Modal>
  );
}
