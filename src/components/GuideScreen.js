import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import {
  FAVORITES_INIT, SCHEDULES_INIT, COURSE_LOG,
  USER_RESTAURANTS, MY_RESTAURANTS, RECOMMENDED_COURSES,
} from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { gS } from '../styles/gS';
import { LightHeader } from './common/LightHeader';
import { TripleStripe } from './common/TripleStripe';

export function GuideScreen({ route }) {
  const [selected, setSelected] = useState(null);
  const [innerTab, setInnerTab] = useState('course');
  const [favorites, setFavorites] = useState(FAVORITES_INIT);
  const [favoritesHydrated, setFavoritesHydrated] = useState(false);
  const [showAllRest, setShowAllRest] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.favorites, FAVORITES_INIT);
      setFavorites(loaded);
      setFavoritesHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!favoritesHydrated) return;
    storage.save(STORAGE_KEYS.favorites, favorites);
  }, [favorites, favoritesHydrated]);

  useEffect(() => {
    if (route?.params?.openCourseId) {
      setSelected(route.params.openCourseId);
      setInnerTab('course');
    }
  }, [route?.params?.openCourseId]);

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
    const c = COURSE_LOG.find(x => x.id === selected);
    const isFav = favorites.includes(selected);
    const guideTabIdx = innerTab === 'course' ? 0 : 1;

    const ALL_RESTAURANTS = [
      ...USER_RESTAURANTS,
      { id: '4', name: '장작구이 참숯갈비', type: '갈비', dist: '2.1km', rating: '4.6' },
      { id: '5', name: '황태해장국', type: '해장국', dist: '1.5km', rating: '4.3' },
      { id: '6', name: '청국장마을', type: '청국장', dist: '3.2km', rating: '4.4' },
    ];
    const visibleRest = showAllRest ? ALL_RESTAURANTS : ALL_RESTAURANTS.slice(0, 2);

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
        <View style={gS.detailHdr}>
          <TouchableOpacity onPress={() => { setSelected(null); setInnerTab('course'); }}>
            <Text style={gS.backBtn}>← 가이드</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={gS.detailName}>{c.name}</Text>
              <Text style={gS.detailLoc}>{c.loc} · 18홀 · Par 72</Text>
            </View>
            <TouchableOpacity onPress={() => toggleFavorite(selected)} style={[gS.favBtn, isFav && gS.favBtnOn]}>
              <Text style={[gS.favBtnTxt, isFav && gS.favBtnTxtOn]}>{isFav ? '저장됨' : '저장'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 150, backgroundColor: '#0D1F0D', position: 'relative', justifyContent: 'flex-end' }}>
          <View style={{ position: 'absolute', inset: 0, opacity: 0.15, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 1, borderColor: C.butter }} />
          </View>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, backgroundColor: 'rgba(5,15,5,0.6)' }} />
          <View style={{ padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {c.tags.map((t, i) => (
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

        <View style={{ backgroundColor: C.bgPrimary }}>
          <View style={{ flexDirection: 'row' }}>
            {[['course', '코스 & 코멘트'], ['food', '맛집 & 주변']].map(([k, l]) => (
              <TouchableOpacity key={k} style={gS.innerTab} onPress={() => setInnerTab(k)}>
                <Text style={[gS.innerTabTxt, innerTab === k && gS.innerTabTxtOn]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', height: 3 }}>
            <View style={{ flex: 1, backgroundColor: C.paleSky, opacity: guideTabIdx === 0 ? 1 : 0.25, height: guideTabIdx === 0 ? 4 : 2, marginTop: guideTabIdx === 0 ? 0 : 1 }} />
            <View style={{ flex: 1, backgroundColor: C.burgundy, opacity: guideTabIdx === 1 ? 1 : 0.25, height: guideTabIdx === 1 ? 4 : 2, marginTop: guideTabIdx === 1 ? 0 : 1 }} />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {innerTab === 'course' && (
            <View style={{ padding: 16 }}>
              <Text style={gS.secLabel}>코스 정보</Text>
              <View style={gS.infoCard}>
                {[['위치', c.loc], ['홀 수', '18홀'], ['Par', '72']].map(([k, v], i) => (
                  <View key={i} style={[gS.infoRow, i === 2 && { borderBottomWidth: 0 }]}>
                    <Text style={gS.infoKey}>{k}</Text>
                    <Text style={gS.infoVal}>{v}</Text>
                  </View>
                ))}
              </View>

              {c.memo ? (
                <>
                  <Text style={[gS.secLabel, { marginTop: 4 }]}>코스 한마디</Text>
                  <View style={gS.memoBox}>
                    <Text style={gS.memoTxt}>"{c.memo}"</Text>
                  </View>
                </>
              ) : (
                <View style={{ backgroundColor: C.paleSky + '22', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 0.5, borderColor: C.paleSky + '60' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, lineHeight: 18 }}>
                    아직 방문 전이에요. 아래 골퍼들의 코멘트를 참고해보세요
                  </Text>
                </View>
              )}

              <TouchableOpacity style={{ backgroundColor: '#3A1C00', borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginBottom: 8 }}
                onPress={() => Linking.openURL(`https://golf.kakao.com/search?query=${encodeURIComponent(c.name)}`)}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: '#FEE500', letterSpacing: 0.3 }}>카카오골프 예약하기</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#03C75A', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                  onPress={() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(c.name)}`)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#fff' }}>네이버 골프장 정보</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, backgroundColor: '#FEE500', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                  onPress={() => Linking.openURL(`kakaomap://search?q=${encodeURIComponent(c.name)}`)
                    .catch(() => Linking.openURL(`https://map.kakao.com/link/search/${encodeURIComponent(c.name)}`))}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#3A1C00', fontWeight: '500' }}>카카오맵 보기</Text>
                </TouchableOpacity>
              </View>

              <Text style={gS.secLabel}>골퍼 코멘트 · 좋아요 순</Text>
              {[
                { txt: '그린이 정말 빠릅니다. 퍼팅 연습 충분히 하고 가세요', who: 'J***', date: '2025.04', likes: 24 },
                { txt: '7번홀 왼쪽 OB 많이 납니다. 아이언 공략 추천', who: 'K***', date: '2025.03', likes: 18 },
                { txt: '클럽하우스 식당 된장찌개 강추. 라운딩 후 꼭 드세요', who: 'P***', date: '2025.02', likes: 11 },
              ].map((cm, i) => (
                <View key={i} style={gS.commentCard}>
                  <Text style={gS.commentTxt}>"{cm.txt}"</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={gS.commentWho}>{cm.who} · {cm.date}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: C.burgundy + '60', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.burgundy }}>♥ {cm.likes}</Text>
                    </View>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={gS.commentAddBtn}>
                <Text style={gS.commentAddTxt}>+ 코멘트 남기기</Text>
              </TouchableOpacity>
            </View>
          )}
          {innerTab === 'food' && (
            <View style={{ padding: 16 }}>
              <Text style={gS.secLabel}>내가 저장한 맛집</Text>
              {MY_RESTAURANTS.map(r => (
                <View key={r.id} style={[gS.restItem, { borderColor: C.butter }]}>
                  <View style={[gS.restIcon, { backgroundColor: '#FFF8E7' }]}><Text style={{ fontSize: 20 }}>•</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={gS.mineBadge}><Text style={gS.mineBadgeTxt}>내 기록</Text></View>
                    <Text style={gS.restName}>{r.name}</Text>
                    <Text style={gS.restType}>{r.type} · {r.dist}</Text>
                    <Text style={gS.restMemo}>"{r.memo}"</Text>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
                <Text style={gS.secLabel}>골퍼 추천 맛집</Text>
                <TouchableOpacity onPress={() => setShowAllRest(!showAllRest)}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.burgundy }}>
                    {showAllRest ? '접기' : `더보기 (${ALL_RESTAURANTS.length - 2}개 더)`}
                  </Text>
                </TouchableOpacity>
              </View>
              {visibleRest.map(r => (
                <TouchableOpacity key={r.id} style={gS.restItem}
                  onPress={() => Linking.openURL(`nmap://search?query=${encodeURIComponent(r.name)}`)
                    .catch(() => Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(r.name)}`))}>
                  <View style={[gS.restIcon, { backgroundColor: '#F0F4F8' }]}><Text style={{ fontSize: 20 }}>•</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={[gS.mineBadge, { backgroundColor: C.paleSky }]}><Text style={[gS.mineBadgeTxt, { color: C.charcoalDeep }]}>추천</Text></View>
                    <Text style={gS.restName}>{r.name}</Text>
                    <Text style={gS.restType}>{r.type} · {r.dist}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={gS.ratingBox}><Text style={gS.ratingTxt}>★ {r.rating}</Text></View>
                    <Text style={{ fontFamily: F.sys, fontSize: 9, color: C.paleSky }}>지도 →</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={[gS.secLabel, { marginTop: 24 }]}>근처 골프장</Text>
              {[
                { name: '안성베네스트 CC', dist: '8.2km', loc: '경기 안성', visited: false },
                { name: '사우스링스 CC', dist: '12.4km', loc: '경기 안성', visited: false },
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
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const hasCourses = chipCourses.length > 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      <LightHeader sub="나만의 골프 캐디" title="가이드" right={<Text style={gS.searchTxt}>검색</Text>} />
      <TripleStripe />
      {hasCourses ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}
            style={{ maxHeight: 50 }}>
            {chipCourses.map((c, i) => (
              <TouchableOpacity key={c.id} style={[gS.chip, i === 0 && gS.chipOn]}
                onPress={() => { setSelected(c.id); setInnerTab('course'); }}>
                <Text style={[gS.chipTxt, i === 0 && gS.chipTxtOn]}>
                  {c.isScheduled ? '예정 ' : c.isFavorite ? '저장 ' : ''}{c.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {chipCourses.map(c => {
                const isFav = favorites.includes(c.id);
                return (
                  <TouchableOpacity key={c.id} style={gS.courseCard}
                    onPress={() => { setSelected(c.id); setInnerTab('course'); }} activeOpacity={0.85}>
                    <View style={gS.courseCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={gS.courseCardName}>{c.name}</Text>
                        <Text style={gS.courseCardLoc}>{c.loc} · 18홀</Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleFavorite(c.id)} style={[gS.favBtn, isFav && gS.favBtnOn]}>
                        <Text style={[gS.favBtnTxt, isFav && gS.favBtnTxtOn]}>{isFav ? '저장됨' : '저장'}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
                      {c.tags.slice(0, 2).map((t, i) => (
                        <View key={i} style={[gS.pill, i === 0 && { backgroundColor: C.butter }, i === 1 && { backgroundColor: C.paleSky }]}>
                          <Text style={gS.pillTxt}>{t}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={gS.courseCardScore}>내 베스트 {c.best}타</Text>
                      <Text style={gS.courseCardArrow}>›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ height: 32 }} />
          </ScrollView>
        </>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={gS.emptyBanner}>
            <Text style={gS.emptyTitle}>방문한 코스가 없어요</Text>
            <Text style={gS.emptySub}>관심 있는 골프장을 검색하거나{'\n'}추천 코스를 둘러보세요</Text>
          </View>
          <Text style={[gS.secLabel, { marginHorizontal: 16, marginTop: 8 }]}>추천 골프장</Text>
          <View style={{ paddingHorizontal: 16 }}>
            {RECOMMENDED_COURSES.map(c => (
              <TouchableOpacity key={c.id} style={[gS.courseCard, { borderColor: C.paleSky + '80' }]} activeOpacity={0.85}>
                <View style={gS.courseCardTop}>
                  <Text style={gS.courseCardName}>{c.name}</Text>
                  <TouchableOpacity onPress={() => toggleFavorite(c.id)} style={[gS.favBtn, favorites.includes(c.id) && gS.favBtnOn]}>
                    <Text style={[gS.favBtnTxt, favorites.includes(c.id) && gS.favBtnTxtOn]}>{favorites.includes(c.id) ? '저장됨' : '저장'}</Text>
                  </TouchableOpacity>
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
