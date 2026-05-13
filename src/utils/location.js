import * as Location from 'expo-location';

// 위치 권한 + 현재 좌표 반환 (실패 시 null)
export async function getCurrentLocation() {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      console.warn('[location] permission denied');
      return null;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
  } catch (e) {
    console.warn('[location] failed:', e?.message);
    return null;
  }
}

// 역지오코딩 (좌표 → 주소 텍스트) — 중기예보 지역코드 매핑용
export async function reverseGeocode(lat, lng) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = results?.[0];
    if (!r) return '';
    // 예: "서울특별시 강남구" 또는 "경기도 용인시"
    return [r.region, r.city, r.district].filter(Boolean).join(' ');
  } catch (e) {
    console.warn('[location] reverseGeocode failed:', e?.message);
    return '';
  }
}
