import * as Location from 'expo-location';

// 위치 권한 + 현재 좌표 반환 (실패 시 null)
// 1) 마지막 알려진 위치 우선 (즉시 응답) — 10분 이내면 그대로 사용
// 2) 캐시 없으면 Lowest 정확도로 빠르게 fetch (시군구 단위면 충분)
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
    const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
    if (last) {
      return { lat: last.coords.latitude, lng: last.coords.longitude };
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    };
  } catch (e) {
    console.warn('[location] failed:', e?.message);
    return null;
  }
}

// 현재 위치 권한이 허용 상태인지만 확인 (OS 팝업 없음)
export async function hasLocationPermission() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// 역지오코딩 (좌표 → 주소 텍스트) — 중기예보 지역코드 매핑용
export async function reverseGeocode(lat, lng) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const r = results?.[0];
    if (!r) return '';
    // 예: "서울특별시 강남구" 또는 "경기도 용인시"
    // 광역시는 region=city로 중복 반환되는 케이스가 있어 연속 중복 제거
    const parts = [r.region, r.city, r.district].filter(Boolean);
    return parts.filter((p, i) => p !== parts[i - 1]).join(' ');
  } catch (e) {
    console.warn('[location] reverseGeocode failed:', e?.message);
    return '';
  }
}
