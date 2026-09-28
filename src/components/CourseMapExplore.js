import React, { useState, useEffect, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Keyboard } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppTextInput from './common/AppTextInput';
import { Icon, GreenFlag } from './common/Icon';
import { showAppAlert } from './AppAlert'; // 안내(책) — 헤더 없는 풀블리드라 오버레이 버튼으로
import { Spinner } from './common/Spinner'; // 핀 로딩 표시(공용 스피너, [[feedback-loading-spinner]])
import { C, F, fs } from '../constants/colors';
import { searchGolfCourses } from '../utils/golfCourses';
import { normalizeCourseName } from '../utils/top100';
import { courseKey } from '../utils/courseNameKey';   // 다녀온 구장 매칭 키(CourseExploreTab visitedStats와 같은 규칙)
import { getCurrentLocation } from '../utils/location';

const _and = Platform.OS === 'android';

// ★코스 탭 지도 퍼스트(2026-08-26) — 신규 유저가 "뭘 검색하지?" 없이 지도에서 바로 골프장을 둘러보게.
//   전국 뷰=100대 코스(금색 핀)만, 확대하면 화면 안 전체 골프장(버건디 핀)까지 — 핀 수를 눌러 팬·줌 부드럽게.
//   핀 탭 → 하단 카드(이름·주소·100대 뱃지·내 위치 거리) → '상세 보기'로 기존 코스 상세(위키) 진입.
//   마스터 477곳 좌표(x=경도,y=위도)는 이미 있음. 안드 구글맵 키 가드는 부모(CourseExploreTab)가 처리.

// 지역 칩 → 카메라 프리셋. 델타는 그 지역이 화면에 꽉 차는 값(폰 세로 기준 눈대중, 폰 검증으로 미세조정).
const REGION_CAM = {
  전체: { latitude: 36.1, longitude: 127.8, latitudeDelta: 5.8, longitudeDelta: 4.6 },
  수도권: { latitude: 37.45, longitude: 127.05, latitudeDelta: 1.3, longitudeDelta: 1.1 },
  강원: { latitude: 37.55, longitude: 128.35, latitudeDelta: 1.9, longitudeDelta: 1.7 },
  충청: { latitude: 36.5, longitude: 127.25, latitudeDelta: 1.7, longitudeDelta: 1.5 },
  경상: { latitude: 35.75, longitude: 128.5, latitudeDelta: 2.5, longitudeDelta: 2.1 },
  전라: { latitude: 35.2, longitude: 126.9, latitudeDelta: 2.3, longitudeDelta: 1.9 },
  제주: { latitude: 33.38, longitude: 126.53, latitudeDelta: 0.55, longitudeDelta: 0.7 },
};
const REGIONS = Object.keys(REGION_CAM);
const GOLD = '#C9A227'; // 100대 코스 핀·뱃지

// ★핀은 477개 전부를 처음부터 올려두고 이후 '절대' 갈아끼우지 않는다(2026-08-26 확정 구조).
//   시도 이력: ①뷰포트 필터(팬마다 교체)=네이티브 크래시 ②줌 단계별 100대↔전체 전환=전환 순간 대량
//   탈부착으로 핀 전멸. 마커 탈부착·재스냅샷이 이 라이브러리의 만병 근원이라, 마운트 후 무변경이 유일한 안전지대.
//   전국 뷰에선 수도권이 겹쳐 보이지만 방향 잡기 용도로 충분하고, 100대(금색·크게·zIndex 위)가 기준점이 된다.

