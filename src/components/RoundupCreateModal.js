import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Platform, Keyboard } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpinnerPicker } from './common/SpinnerPicker';
import { C, F, fs } from '../constants/colors';
import { searchGolfCourses, getSubCoursesForCourse } from '../utils/golfCourses';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { COMPANION_OPTIONS, AGEGROUP_OPTIONS, SKILL_OPTIONS, TAG_OPTIONS, tagStyle, INVITE_SAMPLES, REGION_OPTIONS, ROUNDUP_PUBLIC_ENABLED, regionFromAddress } from '../constants/roundup';
import { mS } from '../styles/mS';
import { WEEKDAYS } from '../constants/data';
import { UserContext } from '../contexts/UserContext';
import { OverlayAlert } from './common/OverlayAlert';
import { FriendSelectModal } from './FriendSelectModal';
import { loadFriendData, resolveGroupAudience, DEFAULT_FRIEND_GROUPS } from '../utils/friendGroups';
import { loadMyCrews } from '../utils/crews';
import { getUid } from '../utils/firebase';
import { SubCourseChips } from './common/SubCourseChips';

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
// 공개범위 칩 선택 색 — 친구공개/친구지정을 한눈에 구분(중요 구분). 라운지라 navy 사용 가능([[feedback_navy_lounge_color]]).
//   친구공개=네이비(라운지색), 친구지정=버건디(초대장·체크 액센트와 통일), 전체공개=차콜(중립).
const SCOPE_ON_COLOR = { all: C.charcoal, friends: C.navy, select: C.burgundy };

