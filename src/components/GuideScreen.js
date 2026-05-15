import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, TextInput, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
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
  MY_RESTAURANTS, RECOMMENDED_COURSES,
} from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { getUserCourses, addUserCourse, deleteUserCourse } from '../utils/userCourses';
import { gS } from '../styles/gS';
import { CourseLogTab } from './CourseLogTab';
import { CourseExploreTab } from './CourseExploreTab';
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { KAKAO_JS_KEY, UNSPLASH_ACCESS_KEY } from '../constants/api';
import { fetchCoursePlaceInfo } from '../utils/kakao';

export function GuideScreen({ route, navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [selected, setSelected] = useState(null);
  const [innerTab, setInnerTab] = useState('course');
  const [favorites, setFavorites] = useState(FAVORITES_INIT);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [userCoursesList, setUserCoursesList] = useState([]);
  const [userCoursesHydrated, setUserCoursesHydrated] = useState(false);
  const [showAllRest, setShowAllRest] = useState(false);
  const [showAllCafe, setShowAllCafe] = useState(false);
  const [comments, setComments] = useState([]);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [topTab, setTopTab] = useState('explore');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('전체');
  // 코스 상세에서 날씨/교통 팝업
  const [showCoursePopup, setShowCoursePopup] = useState(false);
  const [coursePopupTab, setCoursePopupTab] = useState('wx');
  const [coursePopupSched, setCoursePopupSched] = useState(null);
  // 상세화면 코스 정보 (phone) + 갤러리
  const [coursePhone, setCoursePhone] = useState('');
  const [coursePhotos, setCoursePhotos] = useState([]);
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
      setTopTab('explore');
      setShowAllRest(false);
      setShowAllCafe(false);
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
      setSelected(route.params.openCourseId);
      setInnerTab('course');
      navigation.setParams({ openCourseId: undefined });
    }
  }, [route?.params?.openCourseId]);

  useEffect(() => {
    if (route?.params?.openComment) {
      setShowCommentInput(true);
      navigation.setParams({ openComment: undefined });
    }
  }, [route?.params?.openComment]);

  // selected 변경 시 phone + 갤러리 사진 fetch
  useEffect(() => {
    if (!selected) { setCoursePhone(''); setCoursePhotos([]); return; }
    const data = getCourseData(selected);
    if (!data?.name) return;
    setCoursePhone(''); setCoursePhotos([]);
    let cancelled = false;
    (async () => {
      // 1) 카카오 place 정보 (phone)
      const info = await fetchCoursePlaceInfo(data.name);
      if (!cancelled && info?.phone) setCoursePhone(info.phone);
      // 2) Unsplash 골프장 이미지 (이름 키워드)
      try {
        const q = encodeURIComponent(data.name + ' golf course');
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${q}&per_page=8&orientation=landscape&content_filter=high&client_id=${UNSPLASH_ACCESS_KEY}`,
        );
        if (res.ok) {
          const j = await res.json();
          const urls = (j?.results || []).map(p => p.urls?.regular).filter(Boolean).slice(0, 6);
          if (!cancelled && urls.length) setCoursePhotos(urls);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [selected, userCoursesList]);

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
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, color: C.charcoal, flexShrink: 1 }}
              numberOfLines={1}>{c.name}</Text>
            {(() => {
              const saved = userCoursesList.some(uc => uc.name === c.name);
              return (
                <TouchableOpacity onPress={() => handleToggleSaveDetail(c)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 20 }}>{saved ? '❤️' : '🤍'}</Text>
                </TouchableOpacity>
              );
            })()}
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 4 }}>{c.loc} · 18홀 · Par 72</Text>
        </View>

        <View style={{ height: 1, backgroundColor: C.warmGrayLight }} />

        <View style={{ backgroundColor: C.bgPrimary }}>
          <View style={{ flexDirection: 'row' }}>
            {[
              ['course', '코스 & 코멘트', C.paleSky,  '#1A4060', C.paleSky],
              ['food',   '맛집 & 주변',  C.burgundy, '#fff',    C.burgundy],
            ].map(([k, l, fullBg, fullFg, underColor]) => {
              const on = innerTab === k;
              return (
                <TouchableOpacity key={k}
                  style={{
                    flex: 1, paddingVertical: 12, alignItems: 'center',
                    backgroundColor: on ? fullBg : 'transparent',
                  }}
                  onPress={() => setInnerTab(k)}>
                  <Text style={{
                    fontFamily: F.sys,
                    fontSize: 13,
                    color: on ? fullFg : C.warmGrayLight,
                    fontWeight: on ? '700' : '400',
                  }}>{l}</Text>
                  {!on && (
                    <View style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0,
                      height: 2,
                      backgroundColor: underColor,
                      opacity: 0.35,
                    }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <ScrollView ref={r => { scrollRefs.current.detail = r; }} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
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
              {/* 5개 버튼 한 줄 — 동일 사이즈, 날씨/교통은 이모티콘만, 나머지는 텍스트만 */}
              {(() => {
                const btnBase = {
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                };
                const txt = { fontFamily: F.sys, fontSize: 11, fontWeight: '600' };
                return (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 18 }}>
                    <TouchableOpacity style={[btnBase, { backgroundColor: '#C8D9E6' }]}
                      onPress={() => openCourseInfo(c, 'wx')}>
                      <Text style={{ fontSize: 18 }}>🌤</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[btnBase, { backgroundColor: '#F5E6A8' }]}
                      onPress={() => openCourseInfo(c, 'tr')}>
                      <Text style={{ fontSize: 18 }}>🚗</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[btnBase, { backgroundColor: '#3A1C00' }]}
                      onPress={() => Linking.openURL(`https://golf.kakao.com/search?query=${encodeURIComponent(c.name)}`)}>
                      <Text style={[txt, { color: '#FEE500' }]}>카카오골프</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[btnBase, { backgroundColor: '#03C75A' }]}
                      onPress={() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`)}>
                      <Text style={[txt, { color: '#fff' }]}>네이버정보</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[btnBase, { backgroundColor: '#8B8680' }]}
                      onPress={() => Linking.openURL(`nmap://search?query=${encodeURIComponent(c.name)}`)
                        .catch(() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`))}>
                      <Text style={[txt, { color: '#fff' }]}>네이버지도</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* 코스 정보 카드 — 전화번호만, 탭 → 전화 연결 */}
              <View style={{
                backgroundColor: '#fff', borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline,
                paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>📞</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray }}>전화번호</Text>
                </View>
                {coursePhone ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${coursePhone.replace(/[^0-9]/g, '')}`)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy, fontWeight: '600' }}>
                      {coursePhone}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight }}>—</Text>
                )}
              </View>

              {/* 사진 갤러리 — 가로 스크롤 */}
              {coursePhotos.length > 0 && (
                <View style={{ marginBottom: 18 }}>
                  <Text style={[gS.secLabel, { marginBottom: 8 }]}>사진</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}>
                    {coursePhotos.map((u, i) => (
                      <Image key={i} source={{ uri: u }}
                        style={{ width: 160, height: 110, borderRadius: 10 }} resizeMode="cover" />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* 코스 한마디 — 최근 라운딩 한줄메모 기준 */}
              <Text style={[gS.secLabel, { marginTop: 4 }]}>코스 한마디</Text>
              {(() => {
                // 최근 라운딩 (날짜 내림차순) 첫 번째의 memo
                const latestDiary = [...myDiaries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
                const memo = latestDiary?.memo;
                if (memo) {
                  return (
                    <View style={{
                      backgroundColor: '#fff', borderWidth: 1, borderColor: '#C9A84C',
                      borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
                    }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#3D3935', lineHeight: 20 }}>{memo}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGray, marginTop: 6 }}>
                        {latestDiary.date} 라운딩
                      </Text>
                    </View>
                  );
                }
                return (
                  <View style={{
                    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E8E2D0',
                    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 16,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#2A2622', lineHeight: 20 }}>
                      처음 방문하는 코스예요. 라운딩 후 한마디를 남겨보세요 ✏️
                    </Text>
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
            </View>
            </>
          )}
          {innerTab === 'food' && (() => {
            const openKakaoMap = (name) => Linking.openURL(`kakaomap://search?q=${encodeURIComponent(name)}`)
              .catch(() => Linking.openURL(`https://map.kakao.com/link/search/${encodeURIComponent(name)}`));

            const RECOMMEND_FOOD = [
              { id: 'r1', name: '미락 숯불갈비',     type: '갈비',       dist: '1.2km', rating: '4.8', reviews: 124, initial: '갈' },
              { id: 'r2', name: '순두부마을',        type: '순두부찌개', dist: '800m',  rating: '4.5', reviews: 89,  initial: '한' },
              { id: 'r3', name: '장작구이 참숯갈비', type: '갈비',       dist: '2.1km', rating: '4.6', reviews: 67,  initial: '갈' },
              { id: 'r4', name: '황태해장국',        type: '해장국',     dist: '1.5km', rating: '4.3', reviews: 45,  initial: '한' },
              { id: 'r5', name: '청국장마을',        type: '청국장',     dist: '3.2km', rating: '4.4', reviews: 38,  initial: '한' },
            ];
            const NEARBY_CAFE = [
              { id: 'c1', name: '카페 드롭탑',   type: '카페', dist: '1.0km', rating: '4.4', reviews: 52, initial: '카' },
              { id: 'c2', name: '투썸플레이스', type: '카페', dist: '1.8km', rating: '4.2', reviews: 38, initial: '카' },
              { id: 'c3', name: '메가커피',     type: '카페', dist: '2.3km', rating: '4.1', reviews: 29, initial: '카' },
            ];

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

            return (
              <View>
                {/* 카카오맵 JS SDK 임베드 — 골프장 중심 + 주변 맛집 마커 */}
                <View style={{ height: 320, position: 'relative' }}>
                  {(() => {
                    const safeName = (c.name || '').replace(/'/g, "\\'");
                    const safeLoc = (c.loc || '').replace(/'/g, "\\'");
                    const initX = Number.isFinite(c.x) ? c.x : 'null';
                    const initY = Number.isFinite(c.y) ? c.y : 'null';
                    const savedNames = JSON.stringify(MY_RESTAURANTS.map(r => r.name));
                    const recNames = JSON.stringify(RECOMMEND_FOOD.map(r => r.name));
                    const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;}
  .lbl{
    border-radius:6px;
    padding:2px 7px;
    font-size:10px;
    font-weight:600;
    white-space:nowrap;
    box-shadow:0 1px 2px rgba(0,0,0,0.15);
    transform:translate(-50%, 6px);
    font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;
    border:1px solid rgba(0,0,0,0.08);
  }
  .lbl-course{ background:#6B1E2A; color:#F5E6A8; border:none; font-size:11px; }
  .lbl-saved{ background:#F5E6A8; color:#5A4500; }
  .lbl-rec  { background:#C8D9E6; color:#1A4060; }
</style>
<script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&libraries=services&autoload=false"></script>
</head><body><div id="map"></div>
<script>
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
kakao.maps.load(function(){
  var initX = ${initX}, initY = ${initY};
  var name = '${safeName}', loc = '${safeLoc}';
  var savedNames = ${savedNames};
  var recNames   = ${recNames};

  function placeOne(map, center, ps, q, klass, prefix){
    ps.keywordSearch(q, function(data, status){
      if(status !== kakao.maps.services.Status.OK || !data[0]) return;
      var p = data[0];
      var pos = new kakao.maps.LatLng(p.y, p.x);
      new kakao.maps.Marker({ map: map, position: pos });
      new kakao.maps.CustomOverlay({
        map: map, position: pos, yAnchor: 0,
        content: '<div class="lbl '+klass+'">'+prefix+esc(p.place_name)+'</div>',
      });
    }, { location: center, radius: 5000, sort: kakao.maps.services.SortBy.DISTANCE });
  }

  function initAt(lat, lng){
    var center = new kakao.maps.LatLng(lat, lng);
    var map = new kakao.maps.Map(document.getElementById('map'), { center: center, level: 7 });
    // 골프장 마커 + 라벨
    new kakao.maps.Marker({ map: map, position: center, zIndex: 10 });
    new kakao.maps.CustomOverlay({
      map: map, position: center, yAnchor: 0,
      content: '<div class="lbl lbl-course">⛳ '+esc(name)+'</div>',
      zIndex: 11,
    });
    var ps = new kakao.maps.services.Places();
    // 내 저장 맛집 (⭐ 버터)
    savedNames.forEach(function(n){ placeOne(map, center, ps, n, 'lbl-saved', '⭐ '); });
    // 추천 맛집 (📍 팔레스카이)
    recNames.forEach(function(n){ placeOne(map, center, ps, n, 'lbl-rec', '📍 '); });
  }

  if(initX != null && initY != null){
    initAt(initY, initX);
  } else {
    var geocoder = new kakao.maps.services.Geocoder();
    var doKw = function(){
      var ps = new kakao.maps.services.Places();
      ps.keywordSearch(name, function(data, status){
        if(status === kakao.maps.services.Status.OK && data[0]) initAt(parseFloat(data[0].y), parseFloat(data[0].x));
        else initAt(37.5665, 126.9780);
      });
    };
    if(loc){
      geocoder.addressSearch(loc, function(result, status){
        if(status === kakao.maps.services.Status.OK && result[0]) initAt(parseFloat(result[0].y), parseFloat(result[0].x));
        else doKw();
      });
    } else { doKw(); }
  }
});
</script></body></html>`;
                    return (
                      <WebView
                        source={{ html, baseUrl: 'https://deargolf.app' }}
                        style={{ width: '100%', height: '100%' }}
                        originWhitelist={['*']}
                        javaScriptEnabled
                        domStorageEnabled
                        mixedContentMode="always"
                        startInLoadingState
                        renderLoading={() => (
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
                            <ActivityIndicator color={C.burgundy} />
                          </View>
                        )}
                        onShouldStartLoadWithRequest={(req) => {
                          if (req.url.startsWith('kakaomap://') || req.url.startsWith('intent://')) return false;
                          return true;
                        }}
                        onError={(e) => console.warn('[kakao map]', e?.nativeEvent?.description)}
                      />
                    );
                  })()}
                  {/* 우하단 카카오맵 앱 직접 열기 버튼 */}
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`kakaomap://search?q=${encodeURIComponent(c.name + ' 맛집')}`)
                      .catch(() => Linking.openURL(`https://map.kakao.com/?q=${encodeURIComponent(c.name + ' 맛집')}`))}
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      backgroundColor: '#FEE500', borderRadius: 8,
                      paddingHorizontal: 10, paddingVertical: 6,
                    }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#3A1C00', fontWeight: '600' }}>카카오맵 →</Text>
                  </TouchableOpacity>
                  <View style={{
                    position: 'absolute', top: 8, right: 8,
                    backgroundColor: 'rgba(255,255,255,0.92)',
                    borderRadius: 8,
                    paddingHorizontal: 8, paddingVertical: 4,
                    flexDirection: 'row', gap: 8,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.charcoal }}>⭐ 내 저장</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.charcoal }}>📍 추천</Text>
                  </View>
                </View>

              <View style={{ padding: 16, paddingTop: 12 }}>
                {/* ① 내가 저장한 맛집 */}
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, letterSpacing: 0, marginTop: 12, marginBottom: 8 }}>내가 저장한 맛집</Text>
                {MY_RESTAURANTS.map(r => (
                  <TouchableOpacity key={r.id}
                    onPress={() => openKakaoMap(r.name)}
                    activeOpacity={0.85}
                    style={[styles.card, { borderWidth: 1, borderColor: '#C9A84C55', backgroundColor: '#FFFDF5' }]}>
                    <View style={[styles.circle, { backgroundColor: '#F5E6A8' }]}>
                      <Text style={{ fontSize: 18 }}>🍽️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 3 }}>
                        <View style={{ backgroundColor: '#F5E6A8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={[styles.badgeTxt, { color: '#5A4A00' }]}>내 기록</Text>
                        </View>
                        <View style={{ backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 9, color: '#2E7D32' }}>영업중</Text>
                        </View>
                      </View>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.meta}>{r.type} · {r.dist}</Text>
                      {r.memo && <Text style={styles.memo}>"{r.memo}"</Text>}
                    </View>
                    <View style={{ alignSelf: 'flex-end' }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.burgundy }}>지도 →</Text>
                    </View>
                  </TouchableOpacity>
                ))}


                {/* ② 골퍼 추천 맛집 */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, letterSpacing: 0 }}>골퍼 추천 맛집</Text>
                  <TouchableOpacity onPress={() => setShowAllRest(v => !v)}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>
                      {showAllRest ? '접기' : `더보기 (${RECOMMEND_FOOD.length - 2}개 더)`}
                    </Text>
                  </TouchableOpacity>
                </View>
                {(showAllRest ? RECOMMEND_FOOD : RECOMMEND_FOOD.slice(0, 2)).map(r => (
                  <TouchableOpacity key={r.id}
                    onPress={() => openKakaoMap(r.name)}
                    activeOpacity={0.85}
                    style={[styles.card, { borderWidth: 0.5, borderColor: C.hairline, backgroundColor: '#fff' }]}>
                    <View style={[styles.circle, { backgroundColor: '#8B3040' }]}>
                      <Text style={{ fontSize: 18 }}>🍽️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 3 }}>
                        <View style={{ backgroundColor: '#6B1E2A', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={[styles.badgeTxt, { color: '#F5E6A8' }]}>추천</Text>
                        </View>
                        <View style={{ backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 9, color: '#2E7D32' }}>영업중</Text>
                        </View>
                      </View>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.meta}>{r.type} · {r.dist}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <View style={styles.ratingBox}><Text style={styles.ratingTxt}>★ {r.rating}</Text></View>
                      <Text style={styles.reviewsTxt}>리뷰 {r.reviews}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.burgundy, marginTop: 2 }}>지도 →</Text>
                    </View>
                  </TouchableOpacity>
                ))}


                {/* ③ 근처 카페 */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, letterSpacing: 0 }}>근처 카페</Text>
                  <TouchableOpacity onPress={() => setShowAllCafe(v => !v)}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>
                      {showAllCafe ? '접기' : `더보기 (${NEARBY_CAFE.length - 2}개 더)`}
                    </Text>
                  </TouchableOpacity>
                </View>
                {(showAllCafe ? NEARBY_CAFE : NEARBY_CAFE.slice(0, 2)).map(r => (
                  <TouchableOpacity key={r.id}
                    onPress={() => openKakaoMap(r.name)}
                    activeOpacity={0.85}
                    style={[styles.card, { borderWidth: 0.5, borderColor: '#C8D9E666', backgroundColor: '#fff' }]}>
                    <View style={[styles.circle, { backgroundColor: '#C8D9E6' }]}>
                      <Text style={{ fontSize: 18 }}>☕</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 3 }}>
                        <View style={{ backgroundColor: '#C8D9E6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={[styles.badgeTxt, { color: '#1A4060' }]}>카페</Text>
                        </View>
                        <View style={{ backgroundColor: '#E8F5E9', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 9, color: '#2E7D32' }}>영업중</Text>
                        </View>
                      </View>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.meta}>{r.type} · {r.dist}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <View style={styles.ratingBox}><Text style={styles.ratingTxt}>★ {r.rating}</Text></View>
                      <Text style={styles.reviewsTxt}>리뷰 {r.reviews}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.burgundy, marginTop: 2 }}>지도 →</Text>
                    </View>
                  </TouchableOpacity>
                ))}


                {/* ④ 근처 골프장 */}
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.textSecondary, letterSpacing: 0, marginTop: 12, marginBottom: 8 }}>근처 골프장</Text>
                {[
                  { name: '안성베네스트 CC', dist: '8.2km',  loc: '경기 안성', visited: false },
                  { name: '사우스링스 CC',   dist: '12.4km', loc: '경기 안성', visited: false },
                  { name: '파인크리크 골프장', dist: '24.1km', loc: '경기 평택', visited: true },
                ].map((n, i) => (
                  <View key={i} style={gS.nearbyCard}>
                    <View style={gS.nearbyIconWrap}><Text style={{ fontSize: 16 }}>⛳</Text></View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={gS.nearbyName}>{n.name}</Text>
                        {n.visited && <View style={gS.visitedBadge}><Text style={gS.visitedBadgeTxt}>방문</Text></View>}
                      </View>
                      <Text style={gS.nearbyLoc}>{n.loc}</Text>
                    </View>
                    <Text style={gS.nearbyDist}>{n.dist}</Text>
                  </View>
                ))}
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
      <View style={{ flexDirection: 'row', backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
        {[['explore', '탐색', '#6B1E2A'], ['log', '내 코스기록', '#F5E6A8']].map(([k, l, color]) => {
          const on = topTab === k;
          return (
            <TouchableOpacity key={k}
              onPress={() => setTopTab(k)}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: on ? 3 : 0, borderBottomColor: color }}>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: on ? C.charcoal : C.warmGrayLight, fontWeight: on ? '600' : '400' }}>{l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {topTab === 'log' ? (
        <CourseLogTab navigation={navigation} />
      ) : (
        <CourseExploreTab
          onSelectCourse={(id) => { setSelected(id); setInnerTab('course'); }}
          onOpenPreview={handleOpenPreview}
        />
      )}
    </SafeAreaView>
  );
}
