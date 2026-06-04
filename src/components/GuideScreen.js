import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, TextInput, KeyboardAvoidingView, Platform, BackHandler, Image, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { Spinner } from './common/Spinner';
import { showAppAlert } from './AppAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { UserContext } from '../contexts/UserContext';
import { DiariesContext } from '../contexts/DiariesContext';

// 헤더·버튼을 라운지(navy) 헤더 규격에 맞춰 안드 컴팩트 보정 (RoundupTab과 동일 패턴)
const _and = Platform.OS === 'android';

import { C, F, fs } from '../constants/colors';
import {
  FAVORITES_INIT, SCHEDULES_INIT, COURSE_LOG, DIARY_DATA,
  RECOMMENDED_COURSES, WEEKDAYS,
} from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getTop100Courses, normalizeCourseName } from '../utils/top100';
import { getUserCourses } from '../utils/userCourses';
import { gS } from '../styles/gS';
import { CourseExploreTab } from './CourseExploreTab';
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { fetchCoursePlaceInfo, searchGolfCourses, searchNearbyRestaurants, searchNearbyCafes, searchNearbyGolfCourses, searchRestaurantsByKeyword } from '../utils/kakao';
import { buildFoodMapUrl, NAVER_MAP_HEADERS, cityTokenOf, regionOf, naverSearchUrl } from '../utils/naverMap';
import { getSavedRestaurants, addSavedRestaurant, removeSavedRestaurant, updateSavedRestaurant } from '../utils/savedRestaurants';
import { getFoodRecs, toggleFoodRec, seedRecCount } from '../utils/foodRecs';
import { getCourseComments, addCourseComment, toggleCommentLike, deleteCourseComment, updateCourseComment } from '../utils/courseComments';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { createContentReport, hasReportedContent } from '../utils/contentReports';
import { RestaurantSaveModal } from './RestaurantSaveModal';
import { CourseLogModal } from './CourseLogModal';

