import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, TextInput, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserContext } from '../contexts/UserContext';

// TODO: 추후 카카오 로컬 API로 골프장 이미지 동적 가져오기 — 현재는 Unsplash 임시 매핑
const COURSE_IMAGES = {
  '1': 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800',
  '2': 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800',
  '3': 'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800',
  default: 'https://images.unsplash.com/photo-1592919505780-303950717480?w=800',
};
import { C, F } from '../constants/colors';
import {
  FAVORITES_INIT, SCHEDULES_INIT, COURSE_LOG, DIARY_DATA,
  RECOMMENDED_COURSES,
} from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getUserCourses, addUserCourse, deleteUserCourse } from '../utils/userCourses';
import { gS } from '../styles/gS';
import { CourseExploreTab } from './CourseExploreTab';
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { fetchCoursePlaceInfo, searchGolfCourses, searchNearbyRestaurants, searchNearbyCafes, searchNearbyGolfCourses, searchRestaurantsByKeyword } from '../utils/kakao';
import { buildFoodMapUrl, NAVER_MAP_HEADERS } from '../utils/naverMap';
import { getSavedRestaurants, addSavedRestaurant, removeSavedRestaurant, updateSavedRestaurant } from '../utils/savedRestaurants';
import { getFoodRecs, toggleFoodRec, seedRecCount } from '../utils/foodRecs';
import { RestaurantSaveModal } from './RestaurantSaveModal';

