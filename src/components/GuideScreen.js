import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, KeyboardAvoidingView, Platform, BackHandler, ActivityIndicator, Modal } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { Spinner } from './common/Spinner';
import { showAppAlert } from './AppAlert';
import { auth } from '../utils/firebase';
import { connectKakaoAccount } from '../utils/kakaoAuth';
import { anonHasAppleTrace, connectAppleAccount } from '../utils/appleAuth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ROUTES } from '../constants/routes';
import { UserContext } from '../contexts/UserContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { SchedulesContext } from '../contexts/SchedulesContext';

// 헤더·버튼을 라운지(navy) 헤더 규격에 맞춰 안드 컴팩트 보정 (RoundupTab과 동일 패턴)
const _and = Platform.OS === 'android';

import { C, F, fs } from '../constants/colors';
import {
  FAVORITES_INIT, SCHEDULES_INIT, COURSE_LOG, WEEKDAYS,
} from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getTop100Courses, top100RankOf } from '../utils/top100';
import { getUserCourses } from '../utils/userCourses';
import { getSavedCourses, toggleSavedCourse } from '../utils/savedCourses'; // 내 저장 골프장(위시리스트) — 기록 무관
import { gS } from '../styles/gS';
import { CourseExploreTab } from './CourseExploreTab';
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { fetchCoursePlaceInfo, searchNearbyRestaurants, searchNearbyCafes, searchNearbyGolfCourses, searchRestaurantsByKeyword } from '../utils/kakao';
import { searchGolfCourses, getGolfCourses } from '../utils/golfCourses';
import { isRoundDiary } from '../utils/diaryKind';
import { cityTokenOf, regionOf, naverSearchUrl, naverFoodListUrl } from '../utils/naverMap';
import { getCourseHomepage, courseSearchUrl, BOOKING_SITES } from '../utils/courseBooking'; // 예약하기 — 홈피/전화/골팡/카카오VX 선택 시트
import { WebSheet } from './WebSheet'; // 구장 홈페이지 앱내 웹뷰(맛집 상세와 같은 결)
import { FoodMapView } from './FoodMapView';
import { getSavedRestaurants, addSavedRestaurant, removeSavedRestaurant, updateSavedRestaurant } from '../utils/savedRestaurants';
import { getFoodRecs, toggleFoodRec, seedRecCount } from '../utils/foodRecs';
import { getCourseComments, addCourseComment, toggleCommentLike, deleteCourseComment, updateCourseComment } from '../utils/courseComments';
import { getCourseRatings, setMyCourseRating } from '../utils/courseRatings';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { createContentReport, hasReportedContent } from '../utils/contentReports';
import { RestaurantSaveModal } from './RestaurantSaveModal';
import { CourseLogModal } from './CourseLogModal';
import { Icon } from './common/Icon'; // 🔍 검색 커스텀 아이콘(이모지 통일)
import { RestaurantDetailSheet } from './RestaurantDetailSheet'; // 앱 내 식당 상세(카카오 place 웹뷰) — 함께 식사와 공용
import { destinationBadge } from '../utils/mealDirection'; // 귀가 동선 방향 뱃지 — 함께 식사와 공용
import { loadPrivateProfile } from '../utils/privateProfile';
import { getUid } from '../utils/firebase';

