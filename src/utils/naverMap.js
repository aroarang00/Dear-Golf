import {
  NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET, NAVER_STATIC_MAP_URL,
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

// 마커 파라미터 1개 생성 — 값 전체를 인코딩해야 RN URL 처리에서 안전
const markerParam = (parts) => 'markers=' + encodeURIComponent(parts.join('|'));

// 좌표가 유효한 항목만
const validPos = (arr) => (arr || []).filter(s => Number.isFinite(s.x) && Number.isFinite(s.y));

// 골프장 + 골퍼 추천 맛집 + 내 저장 맛집 마커가 찍힌 네이버 정적 지도 URL 생성
//  center : { x: 경도, y: 위도 }  — 골프장 (큰 버건디 핀)
//  nearby : [{ x, y }]            — 골퍼 추천 맛집 (주황색 핀, 최대 12)
//  saved  : [{ x, y }]            — 내 저장 맛집 (노란색 핀, 최대 10)
//  level  : 줌 레벨 (기본 12 — 반경 3km가 잘 보이는 수준)
//  좌표가 없으면 null 반환
export function buildFoodMapUrl(center, nearby = [], saved = [], { w = 360, h = 200, level = 12 } = {}) {
  if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) return null;
  const nearbyPins = validPos(nearby).slice(0, 12);
  const savedPins  = validPos(saved).slice(0, 10);
  const params = [
    `w=${w}`, `h=${h}`,
    `center=${center.x},${center.y}`,
    `level=${level}`,
    'scale=2',
    'format=png',
    // 골프장 — 큰 버건디 핀
    markerParam(['type:d', 'size:mid', 'color:0x6B1E2A', `pos:${center.x} ${center.y}`]),
  ];
  // 골퍼 추천 맛집 — 주황색 핀
  // ※ 한 markers 파라미터에 pos 좌표를 여러 개 넣으면 네이버는 첫 1개만 렌더링함 →
  //   좌표마다 별도 markers 파라미터로 추가해야 모두 표시됨
  nearbyPins.forEach(s => {
    params.push(markerParam(['type:d', 'size:small', 'color:0xFF7A00', `pos:${s.x} ${s.y}`]));
  });
  // 내 저장 맛집 — 노란색 핀
  savedPins.forEach(s => {
    params.push(markerParam(['type:d', 'size:small', 'color:0xFFCC00', `pos:${s.x} ${s.y}`]));
  });
  return `${NAVER_STATIC_MAP_URL}?${params.join('&')}`;
}
