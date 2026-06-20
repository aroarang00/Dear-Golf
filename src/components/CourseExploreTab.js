import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import AppTextInput from './common/AppTextInput';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { showAppAlert } from './AppAlert'; // OS 기본 팝업 대신 앱 디자인 알림(안드 시스템팝업 방지)
import { AttentionMotion } from './common/AttentionMotion'; // '내 코스 모아보기' 바 맥동
import { GreenFlag, Icon } from './common/Icon'; // 🏌️ → 입체 그린·핀 SVG, ⛳ → green 라인 아이콘

const _and = Platform.OS === 'android';
import { C, F, fs } from '../constants/colors';
import { searchNearbyDrivingRanges, searchNearbyScreenGolf, NON_COURSE_NAME_RE, HIDDEN_UMBRELLA_BASES } from '../utils/kakao';
import { searchGolfCourses } from '../utils/golfCourses';
import { getCurrentLocation, hasLocationPermission } from '../utils/location';
import { getUserCourses } from '../utils/userCourses';
import { getSavedCourses, saveSavedCoursesOrder } from '../utils/savedCourses'; // 내 저장 골프장(위시리스트)
import { getRecentCourses, addRecentCourse, clearRecentCourses } from '../utils/recentCourses';
import { getTop100Courses, normalizeCourseName } from '../utils/top100';
import { naverSearchUrl } from '../utils/naverMap';

// 주변 연습장·스크린골프 결과 디스크 캐시 — 위치 fix 간헐 실패·카카오 일시오류(429·순단) 시 직전 성공값 폴백.
//   연습장 위치는 거의 안 변해 TTL 길게(7일). 날씨(wxCache) 폴백 패턴과 동일 ([[image-load-speed]] 류 회복력).
const NEARBY_CACHE_KEY = '@dg_nearby_v1';
const NEARBY_TTL = 7 * 24 * 3600 * 1000;
const RETRY_HINT = '\n아래로 당겨 다시 불러올 수 있어요';

const REGIONS = ['전체', '수도권', '강원', '충청', '경상', '전라', '제주'];
const getRegion = (loc) => {
  if (!loc) return null;
  const first = loc.split(' ')[0];
  if (['서울', '서울특별시', '인천', '인천광역시', '경기', '경기도'].includes(first)) return '수도권';
  if (['충북', '충청북도', '충남', '충청남도', '대전', '대전광역시', '세종', '세종특별자치시'].includes(first)) return '충청';
  if (['강원', '강원도', '강원특별자치도'].includes(first)) return '강원';
  if (['경북', '경상북도', '경남', '경상남도', '대구', '대구광역시', '부산', '부산광역시', '울산', '울산광역시'].includes(first)) return '경상';
  if (['전북', '전북특별자치도', '전라북도', '전남', '전라남도', '광주', '광주광역시'].includes(first)) return '전라';
  if (['제주', '제주특별자치도', '제주도'].includes(first)) return '제주';
  return null;
};

const distLabel = (m) => {
  if (!m) return '';
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
};

// 공통 섹션 래퍼 — 깔끔한 흰 카드(둥근 모서리·얇은 테두리·부드러운 그림자)로 통일.
//   색색 헤더 바 폐기(사용자 2026-06-20, 세련된 박스화). 아이콘은 title 안 이모지로 구분. headerBg/titleColor는 무시(호환용).
function Section({ title, right, children, onRightPress }) {
  return (
    // 바깥 = 그림자(입체감)·둥근 모서리. 안 = overflow:hidden 클립(같은 View에 그림자+overflow면 iOS서 그림자 잘림).
    <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 14, backgroundColor: C.bgSecondary,
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 7, elevation: 4 }}>
      <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: C.hairline }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 14, paddingTop: 13, paddingBottom: 9, gap: 8 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, letterSpacing: 0.3 }}>{title}</Text>
          {right ? (
            onRightPress ? (
              <TouchableOpacity onPress={onRightPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6} style={{ flexShrink: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, textDecorationLine: 'underline' }}>{right}</Text>
              </TouchableOpacity>
            ) : (
              <Text numberOfLines={1} style={{ flexShrink: 0, fontFamily: F.sys, fontSize: fs(10), color: C.warmGray }}>{right}</Text>
            )
          ) : null}
        </View>
        <View style={{ paddingBottom: 6 }}>{children}</View>
      </View>
    </View>
  );
}

