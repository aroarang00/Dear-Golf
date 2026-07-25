// (정적 지도 인증 헤더 NAVER_MAP_HEADERS는 어디서도 미사용이라 삭제 — 2026-07-02 감사.
//  이 파일은 외부 네이버지도 검색 URL 생성 전용, 앱 내 네이버 API 호출 없음.)

// 네이버 지도 검색 — 이름만 쓰면 동명 다른 지역(예: 양주 연습장 → 포항)으로 빠진다.
//   loc(주소)에서 지역 토큰을 함께 실어 지역을 고정([[course-matching-accuracy]]). GuideScreen·CourseExploreTab 공용.
//   ([[region-classification]] '파서 3곳 중복' TODO 중 네이버 검색용 토큰을 여기로 통합)
export function cityTokenOf(loc) {
  const tokens = String(loc || '').trim().split(/\s+/);
  for (const t of tokens) {
    if (/(특별시|광역시|특별자치시|특별자치도|도)$/.test(t)) continue; // 광역 단위 제외
    if (/[시군구]$/.test(t)) return t;                                  // 시/군/구 우선
  }
  for (const t of tokens) {
    if (/[읍면]$/.test(t)) return t;                                    // 없으면 읍/면
  }
  return '';
}
// 카카오 풀주소면 시/군/구, COURSE_LOG 축약형('경기 용인')이면 추출 실패 → loc 전체로 폴백.
export function regionOf(loc) {
  return cityTokenOf(loc) || String(loc || '').trim();
}
export function naverSearchUrl(name, loc, extra = '') {
  const q = [name, regionOf(loc), extra].filter(Boolean).join(' ');
  return `https://map.naver.com/v5/search/${encodeURIComponent(q)}`;
}

// 주소에서 '가장 좁은 행정구역'(동/읍/면 우선 → 구 → 시/군) 하나를 뽑는다 — 구장 주변 맛집을 좁게 잡기 위함.
export function localAreaOf(loc) {
  const tokens = String(loc || '').trim().split(/\s+/);
  for (const t of tokens) if (/[동읍면]$/.test(t)) return t;   // 가장 좁은 행정동 우선
  for (const t of tokens) if (/구$/.test(t)) return t;         // 그다음 구
  for (const t of tokens) if (/[시군]$/.test(t)) return t;     // 그다음 시/군
  return '';
}

// 구장 '주변 맛집'을 네이버에서 '리스트'로 열기 — 검색어는 '○○면(동) 맛집' (지역+카테고리).
//   ★구장명을 검색어에 넣으면(‘구장명 맛집’·‘구장명 지역 맛집’) 구장 POI로 강하게 매칭돼 단일 장소로 열린다
//     (청백산가든·힐마루골프 버그). 그래서 구장명은 빼고 '행정구역 + 맛집'만 쓴다 → 항상 리스트.
//   행정구역은 되도록 좁게(읍/면/동) 잡아 구장 근처가 나오게. 없으면 시/군 → 전체 주소 순으로 폴백.
// WGS84(경도 lng, 위도 lat) → EPSG:3857(Web Mercator) — 네이버 지도 v5 'c'(중심) 파라미터가 요구하는 좌표계.
function toWebMercator(lng, lat) {
  const R = 20037508.34;
  const x = (lng * R) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * R) / 180;
  return { x, y };
}

// 구장 '주변 맛집' 리스트 — 우선순위:
//   ① 좌표(coord{x:경도,y:위도})가 있으면 그 좌표를 지도 중심으로 '맛집' 검색 → 주소 없어도 구장 근처 리스트 (가장 정확).
//   ② 좌표 없으면 주소의 행정구역(읍/면/동) + 맛집.
//   ③ 그것도 없으면 구장명 폴백.
//   ★구장명을 검색어에 넣으면 구장 POI로 빠져 단일 장소가 열림(청백산가든·힐마루 버그)이라 ①②를 우선.
export function naverFoodListUrl(loc, fallbackName = '', coord = null) {
  if (coord && Number.isFinite(coord.x) && Number.isFinite(coord.y)) {
    const { x, y } = toWebMercator(coord.x, coord.y);
    return `https://map.naver.com/v5/search/${encodeURIComponent('맛집')}?c=${x.toFixed(2)},${y.toFixed(2)},15,0,0,0,dh`;
  }
  const area = localAreaOf(loc) || regionOf(loc);
  const q = area ? `${area} 맛집` : (fallbackName ? `${fallbackName} 맛집` : '맛집');
  return `https://map.naver.com/v5/search/${encodeURIComponent(q)}`;
}
