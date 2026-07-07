import * as Location from 'expo-location';

// 위치 권한 + 현재 좌표 반환 (실패 시 null)
// 1) 마지막 알려진 위치 우선 (즉시 응답) — 10분 이내면 그대로 사용
// 2) 캐시 없으면 Lowest 정확도로 새 fix 시도 — timeoutMs 안에 응답 못 받으면 fail
// 3) 새 fix 실패 시 maxAge 무관 last-known으로 fallback (몇 시간 전이라도 시군구 단위면 날씨용 충분)
// 4) 그것도 없으면 null
//
// timeoutMs 추가 이유: expo-location의 getCurrentPositionAsync는 명시적 타임아웃 없으면
// 실내·GPS 약한 환경에서 무한 대기 가능 — 사용자가 "안 뜬다"고 인식하는 원인.
export async function getCurrentLocation(timeoutMs = 8000) {
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
    // 새 fix — 타임아웃 보호
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('location-timeout')), timeoutMs)),
    ]).catch(e => {
      console.warn('[location] fix failed:', e?.message);
      return null;
    });
    if (pos) {
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }
    // 타임아웃·실패 시 stale last-known으로 fallback (maxAge 제한 없음)
    const stale = await Location.getLastKnownPositionAsync();
    if (stale) {
      console.warn('[location] using stale last-known');
      return { lat: stale.coords.latitude, lng: stale.coords.longitude };
    }
    return null;
  } catch (e) {
    console.warn('[location] failed:', e?.message);
    return null;
  }
}

// 위치 권한만 요청 (OS 팝업) — 좌표는 수집하지 않음.
//   온보딩 인트로는 LBS 약관 동의 '전' 단계라, 여기서 getCurrentLocation으로 GPS fix를 받으면
//   '동의 없이 위치 수집' 소지가 생김. 권한만 미리 받아두고 실제 좌표 수집은 동의 이후 기능에서.
export async function requestLocationPermission() {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
    }
    return status === 'granted';
  } catch {
    return false;
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
// timeoutMs: iOS의 reverseGeocodeAsync는 Apple 지오코더를 쓰는데 호출이 잦으면 강하게 rate-limit돼
//   응답이 무한 지연(hang)될 수 있다. 타임아웃이 없으면 이걸 await하는 날씨 fetch가 통째로 멈춰
//   '빙글빙글 무한 로딩'이 됐다(간헐적). loc은 부가데이터(중기예보·미세먼지·자외선)용일 뿐 —
//   현재 기온 등 실제 날씨는 좌표만으로 받으므로, 지오코더가 느리면 ''로 폴백해 파이프라인을 계속 진행시킨다.
export async function reverseGeocode(lat, lng, timeoutMs = 6000) {
  try {
    const results = await Promise.race([
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('geocode-timeout')), timeoutMs)),
    ]);
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
