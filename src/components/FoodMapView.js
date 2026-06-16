import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { F, fs } from '../constants/colors';

// 줌 범위 제한 — 과도한 확대/축소로 미니맵이 '깨진 것처럼' 보이는 상태를 애초에 차단.
//   minZoomLevel=10(시/군 수준)~maxZoomLevel=17(건물 수준). 골프장+반경 3km 맛집을 보기에 충분한 범위.
const MIN_ZOOM = 10;
const MAX_ZOOM = 17;

// 안드는 구글맵 키(Maps SDK for Android) 없이 MapView를 올리면 네이티브 크래시가 난다.
//   빌드 시점에 EXPO_PUBLIC_GOOGLE_MAPS_API_KEY가 비어 있으면 지도를 띄우지 않고 폴백으로 떨어뜨려 앱을 보호한다.
//   (iOS는 Apple Maps라 키 불필요. 키 등록 + 재빌드 시 이 가드를 통과해 자동으로 실제 지도로 전환됨.)
const GMAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const ANDROID_MAP_UNAVAILABLE = Platform.OS === 'android' && !GMAPS_KEY;

// 맛집 인터랙티브 지도 — 골프장 중심 + 추천 맛집 + 저장 맛집 마커. 팬·줌·마커 탭(정보 말풍선).
//   네이티브 react-native-maps (iOS=Apple Maps, 안드=구글맵). 마커 좌표는 카카오 FD6 WGS84(x=경도,y=위도) 직접.
//   히스토리: 카카오맵 WebView 임베드(불안정) → 네이버 정적지도(자리만 채우는 썸네일) → 이걸로 인터랙티브 복귀.
//   카카오맵 SDK(@react-native-kakao/map 2.2.7)는 카카오 패밀리 2.4.5와 버전 충돌이라 react-native-maps 채택. ([[food-map-interactive]])
//   ⚠️ 안드는 EXPO_PUBLIC_GOOGLE_MAPS_API_KEY(GCP Maps SDK for Android) 필요 — 없으면 빈 지도가 아니라 네이티브 크래시(위 가드로 폴백 처리).
const validPos = (arr) => (arr || []).filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.y));

