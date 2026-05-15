import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Linking, ActivityIndicator } from 'react-native';
import { C, F } from '../constants/colors';
import { searchGolfCourses, searchNearbyDrivingRanges, searchNearbyScreenGolf } from '../utils/kakao';
import { getCurrentLocation } from '../utils/location';
import { getUserCourses, addUserCourse, deleteUserCourse } from '../utils/userCourses';

const REGIONS = ['전체', '수도권', '강원', '충청', '경상', '전라', '제주'];
const getRegion = (loc) => {
  if (!loc) return null;
  const first = loc.split(' ')[0];
  if (['서울', '서울특별시', '인천', '인천광역시', '경기', '경기도'].includes(first)) return '수도권';
  if (['충북', '충청북도', '충남', '충청남도', '대전', '대전광역시', '세종', '세종특별자치시'].includes(first)) return '충청';
  if (['강원', '강원도', '강원특별자치도'].includes(first)) return '강원';
  if (['경북', '경상북도', '경남', '경상남도', '대구', '대구광역시', '부산', '부산광역시', '울산', '울산광역시'].includes(first)) return '경상';
  if (['전북', '전라북도', '전남', '전라남도', '광주', '광주광역시'].includes(first)) return '전라';
  if (['제주', '제주특별자치도', '제주도'].includes(first)) return '제주';
  return null;
};

const distLabel = (m) => {
  if (!m) return '';
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
};

// 공통 섹션 래퍼 — 헤더 배경색 섹션별 지정
function Section({ title, right, headerBg, children }) {
  return (
    <View style={{ backgroundColor: C.bgPrimary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: headerBg || C.bgSecondary, paddingHorizontal: 14, paddingVertical: 10, gap: 8,
        borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.hairline }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{title}</Text>
        {right ? <Text numberOfLines={1} style={{ flexShrink: 0, fontFamily: F.sys, fontSize: 10, color: C.warmGray }}>{right}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// 더보기 버튼
function MoreButton({ moreCount, onPress }) {
  if (moreCount <= 0) return null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ paddingVertical: 12, alignItems: 'center' }}>
      <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray }}>
        더보기 ({moreCount}개 더) →
      </Text>
    </TouchableOpacity>
  );
}

