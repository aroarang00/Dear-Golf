import { KAKAO_REST_API_KEY } from '../constants/api';

const KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

const isKeyConfigured = () =>
  KAKAO_REST_API_KEY && KAKAO_REST_API_KEY !== 'YOUR_KAKAO_REST_API_KEY';

// 카카오 로컬 키워드 검색 — 골프장 한정
// 반환: [{ kakaoId, name, loc, x, y, url }]
export async function searchGolfCourses(query) {
  const q = (query || '').trim();
  if (!q) return [];
  if (!isKeyConfigured()) {
    console.warn('[kakao] KAKAO_REST_API_KEY not configured. src/constants/api.js 참고.');
    return [];
  }
  try {
    // "골프" 키워드를 강제로 붙여 골프장만 검색되게
    const fullQ = /(골프|골프장|cc|CC|컨트리클럽)/.test(q) ? q : q + ' 골프장';
    const url = `${KEYWORD_URL}?query=${encodeURIComponent(fullQ)}&size=15`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) {
      console.warn('[kakao] HTTP', res.status);
      return [];
    }
    const data = await res.json();
    // 카카오는 category_group_code를 골프장에 안 줘서, category_name으로 필터
    // ex) "스포츠,레저 > 골프 > 골프장"
    return (data.documents || [])
      .filter(d => (d.category_name || '').includes('골프장'))
      .map(d => ({
        kakaoId: d.id,
        name: d.place_name,
        loc: d.road_address_name || d.address_name || '',
        x: parseFloat(d.x), // 경도(longitude)
        y: parseFloat(d.y), // 위도(latitude)
        url: d.place_url,
      }));
  } catch (e) {
    console.warn('[kakao] search failed:', e?.message);
    return [];
  }
}
