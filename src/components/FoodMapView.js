import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

// 맛집 인터랙티브 지도 — 골프장 중심 + 추천 맛집 + 저장 맛집 마커. 팬·줌·마커 탭(정보 말풍선).
//   네이티브 react-native-maps (iOS=Apple Maps, 안드=구글맵). 마커 좌표는 카카오 FD6 WGS84(x=경도,y=위도) 직접.
//   히스토리: 카카오맵 WebView 임베드(불안정) → 네이버 정적지도(자리만 채우는 썸네일) → 이걸로 인터랙티브 복귀.
//   카카오맵 SDK(@react-native-kakao/map 2.2.7)는 카카오 패밀리 2.4.5와 버전 충돌이라 react-native-maps 채택. ([[food-map-interactive]])
//   ⚠️ 안드는 EXPO_PUBLIC_GOOGLE_MAPS_API_KEY(GCP Maps SDK for Android) 필요 — 없으면 빈 지도.
const validPos = (arr) => (arr || []).filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.y));

export function FoodMapView({ courseCoord, courseName, nearby = [], saved = [], height = 210 }) {
  // 골프장 좌표 없으면 호출부가 폴백 처리 (정적 안내)
  if (!courseCoord || !Number.isFinite(courseCoord.x) || !Number.isFinite(courseCoord.y)) {
    return null;
  }
  const recPins = validPos(nearby).slice(0, 12);   // 추천 맛집 — 주황 (정적지도와 동일 상한)
  const savedPins = validPos(saved).slice(0, 10);   // 저장 맛집 — 노랑

  return (
    <MapView
      style={{ width: '100%', height }}
      provider={PROVIDER_DEFAULT}
      initialRegion={{
        latitude: courseCoord.y,
        longitude: courseCoord.x,
        latitudeDelta: 0.06,   // 반경 약 3km가 보이는 수준 (정적지도 level 12 대응)
        longitudeDelta: 0.06,
      }}
    >
      {/* 골프장 — 버건디 큰 핀 */}
      <Marker
        coordinate={{ latitude: courseCoord.y, longitude: courseCoord.x }}
        title={courseName || '골프장'}
        tracksViewChanges={false}
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
          tracksViewChanges={false}
        >
          <View style={[st.pin, st.recPin]}><Text style={st.pinTxt}>📍</Text></View>
        </Marker>
      ))}

      {/* 내 저장 맛집 — 노랑 핀 (메모 있으면 말풍선에 표시) */}
      {savedPins.map((sv, i) => (
        <Marker
          key={`saved-${sv.kakaoId || sv.name || i}`}
          coordinate={{ latitude: sv.y, longitude: sv.x }}
          title={sv.name || '저장한 맛집'}
          description={`⭐ 저장한 맛집${sv.memo ? ` · ${sv.memo}` : ''}`}
          tracksViewChanges={false}
        >
          <View style={[st.pin, st.savedPin]}><Text style={st.pinTxt}>⭐</Text></View>
        </Marker>
      ))}
    </MapView>
  );
}

const st = StyleSheet.create({
  pin: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  coursePin: { backgroundColor: '#6B1E2A', width: 34, height: 34, borderRadius: 17 }, // 골프장 버건디(정적지도 핀 색 유지)
  recPin: { backgroundColor: '#FF7A00' },   // 추천 주황
  savedPin: { backgroundColor: '#FFCC00' }, // 저장 노랑
  pinTxt: { fontSize: 14 },
});