// 라운지 모집은 '미래 라운딩'이라 티오프가 과거면 안 됨 — 만들자마자 노출 윈도우(티오프+5h)에 걸려
//   주최자·참여자 화면에서 사라지는 함정 방지([[roundup-schedule-sync]] / isInVisibleWindow). 확정형 한정.
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// 결합 datetime이 현재보다 과거면 현재 이후로 끌어올림(다음 10분 단위로 깔끔하게). 안드 시간피커는
//   minimumDate가 불안정해 onChange에서 직접 클램프 — iOS minimumDate는 시각화 보조.
const clampFutureTee = (d) => {
  const now = new Date();
  if (d.getTime() >= now.getTime()) return d;
  const c = new Date(now);
  c.setSeconds(0, 0);
  c.setMinutes(Math.ceil((c.getMinutes() + 1) / 10) * 10); // 다음 10분 슬롯
  return c;
};
// 신규 작성 기본 티오프 — 오늘 07:00, 단 이미 지났으면 내일 07:00(오후에 열어도 과거 기본값 X).
const defaultTeeOff = () => {
  const d = new Date();
  d.setHours(7, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d;
};

// 라운딩 모집글 작성·수정 — 확정형/오픈형, 코스 검색, 날짜·시간, 인원, 공개범위, 한마디.
// initialPost 있으면 수정 모드 (prefill + 타이틀·버튼 변경). 부모에서 id 매칭으로 분기.
// friends — 친구지정 모달용 친구 목록 [{ id, name(닉네임), realName }]. RoundupTab이 friendships 컬렉션에서 실제 로드해 주입.
export function RoundupCreateModal({ visible, onClose, onCreate, initialPost = null, friends = [], crewAudience = null, crewName = '' }) {
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
  const [subCourse, setSubCourse] = useState('');         // 세부코스(선택) — 자유입력 + 시드 칩
  const [subCourseOpts, setSubCourseOpts] = useState([]); // 선택 구장의 세부코스 칩 제안(시드된 구장만)
  const [searching, setSearching] = useState(false);
  const [date, setDate] = useState(defaultTeeOff); // 과거 티오프 방지 — 오늘 07:00(지났으면 내일)
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
  // 친구 그룹(가까운친구·라운딩멤버) 빠른선택 — 그룹 멤버 uid로 selectedUids 채움 ([[friend_groups]] Phase C)
  const [friendData, setFriendData] = useState({ friendGroups: DEFAULT_FRIEND_GROUPS, friendMeta: {} });
  const [selectedGroupIds, setSelectedGroupIds] = useState([]); // 그룹으로 채운 경우 그 그룹 id들(복수, 표시·audienceGroupIds용). 수동 선택 시 [] ([[friend_groups]])
  // '크루로 지정' — 내 크루 목록 + 선택한 크루 id들. 선택 크루의 memberUids를 audience에 합침(친구 아니어도 참여) ([[crew-roundup-share-plan]])
  const [myCrews, setMyCrews] = useState([]);                   // [{ id, name, memberUids, names }]
  const [selectedCrewIds, setSelectedCrewIds] = useState([]);
  const [meUid, setMeUid] = useState(null);                     // 본인 uid — 크루 멤버에서 자기 제외용
  const [inviteStyle, setInviteStyle] = useState('casual'); // 친구지정 초대장 톤: 'casual'(보딩패스) | 'formal'(격식) ([[roundup-invitation]])
  const [showFriendSelect, setShowFriendSelect] = useState(false);
  const [word, setWord] = useState('');
  // hideStranger 토글 변경 시 scope이 'all'이면 자동 보정
  useEffect(() => {
    if (hideStranger && scope === 'all') setScope('friends');
  }, [hideStranger]); // eslint-disable-line react-hooks/exhaustive-deps
  // 친구 그룹·메타 로드 — 친구지정 빠른선택(그룹) 해석용 ([[friend_groups]] Phase C)
  useEffect(() => {
    if (!visible) return;
    loadFriendData().then(setFriendData).catch(() => {});
  }, [visible]);
  // 선택한 구장의 세부코스 칩 제안 — 시드된 구장만(없으면 칩 미표시, 자유입력 유지) ([[course-subcourse-plan]])
  useEffect(() => {
    const kid = course?.kakaoId;
    if (!kid) { setSubCourseOpts([]); return; }
    let alive = true;
    getSubCoursesForCourse(kid).then(o => { if (alive) setSubCourseOpts(Array.isArray(o) ? o : []); }).catch(() => {});
    return () => { alive = false; };
  }, [course?.kakaoId]);
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
  const submittingRef = useRef(false);   // 생성 더블탭 가드 — 같은 틱 두 번 탭으로 모집글 중복 생성 방지

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
  // 크루에서 만든 모집 — 공개범위를 '이 크루 멤버 대상 친구지정(select)'으로 고정([[crew-roundup-share-plan]] B). 없으면 일반 모드(동작 0변경).
  const crewMode = Array.isArray(crewAudience) && crewAudience.length > 0;
  // 만석 판정 — joined 기반 통일. teamJoined는 joinRoundup이 갱신 안 해 단체 모집이 만석에 못 닿던 버그 ([[roundup-team-flat-roster]]).
  const editCapTotal = ((initialPost?.teams || 1) > 1) ? ((initialPost?.teams || 0) * 4) : 4;
  const editFull = isEdit && (initialPost.joined || 0) >= ((initialPost.capacity) || editCapTotal);
  const lockToFixed = isEdit && initialPost.scope === 'select' && initialPost.type === 'open' && editFull;

  // '크루로 지정'용 내 크루 로드 — 친구지정에서 크루 멤버를 audience에 합치기 위함. crewMode(크루서 만들기)면 불필요.
  useEffect(() => {
    if (!visible || crewMode) return;
    let alive = true;
    (async () => {
      try {
        const uid = await getUid();
        if (!alive || !uid) return;
        setMeUid(uid);
        const cs = await loadMyCrews(uid);
        if (alive && Array.isArray(cs)) setMyCrews(cs);
      } catch { /* 무시 — 크루 없으면 섹션 미표시 */ }
    })();
    return () => { alive = false; };
  }, [visible, crewMode]);

  // 선택한 크루들의 멤버 합집합(본인 제외) — audience에 더해지는 비친구 포함 수신자.
  const crewMemberUids = useMemo(() => {
    if (!selectedCrewIds.length) return [];
    const set = new Set();
    for (const cid of selectedCrewIds) {
      const c = myCrews.find(x => x.id === cid);
      (c?.memberUids || []).forEach(u => { if (u && u !== meUid) set.add(u); });
    }
    return Array.from(set);
  }, [selectedCrewIds, myCrews, meUid]);

  // 수정 모드 — initialPost로 모든 state prefill
  useEffect(() => {
    if (!visible || !initialPost) return;
    setType(lockToFixed ? 'fixed' : (initialPost.type || 'fixed'));
    setCourseQuery(initialPost.course || '');
    setCourse(initialPost.course ? { name: initialPost.course, loc: null, kakaoId: initialPost.courseKakaoId || null } : null);
    setSubCourse(initialPost.subCourse || '');
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
    setSelectedGroupIds(Array.isArray(initialPost.audienceGroupIds) ? initialPost.audienceGroupIds : []);
    setSelectedCrewIds(Array.isArray(initialPost.audienceCrewIds) ? initialPost.audienceCrewIds : []);
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
    setDate(defaultTeeOff());
    setGroupMode('single'); setMembers(3); setTeams(2); setScope(hideStranger ? 'friends' : 'all'); setWord(''); setOpenTime([]);
    setCompanion('any'); setAgeGroup('any'); setSkill('any'); setTags([]);
    setOpenRegion('capital');
    setSelectMode('include'); setSelectedUids([]); setSelectedGroupIds([]); setSelectedCrewIds([]); setShowFriendSelect(false);
    setSubCourse(''); setSubCourseOpts([]);
  };
  const close = () => { if (!initialPost) reset(); onClose(); };
  // 안드로이드 뒤로가기 — 확인창(OverlayAlert)이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  // (RN Modal 안에서 BackHandler는 onRequestClose보다 불안정 → 여기 한 곳에서 우선순위로 처리)
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    close();
  };

  // 친구 그룹 빠른선택 — 그 그룹 멤버 uid로 selectedUids 채움(현재 친구로 한정). 빈 그룹은 안내 후 중단.
  //   scope=select·include 환원이라 다운스트림(필터·초대장·일정동기화) 무변경 ([[friend_groups]] Phase C)
  const pickGroup = (gid) => {
    // 복수 그룹 토글 — 켜진 그룹들 멤버의 합집합을 selectedUids로 (현재 친구로 한정) ([[friend_groups]])
    const adding = !selectedGroupIds.includes(gid);
    const next = adding ? [...selectedGroupIds, gid] : selectedGroupIds.filter(x => x !== gid);
    const uids = resolveGroupAudience(friendData.friendMeta, next)
      .filter(id => friends.some(f => f.id === id)); // 그룹에 넣었지만 지금은 친구 아닌 uid 제외
    if (adding && uids.length === 0) {
      const gname = (friendData.friendGroups.find(g => g.id === gid) || {}).name || '그룹';
      setAlert({
        title: `'${gname}'에 지정된 친구가 없어요`,
        message: '친구 프로필 ⋯ → 그룹·별명 설정에서\n이 그룹에 친구를 먼저 지정해주세요.',
        buttons: [{ text: '확인' }],
      });
      return;
    }
    setSelectMode('include');
    setSelectedUids(uids);
    setSelectedGroupIds(next);
  };

  // '크루로 지정' 토글 — 크루 멤버는 selectedUids와 별개로 crewMemberUids로 audience에 합쳐짐(친구 그룹과 달리 비친구 포함).
  //   include 모드에서만 의미. 빈 크루(나만 있는)는 합칠 멤버가 없어 무해.
  const pickCrew = (cid) => {
    setSelectMode('include');
    setSelectedCrewIds(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid]);
  };

  // 최종 데이터 빌드
  const buildPayload = () => {
    const courseName = course?.name || courseQuery.trim();
    const isTeam = groupMode === 'team';
    const region = type === 'fixed' ? regionFromAddress(course?.loc) : openRegion;
    // 크루모드 — scope=select·audienceUids=크루멤버로 강제. crewMode=false면 아래는 기존과 100% 동일.
    const effScope = crewMode ? 'select' : scope;
    const isSelect = effScope === 'select';
    const isPublic = effScope === 'all';
    const effAudience = crewMode
      ? crewAudience
      : (isSelect
          ? (selectMode === 'exclude'
              ? friends.map(f => f.id).filter(Boolean).filter(id => !selectedUids.includes(id))
              // include — 개별 지정 친구 ∪ '크루로 지정'한 크루 멤버(비친구 포함). 중복 제거.
              : Array.from(new Set([...selectedUids, ...crewMemberUids])))
          : []);
    return {
      type,
      course: type === 'fixed' ? courseName : null,
      courseLoc: type === 'fixed' ? (course?.loc || null) : null,         // 주소 — 확정 시 일정/지역탭으로 전달([[region-classification]])
      courseKakaoId: type === 'fixed' ? (course?.kakaoId || null) : null, // 코스 가기 매칭용
      subCourse: type === 'fixed' ? (subCourse.trim() || null) : null,    // 세부코스(선택) — 있으면 카드·상세에 구장 아래 표시
      region,
      date: type === 'fixed' ? fmtDate(date) : null,
      day: type === 'fixed' ? DAYS[date.getDay()] : null,
      time: type === 'fixed' ? fmtTime(date) : null,
      teams: isTeam ? teams : 1,
      capacity: isTeam ? teams * 4 : (members + 1),
      companions: [],
      openTime: type === 'open' ? openTime : [],
      scope: effScope,
      // 친구지정/크루 — select일 때만 저장. 크루모드는 audienceUids=크루 memberUids(include 고정).
      //   ([[roundup-visibility-design]] 2026-06-01: Firestore "규칙은 필터 아님" 제약 회피용 해석 필드)
      selectMode: isSelect ? (crewMode ? 'include' : selectMode) : null,
      selectedUids: isSelect ? (crewMode ? crewAudience : selectedUids) : [],
      audienceUids: effAudience,
      audienceGroupIds: isSelect && !crewMode && selectMode === 'include' ? selectedGroupIds : [],
      // '크루로 지정'한 크루 id들 — 비어있지 않으면 createRoundup이 홈 정식초대 배너 제외(카드 자율참여). 수정 복원·표시용.
      audienceCrewIds: isSelect && !crewMode && selectMode === 'include' ? selectedCrewIds : [],
      inviteStyle: isSelect ? (crewMode ? 'casual' : inviteStyle) : null,
      word: word.trim(),
      companion: isPublic ? companion : 'any',
      ageGroup: isPublic ? ageGroup : 'any',
      skill: isPublic ? skill : 'any',
      tags, // 성격 태그는 모든 공개범위에서 저장(친구모집/지정 포함)
    };
  };

  const doSubmit = () => {
    if (submittingRef.current) return;        // 연타 가드 — 중복 생성 차단
    submittingRef.current = true;
    onCreate(buildPayload());
    if (!initialPost) reset();
    onClose();
    setTimeout(() => { submittingRef.current = false; }, 1200); // 연타 윈도우만 막고 해제(재사용 대비)
  };

  const handleSubmit = () => {
    const courseName = course?.name || courseQuery.trim();
    if (type === 'fixed' && !courseName) { // 확정형은 골프장 필수 — 침묵 대신 안내(무반응 버튼 방지)
      setAlert({
        title: '골프장을 입력해주세요',
        message: '확정형 모집은 어느 골프장인지\n정해야 등록할 수 있어요.',
      });
      return;
    }

    // 과거 티오프 백스톱 — 피커 클램프를 통과해도(엣지케이스) 만들자마자 노출 윈도우에 걸려
    //   화면에서 사라지는 함정 차단. 확정형만(오픈형은 날짜 미정). [[roundup-schedule-sync]]
    if (type === 'fixed' && date.getTime() < Date.now()) {
      setAlert({
        title: '이미 지난 시간이에요',
        message: '라운지 모집은 앞으로의 라운딩을 잡는 거예요.\n현재 이후의 날짜·시간으로 정해주세요.',
        buttons: [{ text: '확인', style: 'cancel' }],
      });
      return;
    }

    // 친구지정 가드 — include + 0명 차단 (아무도 못 봄), exclude + 0명은 친구공개 동등이라 허용.
    //   '크루로 지정'한 멤버가 있으면 audience가 비지 않으므로 통과.
    if (scope === 'select' && selectMode === 'include' && selectedUids.length === 0 && crewMemberUids.length === 0) {
      setAlert({
        title: '친구를 선택해주세요',
        message: '한 명도 선택하지 않으면 아무도 모집글을 볼 수 없어요.\n친구지정 화면에서 친구를 고르거나 크루를 지정해주세요.',
        buttons: [
          { text: '취소', style: 'cancel' },
          { text: '친구 선택', onPress: () => setShowFriendSelect(true) },
        ],
      });
      return;
    }

    // 지정 인원 < 모집 좌석 — 지정모집은 지정한 친구만 선착순 참여. 풀이 좌석보다 작으면 만석이 안 돼
    //   확정이 막힐 수 있음. 막지 않고 저장 시점에 확인(놓치기 쉬운 inline 안내 보완). 신규 작성에만.
    if (!initialPost && scope === 'select' && selectMode === 'include'
        && selectedUids.length > 0 && selectedUids.length < members) {
      setAlert({
        title: '지정 인원이 모집 인원보다 적어요',
        message: `지정한 친구 ${selectedUids.length}명이 모집 인원 ${members}명보다 적어요.\n지정한 친구만 참여할 수 있어,\n자리가 다 안 차면 확정이 안 될 수 있어요.\n(결원 시 '모집글 수정'에서 인원을 줄여 확정할 수 있어요)\n\n그래도 이대로 등록할까요?`,
        buttons: [
          { text: '취소', style: 'cancel' },
          { text: '이대로 등록', onPress: () => doSubmit() },
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

            {/* 개별 / 단체 — 모집 형태와 함께 맨 위에서 정함(형태를 한 곳에). 인원/팀수도 같이. */}
            <Text style={[mS.bigLabel, { marginTop: 16 }]}>개별 / 단체</Text>
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
            <Text style={[mS.bigLabel, { marginTop: 12 }]}>모집 인원 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>(주최자 외)</Text></Text>
            {groupMode === 'single' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
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
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6 }}>
              {groupMode === 'single'
                ? '함께 칠 동반자를 모아요 (최대 한 팀 4명)'
                : '여러 팀이 함께하는 단체 모집이에요 (한 팀 4명)'}
            </Text>

            <View style={{ height: 1, backgroundColor: C.hairline, marginTop: 18, marginBottom: 2 }} />

            {type === 'fixed' && (
              <>
                <Text style={mS.bigLabel}>골프장</Text>
                <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="골프장 이름으로 검색..."
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

                {/* 세부코스(선택) — 골프장 아래. 자유입력 + 시드 구장이면 칩 제안. 비우면 카드·상세에 미표시 */}
                <Text style={mS.bigLabel}>세부코스 <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray }}>(선택)</Text></Text>
                <AppTextInput style={[mS.input, { fontSize: fs(15), fontFamily: F.sysSb }]} placeholder="예: 동코스 — 없으면 비워두세요"
                  placeholderTextColor={C.warmGrayLight} value={subCourse} maxLength={20}
                  autoCorrect={false} onChangeText={setSubCourse} />
                {subCourseOpts.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <SubCourseChips options={subCourseOpts} value={subCourse} onPick={setSubCourse} />
                  </View>
                )}

                <Text style={mS.bigLabel}>날짜</Text>
                <TouchableOpacity style={mS.input} onPress={() => setShowDate(true)}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textPrimary }}>
                    {fmtDate(date)} ({DAYS[date.getDay()]})
                  </Text>
                </TouchableOpacity>
                <SpinnerPicker visible={showDate} value={date} mode="date" minimumDate={new Date()}
                  onClose={() => setShowDate(false)}
                  // 오늘로 당기면 기존 시각이 과거가 될 수 있어 결합 후 현재 이후로 클램프
                  onPick={(d) => { const nd = new Date(date); nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setDate(clampFutureTee(nd)); }} />

                <Text style={mS.bigLabel}>티오프 시간</Text>
                <TouchableOpacity style={mS.input} onPress={() => setShowTime(true)}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textPrimary }}>{fmtTime(date)}</Text>
                </TouchableOpacity>
                <SpinnerPicker visible={showTime} value={date} mode="time" is24Hour
                  minimumDate={isSameDay(date, new Date()) ? new Date() : undefined}
                  onClose={() => setShowTime(false)}
                  // 오늘 모집인데 과거 시각을 고르면 현재 이후로 클램프(안드 minimumDate 불안정 대비)
                  onPick={(t) => { const nd = new Date(date); nd.setHours(t.getHours(), t.getMinutes(), 0, 0); setDate(clampFutureTee(nd)); }} />
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

            <View style={{ height: 1, backgroundColor: C.hairline, marginTop: 18, marginBottom: 2 }} />

            {/* 공개 범위 — 일반: 칩 선택 / 크루모드: '크루 멤버 공개' 고정 배너 */}
            {crewMode ? (
              <View style={{ marginTop: 14, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10,
                backgroundColor: 'rgba(143,176,107,0.12)', borderWidth: 0.5, borderColor: 'rgba(94,126,66,0.3)' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: C.charcoal }}>크루 ‘{crewName || '우리 크루'}’ 멤버에게 공개</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 16 }}>이 모집은 크루 멤버 전원이 보고 참여할 수 있어요.</Text>
              </View>
            ) : (<>
            <Text style={mS.bigLabel}>공개 범위</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SCOPES.map(([k, l]) => {
                const blocked = k === 'all' && groupMode === 'team';
                return (
                  <TouchableOpacity key={k}
                    style={[mS.chip, scope === k && { backgroundColor: SCOPE_ON_COLOR[k] || C.charcoal, borderColor: SCOPE_ON_COLOR[k] || C.charcoal },
                      blocked && { opacity: 0.4 }, { flex: 1, alignItems: 'center' }]}
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
                    }}>
                    <Text style={[mS.chipTxt, scope === k && mS.chipTxtOn]}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </>)}

            {/* 그룹 빠른선택 — 그룹 멤버로 한 번에 지정(include만). 수동 선택과 병행 ([[friend_groups]] Phase C) */}
            {scope === 'select' && selectMode === 'include' && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 6 }}>
                  그룹으로 빠르게 지정
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {friendData.friendGroups.map(g => (
                    <TouchableOpacity key={g.id} activeOpacity={0.8} onPress={() => pickGroup(g.id)}
                      style={[mS.chip, selectedGroupIds.includes(g.id) && mS.chipOn]}>
                      <Text style={[mS.chipTxt, selectedGroupIds.includes(g.id) && mS.chipTxtOn]}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 크루로 지정 — 선택 크루 멤버 전원을 audience에 추가(친구 아니어도 보고 참여). 친구 그룹과 별개의 묶음 지정 ([[crew-roundup-share-plan]]) */}
            {scope === 'select' && selectMode === 'include' && myCrews.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 6 }}>
                  크루로 지정
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {myCrews.map(c => (
                    <TouchableOpacity key={c.id} activeOpacity={0.8} onPress={() => pickCrew(c.id)}
                      style={[mS.chip, selectedCrewIds.includes(c.id) && mS.chipOn]}>
                      <Text style={[mS.chipTxt, selectedCrewIds.includes(c.id) && mS.chipTxtOn]}>{c.name || '크루'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {crewMemberUids.length > 0 && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                    크루 멤버 {crewMemberUids.length}명에게 공개 — 친구가 아니어도 보고 참여할 수 있어요.
                  </Text>
                )}
              </View>
            )}

            {/* 친구지정 상태 — 모드·인원 표시 + 다시 선택 진입 */}
            {scope === 'select' && (
              <View style={{ marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal }}>
                  {selectMode === 'include' ? '포함' : '제외'} · 친구 {selectedUids.length}명{crewMemberUids.length > 0 ? ` + 크루 ${crewMemberUids.length}명` : ''}
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

            {/* 지정 인원 < 모집 좌석 안내 — 지정모집은 지정한 친구만 참여 가능(선착순). 풀이 좌석보다 작으면
                만석이 안 돼 확정이 막힐 수 있음. 막지 않고 안내 + escape(인원 수정) 제시 ([[roundup-visibility-design]]) */}
            {scope === 'select' && selectMode === 'include' && (selectedUids.length + crewMemberUids.length) > 0 && (selectedUids.length + crewMemberUids.length) < members && (
              <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                backgroundColor: '#FBF3D3', borderWidth: 0.5, borderColor: C.hairline }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                  💡 지정한 인원 {selectedUids.length + crewMemberUids.length}명이 모집 인원 {members}명보다 적어요.{'\n'}지정한 사람만 참여할 수 있어, 자리가 다 안 차면 '모집글 수정'에서 인원을 줄여 확정할 수 있어요.
                </Text>
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

            {/* 동반자 조건·태그 — 전체공개에서만 의미. 친구공개·친구지정·크루는 어차피 친구라 숨김 */}
            {!crewMode && scope === 'all' && (
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

            <View style={{ height: 1, backgroundColor: C.hairline, marginTop: 18, marginBottom: 2 }} />

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
                    <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => setWord(on ? '' : s)}
                      style={{ backgroundColor: on ? C.burgundy : C.bgSecondary, borderRadius: 10,
                        borderWidth: 0.5, borderColor: on ? C.burgundy : C.hairline,
                        paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: on ? C.butter : C.charcoal }}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <AppTextInput style={[mS.input, { minHeight: 64, textAlignVertical: 'top', fontSize: fs(15), lineHeight: 21 }]} multiline
              placeholder="어느 코스인지, 라운딩에 참고할 점을 적어주세요 (예: 듄스코스)" placeholderTextColor={C.warmGrayLight}
              value={word} onChangeText={(t) => setWord(t.slice(0, 40))} />

            <TouchableOpacity style={mS.saveBtn} onPress={handleSubmit}>
              <Text style={[mS.saveBtnTxt, { fontSize: fs(17) }]}>
                {initialPost ? '수정 저장' : (crewMode ? '크루에 올리기' : '모집글 등록')}
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
        onConfirm={({ selectMode: m, selectedUids: u }) => { setSelectMode(m); setSelectedUids(u); setSelectedGroupIds([]); }} />
    </Modal>
  );
}