export function GuideScreen({ route, navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [selected, setSelected] = useState(null);
  const [openingCourse, setOpeningCourse] = useState(false); // 홈 '구장 ›' → 상세 여는 동안(코스 새로고침·카카오 검색) 스피너 노출 — 목록이 잠깐 보이는 인상 제거
  const [innerTab, setInnerTab] = useState('course');
  const [showCourseLog, setShowCourseLog] = useState(false); // 내 코스기록 페이지
  const [favorites, setFavorites] = useState(FAVORITES_INIT);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [userCoursesList, setUserCoursesList] = useState([]);
  const [userCoursesHydrated, setUserCoursesHydrated] = useState(false);
  // 다이어리는 DiariesContext에서 받음 (Firestore 단일 소스)
  const { diaries } = React.useContext(DiariesContext);
  const [comments, setComments] = useState([]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null); // 내 코멘트 수정 중 id
  const [showAllComments, setShowAllComments] = useState(false); // 골퍼 코멘트 — 상위 10개 + 더보기
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
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [saveModalSeed, setSaveModalSeed] = useState(null);
  const [top100, setTop100] = useState([]); // 100대 코스 — 코스 상세 배지용
  const scrollRefs = useRef({});

  // 100대 코스 목록 — 마운트 시 1회 로드
  useEffect(() => { getTop100Courses().then(list => setTop100(list || [])); }, []);

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
    const unsubscribe = navigation.addListener('tabPress', () => {
      setSelected(null);
      setPreviewCourse(null);
      setOpeningCourse(false);
      setInnerTab('course');
      setShowCommentInput(false);
      setCommentInput('');
      setSearch('');
      setRegionFilter('전체');
      setFoodSearch('');
      setFoodSearchResults([]);
      setSaveModalVisible(false);
      setShowAllGolf(false);
      setShowAllRest(false);
      setShowAllNearby(false);
      Object.values(scrollRefs.current).forEach(r => r?.scrollTo?.({ y: 0, animated: true }));
    });
    return unsubscribe;
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

  // Android 시스템 뒤로가기 — 코스 상세가 열려 있으면 홈으로 가지 않고 상세만 닫는다
  // (코스 탭에 머물러 검색·최근검색 상태 유지)
  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        if (selected || previewCourse) {
          setSelected(null);
          setPreviewCourse(null);
          setInnerTab('course');
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [selected, previewCourse]),
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

  // 좋아요 토글 — 낙관적 업데이트 후 Firestore 반영, 실패 시 롤백
  const toggleLike = async (cm) => {
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
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
        <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
          <TouchableOpacity onPress={() => { setOpeningCourse(false); setSelected(null); setPreviewCourse(null); setInnerTab('course'); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: fs(22), color: C.warmGray }}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={32} color={C.burgundy} />
        </View>
      </SafeAreaView>
    );
  }

  if (selected) {
    const c = getCourseData(selected);
    if (!c) {
      // userCoursesList 로딩 race — 헤더+스피너로 placeholder
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
          <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
            <TouchableOpacity onPress={() => { setSelected(null); setPreviewCourse(null); setInnerTab('course'); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: fs(22), color: C.warmGray }}>←</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size={32} color={C.burgundy} />
          </View>
        </SafeAreaView>
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
      (d.courseId && c.id && d.courseId === c.id) ||
      nameMatch(d.course, c.name)
    );

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
        <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
          <TouchableOpacity onPress={() => { setSelected(null); setPreviewCourse(null); setInnerTab('course'); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: fs(22), color: C.warmGray }}>←</Text>
          </TouchableOpacity>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal }}
                numberOfLines={1}>{c.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }} numberOfLines={1}>
                {courseAddress || c.loc}
              </Text>
              {(() => {
                // 100대 코스 배지 — 골프장명이 top100Courses에 매칭되면 순위 표시
                const rank = top100.find(t => normalizeCourseName(t.name) === normalizeCourseName(c.name))?.rank;
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
          </View>
        </View>

        {/* 코스명 아래 구분선 — 삼색바 */}
        <View style={{ flexDirection: 'row', height: 3 }}>
          <View style={{ flex: 1, backgroundColor: C.butter }} />
          <View style={{ flex: 1, backgroundColor: C.paleSky }} />
          <View style={{ flex: 1, backgroundColor: C.burgundy }} />
        </View>

        {/* 내부 메뉴 — 세그먼트 토글 */}
        <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 16, paddingVertical: 12 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.bgSecondary, borderRadius: 10, padding: 3, borderWidth: 0.5, borderColor: C.hairline }}>
            {[
              ['course', '코스 & 코멘트'],
              ['food',   '맛집 & 주변'],
            ].map(([k, l]) => {
              const on = innerTab === k;
              return (
                <TouchableOpacity key={k}
                  activeOpacity={0.7}
                  style={[
                    { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
                    on && { backgroundColor: C.charcoal },
                  ]}
                  onPress={() => setInnerTab(k)}>
                  <Text style={{
                    fontFamily: on ? F.sysB : F.sysM,
                    fontSize: fs(13),
                    color: on ? C.butter : C.warmGray,
                  }}>{l}</Text>
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

              {/* 한줄 메모 — 버건디 액센트 바 헤더 + 내 기록 횟수 칩(옛 '내 라운딩 기록 · N회' 헤더를 여기로 흡수) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: C.burgundy }} />
                  <Text style={[gS.secLabel, { marginBottom: 0 }]}>한줄 메모</Text>
                </View>
                {myDiaries.length > 0 && (
                  <View style={gS.mineCountPill}>
                    <Text style={gS.mineCountTxt}>내 기록 {myDiaries.length}회</Text>
                  </View>
                )}
              </View>
              {(() => {
                // 최근 라운딩 (날짜 내림차순) 첫 번째의 memo
                const latestDiary = [...myDiaries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
                const memo = latestDiary?.memo;
                if (!memo) {
                  // 미방문 코스 — 입력칸이 아니라 '기록하면 자동으로 채워진다'는 안내.
                  // 점선 테두리 = 앱 전반의 '미기록' 표시와 일관 (메모 카드처럼 보이지 않게)
                  return (
                    <View style={{
                      backgroundColor: C.bgSecondary,
                      borderWidth: 1, borderColor: C.hairline, borderStyle: 'dashed',
                      borderRadius: 10,
                      paddingHorizontal: 14, paddingVertical: 16, marginBottom: 22,
                      alignItems: 'center',
                    }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center' }}>
                        아직 이 코스 라운딩 기록이 없어요
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginTop: 5, lineHeight: 16 }}>
                        라운딩 후 다이어리에 기록을 남기면{'\n'}그날의 한줄 메모가 여기에 표시돼요
                      </Text>
                    </View>
                  );
                }
                return (
                  <View style={{
                    backgroundColor: '#fff',
                    borderLeftWidth: 4, borderLeftColor: C.burgundy,
                    borderRadius: 10,
                    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 22,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#3D3935', lineHeight: 21 }}>
                      {memo}
                    </Text>
                    {latestDiary?.date ? (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 6 }}>
                        {latestDiary.date} 라운딩
                      </Text>
                    ) : null}
                  </View>
                );
              })()}

              {/* 날씨 · 교통 · 네이버정보 — 한 줄 나란히 (한줄메모 아래로 이동, 2026-06-01) */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 26 }}>
                <TouchableOpacity onPress={() => openCourseInfo(c, 'wx')} activeOpacity={0.8}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: C.charcoal,
                  }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>날씨</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openCourseInfo(c, 'tr')} activeOpacity={0.8}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: C.burgundy,
                  }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>교통</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL(naverSearchUrl(c.name, c.loc))}
                  activeOpacity={0.8}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#03C75A',
                  }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff' }}>네이버정보</Text>
                </TouchableOpacity>
              </View>

              {/* 골퍼 코멘트 — 위 섹션과 따뜻한 톤 배경으로 구분(테두리 박스 X — 답답함 회피). */}
              <View style={gS.commentPanel}>
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
                    <TextInput
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
                              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.burgundy }}>{cm.likedByMe ? '♥' : '♡'} {cm.likes}</Text>
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
              `https://map.naver.com/v5/search/${encodeURIComponent(q)}`);

            // 식당 객체 전용 — 식당명만으로 검색 시 동명 다른 지역 식당으로 빠지는 문제 방지.
            // loc(주소)에서 시/군/구 토큰을 함께 쿼리에 실어 정확도 ↑
            const openRestaurantPlace = (r) => {
              if (!r?.name) return;
              const city = cityTokenOf(r.loc);
              openNaverPlace(city ? `${r.name} ${city}` : r.name);
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
            // 네이버 정적 지도 URL — 골프장(큰 핀) + 골퍼 추천 맛집(주황 핀) + 저장 맛집(노란 핀)
            // 저장한 추천 맛집은 노란 핀으로만 표시 — 주황 목록에서 제외
            const mapW = Math.round(Dimensions.get('window').width);
            const savedKeySet = new Set(savedFood.map(s => s.kakaoId || s.name));
            const mapNearby = nearbyFood.filter(r => !savedKeySet.has(r.kakaoId || r.name));
            const mapUrl = buildFoodMapUrl(courseCoord, mapNearby, savedFood, { w: mapW, h: 210 });
            // 네이버 지도(스마트플레이스)에서 골프장 주변 맛집 검색
            const openNaverPlaces = () => Linking.openURL(naverSearchUrl(c.name, c.loc, '맛집'));

            return (
              <View>
                {/* 네이버 정적 지도 — 골프장 중심 + 주변 맛집(반경 3km) 마커 */}
                <View style={{ height: 210, position: 'relative', backgroundColor: C.bgSecondary }}>
                  {mapUrl ? (
                    <Image
                      source={{ uri: mapUrl, headers: NAVER_MAP_HEADERS }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                      onError={(e) => console.warn('[naver map]', e?.nativeEvent?.error)}
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
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.charcoal }}>🟠 추천 맛집</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.charcoal }}>🟡 저장 맛집</Text>
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

              <View style={{ padding: 16, paddingTop: 14 }}>
                {/* 상단 검색창 — 맛집 검색 또는 직접 추가 */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center',
                    backgroundColor: '#fff', borderRadius: 10,
                    borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 12,
                  }}>
                    <Text style={{ fontSize: fs(13), marginRight: 6 }}>🔍</Text>
                    <TextInput
                      value={foodSearch}
                      onChangeText={setFoodSearch}
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
                  <>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, letterSpacing: 0, marginTop: 18, marginBottom: 8 }}>
                      내가 저장한 맛집 · {savedFood.length}
                    </Text>
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
                          {r.memo ? (
                            // 메모 있을 때 — 메모 자체를 탭하면 수정, 수정 힌트는 옅게
                            <TouchableOpacity onPress={() => openSaveModal({ ...r })} activeOpacity={0.7}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 5 }}>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#5A4A00', lineHeight: 16 }}>
                                "{r.memo}"  <Text style={{ fontSize: fs(9), fontStyle: 'normal', color: C.warmGray }}>✏️ 수정</Text>
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={() => openSaveModal({ ...r })} activeOpacity={0.7}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              style={{ alignSelf: 'flex-start', marginTop: 5 }}>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.burgundy }}>✏️ 메모 입력</Text>
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
                  </>
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
                        <View style={[styles.circle, { backgroundColor: '#8B3040' }]}>
                          <Text style={{ fontSize: fs(17) }}>🍽️</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{r.name}</Text>
                          <Text style={styles.meta}>{r.type}{r.distance ? ` · ${fmtDist(r.distance)}` : ''}</Text>
                          {!!r.loc && <Text style={[styles.meta, { color: C.warmGray }]} numberOfLines={1}>{r.loc}</Text>}
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
                            {/* 추천하기 ♥ */}
                            <TouchableOpacity onPress={() => handleToggleRec(r.kakaoId)} activeOpacity={0.7}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                                borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                                borderWidth: 0.5, borderColor: C.burgundy,
                                backgroundColor: liked ? C.burgundy : 'transparent',
                              }}>
                              <Text style={{ fontSize: fs(10), color: liked ? C.butter : C.burgundy }}>{liked ? '♥' : '♡'}</Text>
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
                ) : nearbyAll.length === 0 ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                      반경 3km 내 맛집/카페 정보를 찾지 못했어요.
                    </Text>
                  </View>
                ) : (
                  (showAllNearby ? nearbyAll : nearbyAll.slice(0, 5)).map((r, i) => {
                    const isCafe = r.kind === 'cafe';
                    const saved = savedFood.some(s => (r.kakaoId && s.kakaoId === r.kakaoId) || s.name === r.name);
                    return (
                      <View key={r.kakaoId || i}
                        style={[styles.card, { borderWidth: 0.5, borderColor: C.hairline, backgroundColor: '#fff', alignItems: 'flex-start' }]}>
                        <View style={[styles.circle, { backgroundColor: isCafe ? '#C8D9E6' : '#8B3040' }]}>
                          <Text style={{ fontSize: fs(17) }}>{isCafe ? '☕' : '🍽️'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 2 }}>
                            <View style={{ backgroundColor: isCafe ? '#C8D9E6' : '#F5E6A8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={[styles.badgeTxt, { color: isCafe ? C.navy : '#5A4A00' }]}>{isCafe ? '카페' : '식당'}</Text>
                            </View>
                          </View>
                          <Text style={styles.name}>{r.name}</Text>
                          <Text style={styles.meta}>{r.type}{r.distance ? ` · ${fmtDist(r.distance)}` : ''}</Text>
                          {!!r.loc && <Text style={[styles.meta, { color: C.warmGray }]} numberOfLines={1}>{r.loc}</Text>}
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
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
                          <TouchableOpacity onPress={() => openRestaurantPlace(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.burgundy }}>→</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
                {nearbyAll.length > 5 && (
                  <TouchableOpacity onPress={() => setShowAllNearby(v => !v)}
                    style={{ paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>
                      {showAllNearby ? '접기 ▴' : `더보기 (${nearbyAll.length - 5}) ▾`}
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
              </View>
            );
          })()}
          <View style={{ height: 32 }} />
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
      </SafeAreaView>
    );
  }

  const hasCourses = chipCourses.length > 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={{ backgroundColor: C.butter, paddingHorizontal: 20, paddingVertical: 7, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(61,57,53,0.72)', letterSpacing: 2, marginBottom: _and ? 2 : 4 }}>골퍼들의 코스 이야기</Text>
          <Text style={{
            fontFamily: F.sysSb,
            fontSize: fs(_and ? 24 : 28),
            color: C.charcoal,
          }}>코스</Text>
        </View>
        <TouchableOpacity onPress={() => setShowCourseLog(true)} activeOpacity={0.7}
          style={{ backgroundColor: 'transparent', borderRadius: 20, borderWidth: 1.5, borderColor: C.charcoal, paddingHorizontal: 16, paddingVertical: _and ? 4 : 7, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>내 코스 모아보기</Text>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal, marginLeft: 5 }}>›</Text>
        </TouchableOpacity>
      </View>
      <CourseExploreTab
        onSelectCourse={(id) => { setSelected(id); setInnerTab('course'); }}
        onOpenPreview={handleOpenPreview}
      />
      <CourseLogModal
        visible={showCourseLog}
        onClose={() => setShowCourseLog(false)}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}
