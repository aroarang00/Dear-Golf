import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { C, F, fs } from '../constants/colors';
import { HALL_OF_FAME } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { dS } from '../styles/dS';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { showAppAlert } from './AppAlert';
import { HallOfFameCard } from './HallOfFameCard';
import { MilestoneCard, reachedMilestones, milestoneId, buildMilestoneEntry } from './MilestoneCard';
import { ShareMomentModal } from './ShareMomentModal';
import { DiaryCard } from './DiaryCard';
import { DiaryDetail } from './DiaryDetail';
import { DiaryAddModal } from './DiaryAddModal';
import { GolfLedgerModal } from './GolfLedgerModal';
import { MyPageModal } from './MyPageModal';
import { getTrustGrade } from '../constants/trustGrade';
import { ROUTES } from '../constants/routes';
import { getMannerGrade } from '../constants/mannerGrade';
import { calcHandicap } from '../utils/handicap';
import { countCompletedRounds, displayTotalRounds, countVisitedCourses } from '../utils/roundStats';
import { fetchKakaoProfileImage } from '../utils/kakaoAuth';
import { persistPhoto, resolvePhotoUri } from '../utils/photoStorage';
import { compressImage } from '../utils/imageCompress';
import { TrustGradeModal } from './common/TrustBadge';
import { MannerGradeModal } from './common/MannerBadge';
import { HandicapInfoModal } from './common/HandicapInfoModal';

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
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { schedules, addSchedule, removeSchedule } = React.useContext(SchedulesContext);
  const { diaries, addDiary, editDiary, removeDiary } = React.useContext(DiariesContext);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false); // 골프 가계부
  const [showMyPage, setShowMyPage] = useState(false); // 설정 (마이페이지)
  const [gradeModalOpen, setGradeModalOpen] = useState(false); // 신뢰 등급 설명
  const [mannerModalOpen, setMannerModalOpen] = useState(false); // 매너 등급 설명
  const [handicapInfoOpen, setHandicapInfoOpen] = useState(false); // 핸디 계산 설명
  const [statsExpanded, setStatsExpanded] = useState(false); // 통계 박스 펼침 (기본 접힘, 검색 토글과 독립)
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false); // 프로필 사진 변경 시트
  useAndroidBack(avatarSheetOpen, () => setAvatarSheetOpen(false)); // 시트 떠 있을 때 뒤로가기 → 닫기
  const [addSeed, setAddSeed] = useState(null);
  const [showPickSheet, setShowPickSheet] = useState(false);
  // 미기록 라운딩 — 오늘 포함 지난 일정 중 다이어리 미연결. 기록 추가 시 골라 정확히 연결(중복·오연결 방지).
  const unrecordedRounds = React.useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); const todayMid = t.getTime();
    const recorded = (s) => (s.id && diaries.some(d => d.scheduleId === s.id))
      || diaries.some(d => d.course === s.course && d.date === s.date && !d.scheduleId);
    return (schedules || [])
      .filter(s => {
        if (s.overseas) return false; // 해외는 해외 흐름에서 별도
        if (!s.date) return false;
        const [y, m, d] = s.date.split('.').map(Number);
        if (!y || !m || !d) return false;
        const sd = new Date(y, m - 1, d).getTime(); // 로컬 자정 — todayMid와 같은 기준(타임존 일치)
        return sd <= todayMid && !recorded(s); // 오늘 포함(≤) — 당일 완료 라운딩도 리스트에
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [schedules, diaries]);
  // 기록 추가 진입 — 미기록 라운딩 있으면 선택 시트, 없으면 바로 직접 입력
  const openAddFlow = () => {
    if (unrecordedRounds.length > 0) setShowPickSheet(true);
    else { setAddSeed(null); setShowModal(true); }
  };
  const pickRoundToRecord = (s) => {
    setAddSeed({ date: s.date, course: s.course, courseId: s.courseLogId || s.courseId || null, scheduleId: s.id || null });
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

  useEffect(() => {
    if (route?.params?.openDiaryId) {
      const target = diaries.find(d => d.id === route.params.openDiaryId);
      if (target) {
        setSelected(target);
        // params 초기화 — 안 하면 같은 id로 재진입 시 useEffect가 안 트리거되어
        // MY 첫 화면(다이어리 목록)이 떠버림.
        // diaries가 아직 로딩 안 돼 target이 없을 땐 setParams 안 함 → diaries 변경 후 재시도
        navigation.setParams({ openDiaryId: undefined });
      }
    }
  }, [route?.params?.openDiaryId, diaries]);

  // 일정 모달에서 진입한 경우 모달 닫을 때 일정 화면으로 자동 복귀 ([[modal-navigation-pattern]] navigation 복귀)
  const returnToScheduleRef = React.useRef(false);

  useEffect(() => {
    if (route?.params?.openAddModal) {
      // 일정 캘린더·내 코스기록에서 날짜·골프장·일정ID를 미리 채워서 전달
      // scheduleId가 있으면 다이어리에 보존되어 같은 날 일정 N건 매칭 시 1:1 보장
      const { addDate, addCourse, addCourseId, addScheduleId, returnToSchedule } = route.params;
      setAddSeed((addDate || addCourse || addScheduleId)
        ? { date: addDate, course: addCourse, courseId: addCourseId, scheduleId: addScheduleId || null }
        : null);
      returnToScheduleRef.current = !!returnToSchedule;
      setShowModal(true);
      navigation.setParams({ openAddModal: undefined, addDate: undefined, addCourse: undefined, addCourseId: undefined, addScheduleId: undefined, returnToSchedule: undefined });
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
        overseas: !!data.overseas,
        country: data.country || '',
      });
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
      // 직접 작성 다이어리(scheduleId 없음) → 일정 연동.
      // 사용자 원칙: 홈·일정·MY·코스모아보기는 유기적으로 연동, 정보 차이만 허용.
      // 같은 구장·같은 날 '기록 안 된' 일정이 이미 있으면 거기에 연결(중복 일정 카드 방지),
      // 없을 때만 새 일정 자동 등록. ([[home-multi-schedule-same-day]] 룰3)
      if (!data.scheduleId) {
        try {
          // 미리 잡아둔 일정(기록 미연결, 같은 구장·날) 찾기 — 있으면 거기에 연결.
          // 국내/해외 도메인이 같은 일정만 매칭 (해외 기록이 국내 일정에 붙어 미기록 카드로 새는 것 방지)
          const existingSched = schedules.find(s =>
            s.course === data.course && s.date === data.date
            && !!s.overseas === !!data.overseas
            && !diaries.some(d => d.scheduleId === s.id));
          let linkId;
          if (existingSched) {
            linkId = existingSched.id;
          } else {
            // 과거 라운딩이라 시간 정보는 빈 값 (사용자가 일정 화면에서 수정 가능)
            // 해외 기록이면 overseas·국가를 일정에도 넘겨 해외 탭에서 집계되게 함
            const created2 = await addSchedule({
              course: data.course,
              date: data.date,
              day: data.day,
              time: '',
              members: (data.companions?.length || 0) + 1,
              overseas: !!data.overseas,
              cityCountry: data.overseas ? (data.country || '') : '',
            });
            linkId = created2.id;
          }
          try { await editDiary(created.id, { scheduleId: linkId }); }
          catch (e) { console.warn('[diary] scheduleId link failed:', e?.message); }
        } catch (e) {
          console.warn('[diary] auto schedule link/add failed:', e?.message);
        }
      }
    } else if (type === 'diary-edit') {
      // Firestore 업데이트 — data.id를 기준으로. id·ownerUid는 round.js가 자동으로 분리.
      await editDiary(data.id, data);
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

  // 다이어리 기록 삭제 — diaryOnly: 기록만 / all: 같은 날짜·골프장의 일정까지 삭제
  const handleDeleteDiary = async (target, mode) => {
    await removeDiary(target.id);
    // 연결된 명예의 전당 카드도 함께 삭제
    setHallOfFame(prev => prev.filter(h => h.diaryId !== target.id));
    if (mode === 'all') {
      // course+date 매칭 일정 모두 삭제 (스케줄 1:1 매칭 미연결 다이어리 호환)
      const matches = schedules.filter(s => s.date === target.date && s.course === target.course);
      for (const s of matches) {
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

  const sortedDiaries = [...diaries].sort((a, b) => {
    const dateA = new Date((a.date || '').replace(/\./g, '-'));
    const dateB = new Date((b.date || '').replace(/\./g, '-'));
    return dateB - dateA;
  });

  // 퍼스트 싱글 명예의 전당 카드와 연결된 다이어리 id — 피드 배지 표시용
  const firstSingleId = hallOfFame.find(h => h.type === '퍼스트 싱글')?.diaryId;

  if (selected) return <DiaryDetail item={selected} isFirstSingle={!!firstSingleId && selected.id === firstSingleId} onClose={() => setSelected(null)}
    onUpdate={(updated) => {
      // handleSave('diary-edit')를 거쳐야 명예의 전당(특별한 순간)까지 함께 동기화됨
      handleSave('diary-edit', updated);
      setSelected(updated);
    }}
    onDelete={handleDeleteDiary} />;

  // 프로필 사진 변경 — 갤러리·카카오·기본
  const persistProfile = (patch) => {
    const updated = { ...userProfile, ...patch };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
  };
  const pickAvatarImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (result.canceled) return null;
      // 프로필은 표시 영역이 작아 600px·80%로 압축 (다이어리 사진보다 더 작게)
      const compressed = await compressImage(result.assets[0].uri, { maxWidth: 600 });
      return await persistPhoto(compressed);
    } catch (e) {
      console.warn('[DiaryScreen] 이미지 선택 오류', e?.message);
      return null;
    }
  };
  // 자체 오버레이 시트로 처리 — Modal 위에서 갤러리 피커 호출 시 전환 충돌 회피
  const avatarOptions = [
    { text: '갤러리에서 선택', onPress: async () => { const uri = await pickAvatarImage(); if (uri) persistProfile({ avatarUri: uri }); } },
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
  const hasRecords = diaries.length > 0;
  // 총 라운딩 = 자동 완료 라운딩(다이어리+미기록 지난 일정)에, 마이페이지 입력 기준값 반영([[project_total_rounds]])
  const completedRounds = countCompletedRounds(diaries, schedules);
  const _dispTotal = displayTotalRounds(userProfile, completedRounds);
  const totalRounds = _dispTotal > 0 ? _dispTotal : null;
  const bestScore = hasRecords
    ? Math.min(...diaries.map(d => d.score))
    : (userProfile.lifeBest || null);
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 80 }}>
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
          </View>
          {/* 닉네임·핸디 / 신뢰·매너 등급 / 주최·참석 — 3단 */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal }}>{myName}</Text>
              {/* 핸디 — 베스트 5개 평균. 탭하면 계산 방식 설명 */}
              <TouchableOpacity onPress={() => setHandicapInfoOpen(true)} activeOpacity={0.7}
                style={{ backgroundColor: C.charcoal, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>핸디 {myHandicap ?? '—'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <TouchableOpacity onPress={() => setGradeModalOpen(true)} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                  borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: fs(12) }}>{myGrade.emoji}</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.charcoal }}>{myGrade.label}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMannerModalOpen(true)} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.bgPrimary,
                  borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: fs(12) }}>{myManner.emoji}</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: myManner.color }}>{myManner.label}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>
              주최 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{userProfile.hostedCount || 0}</Text>회
              {'  ·  '}
              참석 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{userProfile.attendedCount || 0}</Text>회
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
                <Text style={{ fontFamily: F.en, fontSize: fs(20), color: st.hi ? C.burgundy : C.charcoal, fontWeight: '700' }}>
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
        const FILTERS = ['전체', '올해', '최근 3개월', '베스트순', '특별한 순간'];

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
          if (filterKey === '올해') {
            list = list.filter(d => (d.date || '').startsWith(String(now.getFullYear())));
          } else if (filterKey === '최근 3개월') {
            const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);
            list = list.filter(d => {
              const [y, m, day] = (d.date || '').split('.').map(Number);
              return y ? new Date(y, m - 1, day) >= cutoff : false;
            });
          } else if (filterKey === '특별한 순간') {
            // 명예의 전당에 오른 기록 모두 — special(홀인원·이글 등) + 퍼스트 싱글
            const hofIds = new Set(hallOfFame.map(h => h.diaryId).filter(Boolean));
            list = list.filter(d => d.special != null || hofIds.has(d.id));
          }
          if (filterKey === '베스트순') {
            list = [...list].sort((a, b) => a.score - b.score);
          }
          return list;
        })();

        // DiaryCard 색상 비교용 — 통계 박스 핸디로 통일 (5개 미만 입력값, 6개+ 베스트 5개 평균)
        const avgScore = myHandicap;

        // 기록이 하나도 없을 때 — 빈 상태 (예시 카드 + CTA)
        if (diaries.length === 0) {
          return (
            <ScrollView style={{ flex: 1, backgroundColor: C.bgPrimary }} showsVerticalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', paddingTop: 40, paddingBottom: 48 }}>
              <Text style={{ fontSize: fs(40), marginBottom: 14 }}>⛳</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 6 }}>
                아직 라운딩 기록이 없어요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 20 }}>
                첫 라운딩을 기록하면 이렇게 남아요
              </Text>
              <View style={{ width: '100%', marginTop: 22 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8, marginLeft: 16 }}>예시</Text>
                <View style={{ opacity: 0.6, paddingHorizontal: 16 }} pointerEvents="none">
                  <DiaryCard item={SAMPLE_DIARY} avgScore={null} onPress={() => {}} />
                </View>
              </View>
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
                style={{ flex: 1 }} contentContainerStyle={dS.filterTabRow}>
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
              {/* ⚠️ TEMP_MILESTONE_PREVIEW — 디자인 확인용 임시 블록. 출시 전 이 블록만 통째로 삭제. __DEV__라 프로덕션엔 안 뜸. */}
              {__DEV__ && (
                <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                  <Text style={[dS.hofSectionLabel, { marginBottom: 6 }]}>🔧 마일스톤 미리보기 (임시)</Text>
                  {[
                    { id: 'pv_r1', kind: 'milestone', category: 'rounds',  value: 50,  tier: 0 },
                    { id: 'pv_r2', kind: 'milestone', category: 'rounds',  value: 100, tier: 1 },
                    { id: 'pv_r3', kind: 'milestone', category: 'rounds',  value: 200, tier: 2 },
                    { id: 'pv_c1', kind: 'milestone', category: 'courses', value: 30,  tier: 0 },
                    { id: 'pv_c2', kind: 'milestone', category: 'courses', value: 50,  tier: 1 },
                    { id: 'pv_c3', kind: 'milestone', category: 'courses', value: 100, tier: 2 },
                  ].map(it => (
                    <MilestoneCard key={it.id} item={it} onShare={() => setShareMoment(it)} />
                  ))}
                </View>
              )}
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
                  <Text style={dS.emptyMsg}>검색 결과가 없어요</Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                  {filtered.map((item, idx) => {
                    const isFS = !!firstSingleId && item.id === firstSingleId;
                    return (
                    <View key={item.id} style={dS.tlNode}>
                      {idx < filtered.length - 1 && <View style={dS.tlLine} />}
                      <View style={[dS.tlDot, item.badge === '베스트' && dS.tlDotBest, item.badge === '버디' && dS.tlDotBirdie, (item.special || isFS) && dS.tlDotSpecial]} />
                      <DiaryCard item={item} avgScore={avgScore} isFirstSingle={isFS} onPress={(it) => setSelected(it)} />
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
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10, paddingBottom: 24 }}>
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
      <TrustGradeModal visible={gradeModalOpen} highlightKey={myGrade.key} onClose={() => setGradeModalOpen(false)} />
      <MannerGradeModal visible={mannerModalOpen} highlightKey={myManner.key} onClose={() => setMannerModalOpen(false)} />
      <HandicapInfoModal visible={handicapInfoOpen} onClose={() => setHandicapInfoOpen(false)} />

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
    </SafeAreaView>
  );
}