// 더보기/접기 토글 버튼 — 펼침 상태면 '접기'(다시 5개로). 안 펼쳤고 더 볼 게 없으면 숨김.
function MoreButton({ moreCount, expanded, onPress }) {
  if (!expanded && moreCount <= 0) return null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ paddingVertical: _and ? 9 : 12, alignItems: 'center' }}>
      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
        {expanded ? '접기 ↑' : `더보기 (${moreCount}개 더) →`}
      </Text>
    </TouchableOpacity>
  );
}

// forwardRef — 코스 탭 재탭(tabPress) 시 부모(GuideScreen)가 scrollToTop()을 호출해 목록을 맨 위로 올림.
export const CourseExploreTab = forwardRef(function CourseExploreTab({ onSelectCourse, onOpenPreview, onOpenCourseLog }, ref) {
  const scrollRef = useRef(null);   // 메인 목록 ScrollView — 스크롤 톱 복귀용
  useImperativeHandle(ref, () => ({
    scrollToTop: () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
    refresh: () => { refreshSaved(); refreshRecent(); refreshFav(); }, // 코스 상세에서 저장/해제 후 '내 저장 골프장' 즉시 갱신
  }), [refreshSaved, refreshRecent, refreshFav]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [region, setRegion] = useState('전체');

  const [savedCourses, setSavedCourses] = useState([]); // userCourses — 검색결과 ❤️·기존코스 판별용
  const [recentCourses, setRecentCourses] = useState([]);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [top100, setTop100] = useState([]); // 지역별 100대 코스 둘러보기용

  const [nearby, setNearby] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyMsg, setNearbyMsg] = useState('');
  const [nearbyExpanded, setNearbyExpanded] = useState(false);

  const [screen, setScreen] = useState([]);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenMsg, setScreenMsg] = useState('');
  const [screenExpanded, setScreenExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // 당겨서 새로고침 표시 (주변 시설 재시도)
  const [savedExpanded, setSavedExpanded] = useState(false); // 내 저장 골프장 더보기
  const [savedFav, setSavedFav] = useState([]); // 내 저장 골프장(위시리스트) — 코스 상세 ★ 저장분
  const [favEditMode, setFavEditMode] = useState(false); // 내 저장 골프장 순서 편집(↑/↓)

  // 위시리스트 순서 ↑/↓ — idx와 dir(-1 위/+1 아래) 스왑 후 즉시 저장. 편집 중엔 전체 목록을 보여줘 idx가 곧 전체 인덱스.
  const moveFav = useCallback((idx, dir) => {
    setSavedFav(prev => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp;
      saveSavedCoursesOrder(next); // 영속(fire-and-forget)
      return next;
    });
  }, []);

  const refreshSaved = useCallback(async () => {
    const list = await getUserCourses();
    setSavedCourses(list || []);
  }, []);

  const refreshFav = useCallback(async () => {
    setSavedFav(await getSavedCourses()); // 내 저장 골프장(위시리스트)
  }, []);

  const refreshRecent = useCallback(async () => {
    const list = await getRecentCourses();
    setRecentCourses(list || []);
  }, []);

  useEffect(() => { refreshSaved(); refreshRecent(); refreshFav(); }, [refreshSaved, refreshRecent, refreshFav]);

  // 100대 코스 목록 로드 (지역 탭 둘러보기용)
  useEffect(() => { getTop100Courses().then(list => setTop100(list || [])); }, []);

  // 주변 연습장·스크린골프 fetch — 위치→카카오. 실패해도 직전 캐시(이미 표시 중)는 유지(빈 화면 방지).
  //   빈 결과여도 리스트가 비어있을 때만 메시지가 보이므로(렌더 조건), 캐시 표시 중엔 오인 메시지가 가려짐.
  const loadNearby = useCallback(async () => {
    try {
      const loc = await getCurrentLocation();
      if (!loc) {
        // 위치 실패 — 권한 거부와 'fix 실패(권한 있음)'를 구분해 안내(기존엔 둘 다 권한 메시지라 혼란).
        const granted = await hasLocationPermission().catch(() => true);
        const msg = granted
          ? '위치를 확인할 수 없어요.' + RETRY_HINT
          : '위치 권한을 허용하면\n주변 시설을 보여드려요';
        setNearbyMsg(msg); setScreenMsg(msg);
        return;
      }
      const [d, s] = await Promise.all([
        searchNearbyDrivingRanges(loc.lat, loc.lng, 10000),
        searchNearbyScreenGolf(loc.lat, loc.lng, 5000),
      ]);
      // 결과 있으면 갱신, 빈 결과(카카오 일시오류 가능)면 기존(캐시) 유지 — setX 안 해 덮어쓰지 않음.
      if (d.length) setNearby(d);
      setNearbyMsg(d.length ? '' : '근처 연습장 정보가 없어요' + RETRY_HINT);
      if (s.length) setScreen(s);
      setScreenMsg(s.length ? '' : '근처 스크린골프 정보가 없어요' + RETRY_HINT);
      if (d.length || s.length) {
        AsyncStorage.setItem(NEARBY_CACHE_KEY, JSON.stringify({ ts: Date.now(), ranges: d, screens: s })).catch(() => {});
      }
    } catch (e) {
      setNearbyMsg('주변 시설 정보를 불러올 수 없어요' + RETRY_HINT);
      setScreenMsg('주변 시설 정보를 불러올 수 없어요' + RETRY_HINT);
    }
  }, []);

  // 마운트 — 캐시 즉시 표시(빈 화면 방지) 후 최신 fetch. 캐시 없을 때만 섹션 스피너.
  useEffect(() => {
    (async () => {
      let hasCache = false;
      try {
        const raw = await AsyncStorage.getItem(NEARBY_CACHE_KEY);
        if (raw) {
          const c = JSON.parse(raw);
          if (c && Date.now() - c.ts < NEARBY_TTL) {
            if (c.ranges?.length) { setNearby(c.ranges); hasCache = true; }
            if (c.screens?.length) { setScreen(c.screens); hasCache = true; }
          }
        }
      } catch {}
      if (!hasCache) { setNearbyLoading(true); setScreenLoading(true); }
      await loadNearby();
      setNearbyLoading(false); setScreenLoading(false);
    })();
  }, [loadNearby]);

  // 당겨서 새로고침 / 헤더 새로고침 버튼 공통 — 위치·카카오 재시도(간헐 실패 회복 수단)
  const onRefreshNearby = useCallback(async () => {
    setRefreshing(true);
    await loadNearby();
    setRefreshing(false);
  }, [loadNearby]);

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

  // 네이버 지도(스마트플레이스)에서 이름으로 검색 — 데이터는 카카오, 지도는 네이버로 통일
  const openMap = (item) => {
    if (!item?.name) return;
    // 이름만 검색하면 동명 다른 지역(예: 양주 연습장 → 포항)으로 빠짐 → loc 지역 토큰 함께 실어 고정.
    Linking.openURL(naverSearchUrl(item.name, item.loc))
      .catch(() => Linking.openURL('https://map.naver.com/'));
  };

  // 지역 100대 코스 항목 탭 → 카카오 검색으로 해당 코스 열기 (목록엔 좌표가 없어서 검색으로 해석)
  const openTop100Course = async (c) => {
    try {
      const list = await searchGolfCourses(c.name);
      const top = list && list[0];
      if (top) {
        await addRecentCourse(top);
        refreshRecent();
        const existing = savedCourses.find(s => s.kakaoId === top.kakaoId);
        if (existing) onSelectCourse?.(existing.id);
        else onOpenPreview?.(top);
        return;
      }
    } catch {}
    setSearch(c.name); // 검색 실패 시 검색창에라도 채워줌
  };

  // 로컬 목록(최근·저장)에서 숨길 항목 — 비코스 잡항목(클럽하우스·연습장 등 과거 기록 잔재)
  // + 큐레이션 대표명(라비에벨 골프앤리조트, 단독이어도 숨김 — 2026-06-02 정책)
  const isHiddenLocal = (name) => {
    if (!name) return true;
    if (NON_COURSE_NAME_RE.test(name)) return true;
    if (!/코스/.test(name) && HIDDEN_UMBRELLA_BASES.includes(normalizeCourseName(name))) return true;
    return false;
  };
  const filteredRecent = (region === '전체'
    ? recentCourses
    : recentCourses.filter(c => getRegion(c.loc) === region)
  ).filter(c => !isHiddenLocal(c.name));
  // 선택한 지역의 100대 코스 (순위순)
  const regionCourses = region === '전체'
    ? []
    : top100.filter(c => getRegion(c.region) === region);
  const visibleRecent = recentExpanded ? filteredRecent : filteredRecent.slice(0, 5);
  const moreRecent = filteredRecent.length - visibleRecent.length;

  const visibleNearby = nearbyExpanded ? nearby : nearby.slice(0, 5);
  const moreNearby = nearby.length - visibleNearby.length;

  const visibleScreen = screenExpanded ? screen : screen.slice(0, 5);
  const moreScreen = screen.length - visibleScreen.length;

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshNearby} tintColor={C.warmGray} />}>
      {/* 0. 내 코스 모아보기 — 골프일정과 동일한 긴 바(그린 그라데이션). 검색창 위. 도착=CourseLogModal([[course-log-naming]]) */}
      {onOpenCourseLog && (
        <AttentionMotion type="pulse" style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 12,
          shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 2.5, elevation: 3 }}>
          <TouchableOpacity onPress={onOpenCourseLog} activeOpacity={0.85} style={{ borderRadius: 12 }}>
            <LinearGradient colors={['#7A9C6C', '#5E7E52']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12,
                borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 14, paddingVertical: _and ? 10 : 11 }}>
              <GreenFlag size={fs(26)} />
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>내 코스 모아보기</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.82)', marginLeft: 7 }}>방문 코스 · 통계 보기</Text>
              </View>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: '#fff' }}>›</Text>
            </LinearGradient>
          </TouchableOpacity>
        </AttentionMotion>
      )}
      {/* 1. 검색창 — 아래 지역탭과의 간격을 탭↔섹션헤더 간격과 대칭으로(검색박스 멀고 헤더에 바짝 붙던 불균형 해소, 안드·iOS 동일) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: C.bgSecondary,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: C.burgundy,
          paddingHorizontal: 14,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        }}>
          <Text style={{ fontSize: fs(16), marginRight: 8 }}>🔍</Text>
          <AppTextInput
            value={search}
            onChangeText={setSearch}
            placeholder="골프장 검색"
            placeholderTextColor={C.warmGray}
            style={{
              flex: 1,
              paddingVertical: 12,
              fontFamily: F.sysSb,
              fontSize: fs(17),
              color: C.charcoal,
            }}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* 코스 검색 안내 — 첫 사용(최근 검색 기록이 아직 없을 때)에만 */}
      {!search.trim() && recentCourses.length === 0 && (
        <View style={{ marginHorizontal: 16, marginBottom: _and ? 8 : 12, backgroundColor: C.bgSecondary, borderRadius: 10, padding: _and ? 10 : 12, borderWidth: 0.5, borderColor: C.hairline }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
            💡 골프장을 검색해 탭하면 — 코스 정보·맛집·골퍼들의 코멘트를 한눈에 볼 수 있어요. 다녀온 코스라면 직접 생생한 코멘트를 남겨 다른 골퍼와 정보를 나눌 수도 있어요.
          </Text>
        </View>
      )}

      {/* 2. 지역 퀵탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 2, gap: 8 }}
        style={{ maxHeight: _and ? 36 : 40, marginBottom: 0 }}>
        {REGIONS.map(r => {
          const on = region === r;
          return (
            <TouchableOpacity key={r} onPress={() => setRegion(r)} activeOpacity={0.7}
              style={{
                minWidth: 56, paddingHorizontal: 12, paddingVertical: _and ? 4 : 6, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? C.charcoal : C.bgSecondary,
                borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline,
              }}>
              <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(12), color: on ? C.butter : C.warmGray }}>{r}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 지역 선택 시 — 그 지역 100대 코스 둘러보기 */}
      {region !== '전체' && !search.trim() && (
        <Section
          title={`🏆 ${region} 100대 코스`}
          right={top100.length ? `${regionCourses.length}곳` : ''}
          headerBg={C.burgundy}
          titleColor={C.butter}>
          {top100.length === 0 ? (
            <View style={{ paddingVertical: 22, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={C.warmGray} />
            </View>
          ) : regionCourses.length === 0 ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center' }}>
              {`${region} 지역의 100대 코스가 없어요`}
            </Text>
          ) : (
            <View style={{ paddingHorizontal: 14 }}>
              {regionCourses.map(c => (
                <TouchableOpacity key={c.rank} onPress={() => openTop100Course(c)} activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: _and ? 9 : 12,
                    borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <Text style={{ fontFamily: F.en, fontSize: fs(14), color: '#A88A2E', width: 34 }}>{c.rank}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(17), color: C.charcoal }}>⛳ {c.name}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>{c.region}</Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(22), color: C.warmGray }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Section>
      )}

      {/* 검색 결과 — 로컬(최근·저장·100대) 포함검색 + 카카오 검색을 합쳐 표시.
          로컬은 네트워크 없이 즉시 떠서, 두 글자만 입력해도 자동 목록이 보인다. */}
      {!!search.trim() && (() => {
        const q = search.trim();
        const norm = (s) => (s || '').replace(/\s/g, '').toLowerCase();
        const inKakao = new Set(searchResults.map(r => norm(r.name)));
        // 이미 표시 중인 구장 base(카카오 + 로컬 누적) — 표기만 다른 같은 구장/대표명 흡수용.
        // '코스'(올드/듄스 등 멀티코스)는 개별 destination이라 흡수에서 제외.
        const shownBases = new Set(searchResults.map(r => normalizeCourseName(r.name)));
        const seen = new Set();
        const localMatches = [];
        const addLocal = (c, kind, loc) => {
          const name = c?.name || '';
          if (!name || !name.includes(q)) return;       // 이름 포함검색
          if (isHiddenLocal(name)) return;              // 클럽하우스·연습장 잡항목 + 큐레이션 대표명 숨김
          const k = norm(name);
          if (seen.has(k) || inKakao.has(k)) return;    // 동일 이름 중복 제거
          const base = normalizeCourseName(name);
          if (!/코스/.test(name) && shownBases.has(base)) return; // 이미 표시된 구장 흡수(라데나GC↔라데나 골프클럽). 코스는 개별 유지
          seen.add(k);
          shownBases.add(base);
          localMatches.push({ ...c, _kind: kind, _loc: loc });
        };
        recentCourses.forEach(c => addLocal(c, 'recent', c.loc));
        savedCourses.forEach(c => addLocal(c, 'saved', c.loc));
        top100.forEach(c => addLocal(c, 'top100', c.region));
        const shownLocal = localMatches.slice(0, 10);

        const onLocalTap = async (m) => {
          if (m._kind === 'top100') { openTop100Course(m); return; }
          await addRecentCourse(m);
          refreshRecent();
          const existing = savedCourses.find(s => s.kakaoId === m.kakaoId);
          if (existing) onSelectCourse?.(existing.id);
          else onOpenPreview?.(m);
        };

        const noResult = !searching && shownLocal.length === 0 && searchResults.length === 0;
        const rowStyle = { flexDirection: 'row', alignItems: 'center', paddingVertical: _and ? 9 : 12,
          borderBottomWidth: 0.5, borderBottomColor: C.hairline };
        return (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
            {shownLocal.map((m, i) => (
              <TouchableOpacity key={`L_${m.kakaoId || m.rank || i}`} onPress={() => onLocalTap(m)}
                activeOpacity={0.7} style={rowStyle}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(17), color: C.charcoal }}>⛳ {m.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>{m._loc || '위치 미상'}</Text>
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginRight: 6 }}>
                  {m._kind === 'top100' ? '100대' : '최근'}
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(22), color: C.warmGray }}>›</Text>
              </TouchableOpacity>
            ))}
            {searching ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={C.warmGray} />
              </View>
            ) : noResult ? (
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 12, textAlign: 'center' }}>
                검색 결과가 없어요
              </Text>
            ) : (
              searchResults.map((r, i) => (
                <TouchableOpacity key={r.kakaoId || i}
                  onPress={async () => {
                    // 검색 결과 탭 → 최근 검색 이력에 기록
                    await addRecentCourse(r);
                    refreshRecent();
                    // 이미 저장된 골프장이면 바로 그 entry로, 아니면 미리보기로
                    const existing = savedCourses.find(c => c.kakaoId === r.kakaoId);
                    if (existing) onSelectCourse?.(existing.id);
                    else onOpenPreview?.(r);
                  }}
                  activeOpacity={0.7} style={rowStyle}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(17), color: C.charcoal }}>⛳ {r.name}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>{r.loc}</Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(22), color: C.warmGray }}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      })()}

      {/* 3. 최근 검색 골프장 — 검색 안 할 때 항상 표시 (이력 없어도 기능을 알 수 있게) */}
      {!search.trim() && (
        <Section
          title={`🔍 최근 검색${recentCourses.length ? ` ${recentCourses.length}곳` : ''}`}
          right={recentCourses.length ? '지우기' : ''}
          onRightPress={recentCourses.length ? () => {
            showAppAlert('최근 검색 지우기', '최근 검색한 골프장 목록을 모두 지울까요?', [
              { text: '취소', style: 'cancel' },
              { text: '지우기', style: 'destructive', onPress: async () => { await clearRecentCourses(); refreshRecent(); } },
            ]);
          } : undefined}
          headerBg={C.charcoal}
          titleColor={C.butter}>
          {recentCourses.length === 0 ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center', lineHeight: 18 }}>
              위 검색창에서 골프장을 검색하면{'\n'}여기에 최근 검색이 모여요
            </Text>
          ) : filteredRecent.length === 0 ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center' }}>
              {`${region}에 최근 검색한 골프장이 없어요`}
            </Text>
          ) : (
            <View style={{ paddingHorizontal: 14 }}>
              {visibleRecent.map((c, i) => (
                <TouchableOpacity key={c.kakaoId || `${c.name}_${i}`}
                  onPress={async () => {
                    await addRecentCourse(c);
                    refreshRecent();
                    const existing = savedCourses.find(s => s.kakaoId === c.kakaoId);
                    if (existing) onSelectCourse?.(existing.id);
                    else onOpenPreview?.(c);
                  }}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: _and ? 10 : 13,
                    borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Icon name="green" size={fs(19)} color={C.charcoal} strokeWidth={1.7} />
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(17), color: C.charcoal, marginLeft: 6 }}>{c.name}</Text>
                    </View>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>
                      {c.loc || '위치 미상'}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(22), color: C.warmGray }}>›</Text>
                </TouchableOpacity>
              ))}
              <MoreButton moreCount={moreRecent} expanded={recentExpanded} onPress={() => setRecentExpanded(v => !v)} />
            </View>
          )}
        </Section>
      )}

      {/* 4. 내 저장 골프장 — 코스 상세에서 저장한 위시리스트(savedCourses). 개수 표시 + ↑/↓ 순서 편집.
          (기존 '주변 연습장'은 카카오 데이터 부정확으로 대체 — 사용자 2026-06-20) */}
      <Section
        title={`⭐ 내 저장 골프장${savedFav.length ? ` ${savedFav.length}곳` : ''}`}
        right={savedFav.length > 1 ? (favEditMode ? '완료' : '순서 편집') : undefined}
        onRightPress={savedFav.length > 1 ? () => setFavEditMode(v => !v) : undefined}
        headerBg={C.paleSky}
        titleColor={C.navy}>
        {savedFav.length === 0 ? (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center', lineHeight: 18 }}>
            코스 상세에서 저장하면{'\n'}여기에 모여요
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 14, marginHorizontal: favEditMode ? 8 : 0, marginBottom: favEditMode ? 8 : 0,
            borderRadius: favEditMode ? 10 : 0, backgroundColor: favEditMode ? 'rgba(122,156,108,0.10)' : 'transparent',
            borderWidth: favEditMode ? 0.5 : 0, borderColor: favEditMode ? 'rgba(122,156,108,0.35)' : 'transparent' }}>
            {/* 편집 중엔 전체 목록(idx=전체 인덱스라야 ↑/↓ 정확), 평소엔 5개+더보기 */}
            {((savedExpanded || favEditMode) ? savedFav : savedFav.slice(0, 5)).map((s, i) => (
              <TouchableOpacity key={s.kakaoId || `${s.name}_${i}`} onPress={() => onOpenPreview?.(s)}
                activeOpacity={favEditMode ? 1 : 0.7} disabled={favEditMode}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: _and ? 9 : 12,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }} numberOfLines={1}>{s.name}</Text>
                  {!!s.loc && (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 2 }} numberOfLines={1}>{s.loc}</Text>
                  )}
                </View>
                {favEditMode ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TouchableOpacity onPress={() => moveFav(i, -1)} disabled={i === 0}
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} activeOpacity={0.6}
                      style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, opacity: i === 0 ? 0.3 : 1 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: C.charcoal }}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveFav(i, 1)} disabled={i === savedFav.length - 1}
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} activeOpacity={0.6}
                      style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, opacity: i === savedFav.length - 1 ? 0.3 : 1 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: C.charcoal }}>↓</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(16), color: C.warmGrayLight }}>›</Text>
                )}
              </TouchableOpacity>
            ))}
            {!favEditMode && <MoreButton moreCount={Math.max(0, savedFav.length - 5)} expanded={savedExpanded} onPress={() => setSavedExpanded(v => !v)} />}
          </View>
        )}
      </Section>

      {/* 5. 내 주변 스크린골프 */}
      <Section
        title="🖥️ 내 주변 스크린골프"
        right="↻ 새로고침"
        onRightPress={onRefreshNearby}
        headerBg={C.butter}
        titleColor={C.charcoal}>
        {screenLoading ? (
          <View style={{ paddingVertical: 22, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={C.warmGray} />
          </View>
        ) : visibleScreen.length === 0 ? (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center' }}>
            {screenMsg}
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 14 }}>
            {visibleScreen.map(n => (
              <View key={n.kakaoId}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: _and ? 9 : 12,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{n.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 2 }}>
                    {distLabel(n.distance) || n.loc}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openMap(n)} activeOpacity={0.7}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.bgSecondary,
                    borderWidth: 0.5, borderColor: C.hairline }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.charcoal }}>지도 →</Text>
                </TouchableOpacity>
              </View>
            ))}
            <MoreButton moreCount={moreScreen} expanded={screenExpanded} onPress={() => setScreenExpanded(v => !v)} />
          </View>
        )}
      </Section>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
});