// onMarkerPress(item) — 맛집 마커의 말풍선(이름·거리)을 탭하면 호출. 호출부에서 네이버 지도 등으로 연결.
export function FoodMapView({ courseCoord, courseName, nearby = [], saved = [], height = 210, onMarkerPress }) {
  // 안드: 커스텀 마커 View는 tracksViewChanges=true로 최소 1프레임 비트맵 스냅샷돼야 보인다.
  //   처음부터 false면 빈 마커로 안 뜨는 react-native-maps 안드 버그 → 잠깐 true 후 false(성능 회복).
  //   마커 셋이 바뀌면(주변맛집 async 로드·코스 변경) 다시 true→false. (hook은 early return 위에 무조건 호출)
  const [tracksMarkers, setTracksMarkers] = useState(true);
  const mapRef = useRef(null);
  // 사용자가 줌·팬으로 초기 위치/배율에서 벗어났는지. 벗어났을 때만 좌하단 리셋 버튼 노출(평소엔 깔끔).
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    setTracksMarkers(true);
    setMoved(false); // 코스가 바뀌면 새 중심이 기준이 되므로 리셋 버튼 숨김
    const t = setTimeout(() => setTracksMarkers(false), 1500);
    return () => clearTimeout(t);
  }, [nearby?.length, saved?.length, courseCoord?.x, courseCoord?.y]);

  // 골프장 좌표 없으면 호출부가 폴백 처리 (정적 안내)
  if (!courseCoord || !Number.isFinite(courseCoord.x) || !Number.isFinite(courseCoord.y)) {
    return null;
  }

  // 안드 구글맵 키 없음 → MapView를 올리지 않고 폴백(크래시 방지). 아래 '네이버지도' 버튼으로 위치 확인 가능.
  if (ANDROID_MAP_UNAVAILABLE) {
    return (
      <View style={[st.fallback, { height }]}>
        <Text style={st.fallbackIcon}>🗺️</Text>
        <Text style={[st.fallbackTxt, { fontFamily: F.sysSb, fontSize: fs(13) }]}>지도는 곧 제공될 예정이에요</Text>
        <Text style={[st.fallbackSub, { fontFamily: F.sys, fontSize: fs(11) }]}>아래 네이버지도로{'\n'}주변 맛집 위치를 확인할 수 있어요</Text>
      </View>
    );
  }
  const recPins = validPos(nearby).slice(0, 12);   // 추천 맛집 — 주황 (정적지도와 동일 상한)
  const savedPins = validPos(saved).slice(0, 10);   // 저장 맛집 — 노랑

  // 초기 화면 — 골프장 중심. 리셋 버튼이 되돌릴 목표 지점이기도 함.
  //   0.06(≈3km 반경)은 너무 넓어 핀이 가운데로 몰려 보였음 → 0.04로 당겨 핀을 퍼뜨림(사용자 2026-06-17, 안드·iOS 공통).
  const HOME_REGION = {
    latitude: courseCoord.y,
    longitude: courseCoord.x,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  };

  // 현재 화면이 초기 위치/배율에서 의미 있게 벗어났는지 판정 → 리셋 버튼 노출 여부.
  //   온갖 미세 흔들림에 버튼이 깜빡이지 않도록 중심 0.004°(약 400m)·배율 25% 임계치.
  const isAwayFromHome = (r) => {
    if (!r) return false;
    const dCenter = Math.abs(r.latitude - HOME_REGION.latitude) + Math.abs(r.longitude - HOME_REGION.longitude);
    const dZoom = Math.abs(r.latitudeDelta - HOME_REGION.latitudeDelta) / HOME_REGION.latitudeDelta;
    return dCenter > 0.004 || dZoom > 0.25;
  };

  const recenter = () => {
    mapRef.current?.animateToRegion(HOME_REGION, 350);
    setMoved(false);
  };

  return (
    <View style={{ width: '100%', height, position: 'relative' }}>
    <MapView
      ref={mapRef}
      style={{ width: '100%', height }}
      provider={PROVIDER_DEFAULT}
      minZoomLevel={MIN_ZOOM}
      maxZoomLevel={MAX_ZOOM}
      onRegionChangeComplete={(r) => setMoved(isAwayFromHome(r))}
      initialRegion={HOME_REGION}
    >
      {/* 골프장 — 버건디 큰 핀 */}
      <Marker
        coordinate={{ latitude: courseCoord.y, longitude: courseCoord.x }}
        title={courseName || '골프장'}
        tracksViewChanges={tracksMarkers}
      >
        <View style={[st.pin, st.coursePin]}><Text style={st.pinTxt}>⛳</Text></View>
      </Marker>

      {/* 골퍼 추천 맛집 — 주황 핀 */}
      {recPins.map((r, i) => (
        <Marker
          key={`rec-${r.kakaoId || r.name || i}`}
          coordinate={{ latitude: r.y, longitude: r.x }}
          title={r.name || '맛집'}
          description={`추천 맛집${Number.isFinite(r.distance) ? ` · ${Math.round(r.distance)}m` : ''}`}
          onCalloutPress={() => onMarkerPress?.(r)}
          tracksViewChanges={tracksMarkers}
          anchor={{ x: 0.5, y: 1 }}
        >
          {/* 동그라미 없이 핀 모양만 — 앵커 바닥=좌표에 핀 끝 (사용자 2026-06-16) */}
          <Text style={st.mapPin}>📍</Text>
        </Marker>
      ))}

      {/* 내 저장 맛집 — 노랑 핀 (메모 있으면 말풍선에 표시) */}
      {savedPins.map((sv, i) => (
        <Marker
          key={`saved-${sv.kakaoId || sv.name || i}`}
          coordinate={{ latitude: sv.y, longitude: sv.x }}
          title={sv.name || '저장한 맛집'}
          description={`⭐ 저장한 맛집${sv.memo ? ` · ${sv.memo}` : ''}`}
          onCalloutPress={() => onMarkerPress?.(sv)}
          tracksViewChanges={tracksMarkers}
        >
          {/* 동그라미 없이 별표만 (사용자 2026-06-16) */}
          <Text style={st.mapStar}>⭐</Text>
        </Marker>
      ))}
    </MapView>

    {/* 좌하단 리셋 — 지도를 움직였을 때만 노출. 탭하면 골프장 중심·기본 배율로 부드럽게 복귀.
        (우하단 '네이버지도' 버튼과 반대쪽 코너라 겹치지 않음) */}
    {moved && (
      <TouchableOpacity
        onPress={recenter}
        activeOpacity={0.8}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={st.resetBtn}
      >
        <Text style={st.resetIcon}>↺</Text>
        <Text style={st.resetTxt}>원위치</Text>
      </TouchableOpacity>
    )}
    </View>
  );
}

const st = StyleSheet.create({
  pin: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  coursePin: { backgroundColor: '#6B1E2A', width: 34, height: 34, borderRadius: 17 }, // 골프장 버건디(정적지도 핀 색 유지)
  pinTxt: { fontSize: 14 },
  mapPin: { fontSize: 34 },    // 추천 맛집 — 동그라미 없이 핀 이모지
  mapStar: { fontSize: 30 },   // 저장 맛집 — 동그라미 없이 별표
  // 좌하단 리셋 버튼 — 흰 배경 캡슐(네이버 초록 버튼과 톤 분리, 보조 액션 인상)
  resetBtn: {
    position: 'absolute', bottom: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  resetIcon: { fontSize: fs(13), color: '#3A3A3A', fontFamily: F.sysSb },
  resetTxt: { fontSize: fs(11), color: '#3A3A3A', fontFamily: F.sysSb },
  // 안드 키 없을 때 폴백 — 의도된 안내 화면(빈 회색 박스 방지)
  fallback: {
    width: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EEF1F0', paddingHorizontal: 20,
  },
  fallbackIcon: { fontSize: 26, marginBottom: 8 },
  fallbackTxt: { color: '#3A3A3A', marginBottom: 4 },
  fallbackSub: { color: '#7A7A7A', textAlign: 'center', lineHeight: 16 },
});