// 골프장 핀 — React.memo + 원시값 props, 그리고 ★선택 여부를 아예 모른다(완전 정적).
//   스냅샷 고정(tracksViewChanges=false) 마커는 무슨 이유로든 다시 그려지면 빈 핀이 되는 게 라이브러리 고질병이라
//   (2026-08-26 "탭하면 주변 점 사라짐" 2회 재발), 탭 후에도 핀 마커엔 그 어떤 prop 변화도 없게 설계.
//   선택 강조는 아래 SelHighlight(별도 마커 1개)가 위에 얹힌다. 탭 감지는 MapView onMarkerPress + identifier.
const CoursePin = React.memo(function CoursePin({ id, lat, lng, gold, track }) {
  const size = gold ? 24 : 16;
  return (
    <Marker identifier={id} coordinate={{ latitude: lat, longitude: lng }}
      tracksViewChanges={track} anchor={{ x: 0.5, y: 0.5 }} zIndex={gold ? 2 : 1}>
      <View style={{ width: size, height: size, borderRadius: size / 2,
        backgroundColor: gold ? GOLD : C.burgundy, borderWidth: 1.5, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center' }}>
        {gold && <Icon name="green" size={size * 0.62} color="#fff" strokeWidth={2.2} />}
      </View>
    </Marker>
  );
});

// 다녀온 구장 표식(2026-09-23) — ★기존 핀(CoursePin)은 절대 안 건드리고 그 위에 '얹는' 별도 마커(선택 강조·내 위치와 같은 방식).
//   라운딩 기록이 늘면 마커 하나가 새로 마운트될 뿐 477개 핀엔 prop 변화 0. 남색 원+흰 체크, zIndex 3(금색 2 위, 선택 999 아래).
//   iOS는 라이브(true), 안드는 마운트 1.5초 뒤 스냅샷(false) — 내 위치 마커와 같은 규칙.
const VisitedPin = React.memo(function VisitedPin({ id, lat, lng }) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    if (Platform.OS === 'ios') return undefined;
    const t = setTimeout(() => setTrack(false), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker key={id} coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={3}
      tracksViewChanges={Platform.OS === 'ios' ? true : track}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.navy, borderWidth: 2, borderColor: '#fff',
        alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={13} color="#fff" strokeWidth={2.6} />
      </View>
    </Marker>
  );
});
const pinKey = (c) => (c?.kakaoId ? `id:${c.kakaoId}` : courseKey(c?.name || ''));

const distKm = (a, b) => {
  // 하버사인 — 카드 '내 위치에서 n km'용(정밀 불필요, 소수 1자리)
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// visited: Map<구장키, {count, best}> — 내가 다녀온 구장(CourseExploreTab visitedStats). 없으면 표시 없음.
export const CourseMapExplore = forwardRef(function CourseMapExplore({ master = [], top100 = [], savedFav = [], visited = null, onPressCourse, onOpenCourseLog, onSwitchToList }, ref) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const [sel, setSel] = useState(null);          // 핀 탭 선택 골프장 → 하단 카드
  const [regionChip, setRegionChip] = useState('전체'); // ※region/줌 state는 두지 않는다 — 팬·줌은 JS 리렌더 0
  const [myLoc, setMyLoc] = useState(null);      // {lat,lng} — 거리 표시·내 위치 이동
  // 내 위치 마커 스냅샷 — 안드는 tracks true를 계속 두면 매 프레임 재래스터(배터리·성능). 마운트 1.5초 뒤 false(핀과 같은 규칙), iOS는 상시 true.
  const [myLocTrack, setMyLocTrack] = useState(true);
  useEffect(() => {
    if (!myLoc || Platform.OS === 'ios') return undefined;
    setMyLocTrack(true);
    const t = setTimeout(() => setMyLocTrack(false), 1500);
    return () => clearTimeout(t);
  }, [myLoc]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // 탭 재탭·복귀 시 '지도 처음'(전국 뷰·선택 해제·검색 비움)으로 — GuideScreen resetView가 호출(2026-08-26)
  useImperativeHandle(ref, () => ({
    reset: () => {
      setSel(null); setSearch(''); setResults([]); setRegionChip('전체');
      mapRef.current?.animateToRegion(REGION_CAM.전체, 400);
    },
  }), []);

  // 100대 매칭 — 정규화 이름 → 순위 (마스터 핀에 금색·뱃지)
  const rankMap = useMemo(() => {
    const m = new Map();
    top100.forEach(c => m.set(normalizeCourseName(c.name), c.rank));
    return m;
  }, [top100]);
  const savedIds = useMemo(() => new Set(savedFav.map(s => String(s.kakaoId))), [savedFav]);

  const allPins = useMemo(() => master.filter(c => Number.isFinite(c.x) && Number.isFinite(c.y)), [master]);
  // 다녀온 구장 — 핀 위에 얹을 마커 목록(보통 수 개~수십 개). key가 안정적이라 기록이 늘면 그 하나만 새로 마운트.
  const visitedPins = useMemo(() => (visited && visited.size ? allPins.filter(c => visited.has(pinKey(c))) : []), [allPins, visited]);

  // 보이는 핀 — 전체 고정 셋. 선택 핀만 예외로 덧붙임(카카오 보완 검색 결과 등 마스터 밖 구장, 키 중복 방지 체크).
  const visiblePins = useMemo(() => {
    let list = allPins;
    if (sel) {
      const k = sel.kakaoId || sel.name;
      if (!list.some(c => (c.kakaoId || c.name) === k)) list = [...list, sel];
    }
    return list;
  }, [allPins, sel]);

  // 마커 스냅샷 — ★안드 전용. 안드는 커스텀 마커가 최소 1프레임 true로 스냅샷돼야 보이고, 이후 false로 성능 회복.
  //   마스터 로드 완료(477개 일괄 마운트) 시점에만 한 번 돈다 — 477개라 여유 있게 1500ms(FoodMapView와 동일).
  //   iOS는 스냅샷 고정이 '핀 사라짐' 버그의 진원지라 항상 true(라이브 뷰) — Apple Maps는 이 정도 수로 문제없다.
  //   ★선택(sel)에는 반응하지 않는다 — 탭할 때마다 전체 재스냅샷이 크래시 원인.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    if (!_and) return undefined;
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 1500);
    return () => clearTimeout(t);
  }, [master.length]);
  const trackPins = _and ? tracks : true;

  // 핀 로딩 표시(2026-08-27) — 첫 진입 시 마스터 로드+마커 477개 네이티브 생성에 2~3초 걸려
  //   그동안 빈 지도만 보이던 것(사용자). 데이터 없거나 마커가 그려지는 동안 스피너 필을 띄운다.
  //   마커 완료 콜백은 없어 시간 기반: 핀 데이터가 생기고 잠시 뒤(생성 소요 어림) 내림.
  const [pinsShown, setPinsShown] = useState(false);
  useEffect(() => {
    if (!allPins.length) { setPinsShown(false); return undefined; }
    const t = setTimeout(() => setPinsShown(true), _and ? 1800 : 1000);
    return () => clearTimeout(t);
  }, [allPins.length]);

  // 핀 키 → 골프장 — MapView onMarkerPress(identifier)에서 역참조
  const pinIndex = useMemo(() => {
    const m = new Map();
    allPins.forEach(c => m.set(String(c.kakaoId || c.name), c));
    if (sel) m.set(String(sel.kakaoId || sel.name), sel);
    return m;
  }, [allPins, sel]);

  // 내 위치 — 마운트 때 조용히 한 번(거리 표시용). 지도 이동은 버튼 눌렀을 때만(첫 화면은 전국 뷰 유지).
  useEffect(() => { getCurrentLocation().then(l => l && setMyLoc(l)).catch(() => {}); }, []);
  const goMyLoc = async () => {
    let l = myLoc;
    if (!l) { l = await getCurrentLocation().catch(() => null); if (l) setMyLoc(l); }
    if (l) mapRef.current?.animateToRegion({ latitude: l.lat, longitude: l.lng, latitudeDelta: 0.5, longitudeDelta: 0.45 }, 400);
  };

  const goRegion = (r) => {
    setRegionChip(r); setSel(null);
    mapRef.current?.animateToRegion(REGION_CAM[r], 450);
  };

  // 검색 — 디바운스. 마스터 로컬 우선(searchGolfCourses)이라 두 글자면 즉시 뜬다.
  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setResults(await searchGolfCourses(q) || []); } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // 검색 결과 탭 → 지도가 거기로 날아가 핀+카드 (어디 있는지까지 한눈에). 좌표 없으면 바로 상세로.
  const onResultTap = (c) => {
    Keyboard.dismiss(); setSearch(''); setResults([]);
    if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
      setSel(c);
      mapRef.current?.animateToRegion({ latitude: c.y, longitude: c.x, latitudeDelta: 0.35, longitudeDelta: 0.3 }, 450);
    } else onPressCourse?.(c);
  };

  const selRank = sel ? rankMap.get(normalizeCourseName(sel.name)) : null;
  const selDist = sel && myLoc ? distKm(myLoc, { lat: sel.y, lng: sel.x }) : null;

  const pill = { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={PROVIDER_DEFAULT}
        initialRegion={REGION_CAM.전체}
        maxZoomLevel={16}
        minZoomLevel={5.5}      // 대한민국 전도보다 더 못 빠지게 — 전세계가 보이던 것(사용자 2026-08-27)
        rotateEnabled={false}   // 북쪽 고정 — 확대 중 실수로 돌아간 지도를 못 되돌려 헤매는 것 방지(사용자 문의 2026-08-26)
        pitchEnabled={false}    // 기울이기도 잠금 — 탐색 지도는 평면이 명확
        // 팬으로 한반도를 벗어나면 중심을 국내로 되돌림 — state 없이 animate만(핀 리렌더 0 유지)
        onRegionChangeComplete={(r) => {
          const lat = Math.min(Math.max(r.latitude, 32.8), 38.9);
          const lng = Math.min(Math.max(r.longitude, 124.8), 130.5);
          if (Math.abs(lat - r.latitude) > 0.001 || Math.abs(lng - r.longitude) > 0.001) {
            mapRef.current?.animateToRegion({ ...r, latitude: lat, longitude: lng }, 250);
          }
        }}
        onMarkerPress={(e) => { const c = pinIndex.get(String(e?.nativeEvent?.id)); if (c) setSel(c); }}
        onPress={(e) => { if (e?.nativeEvent?.action === 'marker-press') return; setSel(null); }}
        showsUserLocation={false}     // 기본 파란 점 — 전국 뷰에선 핀 사이에 묻혀 있는지도 몰랐음(사용자 2026-09-21) → 아래 전용 마커로
        showsMyLocationButton={false} // 기본 내위치 버튼 — 우리 '내 위치' 필과 중복이라 제거(우상단 겹침 지적 2026-08-27)
        showsCompass={false}          // 나침반 — 회전을 잠갔으니(rotateEnabled false) 무의미, 안내 버튼 아래 겹치던 것 제거
        toolbarEnabled={false}
      >
        {visiblePins.map(c => {
          const k = String(c.kakaoId || c.name);
          return (
            <CoursePin key={k} id={k} lat={c.y} lng={c.x}
              gold={rankMap.has(normalizeCourseName(c.name))}
              track={trackPins} />
          );
        })}

        {/* 다녀온 구장 — 기존 핀 위에 얹는 남색 체크 마커(2026-09-23). 핀 자체는 무변경. */}
        {visitedPins.map(c => { const k = `v-${pinKey(c)}`; return <VisitedPin key={k} id={k} lat={c.y} lng={c.x} />; })}

        {/* 선택 강조 — 정적 핀들 위에 얹는 별도 마커 1개(핀 자체는 안 건드림 → 사라짐·크래시 원천 차단).
            tracksViewChanges 상시 true(1개뿐이라 부담 없음), zIndex로 최상단. */}
        {sel && Number.isFinite(sel.x) && Number.isFinite(sel.y) && (
          <Marker key="sel-highlight" coordinate={{ latitude: sel.y, longitude: sel.x }}
            anchor={{ x: 0.5, y: 0.5 }} zIndex={999} tracksViewChanges>
            <View style={{ width: 32, height: 32, borderRadius: 16,
              backgroundColor: selRank ? GOLD : C.burgundy, borderWidth: 3, borderColor: '#fff',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
              <Icon name="green" size={18} color="#fff" strokeWidth={2.2} />
            </View>
          </Marker>
        )}

        {/* 내 위치 — OS 기본 파란 점 대신 전용 마커(2026-09-21). 네이비 점+흰 테두리+연한 후광, 아래 '내 위치' 라벨.
            전국 뷰에서도 라벨 덕에 바로 찾는다. 선택 강조와 같은 방식의 별도 마커 1개(정적 핀 무변경 규칙 유지),
            tracksViewChanges 상시 true, zIndex 998(선택 강조 바로 아래). identifier 없음 → onMarkerPress에서 무시됨. */}
        {myLoc && Number.isFinite(myLoc.lat) && Number.isFinite(myLoc.lng) && (
          <Marker key="my-loc" coordinate={{ latitude: myLoc.lat, longitude: myLoc.lng }}
            anchor={{ x: 0.5, y: 0.32 }} zIndex={998} tracksViewChanges={Platform.OS === 'ios' ? true : myLocTrack}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(26,61,82,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 15, height: 15, borderRadius: 7.5, backgroundColor: C.navy, borderWidth: 2.5, borderColor: '#fff',
                  shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 3 }} />
              </View>
              <View style={{ marginTop: 1, backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2.5, borderWidth: 1, borderColor: '#fff' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(10.5), color: '#fff' }}>내 위치</Text>
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* 핀 로딩 — 마스터 로드+마커 생성 동안 중앙 필(2~3초 빈 지도 지적, 2026-08-27). 탭 방해 없음.
          이 동안은 마커 477개 네이티브 생성으로 화면 전체가 순간 둔해져, 멈춘 게 아니라 로딩임이
          한눈에 보이게 크게(스피너 36·세로 카드, "너무 작아 멈춘 줄" 지적 2026-08-27) */}
      {!pinsShown && (
        <View pointerEvents="none" style={{ position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.97)',
            borderRadius: 22, paddingHorizontal: 30, paddingVertical: 22,
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
            <Spinner size={36} color={C.navy} />
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14.5), color: C.charcoal }}>골프장을 불러오는 중…</Text>
          </View>
        </View>
      )}

      {/* ── 상단 오버레이: 검색 + 안내 + 목록 토글 — 지도가 상태바 뒤까지 풀블리드라 insets.top 아래에 띄움 ── */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 20, elevation: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.97)',
            borderRadius: 12, paddingHorizontal: 12,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
            <Icon name="search" size={fs(16)} color={C.warmGray} />
            <AppTextInput value={search} onChangeText={setSearch} placeholder="골프장 검색"
              placeholderTextColor={C.warmGray} returnKeyType="search"
              style={{ flex: 1, paddingVertical: _and ? 9 : 11, paddingHorizontal: 8, fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }} />
            {!!search && (
              <TouchableOpacity onPress={() => { setSearch(''); Keyboard.dismiss(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close" size={fs(14)} color={C.warmGray} />
              </TouchableOpacity>
            )}
          </View>
          {/* hitSlop — 지도 마커 생성·카메라 비행 중엔 프레임이 떨어져 작은 필은 탭이 자주 빗나감
              ("한 번에 잘 안 눌림" 2026-08-27). 판정을 넓혀 한 번에 잡히게 */}
          <TouchableOpacity onPress={onSwitchToList} activeOpacity={0.8} style={pill}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 6 }}>
            <Icon name="list" size={fs(15)} color={C.charcoal} strokeWidth={1.9} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>목록</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.8} hitSlop={{ top: 10, bottom: 10, left: 6, right: 8 }}
            onPress={() => showAppAlert('코스 지도 안내',
              '전국 골프장이 핀으로 떠 있어요.\n금색 핀은 100대 코스,\n남색 체크는 내가 다녀온 구장이에요.\n\n핀을 탭하면 카드가 뜨고,\n상세 보기에서 코스 정보·골퍼 코멘트·\n주변 맛집을 볼 수 있어요.',
              [{ text: '확인' }])}
            style={[pill, { paddingHorizontal: 9 }]}>
            <Icon name="book" size={fs(16)} color={C.charcoal} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>

        {/* 검색 결과 패널 — 검색 중일 때만 지도를 덮는 흰 카드 */}
        {!!search.trim() && (
          <View style={{ marginTop: 6, backgroundColor: '#fff', borderRadius: 12, maxHeight: 320, overflow: 'hidden',
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
            {searching && results.length === 0 ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator size="small" color={C.warmGray} /></View>
            ) : results.length === 0 ? (
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, padding: 16, textAlign: 'center' }}>검색 결과가 없어요</Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled">
                {results.slice(0, 12).map((c, i) => {
                  const rk = rankMap.get(normalizeCourseName(c.name));
                  return (
                    <TouchableOpacity key={c.kakaoId || i} onPress={() => onResultTap(c)} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: _and ? 10 : 12,
                        borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                      <Icon name="green" size={fs(17)} color={rk ? GOLD : C.charcoal} strokeWidth={1.8} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text numberOfLines={1} style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>{c.name}</Text>
                        {!!c.loc && <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray, marginTop: 2 }}>{c.loc}</Text>}
                      </View>
                      {rk ? <Text style={{ fontFamily: F.sysB, fontSize: fs(10.5), color: GOLD, marginLeft: 6 }}>100대 {rk}위</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* 지역 칩 — 탭하면 그 지역으로 카메라 이동. 검색 중엔 결과 패널에 가려지지 않게 숨김 */}
        {!search.trim() && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}
            contentContainerStyle={{ gap: 7, paddingRight: 8 }}>
            {REGIONS.map(r => {
              const on = regionChip === r;
              return (
                <TouchableOpacity key={r} onPress={() => goRegion(r)} activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={{ paddingHorizontal: 13, paddingVertical: _and ? 6 : 7, borderRadius: 15,
                    backgroundColor: on ? C.charcoal : 'rgba(255,255,255,0.96)',
                    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 }}>
                  <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(12), color: on ? C.butter : C.charcoal }}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── 하단 오버레이 — 플로팅 탭바(≈insets+66) 위. zIndex/elevation — 지도(네이티브 뷰) 위에서
          탭이 지도로 새 카드만 닫히던 것 방지("상세 보기 작동 안 함" 2026-08-26) ── */}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 78, zIndex: 20, elevation: 20 }}>
        {/* 선택 카드 — 핀 탭 시. 카드 전체 탭=상세 */}
        {sel ? (
          <TouchableOpacity onPress={() => onPressCourse?.(sel)} activeOpacity={0.9}
            style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
              shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <GreenFlag size={fs(30)} />
              <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>{sel.name}</Text>
                {!!sel.loc && <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{sel.loc}</Text>}
              </View>
              {/* 상세 보기 — 카드 전체 탭과 별개로 자체 버튼(중첩 터치 안전망). hitSlop 넉넉히 */}
              <TouchableOpacity onPress={() => onPressCourse?.(sel)} activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                style={{ backgroundColor: C.burgundy, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 8, marginLeft: 8 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#fff' }}>상세 보기</Text>
              </TouchableOpacity>
            </View>
            {/* 칩 줄 — 100대·거리·저장·다녀옴이 다 뜨면 한 줄을 넘어 카드 밖으로 삐져나감 → 줄바꿈(2026-09-28) */}
            {(selRank || selDist != null || savedIds.has(String(sel.kakaoId)) || visited?.get(pinKey(sel))) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 6, marginTop: 9 }}>
                {selRank ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(201,162,39,0.14)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3.5 }}>
                    <Icon name="trophy" size={fs(11)} color={GOLD} />
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: GOLD }}>100대 코스 {selRank}위</Text>
                  </View>
                ) : null}
                {selDist != null ? (
                  <View style={{ backgroundColor: C.bgSecondary, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3.5 }}>
                    <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.charcoal }}>내 위치에서 {selDist < 10 ? selDist.toFixed(1) : Math.round(selDist)}km</Text>
                  </View>
                ) : null}
                {savedIds.has(String(sel.kakaoId)) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(242,180,65,0.16)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3.5 }}>
                    <Icon name="star" size={fs(11)} color="#F2B441" />
                    <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.charcoal }}>저장됨</Text>
                  </View>
                ) : null}
                {/* 다녀온 구장 — 내 기록 횟수·베스트(홈 '나도 가 본 구장'과 같은 계산, 2026-09-23) */}
                {(() => {
                  const v = visited?.get(pinKey(sel));
                  if (!v || !v.count) return null;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(26,61,82,0.12)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3.5 }}>
                      <Icon name="check" size={fs(11)} color={C.navy} strokeWidth={2.4} />
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.navy }}>
                        다녀옴 {v.count}번{v.best != null ? ` · 베스트 ${v.best}타` : ''}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}
          </TouchableOpacity>
        ) : null}

        {/* 좌=내 코스 모아보기 / 우=내 위치 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {onOpenCourseLog ? (
            <TouchableOpacity onPress={onOpenCourseLog} activeOpacity={0.85}
              style={[pill, { backgroundColor: '#5E7E52' }]}>
              <GreenFlag size={fs(18)} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#fff' }}>내 코스 모아보기</Text>
            </TouchableOpacity>
          ) : <View />}
          <TouchableOpacity onPress={goMyLoc} activeOpacity={0.8} style={pill}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Icon name="target" size={fs(15)} color={C.navy} strokeWidth={1.9} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.navy }}>내 위치</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});
