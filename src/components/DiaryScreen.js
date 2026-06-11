import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Image, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { C, F, fs } from '../constants/colors';
import { HALL_OF_FAME } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { dS } from '../styles/dS';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { LoadingState } from './common/LoadingState';
import { showAppAlert } from './AppAlert';
import { HallOfFameCard } from './HallOfFameCard';
import { MilestoneCard, reachedMilestones, milestoneId, buildMilestoneEntry, trackTopMedals } from './MilestoneCard';
import { loadFriendData, DEFAULT_FRIEND_GROUPS } from '../utils/friendGroups';
import { ShareMomentModal } from './ShareMomentModal';
import { DiaryCard } from './DiaryCard';
import { DiaryDetail } from './DiaryDetail';
import { DiaryAddModal } from './DiaryAddModal';
import { GolfLedgerModal } from './GolfLedgerModal';
import { MyPageModal } from './MyPageModal';
import { DMListScreen } from './DMListScreen';
import { DMChatScreen } from './DMChatScreen';
import { getTrustGrade } from '../constants/trustGrade';
import { ROUTES } from '../constants/routes';
import { getMannerGrade } from '../constants/mannerGrade';
import { calcHandicap, syncMyHandicap } from '../utils/handicap';
import { countCompletedRounds, displayTotalRounds, countVisitedCourses } from '../utils/roundStats';
import { roundsOnly, isMomentDiary, isRoundDiary } from '../utils/diaryKind';
import { fetchKakaoProfileImage } from '../utils/kakaoAuth';
import { persistPhoto, resolvePhotoUri } from '../utils/photoStorage';
import { uploadAvatar } from '../utils/avatarStorage';
import { CropEditorModal } from './common/CropEditorModal';
import { loadMyFriendsEnriched } from '../utils/friends';
import { getUid } from '../utils/firebase';
import { TrustGradeModal } from './common/TrustBadge';
import { MannerGradeModal } from './common/MannerBadge';
import { HandicapInfoModal } from './common/HandicapInfoModal';
import { MilestoneInfoModal } from './common/MilestoneInfoModal';

// 빈 상태 예시 카드용 더미 데이터 (실제 DiaryCard 컴포넌트로 렌더)
const SAMPLE_DIARY = {
  id: 'sample', date: '2026.05.24', day: '토',
  course: '제이드팰리스 GC', score: 88, par: 72,
  memo: '드라이버가 잘 맞은 날 ⛳', badge: null, special: null,
  photos: [], tags: ['넓은 페어웨이', '그린 빠름'], birdieCount: 2, companions: [],
};

// 라운딩 기록 → 명예의 전당 카드 엔트리. diaryId로 기록과 연결해 수정 시 동기화 가능
function buildHofEntry(data, diaryId) {
  return {
    id: 'hof_' + diaryId,
    diaryId,
    type: data.special,
    date: data.date,
    course: data.course,
    hole: data.specialHole,
    par: data.specialPar || 3,
    distance: data.specialDist || '',
    ball: data.specialBall || '',
    // 라운딩 동반자(나 제외)를 카드에 연동
    companions: (data.companions || []).filter(c => !c.isMe).map(c => c.name),
    memo: data.specialMemo || '',
  };
}

// 라운딩 기록 → 퍼스트 싱글 명예의 전당 엔트리 (라운드 단위 성취 — 80타 미만)
function buildSingleHofEntry(data, diaryId) {
  return {
    id: 'hof_single_' + diaryId,
    diaryId,
    type: '퍼스트 싱글',
    date: data.date,
    course: data.course,
    score: data.score,
    companions: (data.companions || []).filter(c => !c.isMe).map(c => c.name),
    memo: data.memo || '',
  };
}