export function CourseExploreTab({ onSelectCourse, onOpenPreview }) {
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [region, setRegion] = useState('전체');

  const [savedCourses, setSavedCourses] = useState([]);
  const [savedExpanded, setSavedExpanded] = useState(false);

  const [nearby, setNearby] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyMsg, setNearbyMsg] = useState('');
  const [nearbyExpanded, setNearbyExpanded] = useState(false);

  const [screen, setScreen] = useState([]);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenMsg, setScreenMsg] = useState('');
  const [screenExpanded, setScreenExpanded] = useState(false);

  const refreshSaved = useCallback(async () => {
    const list = await getUserCourses();
    setSavedCourses(list || []);
  }, []);

  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  // 가까운 연습장 + 스크린골프 — 마운트 시 1회 fetch
  useEffect(() => {
    (async () => {
      setNearbyLoading(true);
      setScreenLoading(true);
      try {
        const loc = await getCurrentLocation();
        if (!loc) {
          setNearbyMsg('위치 권한을 허용하면 주변 시설을 보여드려요');
          setScreenMsg('위치 권한을 허용하면 주변 시설을 보여드려요');
          setNearby([]); setScreen([]);
          return;
        }
        const [d, s] = await Promise.all([
          searchNearbyDrivingRanges(loc.lat, loc.lng, 10000),
          searchNearbyScreenGolf(loc.lat, loc.lng, 5000),
        ]);
        setNearby(d); setNearbyMsg(d.length ? '' : '근처 연습장 정보가 없어요');
        setScreen(s); setScreenMsg(s.length ? '' : '근처 스크린골프 정보가 없어요');
      } catch (e) {
        setNearbyMsg('주변 시설 정보를 불러올 수 없어요');
        setScreenMsg('주변 시설 정보를 불러올 수 없어요');
      } finally {
        setNearbyLoading(false);
        setScreenLoading(false);
      }
    })();
  }, []);

  // 검색 — 디바운스
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const list = await searchGolfCourses(q);
        setSearchResults(list);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const isSaved = (kakaoId) => savedCourses.some(c => c.kakaoId === kakaoId);

  const handleToggleSave = async (item) => {
    const existing = savedCourses.find(c => c.kakaoId === item.kakaoId);
    if (existing) {
      await deleteUserCourse(existing.id);
    } else {
      await addUserCourse({
        name: item.name, loc: item.loc, x: item.x, y: item.y, kakaoId: item.kakaoId,
      });
    }
    refreshSaved();
  };

  const openMap = (item) => {
    const url = item.url || `https://map.kakao.com/link/map/${encodeURIComponent(item.name)},${item.y},${item.x}`;
    Linking.openURL(url).catch(() => Linking.openURL('https://map.kakao.com/'));
  };

  const filteredSaved = region === '전체'
    ? savedCourses
    : savedCourses.filter(c => getRegion(c.loc) === region);
  const sortedSaved = [...filteredSaved].sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  const visibleSaved = savedExpanded ? sortedSaved : sortedSaved.slice(0, 5);
  const moreSaved = sortedSaved.length - visibleSaved.length;

  const visibleNearby = nearbyExpanded ? nearby : nearby.slice(0, 5);
  const moreNearby = nearby.length - visibleNearby.length;

  const visibleScreen = screenExpanded ? screen : screen.slice(0, 5);
  const moreScreen = screen.length - visibleScreen.length;

  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {/* 1. 검색창 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="골프장 검색 (카카오)"
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
          returnKeyType="search"
        />
      </View>

      {/* 2. 지역 퀵탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 2, gap: 8 }}
        style={{ maxHeight: 40, marginBottom: 4 }}>
        {REGIONS.map(r => {
          const on = region === r;
          return (
            <TouchableOpacity key={r} onPress={() => setRegion(r)} activeOpacity={0.7}
              style={{
                minWidth: 56, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? C.charcoal : C.bgSecondary,
                borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline,
              }}>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: on ? C.butter : C.warmGray, fontWeight: on ? '600' : '400' }}>{r}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 검색 결과 (검색어 있을 때만) */}
      {!!search.trim() && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
          {searching ? (
            <View style={{ paddingVertical: 18, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={C.warmGray} />
            </View>
          ) : searchResults.length === 0 ? (
            <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, paddingVertical: 12, textAlign: 'center' }}>
              검색 결과가 없어요
            </Text>
          ) : (
            searchResults.map((r, i) => {
              const saved = isSaved(r.kakaoId);
              return (
                <TouchableOpacity key={r.kakaoId || i}
                  onPress={() => {
                    // 이미 저장된 골프장이면 바로 그 entry로, 아니면 미리보기로
                    const existing = savedCourses.find(c => c.kakaoId === r.kakaoId);
                    if (existing) onSelectCourse?.(existing.id);
                    else onOpenPreview?.(r);
                  }}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                    borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600' }}>{r.name}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 3 }}>{r.loc}</Text>
                  </View>
                  {saved && <Text style={{ fontSize: 16, marginRight: 6 }}>❤️</Text>}
                  <Text style={{ fontFamily: F.sys, fontSize: 22, color: C.warmGrayLight }}>›</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}

      {/* 3. 저장된 골프장 — 5개 보이는 고정 박스, 내부 스크롤 */}
      <Section
        title={`⛳ 저장된 골프장 ${sortedSaved.length}곳`}
        right="최근 저장순"
        headerBg="#6B1E2A15">
        {sortedSaved.length === 0 ? (
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center' }}>
            {savedCourses.length === 0
              ? '저장된 골프장이 없어요\n검색 결과의 🤍 버튼으로 추가하세요'
              : `${region}에 저장된 골프장이 없어요`}
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 14 }}>
            {visibleSaved.map(c => (
              <TouchableOpacity key={c.id} onPress={() => onSelectCourse && onSelectCourse(c.id)} activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '600' }}>{c.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 3 }}>
                    {c.loc || '위치 미상'} · 18홀
                  </Text>
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: 22, color: C.warmGrayLight }}>›</Text>
              </TouchableOpacity>
            ))}
            <MoreButton moreCount={moreSaved} onPress={() => setSavedExpanded(true)} />
          </View>
        )}
      </Section>

      {/* 4. 내 주변 연습장 */}
      <Section
        title="🏌️ 내 주변 연습장"
        right="현재위치 기준"
        headerBg="#C8D9E630">
        {nearbyLoading ? (
          <View style={{ paddingVertical: 22, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={C.warmGray} />
          </View>
        ) : visibleNearby.length === 0 ? (
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center' }}>
            {nearbyMsg}
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 14 }}>
            {visibleNearby.map(n => (
              <View key={n.kakaoId}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{n.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 }}>
                    {distLabel(n.distance) || n.loc}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openMap(n)} activeOpacity={0.7}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.bgSecondary,
                    borderWidth: 0.5, borderColor: C.hairline }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.charcoal }}>지도 →</Text>
                </TouchableOpacity>
              </View>
            ))}
            <MoreButton moreCount={moreNearby} onPress={() => setNearbyExpanded(true)} />
          </View>
        )}
      </Section>

      {/* 5. 내 주변 스크린골프 */}
      <Section
        title="🖥️ 내 주변 스크린골프"
        right="현재위치 기준"
        headerBg="#F5E6A830">
        {screenLoading ? (
          <View style={{ paddingVertical: 22, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={C.warmGray} />
          </View>
        ) : visibleScreen.length === 0 ? (
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center' }}>
            {screenMsg}
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 14 }}>
            {visibleScreen.map(n => (
              <View key={n.kakaoId}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.charcoal, fontWeight: '600' }}>{n.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, marginTop: 2 }}>
                    {distLabel(n.distance) || n.loc}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openMap(n)} activeOpacity={0.7}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.bgSecondary,
                    borderWidth: 0.5, borderColor: C.hairline }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.charcoal }}>지도 →</Text>
                </TouchableOpacity>
              </View>
            ))}
            <MoreButton moreCount={moreScreen} onPress={() => setScreenExpanded(true)} />
          </View>
        )}
      </Section>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