export function GuideScreen({ route, navigation }) {
  const insets = useSafeAreaInsets(); // 루트 inset은 View+paddingTop으로(탭 포커스 시 SafeAreaView 늦은 적용=콘텐츠 점프 방지, 2026-06-15)
  const { userProfile } = React.useContext(UserContext);
  const [selected, setSelected] = useState(null);
  // 코스 둘러보기 지역탭 선택 — CourseExploreTab에 두면 상세 열 때(if selected early return) 언마운트돼
  //   지역 리스트가 사라지므로 여기(상시 마운트)로 끌어올려 상세 닫고 뒤로 와도 유지되게 함.
  const [exploreRegion, setExploreRegion] = useState('전체');
  const [detailPlace, setDetailPlace] = useState(null);   // 앱 내 식당 상세 시트 대상(코스 맛집 탭)
  // 귀가 동선 방향 뱃지용 목적지 — 집(departure) 우선, 없으면 회사(work). 함께 식사와 같은 규칙·같은 유틸.
  //   라운딩 끝나고 어느 쪽으로 가는지가 맛집 선택의 실질 기준이라, 코스 맛집에도 같은 신호를 준다(사용자 2026-07-22).
  const [mealDest, setMealDest] = useState(null);
  useEffect(() => {
    let alive = true;
    getUid().then(uid => {
      if (!uid) return null;
      return loadPrivateProfile(uid);
    }).then(p => {
      if (!alive || !p) return;
      const hasHome = p.departureCoord && Number.isFinite(p.departureCoord.x);
      const co = hasHome ? p.departureCoord : (p.workCoord && Number.isFinite(p.workCoord.x) ? p.workCoord : null);
      // label = 방향 뱃지 기준 표기('집'/'그외 장소'). 앱이 목적지를 추정하므로 지역명 대신 기준을 드러낸다(사용자 2026-07-23).
      setMealDest(co ? { x: co.x, y: co.y, label: hasHome ? '집' : '그외 장소' } : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [openingCourse, setOpeningCourse] = useState(false); // 홈 '구장 ›' → 상세 여는 동안(코스 새로고침·카카오 검색) 스피너 노출 — 목록이 잠깐 보이는 인상 제거
  const [innerTab, setInnerTab] = useState('course');
  const [showCourseLog, setShowCourseLog] = useState(false); // 내 코스기록 페이지
  const [favorites, setFavorites] = useState(FAVORITES_INIT);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [userCoursesList, setUserCoursesList] = useState([]);
  const [userCoursesHydrated, setUserCoursesHydrated] = useState(false);
  const [savedFav, setSavedFav] = useState([]); // 내 저장 골프장(위시리스트) — 코스 상세 저장 버튼 상태용
  // 다이어리는 DiariesContext에서 받음 (Firestore 단일 소스)
  const { diaries } = React.useContext(DiariesContext);
  const { schedules } = React.useContext(SchedulesContext);
  const [comments, setComments] = useState([]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null); // 내 코멘트 수정 중 id
  const [showAllComments, setShowAllComments] = useState(false); // 골퍼 코멘트 — 상위 10개 + 더보기
  // 코스 평점 ([[project_course_rating]]) — 3카테고리 별5점, 1인1평가 커뮤니티 집계
  const [rating, setRating] = useState({ count: 0, avg: { mgmt: 0, pace: 0, value: 0 }, overall: 0, mine: null });
  const [showRatingInput, setShowRatingInput] = useState(false);
  const [ratingDraft, setRatingDraft] = useState({ mgmt: 0, pace: 0, value: 0 });
  const [commentSort, setCommentSort] = useState('recent'); // 'recent'(최신순 기본) | 'likes'(좋아요순)
  const [myCommentsOnly, setMyCommentsOnly] = useState(false); // 내 코멘트만 보기 필터 (글 많아질 때 내 글 찾기)
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('전체');
  // 코스 상세에서 날씨/교통 팝업
  const [showCoursePopup, setShowCoursePopup] = useState(false);
  const [coursePopupTab, setCoursePopupTab] = useState('wx');
  const [coursePopupSched, setCoursePopupSched] = useState(null);
  // 상세화면 코스 정보 (phone) + 갤러리
  const [coursePhone, setCoursePhone] = useState('');
  const [courseAddress, setCourseAddress] = useState('');
  const [coursePlaceLoading, setCoursePlaceLoading] = useState(false);
  // 맛집/코스 탭 — 골프장 좌표 + 주변 장소(카카오)
  const [courseCoord, setCourseCoord] = useState(null);
  const [nearbyFood, setNearbyFood] = useState([]);
  const [nearbyCafes, setNearbyCafes] = useState([]);
  const [nearbyGolf, setNearbyGolf] = useState([]);
  const [nearbyFoodLoading, setNearbyFoodLoading] = useState(false);
  const [showAllGolf, setShowAllGolf] = useState(false);
  const [showAllRest, setShowAllRest] = useState(false);
  const [showAllNearby, setShowAllNearby] = useState(false);
  // 맛집 탭 — 저장 맛집 / 추천 / 검색 / 저장 모달
  const [savedFood, setSavedFood] = useState([]);
  const [foodRecs, setFoodRecs] = useState({});
  const [foodSearch, setFoodSearch] = useState('');
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [showBooking, setShowBooking] = useState(false); // 예약하기 시트 — 홈피/전화/골팡/카카오VX 선택
  const [webSheet, setWebSheet] = useState(null); // 앱내 웹뷰 { url, title } — 구장 홈페이지
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveModalSeed, setSaveModalSeed] = useState(null);
  const [top100, setTop100] = useState([]); // 100대 코스 — 코스 상세 배지용 + CourseExploreTab에 내려줌(상세 복귀 깜빡임 방지)
  const [exploreMaster, setExploreMaster] = useState([]); // 전국 골프장 마스터 — CourseExploreTab '전체 골프장'용(상시 마운트라 상세 복귀 시 재조회 없음)
  const scrollRefs = useRef({});
  const exploreRef = useRef(null);   // 코스 목록(CourseExploreTab) 스크롤 톱 복귀용 — 탭 재탭 시 호출
  const foodSearchYRef = useRef(0);  // 맛집 검색줄의 콘텐츠 내 y — 포커스 시 검색줄을 위로 스크롤(안드 키보드 가림 회피)

  // 100대 코스 목록 — 마운트 시 1회 로드
  useEffect(() => { getTop100Courses().then(list => setTop100(list || [])); }, []);
  useEffect(() => { getGolfCourses().then(list => setExploreMaster(list || [])).catch(() => {}); }, []);
  // 내 저장 골프장(위시리스트) 로드 — 저장 버튼 상태(저장됨/저장)용
  useEffect(() => { getSavedCourses().then(list => setSavedFav(list || [])); }, []);

  const REGIONS = ['전체', '수도권', '충청', '강원', '전라', '경상', '제주'];
  const getRegion = (loc) => {
    if (!loc) return null;
    // 카카오 도로명 주소는 풀 행정명(경기도·서울특별시·강원특별자치도…)을 쓰므로 짧은/긴 형태 모두 매칭
    const first = loc.split(' ')[0];
    if (['서울', '서울특별시', '인천', '인천광역시', '경기', '경기도'].includes(first)) return '수도권';
    if (['충북', '충청북도', '충남', '충청남도', '대전', '대전광역시', '세종', '세종특별자치시'].includes(first)) return '충청';
    if (['강원', '강원도', '강원특별자치도'].includes(first)) return '강원';
    if (['경북', '경상북도', '경남', '경상남도', '대구', '대구광역시', '부산', '부산광역시', '울산', '울산광역시'].includes(first)) return '경상';
    if (['전북', '전북특별자치도', '전라북도', '전남', '전라남도', '광주', '광주광역시'].includes(first)) return '전라';
    if (['제주', '제주특별자치도', '제주도'].includes(first)) return '제주';
    return null;
  };

  useEffect(() => {
    if (!navigation) return;
    const resetView = () => {
      setSelected(null);
      setPreviewCourse(null);
      setOpeningCourse(false);
      setInnerTab('course');
      setShowCommentInput(false);
      setCommentInput('');
      setSearch('');
      setRegionFilter('전체');
      setExploreRegion('전체');   // 코스 둘러보기 지역탭도 리셋 — 탭 떠났다 오면 '전체'로(상세 갔다 back은 blur 안 떠 유지)
      setFoodSearch('');
      setFoodSearchResults([]);
      setSaveModalVisible(false);
      setShowAllGolf(false);
      setShowAllRest(false);
      setShowAllNearby(false);
      Object.values(scrollRefs.current).forEach(r => r?.scrollTo?.({ y: 0, animated: false }));
      exploreRef.current?.scrollToTop();   // 코스 목록(랜딩)은 별도 컴포넌트라 위 scrollRefs로 안 잡힘 → 직접 호출
    };
    // 탭 재탭(focused 중) + 탭을 떠날 때(blur) 모두 초기화 — 다른 탭처럼 '나갔다 오면 코스 목록'으로.
    //   ★blur 리셋이 핵심: 코스 상세는 인라인 state라, 안드 뒤로가기로 다른 탭 갔다 돌아오면(focus 복귀=tabPress 아님)
    //   상세가 그대로 남던 문제(코스만 상태 유지)를 해소. (상세 내 안드 백은 위 useFocusEffect가 검색 유지하며 닫음.)
    const unsubPress = navigation.addListener('tabPress', resetView);
    const unsubBlur = navigation.addListener('blur', resetView);
    return () => { unsubPress(); unsubBlur(); };
  }, [navigation]);

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.favorites, FAVORITES_INIT);
      setFavorites(loaded);
      setFavoritesHydrated(true);
    })();
  }, []);

  // 다이어리는 DiariesContext가 단일 소스 — 별도 로드 X. Firestore 동기화는 Context가 담당.

  // userCourses (사용자가 카카오 검색으로 추가한 코스) 로드 — COURSE_LOG에 없는 코스 상세 표시용
  const refreshUserCourses = React.useCallback(async () => {
    const list = await getUserCourses();
    setUserCoursesList(list || []);
    setUserCoursesHydrated(true);
  }, []);

  useEffect(() => {
    refreshUserCourses();
    if (!navigation) return;
    // 다른 탭에서 등록한 코스가 반영되도록 탭 진입 시마다 갱신
    const unsub = navigation.addListener('focus', refreshUserCourses);
    return unsub;
  }, [refreshUserCourses, navigation]);

  // 미저장 검색 결과 미리보기 — 카카오 검색 결과를 임시 코스 객체로 보관
  const [previewCourse, setPreviewCourse] = useState(null);
  const PREVIEW_ID = '__preview__';

  const handleOpenPreview = (kakaoItem) => {
    setPreviewCourse({
      id: PREVIEW_ID,
      name: kakaoItem.name,
      loc: kakaoItem.loc,
      x: kakaoItem.x, y: kakaoItem.y,
      kakaoId: kakaoItem.kakaoId,
      _source: 'preview',
      tags: [],
    });
    setSelected(PREVIEW_ID);
    setInnerTab('course');
  };

  // 코스 저장 토글 — 위시리스트(savedCourses). ★기록·일정과 무관, 자유 추가/삭제(orphan 걱정 없음).
  //   '내 저장 골프장' 섹션(CourseExploreTab)이 이 위시리스트를 보여줌 ([[course-name-input]]).
  const toggleSaveCourse = async () => {
    const cur = getCourseData(selected);
    if (!cur?.name) return;
    try {
      const { list } = await toggleSavedCourse({ name: cur.name, loc: cur.loc, x: cur.x, y: cur.y, kakaoId: cur.kakaoId });
      setSavedFav(list);
      exploreRef.current?.refresh?.();
    } catch (e) { if (__DEV__) console.warn('[course save toggle]', e?.message); }
  };

  // 일정 시트에서 코스로 들어온 경우, 그 일정 id를 기억했다가 코스를 닫을 때 일정 시트로 복귀(다이어리 경로와 통일).
  const returnScheduleIdRef = React.useRef(null);   // 홈 일정 시트에서 옴 → 닫을 때 그 시트 재오픈
  const returnCalendarRef = React.useRef(false);    // 일정 캘린더에서 옴 → 닫을 때 캘린더 재오픈
  const returnHomeRef = React.useRef(false);        // 홈 카드에서 구장 직접 탭 → 닫을 때 홈으로
  useEffect(() => {
    if (route?.params?.returnToScheduleId) {
      returnScheduleIdRef.current = route.params.returnToScheduleId;
      navigation.setParams({ returnToScheduleId: undefined });
    }
  }, [route?.params?.returnToScheduleId]);
  useEffect(() => {
    if (route?.params?.returnToCalendar) {
      returnCalendarRef.current = true;
      navigation.setParams({ returnToCalendar: undefined });
    }
  }, [route?.params?.returnToCalendar]);
  useEffect(() => {
    if (route?.params?.returnToHome) {
      returnHomeRef.current = true;
      navigation.setParams({ returnToHome: undefined });
    }
  }, [route?.params?.returnToHome]);
  // 코스 상세 닫기(공통) — 안드 뒤로가기·← 버튼 공용. 출발지(홈 시트 / 캘린더 / 홈)로 복귀.
  const closeDetail = React.useCallback(() => {
    setSelected(null);
    setPreviewCourse(null);
    setOpeningCourse(false);
    setInnerTab('course');
    setShowCommentInput(false);
    setShowRatingInput(false);
    const sid = returnScheduleIdRef.current;
    const cal = returnCalendarRef.current;
    const home = returnHomeRef.current;
    returnScheduleIdRef.current = null;
    returnCalendarRef.current = false;
    returnHomeRef.current = false;
    if (cal) navigation.navigate(ROUTES.HOME, { openSchedule: true });           // 캘린더에서 옴 → 캘린더 재오픈
    else if (sid) navigation.navigate(ROUTES.HOME, { openScheduleSheetId: sid }); // 홈 시트에서 옴 → 그 시트 재오픈
    else if (home) navigation.navigate(ROUTES.HOME);                              // 홈 카드 직접 탭 → 홈으로
  }, [navigation]);

  // Android 시스템 뒤로가기 — 코스 상세가 열려 있으면 홈으로 가지 않고 상세만 닫는다(일정에서 왔으면 일정으로 복귀)
  // (코스 탭에 머물러 검색·최근검색 상태 유지)
  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        // 인라인 입력(코멘트·평점)이 열려 있으면 그것부터 닫는다 — 작성 중 뒤로가기에 상세가 통째로 닫히지 않게.
        if (showCommentInput) { setShowCommentInput(false); return true; }
        if (showRatingInput) { setShowRatingInput(false); return true; }
        if (selected || previewCourse) {
          closeDetail();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [selected, previewCourse, showCommentInput, showRatingInput, closeDetail]),
  );

  // 코스 상세에서 날씨/교통 팝업 열기 — 오늘 라운딩 가상 일정으로 fetch
  const openCourseInfo = (course, tab) => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
    const day = WEEKDAYS[today.getDay()];
    setCoursePopupSched({
      course: course.name,
      courseLogId: course._source !== 'user' ? course.id : undefined,
      courseId: course._source === 'user' ? course.id : undefined,
      // 코스 상세에서 이미 확보한 골프장 좌표를 직접 전달 — 날씨/교통이 해당 구장 기준으로 동작
      courseX: courseCoord?.x ?? (Number.isFinite(course.x) ? course.x : undefined),
      courseY: courseCoord?.y ?? (Number.isFinite(course.y) ? course.y : undefined),
      courseLoc: courseAddress || course.loc || '',
      date: dateStr, day, time: '07:00', members: 4, dDay: 0,
      isPreview: true, // 예정 라운딩이 아닌 코스 둘러보기 — 추천 출발시간 대신 안내 문구
      weather: '맑음 20°', wind: '', duration: '',
    });
    setCoursePopupTab(tab);
    setShowCoursePopup(true);
  };

  // selected id를 COURSE_LOG 또는 userCourses에서 찾아 { name, loc, _source } 반환
  // PREVIEW_ID면 미저장 검색결과 객체 반환
  const getCourseData = (id) => {
    if (!id) return null;
    if (id === PREVIEW_ID && previewCourse) return previewCourse;
    const fromLog = COURSE_LOG.find(c => c.id === id);
    if (fromLog) return { ...fromLog, _source: 'log' };
    const fromUser = userCoursesList.find(c => c.id === id);
    if (fromUser) return { ...fromUser, _source: 'user' };
    return null;
  };

  // 코멘트 키 — 카카오로 등록된 코스(미리보기·저장 무관)는 kakaoId로 키를 통일해
  // 같은 골프장의 코멘트를 항상 함께 보이게 함. COURSE_LOG 기본 코스는 자체 id 사용.
  const commentKeyFor = (id) => {
    if (!id) return null;
    if (id === PREVIEW_ID) return previewCourse?.kakaoId ? `kakao:${previewCourse.kakaoId}` : null;
    const d = getCourseData(id);
    return d?.kakaoId ? `kakao:${d.kakaoId}` : id;
  };

  useEffect(() => {
    if (!favoritesHydrated) return;
    storage.save(STORAGE_KEYS.favorites, favorites);
  }, [favorites, favoritesHydrated]);

  useEffect(() => {
    if (route?.params?.openCourseId) {
      const id = route.params.openCourseId;
      const tab = route.params.openCourseTab; // 'food' 면 맛집 탭으로
      navigation.setParams({ openCourseId: undefined, openCourseTab: undefined });
      // userCourses 목록을 최신화한 뒤 선택 — 새로 추가된 코스도 상세를 찾도록
      setOpeningCourse(true);
      (async () => {
        try {
          await refreshUserCourses();
          setSelected(id);
          setInnerTab(tab === 'food' ? 'food' : 'course');
        } finally {
          setOpeningCourse(false);
        }
      })();
    }
  }, [route?.params?.openCourseId, refreshUserCourses]);

  // 이름/kakaoId로 코스 열기 — 홈 카드에서 courseId 해석이 안 될 때(로컬 userCourses 없음 등) 넘어옴.
  //   저장된 코스면 그걸 열고, 아니면 카카오 검색해 미리보기(previewCourse)로 연다 → ">"가 항상 동작 ([[course-name-input]]).
  useEffect(() => {
    const name = route?.params?.openCourseName;
    if (!name) return;
    const kakaoId = route?.params?.openCourseKakaoId;
    const wantTab = route?.params?.openCourseTab === 'food' ? 'food' : 'course'; // 홈 '주변 맛집'은 맛집 탭으로
    // 파라미터를 즉시 비우면 의존성(openCourseName)이 바뀌어 effect가 재실행된다. 그때 이전 실행의
    //   cleanup이 먼저 돌므로 cancelled 플래그를 두면 async가 setSelected 전에 중단된다(상세 안 열림).
    //   → openCourseId effect와 동일하게 플래그 없이 진행. 재실행은 이름이 비어 즉시 return해 무해.
    navigation.setParams({ openCourseName: undefined, openCourseKakaoId: undefined, openCourseTab: undefined });
    setOpeningCourse(true); // 코스 새로고침·카카오 검색 동안 스피너 — 목록이 잠깐 보이는 인상 제거
    (async () => {
      try {
        await refreshUserCourses();
        const list = await getUserCourses();
        const existing = list.find(c => (kakaoId && c.kakaoId === kakaoId) || c.name === name);
        if (existing) { setSelected(existing.id); setInnerTab(wantTab); return; }
        const results = await searchGolfCourses(name).catch(() => []);
        const match = (kakaoId && results.find(r => r.kakaoId === kakaoId)) || results[0];
        if (match) {
          handleOpenPreview(match);
          if (wantTab === 'food') setInnerTab('food'); // handleOpenPreview는 'course'로 두므로 맛집 요청 시 덮어씀
        } else {
          // 검색 무결과 — 이름만으로 미리보기 (코멘트 키는 kakaoId 있을 때만 매칭)
          setPreviewCourse({ id: PREVIEW_ID, name, loc: '', x: null, y: null, kakaoId: kakaoId || null, _source: 'preview', tags: [] });
          setSelected(PREVIEW_ID);
          setInnerTab(wantTab);
        }
      } finally {
        setOpeningCourse(false);
      }
    })();
  }, [route?.params?.openCourseName, refreshUserCourses]);

  useEffect(() => {
    if (route?.params?.openComment) {
      setShowCommentInput(true);
      navigation.setParams({ openComment: undefined });
    }
  }, [route?.params?.openComment]);

  // selected 변경 시 카카오 place 정보(전화번호 + 주소) fetch
  useEffect(() => {
    if (!selected) { setCoursePhone(''); setCourseAddress(''); setCoursePlaceLoading(false); return; }
    const data = getCourseData(selected);
    if (!data?.name) return;
    setCoursePhone(''); setCourseAddress(''); setCoursePlaceLoading(true);
    let cancelled = false;
    (async () => {
      const info = await fetchCoursePlaceInfo(data.name);
      if (cancelled) return;
      if (info?.phone) setCoursePhone(info.phone);
      if (info?.address) setCourseAddress(info.address);
      setCoursePlaceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selected, userCoursesList]);

  // 맛집 탭 — 골프장 좌표 확보 후 주변 맛집(카카오 FD6, 반경 3km) 검색
  useEffect(() => {
    if (!selected) { setCourseCoord(null); setNearbyFood([]); setNearbyFoodLoading(false); return; }
    const data = getCourseData(selected);
    if (!data?.name) return;
    setCourseCoord(null); setNearbyFood([]); setNearbyCafes([]); setNearbyGolf([]);
    setShowAllGolf(false); setShowAllRest(false); setShowAllNearby(false);
    setNearbyFoodLoading(true);
    let cancelled = false;
    (async () => {
      // 1) 좌표: 코스에 x/y가 있으면 사용, 없으면 카카오 골프장 검색으로 확보
      let coord = (Number.isFinite(data.x) && Number.isFinite(data.y))
        ? { x: data.x, y: data.y } : null;
      if (!coord) {
        const found = await searchGolfCourses(data.name);
        if (found[0] && Number.isFinite(found[0].x)) coord = { x: found[0].x, y: found[0].y };
      }
      if (cancelled) return;
      if (!coord) { setNearbyFoodLoading(false); return; }
      setCourseCoord(coord);
      // 2) 주변 검색 — 음식점(FD6 3km) + 카페(CE7 3km) + 골프장(10km)
      const [food, cafes, golf] = await Promise.all([
        searchNearbyRestaurants(coord.y, coord.x, 3000),
        searchNearbyCafes(coord.y, coord.x, 3000),
        searchNearbyGolfCourses(coord.y, coord.x, 10000),
      ]);
      if (cancelled) return;
      setNearbyFood(food);
      setNearbyCafes(cafes);
      setNearbyGolf((golf || []).filter(g => g.name !== data.name));
      setNearbyFoodLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selected, userCoursesList]);

  // 맛집 탭 — 추천(♥) 상태 로드 (1회)
  useEffect(() => {
    (async () => setFoodRecs(await getFoodRecs()))();
  }, []);

  // 맛집 탭 — 현재 골프장의 저장 맛집 로드
  const refreshSavedFood = React.useCallback(async (courseName) => {
    if (!courseName) { setSavedFood([]); return; }
    setSavedFood(await getSavedRestaurants(courseName));
  }, []);

  useEffect(() => {
    const d = getCourseData(selected);
    refreshSavedFood(d?.name || '');
  }, [selected, userCoursesList, refreshSavedFood]);

  // 맛집 탭 — 검색어 디바운스 → 카카오 음식점 키워드 검색
  useEffect(() => {
    const q = foodSearch.trim();
    if (q.length < 2) { setFoodSearchResults([]); setFoodSearchLoading(false); return; }
    setFoodSearchLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const results = await searchRestaurantsByKeyword(q, courseCoord?.y, courseCoord?.x);
      if (cancelled) return;
      setFoodSearchResults(results);
      setFoodSearchLoading(false);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [foodSearch, courseCoord]);

  // 맛집 저장 모달 열기 — seed: 카카오 결과 객체 또는 직접입력 { name }
  const openSaveModal = (seed) => { setSaveModalSeed(seed || null); setSaveModalVisible(true); };

  // 모달에서 저장 확정 → 신규 저장(추가) 또는 메모 수정(rest.id 있으면)
  const handleSaveRestaurant = async (rest) => {
    const d = getCourseData(selected);
    if (d?.name) {
      if (rest.id) await updateSavedRestaurant(d.name, rest.id, { name: rest.name, memo: rest.memo });
      else await addSavedRestaurant(d.name, rest);
      await refreshSavedFood(d.name);
    }
    setSaveModalVisible(false);
    setSaveModalSeed(null);
    setFoodSearch('');
    setFoodSearchResults([]);
  };

  // 저장 맛집 삭제
  const handleRemoveSaved = async (id) => {
    const d = getCourseData(selected);
    if (d?.name) {
      await removeSavedRestaurant(d.name, id);
      await refreshSavedFood(d.name);
    }
  };

  // 추천(♥) 토글 — 추천수 집계용
  const handleToggleRec = async (kakaoId) => {
    if (!kakaoId) return;
    setFoodRecs(await toggleFoodRec(kakaoId));
  };

  useEffect(() => {
    if (!selected) return;
    if (selected === PREVIEW_ID) {
      // 미저장 미리보기 — 카카오ID 기반으로 코멘트 공유 (저장 안 한 골프장도 코멘트 가능)
      setShowCommentInput(false);
      setCommentInput('');
      const kid = commentKeyFor(PREVIEW_ID);
      if (!kid) { setComments([]); return; }
      let cancelledP = false;
      (async () => {
        const list = await getCourseComments(kid);
        if (!cancelledP) setComments(list);
      })();
      return () => { cancelledP = true; };
    }
    const inLog = COURSE_LOG.find(x => x.id === selected);
    const inUser = userCoursesList.find(x => x.id === selected);
    if (!inLog && !inUser) {
      // userCoursesList가 최신이 아닐 수 있어 — 최신 목록으로 한 번 더 재확인 후에만 정리
      let cancelledLookup = false;
      (async () => {
        const fresh = await getUserCourses();
        if (cancelledLookup) return;
        if (fresh.some(c => c.id === selected)) {
          setUserCoursesList(fresh); // 최신 반영 → 효과 재실행되며 코스를 찾음
        } else if (userCoursesHydrated) {
          setSelected(null);
        }
      })();
      return () => { cancelledLookup = true; };
    }
    setShowCommentInput(false);
    setCommentInput('');
    // Firestore에서 전체 유저 공유 코멘트 로드
    // 코스가 바뀌면 in-flight 결과는 버려서 엉뚱한 코스에 표시되지 않게 함
    const courseId = commentKeyFor(selected);
    let cancelled = false;
    (async () => {
      const list = await getCourseComments(courseId);
      if (cancelled) return;
      setComments(list);
    })();
    return () => { cancelled = true; };
  }, [selected, previewCourse?.kakaoId, userCoursesList, userCoursesHydrated]);

  // 코스 평점 로드 — 코스 바뀌면 재집계 ([[project_course_rating]])
  useEffect(() => {
    if (!selected) return;
    const key = commentKeyFor(selected);
    if (!key) { setRating({ count: 0, avg: { mgmt: 0, pace: 0, value: 0 }, overall: 0, mine: null }); return; }
    let cancelled = false;
    (async () => {
      const r = await getCourseRatings(key);
      if (!cancelled) setRating(r);
    })();
    return () => { cancelled = true; };
  }, [selected, previewCourse?.kakaoId]);

  // 익명(카카오 미연동) → 카카오 연동 게이트. 공개 게시판(코멘트·별점)은 책임성·별점 1인1평가 우회
  //   방지를 위해 쓰기만 연동 후 허용(읽기는 익명 OK). ([[anonymous-user-policy]] · [[golfer-comments-board]] · [[course-rating]])
  const requireKakaoLink = async (onProceed) => {
    // ★Apple 사용자 세션 유실 — 카카오 연동을 권하면 원래 Apple 계정과 영구 분리. Apple 재로그인이 정답(FriendsTab과 동일).
    if (await anonHasAppleTrace()) {
      showAppAlert('Apple 로그인이 필요해요', '로그인이 풀려 있어요.\nApple로 다시 로그인하면\n기존 기록 그대로 이어서 진행할게요.', [
        { text: '닫기', style: 'cancel' },
        { text: 'Apple로 계속하기', onPress: async () => {
            const r = await connectAppleAccount();
            if (!r?.ok) { if (!r?.canceled) showAppAlert('Apple 로그인 실패', '잠시 후 다시 시도해주세요.'); return; }
            onProceed?.();
          } },
      ]);
      return;
    }
    showAppAlert('카카오 연동이 필요해요', '코스 평점·코멘트는 카카오 연동 후\n남길 수 있어요.\n연동하면 바로 이어서 진행할게요.', [
      { text: '닫기', style: 'cancel' },
      { text: '카카오 연동하기', onPress: async () => {
          const r = await connectKakaoAccount();
          if (r?.banned) { showAppAlert('이용이 제한된 계정이에요', '이 카카오 계정은\nDear Golf 이용이 제한되었어요.'); return; }
          if (!r?.ok) { showAppAlert('카카오 연동 실패', '잠시 후 다시 시도해주세요.'); return; }
          onProceed?.();
        } },
    ]);
  };
  const gateIfAnon = (onProceed) => { if (auth.currentUser?.isAnonymous) { requireKakaoLink(onProceed); return true; } return false; };

  // 내 평점 저장/수정 — 3카테고리 모두 별점 후 저장
  const submitRating = async () => {
    if (gateIfAnon(() => submitRating())) return;
    const key = commentKeyFor(selected);
    if (!key) { showAppAlert('코스 평점', '이 골프장에는 평점을 남길 수 없어요.'); return; }
    const d = ratingDraft;
    if (![d.mgmt, d.pace, d.value].every(n => n >= 1 && n <= 5)) {
      showAppAlert('코스 평점', '세 항목 모두 별점을 매겨주세요.'); return;
    }
    const ok = await setMyCourseRating(key, d);
    if (!ok) { showAppAlert('저장 실패', '네트워크 상태를 확인하고 다시 시도해주세요.'); return; }
    setShowRatingInput(false);
    const r = await getCourseRatings(key);
    setRating(r);
  };

  // 좋아요 토글 — 낙관적 업데이트 후 Firestore 반영, 실패 시 롤백
  const toggleLike = async (cm) => {
    if (gateIfAnon(() => toggleLike(cm))) return;
    const wasLiked = cm.likedByMe;
    setComments(prev => prev.map(c => c.id === cm.id
      ? { ...c, likedByMe: !wasLiked, likes: c.likes + (wasLiked ? -1 : 1) }
      : c));
    const ok = await toggleCommentLike(cm.id, wasLiked);
    if (!ok) {
      setComments(prev => prev.map(c => c.id === cm.id
        ? { ...c, likedByMe: wasLiked, likes: c.likes + (wasLiked ? 1 : -1) }
        : c));
    }
  };

  const anonymize = (name = '') => {
    if (!name) return '익***';
    return name.charAt(0) + '***';
  };

  // 코멘트 신고 — 사유 선택 시트 ([[content-report-policy]] §4).
  // 1인 1회 제한은 createContentReport가 deterministic Doc ID로 차단.
  const handleReportComment = async (cm) => {
    const already = await hasReportedContent('courseComment', cm.id);
    if (already) {
      showAppAlert('이미 신고한 코멘트예요', '검토 결과는 자동으로 반영돼요.', [{ text: '확인' }]);
      return;
    }
    const submit = async (reason) => {
      try {
        await createContentReport({
          targetType: 'courseComment',
          targetId: cm.id,
          targetAuthorUid: cm.authorUid || null,
          reason,
        });
        showAppAlert('신고가 접수됐어요', '디어골프 팀이 3일 이내에 확인할게요.', [{ text: '확인' }]);
      } catch (e) {
        if (__DEV__) console.warn('[GuideScreen] content report fail', e?.message);
        showAppAlert('신고 접수 실패', '잠시 후 다시 시도해주세요.', [{ text: '확인' }]);
      }
    };
    showAppAlert('코멘트 신고', '어떤 이유로 신고할까요?', [
      { text: '광고/스팸', onPress: () => submit('ad_spam') },
      { text: '부적절 콘텐츠', onPress: () => submit('inappropriate') },
      { text: '취소', style: 'cancel' },
    ]);
  };

  // 내 코멘트 — 수정/삭제 (남의 코멘트는 신고). ⋯ 버튼이 cm.mine으로 분기.
  const openMyCommentMenu = (cm) => {
    showAppAlert('내 코멘트', '', [
      { text: '수정', onPress: () => startEditComment(cm) },
      { text: '삭제', style: 'destructive', onPress: () => confirmDeleteComment(cm) },
      { text: '취소', style: 'cancel' },
    ]);
  };
  const startEditComment = (cm) => {
    setEditingCommentId(cm.id);
    setCommentInput(cm.txt || '');
    setShowCommentInput(true);
  };
  const confirmDeleteComment = (cm) => {
    showAppAlert('코멘트 삭제', '이 코멘트를 삭제할까요?\n되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        const ok = await deleteCourseComment(cm.id);
        if (ok) {
          setComments(prev => prev.filter(c => c.id !== cm.id));
          if (editingCommentId === cm.id) { setEditingCommentId(null); setCommentInput(''); }
        } else {
          showAppAlert('삭제 실패', '잠시 후 다시 시도해주세요.', [{ text: '확인' }]);
        }
      } },
    ]);
  };

  // 코멘트 작성 — Firestore에 저장(전체 유저 공유)
  const submitComment = async () => {
    if (gateIfAnon(() => submitComment())) return;
    const txt = commentInput.trim();
    if (!txt || !selected) return;
    // 비속어 필터 — 라운지 댓글과 동일 정책([[roundup-comments-policy]] §5). 신규·수정 모두 적용.
    if (containsProfanity(txt)) { showAppAlert('코멘트', PROFANITY_BLOCK_MESSAGE); return; }
    // 수정 모드 — 기존 코멘트 본문만 업데이트
    if (editingCommentId) {
      const id = editingCommentId;
      setCommentInput('');
      setShowCommentInput(false);
      setEditingCommentId(null);
      const ok = await updateCourseComment(id, txt);
      if (ok) setComments(prev => prev.map(c => (c.id === id ? { ...c, txt } : c)));
      else showAppAlert('코멘트 수정 실패', '네트워크 상태를 확인하고 다시 시도해주세요.');
      return;
    }
    // 카카오 코스는 kakaoId로 키 통일 — 미리보기/저장 코스가 같은 코멘트 공유
    const courseKey = commentKeyFor(selected);
    if (!courseKey) { showAppAlert('코멘트', '이 골프장에는 코멘트를 남길 수 없어요.'); return; }
    const anon = anonymize(userProfile?.nickname);
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;
    setCommentInput('');
    setShowCommentInput(false);
    const created = await addCourseComment(courseKey, txt, anon, dateStr);
    if (created) setComments(prev => [created, ...prev]);
    else showAppAlert('코멘트 저장 실패', '네트워크 상태를 확인하고 다시 시도해주세요.');
  };

  const toggleFavorite = (id) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const scheduleCourseIds = SCHEDULES_INIT.map(s => s.courseLogId).filter(Boolean);
  const favoriteCourses = COURSE_LOG.filter(c => favorites.includes(c.id) && !scheduleCourseIds.includes(c.id));
  const otherCourses = COURSE_LOG.filter(c => !scheduleCourseIds.includes(c.id) && !favorites.includes(c.id));
  const chipCourses = [
    ...SCHEDULES_INIT.filter(s => s.courseLogId).map(s => ({ ...COURSE_LOG.find(c => c.id === s.courseLogId), isScheduled: true })),
    ...favoriteCourses.map(c => ({ ...c, isFavorite: true })),
    ...otherCourses,
  ].filter(Boolean);

  // 홈 '구장 ›' → 상세 여는 중(코스 새로고침·카카오 검색) — 목록 대신 스피너로 즉시 반응감 부여.
  //   selected가 잡히면 바로 아래 상세 렌더로 넘어가므로 selected 없을 때만.
  if (openingCourse && !selected) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
        <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
          <TouchableOpacity onPress={closeDetail}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: fs(22), color: C.warmGray }}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={32} color={C.burgundy} />
        </View>
      </View>
    );
  }

  if (selected) {
    const c = getCourseData(selected);
    if (!c) {
      // userCoursesList 로딩 race — 헤더+스피너로 placeholder
      return (
        <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
          <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
            <TouchableOpacity onPress={closeDetail}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(22), color: C.warmGray }}>←</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size={32} color={C.burgundy} />
          </View>
        </View>
      );
    }
    const isUserCourse = c._source === 'user';
    const guideTabIdx = innerTab === 'course' ? 0 : 1;
    // 내 코스기록 — courseId 우선, 없으면 코스명으로 매칭
    // 코스명은 공백·구두점·골프장 표기어(CC·컨트리클럽 등)를 제거해 직접 입력 표기 차이를 흡수,
    // 정규화 후 동일하거나 한쪽이 다른 쪽을 포함하면 같은 코스로 간주
    const normName = (s) => (s || '')
      .toLowerCase()
      .replace(/[\s·.\-_]/g, '')
      .replace(/컨트리클럽|골프클럽|골프장|컨트리|클럽|countryclub|golfclub|cc|gc/g, '');
    const nameMatch = (a, b) => {
      const na = normName(a), nb = normName(b);
      if (na.length < 2 || nb.length < 2) return false;
      return na === nb || na.includes(nb) || nb.includes(na);
    };
    const myDiaries = diaries.filter(d =>
      isRoundDiary(d) && ( // 일상(모멘트) 제외 — 방문 횟수는 라운딩만
        (d.courseId && c.id && d.courseId === c.id) ||
        nameMatch(d.course, c.name)
      )
    );
    // 방문 횟수 = 다이어리 기록 + 기록 없는 지난 일정 (CourseLogTab '방문' 기준과 통일).
    // 방문이 본질, 기록은 옵션 — 라운딩만 하고 기록 안 남긴 경우도 방문에 포함.
    const todayMs = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); })();
    const isPast = (date) => !!date && new Date(String(date).replace(/\./g, '-')).getTime() < todayMs;
    const mySchedules = (schedules || []).filter(s =>
      isPast(s.date) &&
      ((s.courseId && c.id && s.courseId === c.id) || nameMatch(s.course, c.name))
    );
    const unrecordedSched = mySchedules.filter(s =>
      !myDiaries.some(r => (s.id && r.scheduleId === s.id) || (!r.scheduleId && r.date === s.date)));
    const visitCount = myDiaries.length + unrecordedSched.length;

    return (
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
        <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity onPress={closeDetail}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(22), color: C.warmGray }}>←</Text>
            </TouchableOpacity>
            {/* 저장 — 위시리스트 토글(기록 무관). 저장됨=진한 버건디 채움 / 미저장=흐린 아웃라인. 별 제거(골퍼평점과 겹침) */}
            {(() => {
              const fav = savedFav.some(s => (c.kakaoId && s.kakaoId === c.kakaoId) || s.name === c.name);
              return (
                <TouchableOpacity onPress={toggleSaveCourse} activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ paddingHorizontal: 13, paddingVertical: 6, borderRadius: 16,
                    backgroundColor: fav ? C.burgundy : 'transparent',
                    borderWidth: 1, borderColor: C.burgundy }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: fav ? C.butter : C.burgundy }}>
                    {fav ? '저장됨' : '+ 저장'}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal }}
                numberOfLines={1}>{c.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }} numberOfLines={1}>
                {courseAddress || c.loc}
              </Text>
              {(() => {
                // 100대 코스 배지 — 큐레이션(다중코스 리조트) 반영 매칭. 정규화 완전일치만 쓰면 '소노펠리체 비발디파크 EAST'처럼
                //   코스단위명이 top100 구장명과 안 맞아 배지가 누락됐음([[course-matching-unification]]).
                const rank = top100RankOf(top100, c.name);
                if (!rank) return null;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4,
                    backgroundColor: '#FBF3D3', borderWidth: 0.5, borderColor: '#C9A84C', borderRadius: 6,
                    paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 }}>
                    <Text style={{ fontSize: fs(11) }}>🏆</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#8B6914' }}>
                      100대 코스 {rank}위
                    </Text>
                  </View>
                );
              })()}
            </View>
            {/* 골퍼평점 — 구장명 우측(종합 평균). 화면 끝에서 띄우고(marginRight) 크게. 상세·입력은 아래 패널 ([[project_course_rating]]) */}
            {rating.count > 0 ? (
              <View style={{ alignItems: 'flex-end', paddingTop: 2, marginRight: 8 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, marginBottom: 3 }}>골퍼평점</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="star" size={fs(23)} color="#F2B441" />
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(25), color: C.charcoal }}>{rating.overall.toFixed(1)}</Text>
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 2 }}>골퍼 {rating.count}명</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* 코스명 아래 구분선 — 삼색바 */}
        <View style={{ flexDirection: 'row', height: 3 }}>
          <View style={{ flex: 1, backgroundColor: C.butter }} />
          <View style={{ flex: 1, backgroundColor: C.paleSky }} />
          <View style={{ flex: 1, backgroundColor: C.burgundy }} />
        </View>

        {/* 내부 메뉴 — 아이콘 세그먼트. 맛집 발견성이 중요해, 비활성 탭도 진한 글씨+아이콘으로 또렷이 보이게.
            선택만 채움(차콜+버터), 비선택도 충분히 읽힘(회색X→차콜). */}
        <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 12, padding: 4, borderWidth: 0.5, borderColor: C.hairline }}>
            {[
              ['course', '코스 · 코멘트', 'flag'],
              ['food',   '맛집 · 주변', 'bowl'],
            ].map(([k, l, ic]) => {
              const on = innerTab === k;
              return (
                <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setInnerTab(k)}
                  style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
                    paddingVertical: 10, borderRadius: 9, backgroundColor: on ? C.charcoal : 'transparent' }}>
                  <Icon name={ic} size={fs(15)} color={on ? C.butter : C.charcoal} />
                  <Text numberOfLines={1} style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(13), color: on ? C.butter : C.charcoal }}>{l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView ref={r => { scrollRefs.current.detail = r; }} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {innerTab === 'course' && (
            <>
            <View style={{ padding: 16 }}>
              {/* 코스 특징 태그 칩 — 별점(★) 태그는 제외하고 특징 태그만 */}
              {(() => {
                const featureTags = (c.tags || []).filter(t => !(typeof t === 'string' && t.startsWith('★')));
                if (featureTags.length === 0) return null;
                return (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                    {featureTags.map((t, i) => (
                      <View key={i} style={[
                        { borderRadius: 5, paddingHorizontal: 9, paddingVertical: 4 },
                        i === 0 && { backgroundColor: C.butter },
                        i === 1 && { backgroundColor: C.paleSky },
                        i === 2 && { backgroundColor: C.burgundy },
                        i > 2 && { backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline },
                      ]}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: i === 2 ? '#FAF6EC' : i === 0 ? '#5A4A00' : i === 1 ? C.navy : C.warmGray }}>{t}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
              {/* 연락처 제거 (2026-06-01) — 네이버정보 버튼으로 대체, 코스페이지 정리(골퍼코멘트 메인화) */}

              {/* 코스 평점 — 흰 카드 박스로 띄움(골퍼코멘트 풀폭 따뜻한 패널과 구분, 눈에 확). 사용자 2026-06-14 ([[project_course_rating]])
                  ★위키 재배치(2026-06-30): 평점·코멘트가 메인이라 상단으로. 날씨·교통·네이버(유틸)는 코멘트 아래로 이동, 내 기록·한줄평 strip 제거. */}
              <View style={[{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.hairline, padding: 16, marginTop: 10, marginBottom: 18 },
                Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 }, android: { elevation: 6 } })]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Icon name="star" size={fs(20)} color="#F2B441" />
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal, letterSpacing: 0.3 }}>코스 평점</Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
                    {rating.count > 0 ? `골퍼 ${rating.count}명 참여` : '아직 평가 없음'}
                  </Text>
                </View>

                {rating.count > 0 ? (
                  <>
                    {[['코스관리', 'mgmt'], ['경기진행', 'pace'], ['가성비', 'value']].map(([label, k]) => (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ width: 52, fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray }}>{label}</Text>
                        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden', marginHorizontal: 8 }}>
                          <View style={{ width: `${(rating.avg[k] / 5) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: C.burgundy }} />
                        </View>
                        <Text style={{ width: 26, textAlign: 'right', fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>{rating.avg[k].toFixed(1)}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginBottom: 12, lineHeight: 18 }}>
                    첫 평가를 남겨 다른 골퍼에게 도움을 주세요
                  </Text>
                )}

                {!showRatingInput ? (
                  <TouchableOpacity onPress={() => { setRatingDraft(rating.mine || { mgmt: 0, pace: 0, value: 0 }); setShowRatingInput(true); }}
                    style={{ marginTop: 6, borderWidth: 1, borderColor: C.burgundy, borderRadius: 9, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy }}>{rating.mine ? '내 평가 수정' : '내 평가 남기기'}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.hairline }}>
                    {[['코스관리', 'mgmt'], ['경기진행', 'pace'], ['가성비(그린피 대비)', 'value']].map(([label, k]) => (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal }}>{label}</Text>
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <TouchableOpacity key={n} onPress={() => setRatingDraft(d => ({ ...d, [k]: n }))} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}>
                              <Text style={{ fontSize: fs(24), color: n <= ratingDraft[k] ? '#E0A800' : 'rgba(0,0,0,0.16)' }}>★</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity onPress={() => setShowRatingInput(false)} style={{ flex: 1, borderWidth: 1, borderColor: C.hairline, borderRadius: 9, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={submitRating} style={{ flex: 2, backgroundColor: C.burgundy, borderRadius: 9, paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>저장</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* 골퍼 코멘트 — 위 코스 평점 패널과 배경 연속(marginTop 0). 버터 바가 섹션 구분 */}
              <View style={[gS.commentPanel, { marginTop: 0 }]}>
              {/* 게시판 시작 — 버터색 단색 바(전폭). 패널 패딩 상쇄해 화면 끝까지 ([[project_golfer_comments_board]]) */}
              <View style={{ height: 3, backgroundColor: C.butter, marginHorizontal: -16, marginTop: -16, marginBottom: 14 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                  <Text style={{ fontSize: fs(19) }}>💬</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal, letterSpacing: 0.3 }}>골퍼 코멘트</Text>
                  {comments.length > 0 && (
                    <View style={{ backgroundColor: C.burgundy, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1, minWidth: 18, alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>{comments.length}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => { if (editingCommentId) { setEditingCommentId(null); setCommentInput(''); } setShowCommentInput(v => !v); }}
                  activeOpacity={0.85}
                  style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, marginLeft: 8 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.butter }}>+ 코멘트</Text>
                </TouchableOpacity>
              </View>

              {/* 골퍼 코멘트 설명 — 게시판 목적 안내(첫 방문자도 바로 이해) */}
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginBottom: 14, lineHeight: 17 }}>
                이 골프장을 다녀온 골퍼들의 코스 팁·후기 게시판이에요.{'\n'}다녀오셨다면 한마디 남겨 정보를 나눠주세요.
              </Text>

              {/* 코멘트 입력 */}
              {showCommentInput && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
                        {anonymize(userProfile?.nickname)} · {editingCommentId ? '코멘트 수정' : '전체공개'}
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>{commentInput.length}/200</Text>
                    </View>
                    <AppTextInput
                      value={commentInput}
                      onChangeText={(t) => { if (t.length <= 200) setCommentInput(t); }}
                      placeholder="코스에 대한 한마디를 남겨주세요"
                      placeholderTextColor={C.warmGrayLight}
                      multiline
                      style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, minHeight: 60, textAlignVertical: 'top' }}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}>
                      <TouchableOpacity onPress={() => { setShowCommentInput(false); setCommentInput(''); setEditingCommentId(null); }}>
                        <View style={{ paddingHorizontal: 14, paddingVertical: 7 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>취소</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={submitComment}
                        disabled={!commentInput.trim()}
                        style={{ backgroundColor: commentInput.trim() ? C.burgundy : C.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: commentInput.trim() ? C.butter : C.warmGrayLight }}>{editingCommentId ? '수정' : '등록'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              )}

              {/* 정렬 + 내 코멘트 필터 — 게시판형. 최신순(기본)/좋아요순 + 내 글만 보기(많아질 때 내 글 찾기) */}
              {comments.length > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 8, padding: 2, borderWidth: 0.5, borderColor: C.hairline }}>
                    {[['recent', '최신순'], ['likes', '좋아요순']].map(([k, l]) => (
                      <TouchableOpacity key={k} onPress={() => setCommentSort(k)} activeOpacity={0.8}
                        style={[{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: 6 }, commentSort === k && { backgroundColor: C.burgundy }]}>
                        <Text style={{ fontFamily: commentSort === k ? F.sysB : F.sysM, fontSize: fs(11), color: commentSort === k ? C.butter : C.warmGray }}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {comments.some(c => c.mine) && (
                    <TouchableOpacity onPress={() => setMyCommentsOnly(v => !v)} activeOpacity={0.8}
                      style={{ marginLeft: 'auto', borderRadius: 8, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 6,
                        backgroundColor: myCommentsOnly ? C.burgundy : C.bgSecondary, borderColor: myCommentsOnly ? C.burgundy : C.hairline }}>
                      <Text style={{ fontFamily: myCommentsOnly ? F.sysB : F.sysM, fontSize: fs(11), color: myCommentsOnly ? C.butter : C.warmGray }}>내 코멘트</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {/* 코멘트 리스트 — 정렬·내코멘트필터 적용, 상위 10개 + 더보기 */}
              {(() => {
                const filtered = myCommentsOnly ? comments.filter(c => c.mine) : comments;
                const tsOf = (c) => (c.createdAt?.toMillis?.() ?? c.ts ?? 0);
                const sorted = [...filtered].sort((a, b) =>
                  commentSort === 'likes' ? (b.likes - a.likes) : (tsOf(b) - tsOf(a)));
                const visible = showAllComments ? sorted : sorted.slice(0, 10);
                if (sorted.length === 0) {
                  // 빈 상태 — 코멘트 카드와 같은 흰 카드 톤으로 안착(따뜻한 패널 위 떠 보이지 않게)
                  return (
                    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline,
                      paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: fs(24), marginBottom: 8 }}>💬</Text>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, marginBottom: myCommentsOnly ? 0 : 3 }}>
                        {myCommentsOnly ? '아직 내가 쓴 코멘트가 없어요' : '아직 코멘트가 없어요'}
                      </Text>
                      {!myCommentsOnly && (
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>첫 코멘트를 남겨 정보를 나눠보세요</Text>
                      )}
                    </View>
                  );
                }
                return (
                  <>
                    {visible.map((cm) => (
                      <View key={cm.id} style={[gS.commentCard, cm.mine && gS.commentCardMine]}>
                        <Text style={gS.commentTxt}>"{cm.txt}"</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            {cm.mine && (
                              <View style={gS.mineBadge}><Text style={gS.mineBadgeTxt}>나</Text></View>
                            )}
                            <Text style={gS.commentWho}>{cm.mine ? cm.date : `${cm.who} · ${cm.date}`}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                              onPress={() => toggleLike(cm)}
                              activeOpacity={0.6}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: cm.likedByMe ? C.burgundy : C.burgundy + '60', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                              {/* ♥+U+FE0E — 텍스트 렌더 강제(일부 기기가 ♥를 이모지로 그려 color 무시하는 편차 차단, [[rn-platform-gotchas]]) */}
                              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.burgundy }}>{cm.likedByMe ? '♥︎' : '♡'} {cm.likes}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => cm.mine ? openMyCommentMenu(cm) : handleReportComment(cm)}
                              activeOpacity={0.6}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
                              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray, letterSpacing: 1 }}>⋯</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                    {sorted.length > 10 && (
                      <TouchableOpacity onPress={() => setShowAllComments(v => !v)} activeOpacity={0.7}
                        style={{ paddingVertical: 10, alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.burgundy }}>
                          {showAllComments ? '접기' : `코멘트 ${sorted.length - 10}개 더보기`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                );
              })()}
              </View>

              {/* 예약 선택 시트 — 홈피(큐레이션 URL 있으면 바로/없으면 네이버검색)·전화(번호 있을 때만)·카카오VX·티스캐너.
                  트리거는 아래 '날씨·교통·예약' 줄의 예약 버튼(네이버정보 자리 대체, 사용자 2026-07-23) */}
              <Modal visible={showBooking} transparent animationType="slide" onRequestClose={() => setShowBooking(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                  <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowBooking(false)} />
                  <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 14) }}>
                    <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairline }} />
                    </View>
                    <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }} numberOfLines={1}>{c.name} 예약</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4, lineHeight: 18 }}>구장마다 예약처가 달라요. 원하는 곳으로 연결해 드릴게요.</Text>
                    </View>
                    {(() => {
                      const homepage = getCourseHomepage(c.name);
                      const tel = (coursePhone || '').replace(/[^0-9+]/g, '');
                      const rows = [
                        { key: 'home', icon: 'clubhouse', label: '구장 홈페이지', sub: homepage ? '공식 홈페이지 · 직접 예약' : `네이버에서 '${c.name}' 검색`, url: homepage || courseSearchUrl(c.name), inApp: true },
                        tel ? { key: 'tel', icon: 'phone', label: '전화 예약', sub: coursePhone, url: `tel:${tel}` } : null,
                        { key: 'kakaovx', icon: 'ticket', label: '카카오VX 골프예약', sub: '티타임 검색 · 임박특가', url: BOOKING_SITES.kakaovx, inApp: true },
                        { key: 'teescanner', icon: 'ticket', label: '골프존 티스캐너', sub: '전국 특가 티타임 · 조인', url: BOOKING_SITES.teescanner, inApp: true },
                      ].filter(Boolean);
                      return rows.map((r) => (
                        <TouchableOpacity key={r.key} activeOpacity={0.7}
                          onPress={() => { setShowBooking(false); r.inApp ? setWebSheet({ url: r.url, title: r.key === 'home' ? `${c.name} 홈페이지` : r.label }) : Linking.openURL(r.url).catch(() => {}); }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13 }}>
                          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.bgSecondary, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name={r.icon} size={fs(18)} color={C.burgundy} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{r.label}</Text>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 1 }} numberOfLines={1}>{r.sub}</Text>
                          </View>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(16), color: C.warmGrayLight }}>›</Text>
                        </TouchableOpacity>
                      ));
                    })()}
                  </View>
                </View>
              </Modal>

              {/* 구장 홈페이지 앱내 웹뷰 — 예약 시트에서 '구장 홈페이지' 선택 시. 안 열리면 '외부로 열기'로 폴백 */}
              <WebSheet visible={!!webSheet} url={webSheet?.url} title={webSheet?.title} onClose={() => setWebSheet(null)} />

              {/* 날씨 · 교통 · 예약 — 유틸리티(라운드 준비). 네이버정보는 예약 시트의 '구장 홈페이지'가 대체(사용자 2026-07-23). */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 8 }}>
                <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: C.burgundy }} />
                <Text style={[gS.secLabel, { marginBottom: 0 }]}>날씨 · 교통 · 예약</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                <TouchableOpacity onPress={() => openCourseInfo(c, 'wx')} activeOpacity={0.8}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.charcoal }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>날씨</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openCourseInfo(c, 'tr')} activeOpacity={0.8}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.burgundy }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>교통</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowBooking(true)} activeOpacity={0.8}
                  style={{ flex: 1, flexDirection: 'row', gap: 5, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D4853A' }}>
                  <Icon name="ticket" size={fs(15)} color="#fff" />
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff' }}>예약</Text>
                </TouchableOpacity>
              </View>

              {/* 주변 골프장 — 카카오 로컬 반경 10km */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
                <Text style={gS.secLabel}>주변 골프장 · 반경 10km</Text>
                {nearbyGolf.length > 3 && (
                  <TouchableOpacity onPress={() => setShowAllGolf(v => !v)}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.burgundy }}>
                      {showAllGolf ? '접기' : `더보기 (${nearbyGolf.length - 3})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {nearbyFoodLoading ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator color={C.burgundy} />
                </View>
              ) : nearbyGolf.length === 0 ? (
                <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
                    반경 10km 내 다른 골프장을 찾지 못했어요.
                  </Text>
                </View>
              ) : (
                (showAllGolf ? nearbyGolf : nearbyGolf.slice(0, 3)).map((g, i) => (
                  <TouchableOpacity key={g.kakaoId || i}
                    onPress={() => handleOpenPreview(g)}
                    activeOpacity={0.85}
                    style={gS.nearbyCard}>
                    <View style={gS.nearbyIconWrap}><Text style={{ fontSize: fs(16) }}>⛳</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={gS.nearbyName} numberOfLines={1}>{g.name}</Text>
                      <Text style={gS.nearbyLoc} numberOfLines={1}>{g.loc}</Text>
                    </View>
                    <Text style={gS.nearbyDist}>
                      {g.distance >= 1000 ? `${(g.distance / 1000).toFixed(1)}km` : `${g.distance}m`}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
            </>
          )}
          {innerTab === 'food' && (() => {
            // 네이버 지도(스마트플레이스) 검색 열기
            const openNaverPlace = (q) => Linking.openURL(
              `https://map.naver.com/v5/search/${encodeURIComponent(q)}`).catch(() => {}); // 핸들러 부재 시 unhandled rejection 방지

            // 식당 탭 — 앱 안에서 상세 시트로 연다(함께 식사와 같은 컴포넌트·같은 경험, 사용자 2026-07-22).
            //   전엔 네이버 지도로 앱을 나갔는데, 같은 성격의 정보인데 한쪽만 이탈하는 게 어색했다.
            //   카카오 로컬 결과라 kakaoId가 있어 place 웹뷰가 그대로 열린다. 목록 전체를 더 보는
            //   '네이버 지도에서 맛집 더보기'는 검색 결과라 시트에 안 맞아 그대로 둔다(탈출구 역할).
            const openRestaurantPlace = (r) => {
              if (!r?.name) return;
              setDetailPlace(r);
            };
            // 시트 안 '길찾기' — 기존 동작 유지(네이버 지도 검색). loc의 시/군/구 토큰을 함께 실어
            //   동명이인 식당으로 빠지는 것 방지.
            const navRestaurant = (r) => {
              if (!r?.name) return;
              const city = cityTokenOf(r.loc);
              openNaverPlace(city ? `${r.name} ${city}` : r.name);
            };

            // 귀가 동선 방향 뱃지 — 길목(그린)/우회(앰버)/반대(뮤트). 함께 식사와 같은 유틸·같은 색이라
            //   두 화면의 신호가 일치한다. 목적지 미등록·좌표 없으면 null(조용히 생략).
            //   ★맛집 목록이 세 곳(저장한 맛집·추천 맛집·가까운 맛집/카페)이라 헬퍼로 뽑아 전부 같게 붙인다.
            const dirBadge = (r) => {
              const badge = destinationBadge(courseCoord, mealDest, mealDest?.label, r);
              if (!badge) return null;
              const bt = badge.tone === 'good' ? { bg: 'rgba(94,139,96,0.15)', fg: '#3C7D4F' }
                : badge.tone === 'mild' ? { bg: 'rgba(139,105,20,0.13)', fg: '#8B6914' }
                  : { bg: 'rgba(150,90,70,0.12)', fg: '#9A6A55' };
              return (
                <View style={{ alignSelf: 'flex-start', marginTop: 5, backgroundColor: bt.bg,
                  borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: bt.fg }}>{badge.text}</Text>
                </View>
              );
            };

            const fmtDist = (m) => (!m ? '' : m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);

            const styles = {
              card: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6 },
              circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
              circleTxt: { fontFamily: F.sysSb, fontSize: fs(14) },
              badge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 3 },
              badgeTxt: { fontFamily: F.sysSb, fontSize: fs(9) },
              name: { fontFamily: F.sysSb, fontSize: fs(13), color: '#2A2622' },
              meta: { fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 1 },
              memo: { fontFamily: F.sys, fontSize: fs(10), color: '#5A4A00', marginTop: 4 },
              ratingBox: { backgroundColor: '#F5E6A8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
              ratingTxt: { fontFamily: F.sysSb, fontSize: fs(10), color: '#5A4A00' },
              reviewsTxt: { fontFamily: F.sys, fontSize: fs(9), color: C.warmGray },
            };

            // 주변 맛집 + 카페 — 거리순 통합
            const nearbyAll = [...nearbyFood, ...nearbyCafes]
              .sort((a, b) => (a.distance || 0) - (b.distance || 0));
            // 골퍼 추천 맛집 — 추천수(하트) 내림차순 정렬
            const recCountOf = (r) => seedRecCount(r.kakaoId) + (foodRecs[r.kakaoId] ? 1 : 0);
            const recSorted = [...nearbyFood].sort((a, b) => recCountOf(b) - recCountOf(a));
            // ③ '가까운' 리스트에서 ②(골퍼 추천)에 이미 보이는 식당은 제외 — 같은 식당이 위아래 중복으로 뜨던 것 방지(사용자 2026-07-23)
            const recShownIds = new Set((showAllRest ? recSorted : recSorted.slice(0, 3)).map(r => r.kakaoId || r.name));
            const nearbyDeduped = nearbyAll.filter(r => !recShownIds.has(r.kakaoId || r.name));
            // 인터랙티브 지도 마커 — 골프장(버건디) + 골퍼 추천 맛집(주황) + 저장 맛집(노랑)
            // 저장한 추천 맛집은 노란 핀으로만 표시 — 주황 목록에서 제외
            const savedKeySet = new Set(savedFood.map(s => s.kakaoId || s.name));
            const mapNearby = nearbyFood.filter(r => !savedKeySet.has(r.kakaoId || r.name));
            // 네이버 지도에서 골프장 주변 맛집을 '리스트'로 — 구장명 대신 '행정구역(읍/면/동) + 맛집'으로 검색.
            //   구장명을 넣으면 구장 POI로 빠져 단일 장소가 열림(청백산가든·힐마루골프 버그).
            const openNaverPlaces = () => Linking.openURL(naverFoodListUrl(c.loc, c.name, courseCoord)).catch(() => {});

            return (
              <View>
                {/* 맛집 인터랙티브 지도 — 골프장 중심 + 주변 맛집(반경 3km) 마커, 팬·줌·마커 탭 ([[food-map-interactive]]) */}
                <View style={{ height: 210, position: 'relative', backgroundColor: C.bgSecondary }}>
                  {courseCoord && Number.isFinite(courseCoord.x) && Number.isFinite(courseCoord.y) ? (
                    <FoodMapView
                      courseCoord={courseCoord}
                      courseName={c.name}
                      nearby={mapNearby}
                      saved={savedFood}
                      height={210}
                      onMarkerPress={openRestaurantPlace}
                    />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      {nearbyFoodLoading
                        ? <ActivityIndicator color={C.burgundy} />
                        : <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>지도를 불러올 수 없습니다</Text>}
                    </View>
                  )}
                  {/* 범례 */}
                  <View style={{
                    position: 'absolute', top: 8, right: 8,
                    backgroundColor: 'rgba(255,255,255,0.92)',
                    borderRadius: 8,
                    paddingHorizontal: 8, paddingVertical: 4,
                    flexDirection: 'row', gap: 8,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.charcoal }}>⛳ 골프장</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.charcoal }}>📍 추천 맛집</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.charcoal }}>⭐ 저장 맛집</Text>
                  </View>
                  {/* 우하단 네이버 지도 앱 열기 — 해당 골프장 위치 기준 */}
                  <TouchableOpacity
                    onPress={() => {
                      // 골프장명만으로 검색하면 동명 다른 지역으로 빠짐 → 지역 토큰 함께 실어 고정.
                      const q = [c.name, regionOf(c.loc)].filter(Boolean).join(' ');
                      Linking.openURL(`nmap://search?query=${encodeURIComponent(q)}`)
                        .catch(() => Linking.openURL(naverSearchUrl(c.name, c.loc)));
                    }}
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      backgroundColor: '#03C75A', borderRadius: 10,
                      paddingHorizontal: 10, paddingVertical: 6,
                    }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#fff' }}>네이버지도 →</Text>
                  </TouchableOpacity>
                </View>

              <View style={{ padding: 16, paddingTop: 14 }}
                onLayout={(e) => { foodSearchYRef.current = e.nativeEvent.layout.y; }}>
                {/* 상단 검색창 — 맛집 검색 또는 직접 추가. 포커스 시 검색줄을 화면 위로 스크롤 —
                    edge-to-edge라 adjustResize 무효, 지도(210) 아래 입력이라 키보드가 검색줄·결과를 덮었음(2026-07-05). */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#fff', borderRadius: 10,
                    borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 12,
                  }}>
                    <View style={{ marginRight: 6 }}><Icon name="search" size={fs(15)} color={C.warmGray} /></View>
                    <AppTextInput
                      value={foodSearch}
                      onChangeText={setFoodSearch}
                      onFocus={() => { // 키보드 안착 후 스크롤(MealDecisionBar 패널 스크롤과 동일 240ms 지연)
                        setTimeout(() => scrollRefs.current.detail?.scrollTo?.({ y: Math.max(0, (foodSearchYRef.current || 210) - 8), animated: true }), 240);
                      }}
                      placeholder="맛집 검색 또는 직접 추가"
                      placeholderTextColor={C.warmGrayLight}
                      style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, paddingVertical: 9 }}
                    />
                    {foodSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setFoodSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ color: C.warmGray, fontSize: fs(13) }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => { const q = foodSearch.trim(); if (q) openSaveModal({ name: q }); }}
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: foodSearch.trim() ? C.burgundy : C.hairline,
                      borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center',
                    }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: foodSearch.trim() ? C.butter : C.warmGrayLight }}>+ 추가</Text>
                  </TouchableOpacity>
                </View>

                {/* 검색 결과 — 카카오 음식점 키워드 검색 */}
                {foodSearch.trim().length >= 2 && (
                  <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, marginTop: 8, overflow: 'hidden' }}>
                    {foodSearchLoading ? (
                      <View style={{ padding: 14, alignItems: 'center' }}>
                        <ActivityIndicator color={C.burgundy} size="small" />
                      </View>
                    ) : foodSearchResults.length === 0 ? (
                      <TouchableOpacity onPress={() => openSaveModal({ name: foodSearch.trim() })} style={{ padding: 12 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
                          검색 결과가 없어요. <Text style={{ color: C.burgundy }}>"{foodSearch.trim()}" 직접 추가 →</Text>
                        </Text>
                      </TouchableOpacity>
                    ) : foodSearchResults.map((r, i) => (
                      <TouchableOpacity key={r.kakaoId || i} onPress={() => openSaveModal(r)} activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.hairline }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal }}>{r.name}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }} numberOfLines={1}>
                            {r.type}{r.loc ? ` · ${r.loc}` : ''}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.burgundy }}>+ 저장</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* ① 내가 저장한 맛집 — 골프장별 저장 목록 (없으면 섹션 숨김) */}
                {savedFood.length > 0 && (
                  <View style={{ marginTop: 18, backgroundColor: 'rgba(201,168,76,0.07)', borderWidth: 1, borderColor: '#C9A84C40', borderRadius: 14, padding: 12 }}>
                    {/* 연한 골드 박스로 섹션 통째 감싸 추천·주변과 확실히 구분(사용자 2026-06-15) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Text style={{ fontSize: fs(14), color: '#C9A84C' }}>★</Text>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#5A4A00' }}>내가 저장한 맛집</Text>
                      <View style={{ backgroundColor: '#F5E6A8', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#5A4A00' }}>{savedFood.length}</Text>
                      </View>
                      <View style={{ flex: 1, height: 1, backgroundColor: '#C9A84C44', marginLeft: 4 }} />
                    </View>
                    {savedFood.map(r => (
                      <TouchableOpacity key={r.id}
                        onPress={() => openRestaurantPlace(r)}
                        activeOpacity={0.85}
                        style={[styles.card, { borderWidth: 1, borderColor: '#C9A84C55', backgroundColor: '#FFFDF5', alignItems: 'flex-start' }]}>
                        <View style={[styles.circle, { backgroundColor: '#F5E6A8' }]}>
                          <Text style={{ fontSize: fs(17), color: C.burgundy }}>★</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 3 }}>
                            <View style={{ backgroundColor: '#F5E6A8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={[styles.badgeTxt, { color: '#5A4A00' }]}>내 기록</Text>
                            </View>
                          </View>
                          <Text style={styles.name}>{r.name}</Text>
                          <Text style={styles.meta}>{r.type || '음식점'}{r.loc ? ` · ${r.loc}` : ''}</Text>
                          {/* 저장한 맛집은 좌표가 없는 옛 기록도 있어 뱃지가 안 뜰 수 있다(그때는 조용히 생략) */}
                          {dirBadge(r)}
                          {r.memo ? (
                            // 메모 있을 때 — 메모 자체를 탭하면 수정, 수정 힌트는 옅게(✏️ 이모지 → 자체 pen 아이콘, 2026-07-05)
                            <TouchableOpacity onPress={() => openSaveModal({ ...r })} activeOpacity={0.7}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 5 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
                                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#5A4A00', lineHeight: 16, flexShrink: 1 }}>
                                  "{r.memo}"
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 1 }}>
                                  <Icon name="pen" size={fs(9)} color={C.warmGray} />
                                  <Text style={{ fontFamily: F.sys, fontSize: fs(9), color: C.warmGray }}>수정</Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={() => openSaveModal({ ...r })} activeOpacity={0.7}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              style={{ alignSelf: 'flex-start', marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Icon name="pen" size={fs(10)} color={C.burgundy} />
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.burgundy }}>메모 입력</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
                          <TouchableOpacity onPress={() => handleRemoveSaved(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>삭제</Text>
                          </TouchableOpacity>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.burgundy }}>→</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* ② 골퍼 추천 맛집 — 카카오 로컬 반경 3km 음식점 */}
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, letterSpacing: 0, marginTop: 18, marginBottom: 8 }}>골퍼 추천 맛집 · 추천순</Text>
                {nearbyFoodLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator color={C.burgundy} />
                  </View>
                ) : nearbyFood.length === 0 ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                      반경 3km 내 맛집 정보를 찾지 못했어요.
                    </Text>
                  </View>
                ) : (
                  (showAllRest ? recSorted : recSorted.slice(0, 3)).map((r, i) => {
                    const liked = !!foodRecs[r.kakaoId];
                    const recCount = seedRecCount(r.kakaoId) + (liked ? 1 : 0);
                    const saved = savedFood.some(s => (r.kakaoId && s.kakaoId === r.kakaoId) || s.name === r.name);
                    return (
                      <View key={r.kakaoId || i}
                        style={[styles.card, { borderWidth: 0.5, borderColor: C.hairline, backgroundColor: '#fff', alignItems: 'flex-start' }]}>
                        <View style={{ alignItems: 'center', marginRight: 10 }}>
                          <View style={[styles.circle, { backgroundColor: '#8B3040', marginRight: 0 }]}>
                            <Icon name="dining" size={fs(18)} color="#fff" />
                          </View>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(9), color: '#8B3040', marginTop: 3 }}>식당</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          {/* 이름·정보 탭도 상세 열기 — 화살표만 되던 것(사용자 2026-07-23) */}
                          <TouchableOpacity activeOpacity={0.6} onPress={() => openRestaurantPlace(r)}>
                            <Text style={styles.name}>{r.name}</Text>
                            <Text style={styles.meta}>{r.type}{r.distance ? ` · ${fmtDist(r.distance)}` : ''}</Text>
                            {!!r.loc && <Text style={[styles.meta, { color: C.warmGray }]} numberOfLines={1}>{r.loc}</Text>}
                            {dirBadge(r)}
                          </TouchableOpacity>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
                            {/* 추천하기 ♥ */}
                            <TouchableOpacity onPress={() => handleToggleRec(r.kakaoId)} activeOpacity={0.7}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                                borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                                borderWidth: 0.5, borderColor: C.burgundy,
                                backgroundColor: liked ? C.burgundy : 'transparent',
                              }}>
                              <Text style={{ fontSize: fs(10), color: liked ? C.butter : C.burgundy }}>{liked ? '♥︎' : '♡'}</Text>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: liked ? C.butter : C.burgundy }}>{recCount}</Text>
                            </TouchableOpacity>
                            {/* 저장 — 추천 ♥와 분리된 별도 + 저장 버튼 */}
                            <TouchableOpacity onPress={() => !saved && openSaveModal(r)} activeOpacity={0.7} disabled={saved}
                              style={{
                                borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                                borderWidth: 0.5, borderColor: saved ? C.hairline : '#C9A84C',
                                backgroundColor: saved ? C.hairline : '#FFFDF5',
                              }}>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: saved ? C.warmGrayLight : '#5A4A00' }}>
                                {saved ? '저장됨' : '+ 저장'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => openRestaurantPlace(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.burgundy }}>→</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
                {nearbyFood.length > 3 && (
                  <TouchableOpacity onPress={() => setShowAllRest(v => !v)}
                    style={{ paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>
                      {showAllRest ? '접기 ▴' : `더보기 (${nearbyFood.length - 3}) ▾`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ③ 가까운 맛집/카페 — 카카오 로컬 반경 3km (음식점 + 카페 거리순) */}
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, letterSpacing: 0, marginTop: 18, marginBottom: 8 }}>가까운 맛집/카페</Text>
                {nearbyFoodLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator color={C.burgundy} />
                  </View>
                ) : nearbyDeduped.length === 0 ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                      이 근처 다른 맛집·카페는 없어요.
                    </Text>
                  </View>
                ) : (
                  (showAllNearby ? nearbyDeduped : nearbyDeduped.slice(0, 5)).map((r, i) => {
                    const isCafe = r.kind === 'cafe';
                    const saved = savedFood.some(s => (r.kakaoId && s.kakaoId === r.kakaoId) || s.name === r.name);
                    const liked = !!foodRecs[r.kakaoId];
                    const recCount = seedRecCount(r.kakaoId) + (liked ? 1 : 0);
                    return (
                      <View key={r.kakaoId || i}
                        style={[styles.card, { borderWidth: 0.5, borderColor: C.hairline, backgroundColor: '#fff', alignItems: 'flex-start' }]}>
                        <View style={{ alignItems: 'center', marginRight: 10 }}>
                          <View style={[styles.circle, { backgroundColor: isCafe ? '#C8D9E6' : '#8B3040', marginRight: 0 }]}>
                            <Icon name={isCafe ? 'cafe' : 'dining'} size={fs(18)} color={isCafe ? C.navy : '#fff'} />
                          </View>
                          {/* 식당/카페 종류를 이모지(아이콘) 아래에 라벨로(사용자 2026-07-23) — 이름 위 배지 대체 */}
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(9), color: isCafe ? C.navy : '#8B3040', marginTop: 3 }}>{isCafe ? '카페' : '식당'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          {/* 이름·정보 탭도 상세 열기 — 화살표만 되던 것(사용자 2026-07-23) */}
                          <TouchableOpacity activeOpacity={0.6} onPress={() => openRestaurantPlace(r)}>
                            <Text style={styles.name}>{r.name}</Text>
                            <Text style={styles.meta}>{r.type}{r.distance ? ` · ${fmtDist(r.distance)}` : ''}</Text>
                            {!!r.loc && <Text style={[styles.meta, { color: C.warmGray }]} numberOfLines={1}>{r.loc}</Text>}
                            {dirBadge(r)}
                          </TouchableOpacity>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
                            {/* 추천 ♥ — ②골퍼추천과 동일. 가까운 리스트에서도 추천 가능(사용자 2026-07-23). 추천 쌓이면 ②로 올라옴 */}
                            <TouchableOpacity onPress={() => handleToggleRec(r.kakaoId)} activeOpacity={0.7}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                                borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                                borderWidth: 0.5, borderColor: C.burgundy,
                                backgroundColor: liked ? C.burgundy : 'transparent',
                              }}>
                              <Text style={{ fontSize: fs(10), color: liked ? C.butter : C.burgundy }}>{liked ? '♥︎' : '♡'}</Text>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: liked ? C.butter : C.burgundy }}>{recCount}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => !saved && openSaveModal(r)} activeOpacity={0.7} disabled={saved}
                              style={{
                                borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                                borderWidth: 0.5, borderColor: saved ? C.hairline : '#C9A84C',
                                backgroundColor: saved ? C.hairline : '#FFFDF5',
                              }}>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: saved ? C.warmGrayLight : '#5A4A00' }}>
                                {saved ? '저장됨' : '+ 저장'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => openRestaurantPlace(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.burgundy }}>→</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
                {nearbyDeduped.length > 5 && (
                  <TouchableOpacity onPress={() => setShowAllNearby(v => !v)}
                    style={{ paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>
                      {showAllNearby ? '접기 ▴' : `더보기 (${nearbyDeduped.length - 5}) ▾`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 네이버 지도에서 맛집 더 찾기 — 맨 아래 한 곳 */}
                <TouchableOpacity onPress={openNaverPlaces} activeOpacity={0.85}
                  style={{
                    marginTop: 14, borderRadius: 10, backgroundColor: '#03C75A',
                    paddingVertical: Platform.OS === 'android' ? 11 : 15, alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: '#fff' }}>네이버 지도에서 맛집 더보기 →</Text>
                </TouchableOpacity>
              </View>
              {/* 앱 내 식당 상세 — 함께 식사와 같은 컴포넌트(카카오 place 웹뷰). 이 탭 안에 두어야
                  ScrollView 위에 정상적으로 뜬다. onDecide는 여기선 없음(식사 제안은 일정 화면 소관). */}
              <RestaurantDetailSheet
                visible={!!detailPlace}
                place={detailPlace}
                onClose={() => setDetailPlace(null)}
                onNav={() => { const p = detailPlace; setDetailPlace(null); navRestaurant(p); }}
              />
              </View>
            );
          })()}
          {/* 하단 여백 — 플로팅 탭바(≈insets.bottom+66)가 떠 있어 32px로는 마지막 내용이 가린다.
              다른 탭 화면과 같은 값으로 통일(2026-07-22 일괄 점검). */}
          <View style={{ height: insets.bottom + 92 }} />
        </ScrollView>

        <WeatherTransportPopup
          visible={showCoursePopup}
          initialTab={coursePopupTab}
          schedule={coursePopupSched}
          onClose={() => setShowCoursePopup(false)}
        />

        <RestaurantSaveModal
          visible={saveModalVisible}
          seed={saveModalSeed}
          courseName={c.name}
          onClose={() => { setSaveModalVisible(false); setSaveModalSeed(null); }}
          onSave={handleSaveRestaurant}
        />
      </View>
    );
  }

  const hasCourses = chipCourses.length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ backgroundColor: C.butter, paddingHorizontal: 20, paddingVertical: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(61,57,53,0.72)', letterSpacing: 2, marginBottom: _and ? 2 : 4 }}>골퍼들의 코스 이야기</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{
              fontFamily: F.sysSb,
              fontSize: fs(_and ? 24 : 28),
              color: C.charcoal,
            }}>코스</Text>
            {/* 안내 — 제목 옆. 구장 탭=코스·코멘트·맛집, 아래로 내 주변 스크린골프(사용자 2026-06-20).
                '내 코스 모아보기'는 검색창 위 긴 바(CourseExploreTab)로 이동(헤더 버튼 제거, 중복 방지). */}
            <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => showAppAlert('코스 둘러보기 안내',
                '골프장을 검색해 탭하면\n코스 정보·골퍼 코멘트·주변 맛집을\n한눈에 볼 수 있어요.\n\n아래로 내리면 내 주변\n스크린골프장을 찾을 수 있어요.',
                [{ text: '확인' }])}
              style={{ padding: 4 }}>
              <Icon name="book" size={fs(20)} color={C.charcoal} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <CourseExploreTab
        ref={exploreRef}
        region={exploreRegion}
        onRegionChange={setExploreRegion}
        top100={top100}
        master={exploreMaster}
        onSelectCourse={(id) => { setSelected(id); setInnerTab('course'); }}
        onOpenPreview={handleOpenPreview}
        onOpenCourseLog={() => setShowCourseLog(true)}
      />
      <CourseLogModal
        visible={showCourseLog}
        onClose={() => setShowCourseLog(false)}
        navigation={navigation}
      />
    </View>
  );
}
