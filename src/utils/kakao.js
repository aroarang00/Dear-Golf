import { KAKAO_REST_API_KEY } from '../constants/api';

const KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const ADDRESS_URL = 'https://dapi.kakao.com/v2/local/search/address.json';

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

// 주소 문자열 → 좌표 (x=경도, y=위도). 실패 시 null.
// 1차: 주소 검색 API, 0건이면 키워드 검색으로 폴백.
export async function addressToCoord(address) {
  const q = (address || '').trim();
  if (!q) return null;
  if (!isKeyConfigured()) {
    console.warn('[kakao] KAKAO_REST_API_KEY not configured.');
    return null;
  }
  const headers = { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` };
  try {
    const addrRes = await fetch(`${ADDRESS_URL}?query=${encodeURIComponent(q)}&size=1`, { headers });
    if (addrRes.ok) {
      const data = await addrRes.json();
      const d = data.documents?.[0];
      if (d) return { x: parseFloat(d.x), y: parseFloat(d.y) };
    } else {
      console.warn('[kakao] address HTTP', addrRes.status);
    }
    // 폴백: 키워드 검색 (도로명/지번 매칭 실패 케이스)
    const kwRes = await fetch(`${KEYWORD_URL}?query=${encodeURIComponent(q)}&size=1`, { headers });
    if (!kwRes.ok) { console.warn('[kakao] keyword fallback HTTP', kwRes.status); return null; }
    const kwData = await kwRes.json();
    const k = kwData.documents?.[0];
    if (!k) return null;
    return { x: parseFloat(k.x), y: parseFloat(k.y) };
  } catch (e) {
    console.warn('[kakao] addressToCoord failed:', e?.message);
    return null;
  }
}
