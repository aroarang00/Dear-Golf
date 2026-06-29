import {
  NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET,
} from '../constants/api';

// 네이버 정적 지도 이미지를 RN <Image>로 불러올 때 함께 넘길 인증 헤더
//  사용: <Image source={{ uri, headers: NAVER_MAP_HEADERS }} />
export const NAVER_MAP_HEADERS = {
  'x-ncp-apigw-api-key-id': NAVER_MAP_CLIENT_ID,
  'x-ncp-apigw-api-key': NAVER_MAP_CLIENT_SECRET,
};

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