export function GuideScreen({ route, navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [selected, setSelected] = useState(null);
  const [innerTab, setInnerTab] = useState('course');
  const [favorites, setFavorites] = useState(FAVORITES_INIT);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [userCoursesList, setUserCoursesList] = useState([]);
  const [userCoursesHydrated, setUserCoursesHydrated] = useState(false);
  const [comments, setComments] = useState([]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('전체');
  // 코스 상세에서 날씨/교통 팝업
  const [showCoursePopup, setShowCoursePopup] = useState(false);
  const [coursePopupTab, setCoursePopupTab] = useState('wx');
  const [coursePopupSched, setCoursePopupSched] = useState(null);
  // 상세화면 코스 정보 (phone) + 갤러리
  const [coursePhone, setCoursePhone] = useState('');
  const [courseAddress, setCourseAddress] = useState('');
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
  const scrollRefs = useRef({});

  const REGIONS = ['전체', '수도권', '충청', '강원', '전라', '경상', '제주'];
  const getRegion = (loc) => {
    if (!loc) return null;
    const first = loc.split(' ')[0];
    if (['서울', '인천', '경기'].includes(first)) return '수도권';
    if (['충북', '충남', '대전', '세종'].includes(first)) return '충청';
    if (first === '강원') return '강원';
    if (['경북', '경남', '대구', '부산', '울산'].includes(first)) return '경상';
    if (['전북', '전남', '광주'].includes(first)) return '전라';
    if (first === '제주') return '제주';
    return null;
  };

  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('tabPress', () => {
      setSelected(null);
      setPreviewCourse(null);
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

  // userCourses (사용자가 카카오 검색으로 추가한 코스) 로드 — COURSE_LOG에 없는 코스 상세 표시용
  const refreshUserCourses = React.useCallback(async () => {
    const list = await getUserCourses();
    setUserCoursesList(list || []);
    setUserCoursesHydrated(true);
  }, []);

  useEffect(() => { refreshUserCourses(); }, [refreshUserCourses]);

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

  // 코스 상세에서 날씨/교통 팝업 열기 — 오늘 라운딩 가상 일정으로 fetch
  const openCourseInfo = (course, tab) => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
    const day = ['일','월','화','수','목','금','토'][today.getDay()];
    setCoursePopupSched({
      course: course.name,
      courseLogId: course._source !== 'user' ? course.id : undefined,
      courseId: course._source === 'user' ? course.id : undefined,
      // 코스 상세에서 이미 확보한 골프장 좌표를 직접 전달 — 날씨/교통이 해당 구장 기준으로 동작
      courseX: courseCoord?.x ?? (Number.isFinite(course.x) ? course.x : undefined),
      courseY: courseCoord?.y ?? (Number.isFinite(course.y) ? course.y : undefined),
      courseLoc: courseAddress || course.loc || '',
      date: dateStr, day, time: '07:00', members: 4, dDay: 0,
      weather: '맑음 20°', wind: '', duration: '',
    });
    setCoursePopupTab(tab);
    setShowCoursePopup(true);
  };

  // 상세 화면에서 코스 저장/해제 토글 (이름 매칭 — COURSE_LOG/userCourses 양쪽 동작)
  const handleToggleSaveDetail = async (course) => {
    if (!course?.name) return;
    const found = userCoursesList.find(uc => uc.name === course.name);
    if (found) {
      await deleteUserCourse(found.id);
    } else {
      await addUserCourse({
        name: course.name, loc: course.loc,
        x: course.x ?? null, y: course.y ?? null,
        kakaoId: course.kakaoId || null,
      });
    }
    refreshUserCourses();
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
      (async () => {
        await refreshUserCourses();
        setSelected(id);
        setInnerTab(tab === 'food' ? 'food' : 'course');
      })();
    }
  }, [route?.params?.openCourseId, refreshUserCourses]);

  useEffect(() => {
    if (route?.params?.openComment) {
      setShowCommentInput(true);
      navigation.setParams({ openComment: undefined });
    }
  }, [route?.params?.openComment]);

  // selected 변경 시 카카오 place 정보(전화번호 + 주소) fetch
  useEffect(() => {
    if (!selected) { setCoursePhone(''); setCourseAddress(''); return; }
    const data = getCourseData(selected);
    if (!data?.name) return;
    setCoursePhone(''); setCourseAddress('');
    let cancelled = false;
    (async () => {
      const info = await fetchCoursePlaceInfo(data.name);
      if (cancelled || !info) return;
      if (info.phone) setCoursePhone(info.phone);
      if (info.address) setCourseAddress(info.address);
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
      // 미저장 미리보기 — 코멘트 빈 배열로 시작
      setComments([]);
      setShowCommentInput(false);
      setCommentInput('');
      return;
    }
    const inLog = COURSE_LOG.find(x => x.id === selected);
    const inUser = userCoursesList.find(x => x.id === selected);
    if (!inLog && !inUser) {
      // 로드 완료 후에도 못 찾으면 정리 (그 전엔 race 가능성으로 유지)
      if (userCoursesHydrated) setSelected(null);
      return;
    }
    // 코멘트는 COURSE_LOG 코스에만 (mock)
    setComments(inLog ? [
      { id: '1', txt: '그린이 정말 빠릅니다. 퍼팅 연습 충분히 하고 가세요', who: 'J***', date: '2025.04', likes: 24, likedByMe: false },
      { id: '2', txt: '7번홀 왼쪽 OB 많이 납니다. 아이언 공략 추천', who: 'K***', date: '2025.03', likes: 18, likedByMe: false },
      { id: '3', txt: '클럽하우스 식당 된장찌개 강추. 라운딩 후 꼭 드세요', who: 'P***', date: '2025.02', likes: 11, likedByMe: false },
    ] : []);
    setShowCommentInput(false);
    setCommentInput('');
  }, [selected, userCoursesList, userCoursesHydrated]);

  const toggleLike = (id) => {
    setComments(prev => prev.map(c => c.id === id
      ? { ...c, likedByMe: !c.likedByMe, likes: c.likes + (c.likedByMe ? -1 : 1) }
      : c));
  };

  const anonymize = (name = '') => {
    if (!name) return '익***';
    return name.charAt(0) + '***';
  };

  const submitComment = () => {
    const txt = commentInput.trim();
    if (!txt) return;
    const anon = anonymize(userProfile?.nickname);
    const now = new Date();
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;
    setComments(prev => [
      { id: String(Date.now()), txt, who: anon, date: dateStr, likes: 0, likedByMe: false },
      ...prev,
    ]);
    setCommentInput('');
    setShowCommentInput(false);
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

  if (selected) {
    const c = getCourseData(selected);
    if (!c) {
      // userCoursesList 로딩 race — 헤더+스피너로 placeholder
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
          <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
            <TouchableOpacity onPress={() => { setSelected(null); setPreviewCourse(null); setInnerTab('course'); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 22, color: C.warmGray }}>←</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={C.burgundy} />
          </View>
        </SafeAreaView>
      );
    }
    const isUserCourse = c._source === 'user';
    const guideTabIdx = innerTab === 'course' ? 0 : 1;
    // 내 코스기록 — 코스명으로 DIARY_DATA 매칭
    const myDiaries = DIARY_DATA.filter(d => d.course === c.name);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
        <View style={[gS.detailHdr, { paddingTop: 14, paddingBottom: 16 }]}>
          <TouchableOpacity onPress={() => { setSelected(null); setPreviewCourse(null); setInnerTab('course'); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 22, color: C.warmGray }}>←</Text>
          </TouchableOpacity>
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, color: C.charcoal }}
                numberOfLines={1}>{c.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 4 }} numberOfLines={1}>
                {courseAddress || c.loc}
              </Text>
            </View>
            {(() => {
              const saved = userCoursesList.some(uc => uc.name === c.name);
              return (
                <TouchableOpacity onPress={() => handleToggleSaveDetail(c)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  style={{
                    borderWidth: 1, borderColor: C.burgundy, borderBottomWidth: 3,
                    borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6,
                    backgroundColor: saved ? C.burgundy : 'transparent',
                  }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: '700', color: saved ? C.butter : C.burgundy }}>
                    {saved ? '저장됨' : '저장'}
                  </Text>
                </TouchableOpacity>
              );
            })()}
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: C.warmGrayLight }} />

        <View style={{ backgroundColor: C.bgPrimary }}>
          <View style={{ flexDirection: 'row' }}>
            {[
              ['course', '코스 & 코멘트', '#1A4060'],
              ['food',   '맛집 & 주변',  C.burgundy],
            ].map(([k, l, accent]) => {
              const on = innerTab === k;
              return (
                <TouchableOpacity key={k}
                  style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
                  onPress={() => setInnerTab(k)}>
                  <Text style={{
                    fontFamily: F.sys,
                    fontSize: 14,
                    color: on ? accent : C.warmGrayLight,
                    fontWeight: on ? '700' : '400',
                  }}>{l}</Text>
                  {on && (
                    <View style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0,
                      height: 3,
                      backgroundColor: accent,
                    }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView ref={r => { scrollRefs.current.detail = r; }} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {innerTab === 'course' && (
            <>
            <View style={{ height: 200, position: 'relative', justifyContent: 'flex-end' }}>
              {/* TODO: 카카오 로컬 API 사진으로 교체 예정 */}
              <Image
                source={{ uri: COURSE_IMAGES[selected] || COURSE_IMAGES.default }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
                resizeMode="cover"
              />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
              <View style={{ padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {(c.tags || []).map((t, i) => (
                    <View key={i} style={[
                      { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
                      i === 0 && { backgroundColor: 'rgba(245,230,168,0.92)' },
                      i === 1 && { backgroundColor: 'rgba(200,217,230,0.92)' },
                      i === 2 && { backgroundColor: 'rgba(107,30,42,0.9)' },
                    ]}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: i === 2 ? '#FAF6EC' : i === 0 ? '#5A4A00' : '#1A4060' }}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={{ padding: 16 }}>
              {/* COURSE INFO — 홀수 · 파 · 타입 · 전화번호(탭 → 전화) */}
              <Text style={[gS.secLabel, { marginBottom: 6 }]}>COURSE INFO</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary }}>
                  18홀 · Par 72 · 회원제
                </Text>
                {coursePhone ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${coursePhone.replace(/[^0-9]/g, '')}`)}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, fontWeight: '600' }}>
                      {'  ·  '}📞 {coursePhone}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* 날씨 / 교통 — 챠콜 버튼 (아래 3버튼과 동일 사이즈, 하단 테두리 입체감) */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
                <TouchableOpacity onPress={() => openCourseInfo(c, 'wx')} activeOpacity={0.8}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: C.charcoal, borderBottomWidth: 4, borderBottomColor: C.charcoalDeep,
                  }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: '600', color: C.butter }}>날씨</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openCourseInfo(c, 'tr')} activeOpacity={0.8}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: C.charcoal, borderBottomWidth: 4, borderBottomColor: C.charcoalDeep,
                  }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: '600', color: C.butter }}>교통</Text>
                </TouchableOpacity>
              </View>

              {/* 예약 / 정보 버튼 3개 — 카카오골프 / 네이버정보 / 네이버지도 */}
              {(() => {
                const btnBase = { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 4 };
                const txt = { fontFamily: F.sys, fontSize: 13, fontWeight: '600' };
                return (
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 18 }}>
                    <TouchableOpacity style={[btnBase, { backgroundColor: C.burgundy, borderBottomColor: '#4A1420' }]}
                      onPress={() => Linking.openURL(`https://golf.kakao.com/search?query=${encodeURIComponent(c.name)}`)}>
                      <Text style={[txt, { color: '#FEE500' }]}>카카오골프</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[btnBase, { backgroundColor: '#03C75A', borderBottomColor: '#02934A' }]}
                      onPress={() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`)}>
                      <Text style={[txt, { color: '#fff' }]}>네이버정보</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[btnBase, { backgroundColor: '#8B8680', borderBottomColor: '#615D58' }]}
                      onPress={() => Linking.openURL(`nmap://search?query=${encodeURIComponent(c.name)}`)
                        .catch(() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`))}>
                      <Text style={[txt, { color: '#fff' }]}>네이버지도</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* 코스 한마디 — 왼쪽 버건디 세로바 + 이탤릭 */}
              <Text style={[gS.secLabel, { marginTop: 4 }]}>코스 한마디</Text>
              {(() => {
                // 최근 라운딩 (날짜 내림차순) 첫 번째의 memo
                const latestDiary = [...myDiaries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
                const memo = latestDiary?.memo;
                return (
                  <View style={{
                    backgroundColor: '#fff',
                    borderLeftWidth: 4, borderLeftColor: C.burgundy,
                    borderRadius: 10,
                    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, fontStyle: 'italic', color: '#3D3935', lineHeight: 21 }}>
                      {memo || '처음 방문하는 코스예요. 라운딩 후 한마디를 남겨보세요 ✏️'}
                    </Text>
                    {memo && latestDiary?.date ? (
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGray, marginTop: 6 }}>
                        {latestDiary.date} 라운딩
                      </Text>
                    ) : null}
                  </View>
                );
              })()}

              {/* 내 코스기록 — 이 코스 다이어리 엔트리 */}
              {myDiaries.length > 0 && (
                <>
                  <Text style={[gS.secLabel, { marginBottom: 8 }]}>내 코스기록 · {myDiaries.length}회</Text>
                  {myDiaries.map(d => {
                    const diff = d.score - d.par;
                    const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
                    return (
                      <View key={d.id} style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: '#E8E2D0', padding: 12, marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray }}>{d.date} {d.day}</Text>
                          <Text style={{ fontFamily: F.en, fontSize: 20, color: C.charcoal, fontWeight: '600' }}>{d.score}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>타 · {diffLabel}</Text>
                          {d.special && (
                            <View style={{ backgroundColor: d.special === 'HOLE IN ONE' ? '#2A2622' : '#6B1E2A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontFamily: F.sys, fontSize: 9, color: d.special === 'HOLE IN ONE' ? '#C9A84C' : '#F5E6A8', fontWeight: '600' }}>{d.special}</Text>
                            </View>
                          )}
                        </View>
                        {d.memo ? (
                          <Text style={{ fontFamily: F.en, fontSize: 12, color: C.textSecondary, fontStyle: 'italic', marginTop: 6, lineHeight: 17 }}>"{d.memo}"</Text>
                        ) : null}
                        {d.photos?.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                            {d.photos.slice(0, 4).map((p, i) => (
                              <Image key={i} source={{ uri: p }} style={{ width: 76, height: 76, borderRadius: 6, marginRight: 6 }} />
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    );
                  })}
                  <View style={{ height: 12 }} />
                </>
              )}

              {/* 코스 한마디·내 기록 ↔ 골퍼 코멘트 구분선 */}
              <View style={{ height: 1, backgroundColor: C.hairline, marginTop: 4, marginBottom: 18 }} />

              {/* 골퍼 코멘트 헤더 — 모든 코스 */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={gS.secLabel}>골퍼 코멘트 · 좋아요 순</Text>
                <TouchableOpacity
                  onPress={() => setShowCommentInput(v => !v)}
                  style={{ borderWidth: 0.5, borderColor: C.burgundy, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>+ 코멘트</Text>
                </TouchableOpacity>
              </View>

              {/* 코멘트 입력 */}
              {showCommentInput && (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline, padding: 12, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>
                        {anonymize(userProfile?.nickname)} · 전체공개
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>{commentInput.length}/200</Text>
                    </View>
                    <TextInput
                      value={commentInput}
                      onChangeText={(t) => { if (t.length <= 200) setCommentInput(t); }}
                      placeholder="코스에 대한 한마디를 남겨주세요"
                      placeholderTextColor={C.warmGrayLight}
                      multiline
                      style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, minHeight: 60, textAlignVertical: 'top' }}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, gap: 8 }}>
                      <TouchableOpacity onPress={() => { setShowCommentInput(false); setCommentInput(''); }}>
                        <View style={{ paddingHorizontal: 14, paddingVertical: 7 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight }}>취소</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={submitComment}
                        disabled={!commentInput.trim()}
                        style={{ backgroundColor: commentInput.trim() ? C.burgundy : C.hairline, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 12, color: commentInput.trim() ? C.butter : C.warmGrayLight, fontWeight: '600' }}>등록</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              )}

              {/* 코멘트 리스트 (좋아요순) */}
              {[...comments].sort((a, b) => b.likes - a.likes).map((cm) => (
                <View key={cm.id} style={gS.commentCard}>
                  <Text style={gS.commentTxt}>"{cm.txt}"</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={gS.commentWho}>{cm.who} · {cm.date}</Text>
                    <TouchableOpacity
                      onPress={() => toggleLike(cm.id)}
                      activeOpacity={0.6}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: cm.likedByMe ? C.burgundy : C.burgundy + '60', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.burgundy }}>{cm.likedByMe ? '♥' : '♡'} {cm.likes}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* 주변 골프장 — 카카오 로컬 반경 10km */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 }}>
                <Text style={gS.secLabel}>주변 골프장 · 반경 10km</Text>
                {nearbyGolf.length > 3 && (
                  <TouchableOpacity onPress={() => setShowAllGolf(v => !v)}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>
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
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>
                    반경 10km 내 다른 골프장을 찾지 못했어요.
                  </Text>
                </View>
              ) : (
                (showAllGolf ? nearbyGolf : nearbyGolf.slice(0, 3)).map((g, i) => (
                  <TouchableOpacity key={g.kakaoId || i}
                    onPress={() => handleOpenPreview(g)}
                    activeOpacity={0.85}
                    style={gS.nearbyCard}>
                    <View style={gS.nearbyIconWrap}><Text style={{ fontSize: 16 }}>⛳</Text></View>
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

            const fmtDist = (m) => (!m ? '' : m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);

            const styles = {
              card: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6 },
              circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
              circleTxt: { fontFamily: F.sys, fontSize: 14, fontWeight: '600' },
              badge: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 3 },
              badgeTxt: { fontFamily: F.sys, fontSize: 9, fontWeight: '600' },
              name: { fontFamily: F.sys, fontSize: 13, color: '#2A2622', fontWeight: '600' },
              meta: { fontFamily: F.sys, fontSize: 10, color: C.warmGray, marginTop: 1 },
              memo: { fontFamily: F.sys, fontSize: 10, color: '#5A4A00', fontStyle: 'italic', marginTop: 4 },
              ratingBox: { backgroundColor: '#F5E6A8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
              ratingTxt: { fontFamily: F.sys, fontSize: 10, color: '#5A4A00', fontWeight: '600' },
              reviewsTxt: { fontFamily: F.sys, fontSize: 9, color: C.warmGray },
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
            const openNaverPlaces = () => openNaverPlace(c.name + ' 맛집');

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
                        : <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight }}>지도를 불러올 수 없습니다</Text>}
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
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.charcoal }}>⛳ 골프장</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.charcoal }}>🟠 추천 맛집</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.charcoal }}>🟡 저장 맛집</Text>
                  </View>
                  {/* 우하단 네이버 지도 앱 열기 — 해당 골프장 위치 기준 */}
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`nmap://search?query=${encodeURIComponent(c.name)}`)
                      .catch(() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`))}
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      backgroundColor: '#03C75A', borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 6,
                    }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff', fontWeight: '600' }}>네이버지도 →</Text>
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
                    <Text style={{ fontSize: 13, marginRight: 6 }}>🔍</Text>
                    <TextInput
                      value={foodSearch}
                      onChangeText={setFoodSearch}
                      placeholder="맛집 검색 또는 직접 추가"
                      placeholderTextColor={C.warmGrayLight}
                      style={{ flex: 1, fontFamily: F.sys, fontSize: 13, color: C.charcoal, paddingVertical: 9 }}
                    />
                    {foodSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setFoodSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ color: C.warmGrayLight, fontSize: 13 }}>✕</Text>
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
                    <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: '600', color: foodSearch.trim() ? C.butter : C.warmGrayLight }}>+ 추가</Text>
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
                        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>
                          검색 결과가 없어요. <Text style={{ color: C.burgundy }}>"{foodSearch.trim()}" 직접 추가 →</Text>
                        </Text>
                      </TouchableOpacity>
                    ) : foodSearchResults.map((r, i) => (
                      <TouchableOpacity key={r.kakaoId || i} onPress={() => openSaveModal(r)} activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 11, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.hairline }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.charcoal, fontWeight: '600' }}>{r.name}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }} numberOfLines={1}>
                            {r.type}{r.loc ? ` · ${r.loc}` : ''}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy, fontWeight: '600' }}>+ 저장</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* ① 내가 저장한 맛집 — 골프장별 저장 목록 (없으면 섹션 숨김) */}
                {savedFood.length > 0 && (
                  <>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, letterSpacing: 0, marginTop: 18, marginBottom: 8 }}>
                      내가 저장한 맛집 · {savedFood.length}
                    </Text>
                    {savedFood.map(r => (
                      <TouchableOpacity key={r.id}
                        onPress={() => openNaverPlace(r.name)}
                        activeOpacity={0.85}
                        style={[styles.card, { borderWidth: 1, borderColor: '#C9A84C55', backgroundColor: '#FFFDF5', alignItems: 'flex-start' }]}>
                        <View style={[styles.circle, { backgroundColor: '#F5E6A8' }]}>
                          <Text style={{ fontSize: 17, color: C.burgundy }}>★</Text>
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
                              <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#5A4A00', fontStyle: 'italic', lineHeight: 16 }}>
                                "{r.memo}"  <Text style={{ fontSize: 9, fontStyle: 'normal', color: C.warmGrayLight }}>✏️ 수정</Text>
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={() => openSaveModal({ ...r })} activeOpacity={0.7}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              style={{ alignSelf: 'flex-start', marginTop: 5 }}>
                              <Text style={{ fontFamily: F.sys, fontSize: 10, fontWeight: '600', color: C.burgundy }}>✏️ 메모 입력</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
                          <TouchableOpacity onPress={() => handleRemoveSaved(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight }}>삭제</Text>
                          </TouchableOpacity>
                          <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>→</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {/* ② 골퍼 추천 맛집 — 카카오 로컬 반경 3km 음식점 */}
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, letterSpacing: 0, marginTop: 18, marginBottom: 8 }}>골퍼 추천 맛집 · 추천순</Text>
                {nearbyFoodLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator color={C.burgundy} />
                  </View>
                ) : nearbyFood.length === 0 ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, lineHeight: 17 }}>
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
                          <Text style={{ fontSize: 17 }}>🍽️</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.name}>{r.name}</Text>
                          <Text style={styles.meta}>{r.type}{r.distance ? ` · ${fmtDist(r.distance)}` : ''}</Text>
                          {!!r.loc && <Text style={[styles.meta, { color: C.warmGrayLight }]} numberOfLines={1}>{r.loc}</Text>}
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
                            {/* 추천하기 ♥ */}
                            <TouchableOpacity onPress={() => handleToggleRec(r.kakaoId)} activeOpacity={0.7}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 3,
                                borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                                borderWidth: 0.5, borderColor: C.burgundy,
                                backgroundColor: liked ? C.burgundy : 'transparent',
                              }}>
                              <Text style={{ fontSize: 10, color: liked ? C.butter : C.burgundy }}>{liked ? '♥' : '♡'}</Text>
                              <Text style={{ fontFamily: F.sys, fontSize: 10, fontWeight: '600', color: liked ? C.butter : C.burgundy }}>{recCount}</Text>
                            </TouchableOpacity>
                            {/* 저장 — 추천 ♥와 분리된 별도 + 저장 버튼 */}
                            <TouchableOpacity onPress={() => !saved && openSaveModal(r)} activeOpacity={0.7} disabled={saved}
                              style={{
                                borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                                borderWidth: 0.5, borderColor: saved ? C.hairline : '#C9A84C',
                                backgroundColor: saved ? C.hairline : '#FFFDF5',
                              }}>
                              <Text style={{ fontFamily: F.sys, fontSize: 10, fontWeight: '600', color: saved ? C.warmGrayLight : '#5A4A00' }}>
                                {saved ? '저장됨' : '+ 저장'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => openNaverPlace(r.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>→</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
                {nearbyFood.length > 3 && (
                  <TouchableOpacity onPress={() => setShowAllRest(v => !v)}
                    style={{ paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, fontWeight: '600' }}>
                      {showAllRest ? '접기 ▴' : `더보기 (${nearbyFood.length - 3}) ▾`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ③ 가까운 맛집/카페 — 카카오 로컬 반경 3km (음식점 + 카페 거리순) */}
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, letterSpacing: 0, marginTop: 18, marginBottom: 8 }}>가까운 맛집/카페</Text>
                {nearbyFoodLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <ActivityIndicator color={C.burgundy} />
                  </View>
                ) : nearbyAll.length === 0 ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 14 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, lineHeight: 17 }}>
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
                          <Text style={{ fontSize: 17 }}>{isCafe ? '☕' : '🍽️'}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 2 }}>
                            <View style={{ backgroundColor: isCafe ? '#C8D9E6' : '#F5E6A8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={[styles.badgeTxt, { color: isCafe ? '#1A4060' : '#5A4A00' }]}>{isCafe ? '카페' : '식당'}</Text>
                            </View>
                          </View>
                          <Text style={styles.name}>{r.name}</Text>
                          <Text style={styles.meta}>{r.type}{r.distance ? ` · ${fmtDist(r.distance)}` : ''}</Text>
                          {!!r.loc && <Text style={[styles.meta, { color: C.warmGrayLight }]} numberOfLines={1}>{r.loc}</Text>}
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
                          <TouchableOpacity onPress={() => !saved && openSaveModal(r)} activeOpacity={0.7} disabled={saved}
                            style={{
                              borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4,
                              borderWidth: 0.5, borderColor: saved ? C.hairline : '#C9A84C',
                              backgroundColor: saved ? C.hairline : '#FFFDF5',
                            }}>
                            <Text style={{ fontFamily: F.sys, fontSize: 10, fontWeight: '600', color: saved ? C.warmGrayLight : '#5A4A00' }}>
                              {saved ? '저장됨' : '+ 저장'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => openNaverPlace(r.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>→</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
                {nearbyAll.length > 5 && (
                  <TouchableOpacity onPress={() => setShowAllNearby(v => !v)}
                    style={{ paddingVertical: 9, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, fontWeight: '600' }}>
                      {showAllNearby ? '접기 ▴' : `더보기 (${nearbyAll.length - 5}) ▾`}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 네이버 지도에서 맛집 더 찾기 — 맨 아래 한 곳 */}
                <TouchableOpacity onPress={openNaverPlaces} activeOpacity={0.85}
                  style={{
                    marginTop: 14, borderRadius: 10, backgroundColor: '#03C75A',
                    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 12, color: '#fff', fontWeight: '600' }}>네이버 지도에서 맛집 더보기 →</Text>
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
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 10, color: 'rgba(26,61,82,0.6)', letterSpacing: 2, marginBottom: 4 }}>나만의 골프 캐디</Text>
        <Text style={{
          fontFamily: 'Georgia',
          fontStyle: 'italic',
          fontSize: 28,
          color: '#1A3D52',
        }}>Golf 코스</Text>
      </View>
      <CourseExploreTab
        onSelectCourse={(id) => { setSelected(id); setInnerTab('course'); }}
        onOpenPreview={handleOpenPreview}
      />
    </SafeAreaView>
  );
}
