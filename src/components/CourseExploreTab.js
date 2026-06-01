import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Linking, ActivityIndicator, Platform } from 'react-native';

const _and = Platform.OS === 'android';
import { C, F, fs } from '../constants/colors';
import { searchGolfCourses, searchNearbyDrivingRanges, searchNearbyScreenGolf } from '../utils/kakao';
import { getCurrentLocation } from '../utils/location';
import { getUserCourses } from '../utils/userCourses';
import { getRecentCourses, addRecentCourse } from '../utils/recentCourses';
import { getTop100Courses } from '../utils/top100';

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

// 공통 섹션 래퍼 — 헤더를 섹션별 단색 컬러 바로 표시 (리스트와 명확히 구분)
function Section({ title, right, headerBg, titleColor, children }) {
  const tc = titleColor || C.charcoal;
  return (
    <View style={{ backgroundColor: C.bgPrimary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: headerBg || C.charcoal, paddingHorizontal: 14, paddingVertical: _and ? 8 : 11, gap: 8 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(15), color: tc, letterSpacing: 0.3 }}>{title}</Text>
        {right ? <Text numberOfLines={1} style={{ flexShrink: 0, fontFamily: F.sys, fontSize: fs(10), color: tc, opacity: 0.7 }}>{right}</Text> : null}
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
      style={{ paddingVertical: _and ? 9 : 12, alignItems: 'center' }}>
      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
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

  const refreshSaved = useCallback(async () => {
    const list = await getUserCourses();
    setSavedCourses(list || []);
  }, []);

  const refreshRecent = useCallback(async () => {
    const list = await getRecentCourses();
    setRecentCourses(list || []);
  }, []);

  useEffect(() => { refreshSaved(); refreshRecent(); }, [refreshSaved, refreshRecent]);

  // 100대 코스 목록 로드 (지역 탭 둘러보기용)
  useEffect(() => { getTop100Courses().then(list => setTop100(list || [])); }, []);

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

  // 네이버 지도(스마트플레이스)에서 이름으로 검색 — 데이터는 카카오, 지도는 네이버로 통일
  const openMap = (item) => {
    const q = (item.name || '').trim();
    Linking.openURL(`https://map.naver.com/v5/search/${encodeURIComponent(q)}`)
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

  const filteredRecent = region === '전체'
    ? recentCourses
    : recentCourses.filter(c => getRegion(c.loc) === region);
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
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      {/* 1. 검색창 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 }}>
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
          <TextInput
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
        style={{ maxHeight: _and ? 36 : 40, marginBottom: _and ? 2 : 4 }}>
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
                  <Text style={{ fontFamily: F.en, fontSize: fs(14), fontWeight: '700', color: '#A88A2E', width: 34 }}>{c.rank}</Text>
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
        const seen = new Set();
        const localMatches = [];
        const addLocal = (c, kind, loc) => {
          if (!c?.name || !c.name.includes(q)) return; // 이름 포함검색
          const k = norm(c.name);
          if (seen.has(k) || inKakao.has(k)) return;
          seen.add(k);
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
          right={recentCourses.length ? '최근 검색순' : ''}
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
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(17), color: C.charcoal }}>⛳ {c.name}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>
                      {c.loc || '위치 미상'}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(22), color: C.warmGray }}>›</Text>
                </TouchableOpacity>
              ))}
              <MoreButton moreCount={moreRecent} onPress={() => setRecentExpanded(true)} />
            </View>
          )}
        </Section>
      )}

      {/* 4. 내 주변 연습장 */}
      <Section
        title="🏌️ 내 주변 연습장"
        right="현재위치 기준"
        headerBg={C.paleSky}
        titleColor={C.navy}>
        {nearbyLoading ? (
          <View style={{ paddingVertical: 22, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={C.warmGray} />
          </View>
        ) : visibleNearby.length === 0 ? (
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 18, paddingHorizontal: 14, textAlign: 'center' }}>
            {nearbyMsg}
          </Text>
        ) : (
          <View style={{ paddingHorizontal: 14 }}>
            {visibleNearby.map(n => (
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
            <MoreButton moreCount={moreNearby} onPress={() => setNearbyExpanded(true)} />
          </View>
        )}
      </Section>

      {/* 5. 내 주변 스크린골프 */}
      <Section
        title="🖥️ 내 주변 스크린골프"
        right="현재위치 기준"
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
            <MoreButton moreCount={moreScreen} onPress={() => setScreenExpanded(true)} />
          </View>
        )}
      </Section>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