export function DiaryScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();   // 안드 내비게이션 바 인셋 — 하단 바텀시트 잘림 방지
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { schedules, editSchedule, removeSchedule } = React.useContext(SchedulesContext);
  const { diaries, hydrated: diariesHydrated, addDiary, editDiary, removeDiary, reloadDiaries } = React.useContext(DiariesContext);
  // 친구 좋아요 표시용 — 내 다이어리 likes(uid)를 닉네임으로 해석 (좋아요는 친구만 가능)
  const [friendNameByUid, setFriendNameByUid] = useState({});
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false); // 골프 가계부
  const [showMyPage, setShowMyPage] = useState(false); // 설정 (마이페이지)
  const [dmOpen, setDmOpen] = useState(false);   // 내 프로필 → DM 목록(인스타식) ([[dm-design]])
  const [dmChat, setDmChat] = useState(null);    // 목록에서 연 대화 상대 { uid, name }
  const [gradeModalOpen, setGradeModalOpen] = useState(false); // 신뢰 등급 설명
  const [mannerModalOpen, setMannerModalOpen] = useState(false); // 매너 등급 설명
  const [handicapInfoOpen, setHandicapInfoOpen] = useState(false); // 핸디 계산 설명
  const [milestoneInfoOpen, setMilestoneInfoOpen] = useState(false); // 마일스톤 안내 ([[milestone_badges]])
  const [friendGroups, setFriendGroups] = useState(DEFAULT_FRIEND_GROUPS); // 내 카드 owner 그룹 색라벨용 ([[friend_groups]])
  const [friendMeta, setFriendMeta] = useState({}); // 내가 지정한 별명(customName) — 동반자 이름 표시 resolve용 ([[friend_groups]])
  useEffect(() => { loadFriendData().then(fd => { setFriendGroups(fd.friendGroups); setFriendMeta(fd.friendMeta || {}); }).catch(() => {}); }, []);
  const [statsExpanded, setStatsExpanded] = useState(false); // 통계 박스 펼침 (기본 접힘, 검색 토글과 독립)
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false); // 프로필 사진 변경 시트
  useAndroidBack(avatarSheetOpen, () => setAvatarSheetOpen(false)); // 시트 떠 있을 때 뒤로가기 → 닫기
  const [avatarCropUri, setAvatarCropUri] = useState(null); // 아바타 1:1 크롭 대상(갤러리 선택 후, 크롭 전 raw uri)
  const [addSeed, setAddSeed] = useState(null);
  const [showPickSheet, setShowPickSheet] = useState(false);
  // 친구 좋아요 — 친구 닉네임 맵 로드(마운트 1회) + 화면 포커스 시 내 다이어리 재로드(타인발 좋아요 반영).
  //  DiariesContext는 마운트 1회 로드라 친구가 누른 좋아요가 재진입 전까진 안 들어옴 → 포커스 갱신.
  useEffect(() => {
    loadMyFriendsEnriched()
      .then(list => { const m = {}; list.forEach(f => { m[f.id] = f.customName || f.name; }); setFriendNameByUid(m); })
      .catch(() => {});
    const unsub = navigation?.addListener?.('focus', () => { reloadDiaries(); });
    return unsub;
  }, [navigation, reloadDiaries]);
  // 미기록 라운딩 — 지난 일정(오늘 포함) 중 라운딩 기록이 1:1로 배정되지 않은 것.
  //  · 같은 날 같은 구장 2건(36홀·더블)도 각각 일정-기록 1:1로 매칭(정책: 2건 따로 지원)
  //  · 기록의 scheduleId가 가리키던 일정이 삭제(dangling)됐어도 course+date로 다시 이어 '이미 기록인데 미기록으로 떠 중복 기록'을 방지
  const unrecordedRounds = React.useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); const todayMid = t.getTime();
    const existingIds = new Set((schedules || []).map(s => s.id));
    const usedRounds = new Set();        // 이미 어떤 일정에 배정된 기록 id (1:1 보장)
    const recordedSchedIds = new Set();  // 기록이 직접 연결된 일정 id

    // 1차: scheduleId 직접 연결 (가장 강한 1:1) — 모든 일정에 우선 배정
    for (const d of (diaries || [])) {
      if (d.scheduleId && existingIds.has(d.scheduleId) && !usedRounds.has(d.id)) {
        recordedSchedIds.add(d.scheduleId);
        usedRounds.add(d.id);
      }
    }

    // 후보: 국내·지난(오늘 포함)·유효 날짜·아직 직접 연결 안 된 일정
    const candidates = (schedules || []).filter(s => {
      if (s.overseas || !s.date) return false; // 해외는 해외 흐름에서 별도
      const [y, m, d] = s.date.split('.').map(Number);
      if (!y || !m || !d) return false;
      const sd = new Date(y, m - 1, d).getTime(); // 로컬 자정 — todayMid와 같은 기준(타임존 일치)
      return sd <= todayMid && !recordedSchedIds.has(s.id);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // 2차: 후보를 무연결/끊긴(dangling) 기록과 course+date로 1:1 매칭 — 매칭되면 기록된 것으로 간주
    const result = [];
    for (const s of candidates) {
      const loose = (diaries || []).find(d => !usedRounds.has(d.id)
        && d.course === s.course && d.date === s.date
        && (!d.scheduleId || !existingIds.has(d.scheduleId)));
      if (loose) { usedRounds.add(loose.id); continue; } // 이 일정은 이미 기록됨
      result.push(s);
    }
    return result;
  }, [schedules, diaries]);
  // 기록 추가 진입 — 미기록 라운딩 있으면 선택 시트, 없으면 바로 직접 입력
  const openAddFlow = () => {
    if (unrecordedRounds.length > 0) setShowPickSheet(true);
    else { setAddSeed(null); setShowModal(true); }
  };
  const pickRoundToRecord = (s) => {
    setAddSeed({ date: s.date, course: s.course, courseId: s.courseLogId || s.courseId || null, courseLoc: s.courseLoc || null, companions: Array.isArray(s.companions) ? s.companions : [], scheduleId: s.id || null });
    setShowPickSheet(false);
    setShowModal(true);
  };
  const startBlankRecord = () => { setAddSeed(null); setShowPickSheet(false); setShowModal(true); };
  const [hofExpanded, setHofExpanded] = useState(false);
  const [hofTeaserDismissed, setHofTeaserDismissed] = useState(false); // 명예의 전당 티저 '다시 보지 않기' 여부
  const [hofHintSeen, setHofHintSeen] = useState(false); // 첫 특별한 순간 생긴 후 '펼치기' 안내 말풍선 본 여부
  const [hallOfFame, setHallOfFame] = useState(HALL_OF_FAME);
  const [hofHydrated, setHofHydrated] = useState(false);
  const [shareMoment, setShareMoment] = useState(null);   // 특별한 순간 공유 대상
  const [search, setSearch] = useState('');
  const [filterKey, setFilterKey] = useState('전체');
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      setSelected(null);
      setShowModal(false);
      setShowSearch(false);
      setHofExpanded(false);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    (async () => {
      const [h, teaserDismissed, hintSeen] = await Promise.all([
        storage.load(STORAGE_KEYS.hof, HALL_OF_FAME),
        storage.load(STORAGE_KEYS.hofTeaserDismissed, false),
        storage.load(STORAGE_KEYS.hofHintSeen, false),
      ]);
      setHallOfFame(h);
      setHofHydrated(true);
      setHofTeaserDismissed(teaserDismissed);
      setHofHintSeen(hintSeen);
    })();
  }, []);

  useEffect(() => {
    if (!hofHydrated) return;
    storage.save(STORAGE_KEYS.hof, hallOfFame);
  }, [hallOfFame, hofHydrated]);

  // 활동 마일스톤 도달 감지 → 명예의 전당에 멱등 등재(이미 넘긴 단계는 백필).
  // 데이터(라운딩=총 라운딩, 방문 구장=CourseLog 집계)는 이미 있는 것 재사용 — 화면 간 숫자 일치.
  // 한 번 오른 카드는 라운딩 삭제로 카운트가 줄어도 회수하지 않는다(성취 영속).
  useEffect(() => {
    if (!hofHydrated) return;
    const rounds = displayTotalRounds(userProfile, countCompletedRounds(diaries, schedules));
    const courses = countVisitedCourses(diaries, schedules);
    const reached = reachedMilestones({ rounds, courses });
    if (reached.length === 0) return;
    setHallOfFame(prev => {
      const have = new Set(prev.map(h => h.id));
      const missing = reached.filter(m => !have.has(milestoneId(m.category, m.value)));
      if (missing.length === 0) return prev;  // 변화 없으면 같은 참조 반환 → 재렌더·루프 방지
      return [...missing.map(buildMilestoneEntry), ...prev];
    });
  }, [hofHydrated, diaries, schedules, userProfile]);

  // 내 핸디를 users 문서에 동기화 — 라운지 모집 상세에서 남(주최자·참여자)이 내 핸디 보이게.
  //   값이 바뀔 때만 write(중복 방지). ([[friend_groups]] 핸디표시 / handicap.syncMyHandicap)
  useEffect(() => {
    const hc = calcHandicap(diaries, userProfile.avgScore);
    if (hc != null && hc !== userProfile.handicap) syncMyHandicap(hc);
  }, [diaries, userProfile.avgScore, userProfile.handicap]);

  // 홈 'D-0 기록 보기'로 상세 진입한 경우, 닫을 때(안드 뒤로가기 포함) MY 목록이 아니라 홈으로 복귀
  const detailFromHomeRef = React.useRef(false);
  useEffect(() => {
    if (route?.params?.openDiaryId) {
      const target = diaries.find(d => d.id === route.params.openDiaryId);
      if (target) {
        detailFromHomeRef.current = !!route.params.returnToHome;
        setSelected(target);
        // params 초기화 — 안 하면 같은 id로 재진입 시 useEffect가 안 트리거되어
        // MY 첫 화면(다이어리 목록)이 떠버림.
        // diaries가 아직 로딩 안 돼 target이 없을 땐 setParams 안 함 → diaries 변경 후 재시도
        navigation.setParams({ openDiaryId: undefined, returnToHome: undefined });
      }
    }
  }, [route?.params?.openDiaryId, diaries]);

  // 상세 닫기 — 홈에서 진입했으면 홈으로, 아니면 MY 목록으로 복귀
  const handleCloseDetail = React.useCallback(() => {
    setSelected(null);
    if (detailFromHomeRef.current) {
      detailFromHomeRef.current = false;
      navigation.navigate(ROUTES.HOME);
    }
  }, [navigation]);

  // 일정 모달에서 진입한 경우 모달 닫을 때 일정 화면으로 자동 복귀 ([[modal-navigation-pattern]] navigation 복귀)
  const returnToScheduleRef = React.useRef(false);

  useEffect(() => {
    if (route?.params?.openAddModal) {
      // 일정 캘린더·내 코스기록에서 날짜·골프장·일정ID를 미리 채워서 전달
      // scheduleId가 있으면 다이어리에 보존되어 같은 날 일정 N건 매칭 시 1:1 보장
      const { addDate, addCourse, addCourseId, addScheduleId, addCompanions, returnToSchedule } = route.params;
      // 일정에서 진입 시 동반자도 함께 끌어옴 — 진입처가 일정 객체를 갖고 있으면 addCompanions로 직접 전달(권장),
      // 없으면 scheduleId로 해당 일정을 찾아 채움(폴백). find는 일정 목록 미로드·id 불일치 시 빈 배열이 되는 취약점이 있어 직접 전달 우선.
      const seedSchedule = addScheduleId ? (schedules || []).find(s => s.id === addScheduleId) : null;
      const seedCompanions = Array.isArray(addCompanions) ? addCompanions
        : (Array.isArray(seedSchedule?.companions) ? seedSchedule.companions : []);
      setAddSeed((addDate || addCourse || addScheduleId)
        ? { date: addDate, course: addCourse, courseId: addCourseId, scheduleId: addScheduleId || null,
            companions: seedCompanions }
        : null);
      returnToScheduleRef.current = !!returnToSchedule;
      setShowModal(true);
      navigation.setParams({ openAddModal: undefined, addDate: undefined, addCourse: undefined, addCourseId: undefined, addScheduleId: undefined, addCompanions: undefined, returnToSchedule: undefined });
    }
  }, [route?.params?.openAddModal]);

  // DiaryAddModal 닫힘(저장·취소 무관) — 일정 모달에서 진입한 경우 홈으로 가서 일정 모달 재오픈
  const handleAddModalClose = React.useCallback(() => {
    setShowModal(false);
    if (returnToScheduleRef.current) {
      returnToScheduleRef.current = false;
      navigation.navigate(ROUTES.HOME, { openSchedule: true });
    }
  }, [navigation]);

  const handleSave = async (type, data) => {
    if (type === 'diary') {
      // Firestore에서 ID 자동 생성. 신규 생성 후 명예의 전당도 같이 갱신.
      const created = await addDiary({
        kind: data.kind === 'moment' ? 'moment' : 'round', // 일상(모멘트) 격리 플래그([[moment-feed-extension]])
        date: data.date, day: data.day, course: data.course,
        scheduleId: data.scheduleId || null,        // 일정 연결 — 미기록 리스트 선택/일정 진입 시 1:1 매칭(같은 구장·날 비대칭 차단)
        score: data.score, par: 72, memo: data.memo || '',
        holeScores: data.holeScores || null,        // 스코어카드 18홀
        holePars: data.holePars || null,            // 스코어카드 par 행 (버디 자동집계)
        holeScoresShared: !!data.holeScoresShared,  // 홀별 상세 공개여부 (기본 나만보기)
        birdieCount: data.birdieCount || 0,         // 버디 수 (자동/수동)
        badge: null, weather: data.weather,
        special: data.special || null,
        specialHole: data.specialHole || null,
        specialPar: data.specialPar || null,
        specialDist: data.specialDist || '',
        specialBall: data.specialBall || '',
        specialMemo: data.specialMemo || '',
        companions: data.companions || [{ name: userProfile.nickname, isMe: true }],
        photos: data.photos || [],
        starRating: data.starRating || 0,
        tags: data.tags || [],
        detailMemo: data.detailMemo || '',
        courseId: data.courseId || null,
        cost: data.cost || null,
        visibility: data.visibility || 'friends',
        audienceUids: data.audienceUids || [],          // 그룹 공개 수신자 스냅샷 ([[friend_groups]])
        audienceGroupIds: data.audienceGroupIds || [],  // 원본 그룹 선택(수정 복원용)
        overseas: !!data.overseas,
        country: data.country || '',
      });
      // 일상(모멘트)은 명예의전당·첫싱글 대상 아님 — score:null이라 가드 없으면 첫싱글(≤79) 오발동([[moment-feed-extension]])
      if (data.kind !== 'moment') {
        setHallOfFame(prev => {
          let next = prev;
          // 특별한 순간(홀인원·이글·알바트로스) 카드
          if (data.special) next = [buildHofEntry(data, created.id), ...next];
          // 퍼스트 싱글 — 80타 미만 첫 기록 시 1회 자동 등재.
          // 온보딩/프로필 라이프베스트가 이미 싱글(≤79)이면 제외 — 이미 싱글이라 '첫' 싱글 아님.
          // lifeBest 직접 사용: MyPage에서 lifeBest 수정 시 hasFirstSingle 플래그는 stale → lifeBest가 정확.
          const onboardBest = userProfile.lifeBest || 99;
          if (data.score <= 79 && onboardBest > 79 && !prev.some(h => h.type === '퍼스트 싱글')) {
            next = [buildSingleHofEntry(data, created.id), ...next];
          }
          return next;
        });
      }
      // 직접 작성 다이어리(scheduleId 없음) → 미리 잡아둔 일정이 있으면 거기에만 연결.
      // ★ 과거 기록의 '일정 자동 생성'은 폐지 — 통계·방문수에 0 기여(roundStats가 diary와
      //   중복제거·매칭제외)하면서 날짜수정·삭제 시 고아 카드만 양산. 캘린더 표시는 diary
      //   가상카드(orphanItems)로 커버됨. ([[diary-schedule-orphan-fix]])
      // 국내/해외 도메인이 같은 일정만 매칭 (해외 기록이 국내 일정에 붙어 미기록 카드로 새는 것 방지)
      if (data.kind !== 'moment' && !data.scheduleId) { // 일상은 일정 연결 안 함
        try {
          const existingSched = schedules.find(s =>
            s.course === data.course && s.date === data.date
            && !!s.overseas === !!data.overseas
            && !diaries.some(d => d.scheduleId === s.id));
          // 미리 잡아둔 예정 일정이 있을 때만 연결. 없으면 새 일정 만들지 않음(고아 차단).
          if (existingSched) {
            try { await editDiary(created.id, { scheduleId: existingSched.id }); }
            catch (e) { console.warn('[diary] scheduleId link failed:', e?.message); }
          }
        } catch (e) {
          console.warn('[diary] schedule link failed:', e?.message);
        }
      }
    } else if (type === 'diary-edit') {
      const before = diaries.find(d => d.id === data.id);
      // Firestore 업데이트 — data.id를 기준으로. id·ownerUid는 round.js가 자동으로 분리.
      await editDiary(data.id, data);
      // ① 날짜·구장이 바뀌었고 연결된 '개인' 일정이 있으면 일정도 같이 이동 — 캘린더 어긋남/고아 차단.
      //   라운지 확정 일정(roundupId)은 공유 데이터라 안 건드림(날짜는 DiaryAddModal에서 잠금). ([[diary-schedule-orphan-fix]])
      if (before && data.scheduleId && (before.date !== data.date || before.course !== data.course)) {
        const sched = schedules.find(s => s.id === data.scheduleId);
        if (sched && !sched.roundupId) {
          try { await editSchedule(data.scheduleId, { date: data.date, day: data.day, course: data.course }); }
          catch (e) { console.warn('[diary] schedule sync failed:', e?.message); }
        }
      }
      // 명예의 전당 동기화
      setHallOfFame(prev => {
        const holeId = 'hof_' + data.id;
        const singleId = 'hof_single_' + data.id;
        let next = prev;
        // 홀 성취 카드(홀인원·이글·알바트로스) — special 값으로 등재/갱신/해제
        const holeExists = next.some(h => h.id === holeId);
        if (data.special) {
          next = holeExists
            ? next.map(h => h.id === holeId ? buildHofEntry(data, data.id) : h)
            : [buildHofEntry(data, data.id), ...next];
        } else if (holeExists) {
          next = next.filter(h => h.id !== holeId);
        }
        // 퍼스트 싱글 카드 — '자격'(최초 1회 마일스톤)은 건드리지 않고,
        // 이미 등재된 카드면 골프장·날짜·동반자·메모 등 내용만 갱신
        next = next.map(h => h.id === singleId ? buildSingleHofEntry(data, data.id) : h);
        return next;
      });
    }
  };

  // 라운딩 삭제 — 기록 + 연결된 개인 일정 함께 삭제(scheduleId 우선, 라운지 보호). mode는 'all' 단일로 통일.
  const handleDeleteDiary = async (target, mode) => {
    await removeDiary(target.id);
    // 연결된 명예의 전당 카드도 함께 삭제
    setHallOfFame(prev => prev.filter(h => h.diaryId !== target.id));
    if (mode === 'all') {
      // ② 연결 일정 삭제는 scheduleId 우선 — 날짜·구장이 수정돼 어긋나도 정확히 그 일정을 지움(고아 차단).
      //   scheduleId가 없거나 끊긴 옛 데이터만 course+date 폴백. 라운지 일정(roundupId)은 공유 데이터라 보호.
      //   ([[diary-schedule-orphan-fix]] · [[roundup-schedule-delete-policy]])
      const linked = (target.scheduleId ? schedules.filter(s => s.id === target.scheduleId) : []);
      const matches = linked.length
        ? linked
        : schedules.filter(s => s.date === target.date && s.course === target.course);
      for (const s of matches) {
        if (s.roundupId) continue; // 라운지 확정 일정은 다이어리 삭제로 지우지 않음
        try { await removeSchedule(s.id); }
        catch (e) { console.warn('[diary] schedule remove failed:', e?.message); }
      }
    }
    setSelected(null);
  };

  // 명예의 전당 티저 '다시 보지 않기' — 영구 감춤
  const dismissHofTeaser = () => {
    setHofTeaserDismissed(true);
    storage.save(STORAGE_KEYS.hofTeaserDismissed, true);
  };

  // '펼치기' 안내 말풍선 닫기(또는 펼치면) — 다시 안 뜸
  const dismissHofHint = () => {
    setHofHintSeen(true);
    storage.save(STORAGE_KEYS.hofHintSeen, true);
  };

  // createdAt(Firestore Timestamp) → millis.
  //  - 없음(아주 옛 데이터): 0 (맨 뒤)
  //  - 미해결 serverTimestamp() 센티넬(방금 낙관적 추가, 리로드 전): Infinity = 최신 취급
  //    (안 그러면 0이 돼 같은 날 기록 중 방금 만든 게 맨 아래로 가고, 리로드 때만 제자리)
  const tsMillis = (d) => {
    const c = d?.createdAt;
    if (!c) return 0;
    if (typeof c === 'number') return c;
    if (typeof c.toMillis === 'function') return c.toMillis();
    if (typeof c.seconds === 'number') return c.seconds * 1000;
    return Infinity;
  };
  const sortedDiaries = [...diaries].sort((a, b) => {
    const dateA = new Date((a.date || '').replace(/\./g, '-'));
    const dateB = new Date((b.date || '').replace(/\./g, '-'));
    if (dateB - dateA !== 0) return dateB - dateA;
    // 같은 날짜는 작성 시각 최신순 — 일상(모멘트, date=작성일)이 같은 날 라운딩 사이에 자연스럽게 인터리브([[moment-feed-extension]])
    return tsMillis(b) - tsMillis(a);
  });

  // 퍼스트 싱글 명예의 전당 카드와 연결된 다이어리 id — 피드 배지 표시용
  const firstSingleId = hallOfFame.find(h => h.type === '퍼스트 싱글')?.diaryId;

  if (selected) return <DiaryDetail item={selected} isFirstSingle={!!firstSingleId && selected.id === firstSingleId} friendGroups={friendGroups} friendMeta={friendMeta} onClose={handleCloseDetail}
    onUpdate={(updated) => {
      // handleSave('diary-edit')를 거쳐야 명예의 전당(특별한 순간)까지 함께 동기화됨
      handleSave('diary-edit', updated);
      setSelected(updated);
    }}
    onDelete={handleDeleteDiary} />;

  // 프로필 사진 변경 — 갤러리·카카오·기본
  const persistProfile = (patch) => {
    const updated = { ...userProfile, ...patch };
    setUserProfile({ ...updated });            // 즉시 반영(본인은 로컬 사진 바로 표시)
    storage.save(STORAGE_KEYS.profile, updated);
    // 아바타 변경 시 친구 공개용 https URL 생성(Storage 업로드, 백그라운드).
    // 본인 표시는 avatarUri(로컬), 친구 공개는 avatarUrl(https) — App.js write-through가 users에 동기화.
    if ('avatarUri' in patch) {
      (async () => {
        try {
          const uid = await getUid();
          const url = patch.avatarUri ? await uploadAvatar(uid, patch.avatarUri) : null;
          const withUrl = { ...updated, avatarUrl: url };
          setUserProfile({ ...withUrl });
          storage.save(STORAGE_KEYS.profile, withUrl);
        } catch (e) {
          if (__DEV__) console.warn('[DiaryScreen] avatar upload sync fail', e?.message);
        }
      })();
    }
  };
  // 갤러리에서 원본만 고르고(네이티브 크롭 미사용), 인앱 CropEditorModal(1:1)로 크롭 → 안드·iOS 동일.
  const pickAvatarImageRaw = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1, // 크롭 전이라 원본 화질 유지 (크롭 시 600px·압축됨)
      });
      if (result.canceled) return null;
      return result.assets[0].uri;
    } catch (e) {
      console.warn('[DiaryScreen] 이미지 선택 오류', e?.message);
      return null;
    }
  };
  // 자체 오버레이 시트로 처리 — Modal 위에서 갤러리 피커 호출 시 전환 충돌 회피
  const avatarOptions = [
    { text: '갤러리에서 선택', onPress: async () => { const uri = await pickAvatarImageRaw(); if (uri) setAvatarCropUri(uri); } },
    ...(userProfile.kakaoLinked
      ? [{ text: '카카오 프로필 사진 가져오기', onPress: async () => {
          const uri = await fetchKakaoProfileImage();
          if (uri) persistProfile({ avatarUri: uri });
          else showAppAlert('가져오지 못했어요', '카카오 프로필 사진을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
        } }]
      : []),
    ...(userProfile.avatarUri
      ? [{ text: '기본 이미지로 변경', danger: true, onPress: () => persistProfile({ avatarUri: null }) }]
      : []),
  ];

  // 명함·통계용 값
  const myName = userProfile.nickname || '나';
  const myInitial = myName.charAt(0);
  const myGrade = getTrustGrade(userProfile.hostedCount || 0, userProfile.mannerScore || 0);
  const myManner = getMannerGrade(userProfile.mannerScore || 70);
  const myHandicap = calcHandicap(diaries, userProfile.avgScore);
  // 통계 박스 — 평균타 라벨 폐기, 핸디로 통일 (친구에게 공개되는 핸디 뱃지와 일관성).
  // 라운딩 5개 이하면 입력값 우선, 6개부터는 베스트 5개 평균 (잘 친 5개만, 못 친 건 버림).
  // 총 라운딩 = 자동 완료 라운딩(다이어리+미기록 지난 일정)에, 마이페이지 입력 기준값 반영([[project_total_rounds]])
  const completedRounds = countCompletedRounds(diaries, schedules);
  const _dispTotal = displayTotalRounds(userProfile, completedRounds);
  const totalRounds = _dispTotal > 0 ? _dispTotal : null;
  // 라이프베스트 = 설정값(수동 입력한 과거 베스트)과 다이어리 최저 중 더 좋은(낮은) 값.
  // (다이어리만 쓰면 설정 89가 무시돼, 100짜리 라운딩 추가 시 100으로 잘못 표시되던 버그 수정)
  // 일상(모멘트)은 스코어가 없으므로 제외 — 안 그러면 Math.min에 undefined 섞여 NaN
  const roundScores = roundsOnly(diaries).map(d => d.score).filter(v => Number.isFinite(v) && v > 0);
  const diaryBest = roundScores.length ? Math.min(...roundScores) : null;
  const bestCandidates = [diaryBest, userProfile.lifeBest].filter(v => Number.isFinite(v) && v > 0);
  const bestScore = bestCandidates.length ? Math.min(...bestCandidates) : null;
  // 명함 — 이름 / 흐린 트랙 메달 줄(탭→안내) / 멘트
  const visitedCourses = countVisitedCourses(diaries, schedules);
  const medals = trackTopMedals({ rounds: _dispTotal, courses: visitedCourses }); // { rounds, courses }: 트랙별 최고 메달 value|null
  const myStatus = (userProfile.statusMessage || '').trim();
  // 통계박스 — 핸디 계산 라벨·설명 유지(애매함 방지). 핸디/베스트 그대로 둠.
  const statBoxes = [
    { label: '총 라운딩', value: totalRounds },
    { label: '핸디', value: myHandicap, hi: true },
    { label: '베스트', value: bestScore },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 명함 영역 — 헤더 제거, 아바타 + 닉네임·등급 + 주최/참석, 우상단에 💰·⚙️ */}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, backgroundColor: C.bgPrimary }}>
        <View style={{ position: 'absolute', top: 14, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 1 }}>
          <TouchableOpacity onPress={() => setShowLedger(true)} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(24) }}>💰</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowMyPage(true)} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(24) }}>⚙️</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingRight: 80 }}>
          {/* 아바타 — 탭하면 사진 변경 액션시트 */}
          <View>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setAvatarSheetOpen(true)}
              style={{ width: 80, height: 80, borderRadius: 40,
                backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {userProfile.avatarUri ? (
                <Image source={{ uri: resolvePhotoUri(userProfile.avatarUri) }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Text style={{ fontFamily: F.en, fontSize: fs(32), color: '#fff' }}>{myInitial}</Text>
              )}
            </TouchableOpacity>
            <View pointerEvents="none" style={{ position: 'absolute', right: -2, bottom: -2,
              width: 26, height: 26, borderRadius: 13, backgroundColor: C.charcoal,
              borderWidth: 2, borderColor: C.bgPrimary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: fs(12) }}>📷</Text>
            </View>
            {/* 메시지(DM) — 아바타 우상단. 내 프로필 진입 = 대화 목록(인스타식) ([[dm-design]]) */}
            <TouchableOpacity onPress={() => setDmOpen(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ position: 'absolute', top: -18, right: -12 }}>
              <Text style={{ fontSize: fs(36), textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>💬</Text>
            </TouchableOpacity>
          </View>
          {/* 이름+마일스톤 / 라이프베스트 / 멘트 — 친구모집 전환으로 신뢰·매너·주최·참석 제거([[roundup-friend-redesign]]) */}
          <View style={{ flex: 1 }}>
            {/* 이름 — 옆은 깔끔하게(배지 미부착). 마일스톤은 아래 흐린 줄로. */}
            <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal, marginLeft: 12 }}>{myName}</Text>
            {/* 흐린 트랙 메달 줄 — 이름 아래(옛 라베 자리). 탭하면 마일스톤 안내. 미달성이면 '모으는 중'. ([[milestone_badges]])
                트랙별 최고 메달만 흐리게(라운딩·구장). TEMP 10이면 10도 표시(미리보기). */}
            <TouchableOpacity onPress={() => setMilestoneInfoOpen(true)} activeOpacity={0.7}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, marginLeft: 12 }}>
              {(medals.rounds != null || medals.courses != null) ? (
                <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray }}>
                  {[medals.rounds != null ? `🏅 라운딩 ${medals.rounds}` : null,
                    medals.courses != null ? `🏅 구장 ${medals.courses}` : null].filter(Boolean).join('   ·   ')}
                </Text>
              ) : (
                <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGrayLight }}>🏅 마일스톤 모으는 중</Text>
              )}
              <Text style={{ fontSize: fs(10), color: C.warmGrayLight }}>ⓘ</Text>
            </TouchableOpacity>
            {/* 멘트(상태 메시지) — 표시 전용. 편집은 마이페이지 내 정보에서.
                lineHeight 넉넉히(이모지 윗부분 잘림 방지) */}
            {/* 멘트 — 한 줄 고정. 버튼(💰·⚙️)보다 아래라 우측 여백을 되찾아(marginRight 음수) 폭 확보 */}
            <Text numberOfLines={1} style={{ fontFamily: myStatus ? F.sysM : F.sys, fontSize: fs(13),
              color: myStatus ? C.charcoal : C.warmGray, marginTop: 7, marginLeft: 12, marginRight: -64, lineHeight: 22 }}>
              {myStatus || '마이페이지에서 한마디를 남겨보세요'}
            </Text>
          </View>
        </View>
      </View>

      {/* 통계 토글 — 검색 토글과 완전히 독립. 기본 펼침 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>
        {statsExpanded && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
            {statBoxes.map((st, i) => (
              <View key={i} style={{
                flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
                backgroundColor: st.hi ? '#F5F0E4' : C.bgSecondary,
                borderWidth: st.hi ? 1 : 0.5, borderColor: st.hi ? C.burgundy : C.hairline,
              }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(20), color: st.hi ? C.burgundy : C.charcoal }}>
                  {st.value != null ? st.value : '—'}
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>{st.label}</Text>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity onPress={() => setStatsExpanded(v => !v)} activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 12 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray }}>
            통계 {statsExpanded ? '접기' : '펼치기'}
          </Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(9), color: C.warmGray }}>{statsExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </View>

      {(() => {
        const FILTERS = ['전체', '라운딩', '일상', '올해', '베스트 스코어'];

        const filtered = (() => {
          let list = sortedDiaries;
          const q = search.trim().toLowerCase();
          if (q) {
            list = list.filter(d => {
              if ((d.course || '').toLowerCase().includes(q)) return true;
              return (d.companions || []).some(c => (c.name || '').toLowerCase().includes(q));
            });
          }
          const now = new Date();
          if (filterKey === '라운딩') {
            list = list.filter(isRoundDiary); // 라운딩 기록만 보기
          } else if (filterKey === '일상') {
            list = list.filter(isMomentDiary); // 일상(모멘트)만 보기
          } else if (filterKey === '올해') {
            list = list.filter(d => (d.date || '').startsWith(String(now.getFullYear())));
          }
          if (filterKey === '베스트 스코어') {
            // 일상(모멘트)은 스코어가 없어 랭킹서 제외 — 안 그러면 score null이 0으로 최상단 오염
            list = roundsOnly(list).sort((a, b) => a.score - b.score);
          }
          return list;
        })();

        // DiaryCard 색상 비교용 — 통계 박스 핸디로 통일 (5개 미만 입력값, 6개+ 베스트 5개 평균)
        const avgScore = myHandicap;

        // 첫 로드 전 — 빈 상태 대신 로딩 스피너 (다이어리 로컬+Firestore 로드 동안 깜빡임 방지)
        if (!diariesHydrated) {
          return <LoadingState style={{ backgroundColor: C.bgPrimary }} />;
        }
        // 기록이 하나도 없을 때 — 빈 상태 (예시 카드 + CTA)
        if (diaries.length === 0) {
          return (
            <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', paddingTop: 40, paddingBottom: 48 }}>
              <Text style={{ fontSize: fs(38), marginBottom: 14 }}>⛳  📷</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 6 }}>
                아직 라운딩 기록 / 일상이 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 20 }}>
                라운딩 기록이나 일상을 남기면{'\n'}이렇게 피드에 쌓여요
              </Text>
              <View style={{ width: '100%', marginTop: 22 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8, marginLeft: 16 }}>라운딩 기록 예시</Text>
                <View style={{ opacity: 0.6, paddingHorizontal: 16 }} pointerEvents="none">
                  <DiaryCard item={SAMPLE_DIARY} avgScore={null} onPress={() => {}} />
                </View>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
                스크린·연습장에서의 일상도{'\n'}자유롭게 남겨보세요
              </Text>
              <TouchableOpacity onPress={openAddFlow} activeOpacity={0.85}
                style={{ marginTop: 18, backgroundColor: C.burgundy, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 32 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.butter }}>✏️ 첫 기록 남기기</Text>
              </TouchableOpacity>
            </ScrollView>
          );
        }

        return (
          <>
            <View style={dS.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={[dS.filterTabRow, { flexGrow: 1, justifyContent: 'space-between', paddingRight: 16 }]}>
                {FILTERS.map(f => {
                  const on = filterKey === f;
                  return (
                    <TouchableOpacity key={f} activeOpacity={0.7}
                      style={[dS.filterTab, on && dS.filterTabOn]}
                      onPress={() => setFilterKey(on ? '전체' : f)}>
                      <Text style={[dS.filterTabTxt, on && dS.filterTabTxtOn]}>{f}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity activeOpacity={0.6}
                style={dS.searchToggleBtn}
                onPress={() => {
                  if (showSearch) { setShowSearch(false); setSearch(''); }
                  else setShowSearch(true);
                }}>
                <Text style={[dS.searchToggleTxt, showSearch && { color: '#6B1E2A' }]}>🔍</Text>
              </TouchableOpacity>
            </View>

            {showSearch && (
              <View style={dS.searchWrap}>
                <Text style={dS.searchIcon}>🔍</Text>
                <TextInput
                  style={dS.searchInput}
                  placeholder="골프장 또는 동반자 이름"
                  placeholderTextColor={C.warmGrayLight}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
                <TouchableOpacity activeOpacity={0.6}
                  onPress={() => { setShowSearch(false); setSearch(''); }}>
                  <Text style={dS.searchCloseTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}>
              {hallOfFame.length > 0 ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <TouchableOpacity style={dS.hofToggle} onPress={() => { setHofExpanded(!hofExpanded); if (!hofHintSeen) dismissHofHint(); }}>
                    <Text style={dS.hofSectionLabel}>특별한 순간 · {hallOfFame.length}개</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#C9A84C' }}>{hofExpanded ? '접기' : '펼치기'}</Text>
                  </TouchableOpacity>
                  {/* 첫 특별한 순간 안내 말풍선 — 카드가 접혀 있어 존재를 모르는 문제(테스터 피드백). 펼치거나 닫으면 다시 안 뜸 */}
                  {!hofExpanded && !hofHintSeen && (
                    <View style={{ marginTop: 8, backgroundColor: '#2A2622', borderRadius: 12, borderWidth: 1, borderColor: '#C9A84C55', paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: fs(18) }}>🏆</Text>
                      <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', lineHeight: 18 }}>
                        '펼치기'를 누르면 특별한 순간 카드를 볼 수 있어요.{'\n'}갤러리에 저장해 친구들에게 공유할 수도 있어요.
                      </Text>
                      <TouchableOpacity onPress={dismissHofHint} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: 'rgba(255,255,255,0.45)' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {hofExpanded && hallOfFame.map(item => (
                    item.kind === 'milestone'
                      ? <MilestoneCard key={item.id} item={item} onShare={() => setShareMoment(item)} />
                      : <HallOfFameCard key={item.id} item={item} onShare={() => setShareMoment(item)} />
                  ))}
                  <View style={{ height: 8 }} />
                </View>
              ) : !hofTeaserDismissed ? (
                /* 특별한 기록이 없을 때 — 명예의 전당 잠금 티저 ('다시 보지 않기' 전까지) */
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <Text style={dS.hofSectionLabel}>명예의 전당</Text>
                  <View style={{ marginTop: 10, marginBottom: 8, backgroundColor: '#2A2622', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C44', paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center' }}>
                    <Text style={{ fontSize: fs(26) }}>🔒</Text>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#C9A84C', marginTop: 8 }}>아직 특별한 순간이 없어요</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.55)', marginTop: 6, textAlign: 'center', lineHeight: 17 }}>
                      홀인원 · 알바트로스 · 이글 · 첫싱글을 기록하면{'\n'}명예의 전당 카드가 만들어져요
                    </Text>
                    <TouchableOpacity onPress={dismissHofTeaser} activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 14 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.4)', textDecorationLine: 'underline' }}>더 이상 보지 않기</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {filtered.length === 0 ? (
                <View style={dS.emptyWrap}>
                  <Text style={dS.emptyMsg}>{filterKey === '일상' ? '아직 일상이 없어요' : filterKey === '라운딩' ? '아직 라운딩 기록이 없어요' : '검색 결과가 없어요'}</Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                  {filtered.map((item, idx) => {
                    const isFS = !!firstSingleId && item.id === firstSingleId;
                    return (
                    <View key={item.id} style={dS.tlNode}>
                      {idx < filtered.length - 1 && <View style={dS.tlLine} />}
                      <View style={[dS.tlDot, item.badge === '베스트' && dS.tlDotBest, item.badge === '버디' && dS.tlDotBirdie, (item.special || isFS) && dS.tlDotSpecial]} />
                      <DiaryCard item={item} avgScore={avgScore} isFirstSingle={isFS} friendNameByUid={friendNameByUid} friendGroups={friendGroups} onPress={(it) => setSelected(it)} />
                    </View>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 32 }} />
            </ScrollView>
          </>
        );
      })()}

      {/* + 다이어리 추가 — 우하단 FAB */}
      <TouchableOpacity onPress={openAddFlow} activeOpacity={0.85}
        style={{ position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
          backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 6 }}>
        <View style={{ width: 18, height: 2.5, borderRadius: 1, backgroundColor: '#fff' }} />
        <View style={{ position: 'absolute', width: 2.5, height: 18, borderRadius: 1, backgroundColor: '#fff' }} />
      </TouchableOpacity>

      <DiaryAddModal visible={showModal} onClose={handleAddModalClose} onSave={handleSave} initial={addSeed} />

      {/* 미기록 라운딩 선택 시트 — 기록 추가 시 골라서 일정에 정확히 연결(중복·오연결 방지) */}
      <Modal visible={showPickSheet} transparent animationType="fade" onRequestClose={() => setShowPickSheet(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowPickSheet(false)} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10, paddingBottom: 24 + insets.bottom }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginBottom: 12 }} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, paddingHorizontal: 20, marginBottom: 4 }}>기록할 라운딩을 선택하세요</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, paddingHorizontal: 20, marginBottom: 12 }}>
              아직 기록하지 않은 라운딩이에요.{'\n'}골라서 기록하면 일정과 자동으로 연결돼요.
            </Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {unrecordedRounds.map((s, i) => (
                <TouchableOpacity key={s.id || i} activeOpacity={0.8} onPress={() => pickRoundToRecord(s)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 20,
                    borderTopWidth: i === 0 ? 0.5 : 0, borderBottomWidth: 0.5, borderColor: C.hairline }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>{s.course}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>
                      {s.date} {s.day}{s.time ? ` · ${s.time}` : ''}{s.members ? ` · ${s.members}명` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(18), color: C.warmGrayLight }}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity activeOpacity={0.85} onPress={startBlankRecord}
              style={{ marginTop: 14, marginHorizontal: 20, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>직접 입력하기 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <GolfLedgerModal visible={showLedger} onClose={() => setShowLedger(false)} diaries={diaries} />
      <ShareMomentModal moment={shareMoment} visible={!!shareMoment} onClose={() => setShareMoment(null)} />
      <MyPageModal visible={showMyPage} onClose={() => setShowMyPage(false)} />
      {/* 메시지(DM) — 내 프로필 진입 = 대화 목록(인스타식). 단일 Modal에서 목록↔대화방 전환(Modal 중첩 회피) ([[dm-design]]).
          transparent 필수 — 불투명 RN Modal은 안드서 keyboard-controller가 키보드 inset을 못 받아 입력창이 키보드에 가림
          (DiaryAddModal과 동일 패턴). DMChat/DMList SafeAreaView가 불투명이라 화면은 동일. */}
      <Modal visible={dmOpen} transparent animationType="slide" onRequestClose={() => (dmChat ? setDmChat(null) : setDmOpen(false))}>
        {dmChat ? (
          <DMChatScreen friendUid={dmChat.uid} friendName={dmChat.name} friendAvatarUri={dmChat.avatar || null} onClose={() => setDmChat(null)} />
        ) : (
          <DMListScreen onClose={() => { setDmOpen(false); setDmChat(null); }} onOpenChat={(uid, name, avatar) => setDmChat({ uid, name, avatar })} />
        )}
      </Modal>
      <TrustGradeModal visible={gradeModalOpen} highlightKey={myGrade.key} onClose={() => setGradeModalOpen(false)} />
      <MannerGradeModal visible={mannerModalOpen} highlightKey={myManner.key} onClose={() => setMannerModalOpen(false)} />
      <HandicapInfoModal visible={handicapInfoOpen} onClose={() => setHandicapInfoOpen(false)} />
      <MilestoneInfoModal visible={milestoneInfoOpen} onClose={() => setMilestoneInfoOpen(false)} />

      {/* 프로필 사진 변경 시트 — 자체 오버레이 (Modal 전환 충돌 회피) */}
      {avatarSheetOpen && (
        <TouchableOpacity activeOpacity={1} onPress={() => setAvatarSheetOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: C.bgSecondary, borderRadius: 16, overflow: 'hidden' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingTop: 16, paddingBottom: 12 }}>
              프로필 사진
            </Text>
            {avatarOptions.map((opt, i) => (
              <TouchableOpacity key={i} activeOpacity={0.6}
                onPress={() => { setAvatarSheetOpen(false); opt.onPress(); }}
                style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline,
                  backgroundColor: i === 0 ? '#FBF3D3' : 'transparent' }}>
                <Text style={{ fontFamily: i === 0 ? F.sysB : F.sysM, fontSize: fs(14),
                  color: opt.danger ? C.warmGray : C.charcoal, textAlign: 'center' }}>
                  {opt.text}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity activeOpacity={0.6} onPress={() => setAvatarSheetOpen(false)}
              style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, textAlign: 'center' }}>취소</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* 프로필 사진 1:1 크롭 — 갤러리 선택 후 (안드·iOS 동일 인앱 크롭) */}
      <CropEditorModal
        visible={!!avatarCropUri}
        aspect="avatar"
        uri={avatarCropUri}
        onClose={() => setAvatarCropUri(null)}
        onSave={async (croppedUri) => {
          setAvatarCropUri(null);
          const persisted = await persistPhoto(croppedUri); // 크롭에디터가 이미 600px·압축 출력
          if (persisted) persistProfile({ avatarUri: persisted });
        }} />
    </SafeAreaView>
  );
}
