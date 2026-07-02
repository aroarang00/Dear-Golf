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
