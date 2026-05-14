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
import { getUserCourses } from '../utils/userCourses';
import { gS } from '../styles/gS';
import { CourseLogTab } from './CourseLogTab';

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
  const [topTab, setTopTab] = useState('log');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('전체');
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
      setInnerTab('course');
      setShowCommentInput(false);
      setCommentInput('');
      setSearch('');
      setRegionFilter('전체');
      setTopTab('log');
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
  useEffect(() => {
    (async () => {
      const list = await getUserCourses();
      setUserCoursesList(list || []);
      setUserCoursesHydrated(true);
    })();
  }, []);

  // selected id를 COURSE_LOG 또는 userCourses에서 찾아 { name, loc, _source } 반환
  const getCourseData = (id) => {
    if (!id) return null;
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

  useEffect(() => {
    if (!selected) return;
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
            <TouchableOpacity onPress={() => { setSelected(null); setInnerTab('course'); }}
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
          <TouchableOpacity onPress={() => { setSelected(null); setInnerTab('course'); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 22, color: C.warmGray }}>←</Text>
          </TouchableOpacity>
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 22, color: C.charcoal }}>{c.name}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray, marginTop: 2 }}>{c.loc} · 18홀 · Par 72</Text>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: C.warmGrayLight }} />

        <View style={{ backgroundColor: C.bgPrimary }}>
          <View style={{ flexDirection: 'row' }}>
            {[['course', '코스 & 코멘트'], ['food', '맛집 & 주변']].map(([k, l]) => {
              const on = innerTab === k;
              return (
                <TouchableOpacity key={k}
                  style={[gS.innerTab, { paddingVertical: 8 }]}
                  onPress={() => setInnerTab(k)}>
                  <Text style={{
                    fontFamily: F.sys,
                    fontSize: 13,
                    color: on ? C.charcoal : C.warmGrayLight,
                    fontWeight: on ? '600' : '400',
                  }}>{l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', height: 3 }}>
            <View style={{ flex: 1, backgroundColor: C.paleSky, opacity: guideTabIdx === 0 ? 1 : 0.25, height: guideTabIdx === 0 ? 4 : 2, marginTop: guideTabIdx === 0 ? 0 : 1 }} />
            <View style={{ flex: 1, backgroundColor: C.burgundy, opacity: guideTabIdx === 1 ? 1 : 0.25, height: guideTabIdx === 1 ? 4 : 2, marginTop: guideTabIdx === 1 ? 0 : 1 }} />
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
              {/* 코스 한마디 */}
              <Text style={[gS.secLabel, { marginTop: 4 }]}>코스 한마디</Text>
              {c.memo ? (
                <View style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#C9A84C',
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 16,
                }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#3D3935', fontWeight: '400', lineHeight: 20 }}>
                    {c.memo}
                  </Text>
                </View>
              ) : (
                <View style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#E8E2D0',
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 16,
                }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#2A2622', fontWeight: '600' }}>
                    처음 방문하는 코스예요
                  </Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGray, marginTop: 3 }}>
                    골퍼들의 코멘트를 먼저 확인해보세요
                  </Text>
                </View>
              )}

              {/* 버튼 3개 가로 */}
              <View style={{ flexDirection: 'row', gap: 7, marginBottom: 20 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#3A1C00', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => Linking.openURL(`https://golf.kakao.com/search?query=${encodeURIComponent(c.name)}`)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#FEE500', lineHeight: 17 }}>카카오골프</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#FEE500', lineHeight: 17 }}>예약</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#03C75A', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff', lineHeight: 17 }}>네이버</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff', lineHeight: 17 }}>골프장 정보</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: C.paleSky, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => Linking.openURL(`nmap://search?query=${encodeURIComponent(c.name)}`)
                    .catch(() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`))}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#1A4060', lineHeight: 17 }}>네이버</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#1A4060', lineHeight: 17 }}>지도</Text>
                </TouchableOpacity>
              </View>

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

              {/* 골퍼 코멘트 헤더 — COURSE_LOG 코스에만 (user-added는 코멘트 DB 없음) */}
              {!isUserCourse && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={gS.secLabel}>골퍼 코멘트 · 좋아요 순</Text>
                <TouchableOpacity
                  onPress={() => setShowCommentInput(v => !v)}
                  style={{ borderWidth: 0.5, borderColor: C.burgundy, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>+ 코멘트</Text>
                </TouchableOpacity>
              </View>
              )}

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
                {/* 네이버지도 WebView */}
                <View style={{ height: 200, position: 'relative' }}>
                  <WebView
                    source={{ uri: `https://map.naver.com/v5/search/${encodeURIComponent(c.name + ' 맛집')}` }}
                    style={{ flex: 1 }}
                    startInLoadingState
                    renderLoading={() => (
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
                        <ActivityIndicator color={C.burgundy} />
                      </View>
                    )}
                  />
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
      ) : hasCourses ? (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="골프장 검색..."
              placeholderTextColor={C.warmGrayLight}
              style={{
                backgroundColor: C.bgSecondary,
                borderRadius: 10,
                borderWidth: 0.5,
                borderColor: C.hairline,
                paddingHorizontal: 14,
                paddingVertical: 10,
                fontFamily: F.sys,
                fontSize: 13,
                color: C.charcoal,
              }}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6, gap: 12 }}
            style={{ maxHeight: 44 }}>
            {REGIONS.map(r => {
              const on = regionFilter === r;
              return (
                <TouchableOpacity key={r}
                  onPress={() => setRegionFilter(r)}
                  style={{ paddingVertical: 6, borderBottomWidth: on ? 2 : 0, borderBottomColor: '#6B1E2A' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: on ? '#6B1E2A' : C.warmGrayLight, fontWeight: on ? '600' : '400' }}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView ref={r => { scrollRefs.current.list = r; }} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {chipCourses
                .filter(c => {
                  if (regionFilter !== '전체' && getRegion(c.loc) !== regionFilter) return false;
                  if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
                  return true;
                })
                .map(c => (
                  <TouchableOpacity key={c.id} style={gS.courseCard}
                    onPress={() => { setSelected(c.id); setInnerTab('course'); }} activeOpacity={0.85}>
                    <View style={gS.courseCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={gS.courseCardName}>{c.name}</Text>
                        <Text style={gS.courseCardLoc}>{c.loc} · 18홀</Text>
                      </View>
                      <Text style={[gS.courseCardArrow, { fontSize: 22 }]}>›</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
                      {c.tags.slice(0, 2).map((t, i) => (
                        <View key={i} style={[gS.pill, i === 0 && { backgroundColor: C.butter }, i === 1 && { backgroundColor: C.paleSky }]}>
                          <Text style={gS.pillTxt}>{t}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={gS.courseCardScore}>내 베스트 {c.best}타</Text>
                  </TouchableOpacity>
                ))}
            </View>
            <View style={{ height: 32 }} />
          </ScrollView>
        </>
      ) : (
        <ScrollView ref={r => { scrollRefs.current.empty = r; }} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={gS.emptyBanner}>
            <Text style={gS.emptyTitle}>방문한 코스가 없어요</Text>
            <Text style={gS.emptySub}>관심 있는 골프장을 검색하거나{'\n'}추천 코스를 둘러보세요</Text>
          </View>
          <Text style={[gS.secLabel, { marginHorizontal: 16, marginTop: 8 }]}>추천 골프장</Text>
          <View style={{ paddingHorizontal: 16 }}>
            {RECOMMENDED_COURSES.map(c => (
              <TouchableOpacity key={c.id} style={[gS.courseCard, { borderColor: C.paleSky + '80' }]} activeOpacity={0.85}>
                <View style={gS.courseCardTop}>
                  <Text style={[gS.courseCardName, { flex: 1 }]}>{c.name}</Text>
                  <Text style={[gS.courseCardArrow, { fontSize: 22 }]}>›</Text>
                </View>
                <Text style={gS.courseCardLoc}>{c.loc}</Text>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  {c.tags.map((t, i) => (
                    <View key={i} style={[gS.pill, { backgroundColor: i === 0 ? C.butter : C.paleSky }]}>
                      <Text style={gS.pillTxt}>{t}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
