import { KAKAO_REST_API_KEY } from '../constants/api';
import { normalizeCourseName } from './top100';

// 검색에서 숨길 '대표(엄브렐러)' 골프장 — 건별로 등록한 구장만 (정규화 base 기준).
// 카카오가 올드/듄스 코스를 따로 주면서 리조트 대표명까지 같이 줘 헷갈리는 경우에만 사용.
// 새 케이스 발견 시 base 한 줄씩 추가. (일괄 규칙은 구장별 편차로 오류 위험 → 큐레이션 방식)
//   라비에벨: '라비에벨 골프앤리조트' 숨김, '올드코스'·'듄스코스'는 그대로 노출
export const HIDDEN_UMBRELLA_BASES = ['라비에벨'];

// 골프장 이름에 섞여 들어오는 비(非)코스 잡항목 — 클럽하우스·연습장·스크린골프(골프존) 등. 카카오 결과·로컬 기록 공용 필터.
// ★ '골프존'은 스크린골프 브랜드라 거르되, 실제 골프장 체인 '골프존카운티'(전국 20여 구장)는
//   (?!카운티) lookahead로 살린다 — 이걸 빼면 골프존카운티 전 구장이 검색에서 통째로 누락됨.
export const NON_COURSE_NAME_RE = /(연습장|스크린|실내골프|아카데미|레슨|교습|교실|골프존(?!카운티)|클럽하우스)/;

// 등록된 구장에 한해, 같은 base의 실제 코스(○○코스)가 함께 잡혔을 때만 대표명을 결과에서 뺀다.
//  - 코스 형제가 없으면(예: 힐마루는 '힐마루 골프앤리조트' 단일 entry) 건드리지 않음
//  - 대표명만 단독으로 잡힌 경우도 안전하게 유지(빈 결과 방지)
function hideCuratedUmbrellas(arr) {
  if (!HIDDEN_UMBRELLA_BASES.length) return arr;
  const baseHasCourse = {};
  arr.forEach(r => {
    if (/코스/.test(r.name || '')) baseHasCourse[normalizeCourseName(r.name)] = true;
  });
  return arr.filter(r => {
    const base = normalizeCourseName(r.name);
    const isUmbrella = !/코스/.test(r.name || '') && baseHasCourse[base];
    return !(isUmbrella && HIDDEN_UMBRELLA_BASES.includes(base));
  });
}

const KEYWORD_URL  = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const ADDRESS_URL  = 'https://dapi.kakao.com/v2/local/search/address.json';
const CATEGORY_URL = 'https://dapi.kakao.com/v2/local/search/category.json';
const DIRECTIONS_URL = 'https://apis-navi.kakaomobility.com/v1/directions'; // 카카오모빌리티 자동차 길찾기

const isKeyConfigured = () =>
  KAKAO_REST_API_KEY && KAKAO_REST_API_KEY !== 'YOUR_KAKAO_REST_API_KEY';

// 카카오 로컬 키워드 검색 — 골프장 한정 (로컬 마스터 검색의 폴백 프리미티브)
// 진입점은 utils/golfCourses.js의 searchGolfCourses(로컬 우선). 여기는 마스터에 없을 때만 호출됨.
// 반환: [{ kakaoId, name, loc, x, y, url }]
export async function searchGolfCoursesKakao(query) {
  const q = (query || '').trim();
  if (!q) return [];
  if (!isKeyConfigured()) {
    console.warn('[kakao] KAKAO_REST_API_KEY not configured. src/constants/api.js 참고.');
    return [];
  }

  // 골프장만 남기는 필터 — 카카오 분류의 마지막 항목이 '골프장/컨트리클럽'인 곳만 통과.
  //  ex) "스포츠,레저 > 골프 > 골프장" → 통과
  //  연습장·교습소·아카데미·스크린골프·골프용품·골프레슨 강사 등은 분류가 달라 자동 제외.
  //  (블랙리스트 방식은 '교습소' 등 빠진 분류가 계속 새서 화이트리스트로 전환)
  const isGolfCourse = (d) => {
    const cat = d.category_name || '';
    const name = d.place_name || '';
    const last = cat.split('>').pop().trim();
    // '스포츠,레저 > 골프'로만 끝난 본체(last==='골프')도 인정 — 세부 '골프장' 분류 없이 등록돼
    //   누락되던 CC 구제(예: 경남스카이뷰컨트리클럽). '골프'는 정확 단독일 때만 —
    //   '골프연습장·스크린골프·골프용품'은 last가 그 단어라 그대로 제외. 골프텔(숙박)·주차장·충전소도 분류가 달라 제외.
    if (!/(골프장|컨트리클럽)/.test(last) && last !== '골프') return false;
    // 분류가 골프장으로 잘못 등록된 레슨·교습 + 같은 구장 '클럽하우스' 중복 항목 보조 차단
    if (NON_COURSE_NAME_RE.test(name)) return false;
    return true;
  };

  // 키워드 검색 — pages 페이지까지(페이지당 15건) 모아 골프장만 반환.
  // 짧은 글자(2글자)로 검색해도 결과가 15건 밖으로 밀리지 않도록 여러 페이지를 본다.
  const runQuery = async (qstr, pages = 1) => {
    const docs = [];
    for (let p = 1; p <= pages; p++) {
      const url = `${KEYWORD_URL}?query=${encodeURIComponent(qstr)}&size=15&page=${p}`;
      let res;
      try {
        res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
      } catch (e) { break; }
      if (!res.ok) { if (p === 1) console.warn('[kakao] HTTP', res.status); break; }
      const data = await res.json();
      const page = data.documents || [];
      docs.push(...page);
      if (data.meta?.is_end || page.length < 15) break;
    }
    return docs
      .filter(d => isGolfCourse(d))
      .map(d => ({
        kakaoId: d.id,
        name: d.place_name,
        loc: d.road_address_name || d.address_name || '',
        x: parseFloat(d.x), // 경도(longitude)
        y: parseFloat(d.y), // 위도(latitude)
        url: d.place_url,
      }));
  };

  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter(r => {
      if (!r.kakaoId || seen.has(r.kakaoId)) return false;
      seen.add(r.kakaoId);
      return true;
    });
  };

  try {
    const hasGolfWord = /(골프|gc|cc|컨트리클럽|country\s*club)/i.test(q);
    let results;
    if (hasGolfWord) {
      // 이미 골프 관련어가 있으면 입력어 그대로 (예: "동촌cc")
      results = dedupe(await runQuery(q, 3));
    } else {
      // 골프장 이름은 'CC·GC·컨트리클럽'으로 끝나는 곳이 많다. 이름 한 단어("동촌")만
      // 쳐도, 카카오 검색에선 동명 지명에 밀려 골프장이 안 뜬다. → 입력어 + 골프 접미어
      // 변형을 함께 검색해 합친다. ("동촌" → "동촌cc"가 동촌CC를 찾아냄)
      const lists = await Promise.all([
        runQuery(q, 2),
        runQuery(q + 'cc', 1),
        runQuery(q + 'gc', 1),
        runQuery(q + ' 컨트리클럽', 1),
        runQuery(q + ' 골프장', 1),
      ]);
      results = dedupe(lists.flat());
    }
    if (results.length === 0) {
      // 폴백: 'GC/CC/골프클럽' 약어를 떼고 재검색 (예: 킹스데일GC → 킹스데일)
      const bare = q.replace(/\s*(g\.?\s*c|c\.?\s*c|골프클럽|컨트리클럽|골프장|골프)\s*$/i, '').trim();
      if (bare && bare !== q) results = dedupe(await runQuery(bare, 3));
    }
    // 관련성 필터 — 변형 쿼리('일동cc','일동 골프장')를 카카오가 느슨히 해석해 'cc/골프장' 맞는 인기
    //   구장을 끌어와 이름·주소 모두 무관한 게 섞이는 문제(예: '일동'에 안산 '제일CC').
    //   골프 접미어 뗀 핵심어가 '이름 OR 주소(loc)에 포함된 것만' 남긴다. 이로써:
    //   - '포천'(지역) → 포천힐스(이름)·포레스트힐(주소 포천) 둘 다 유지
    //   - '포천힐'(구체) → 포천힐스만(포레스트힐은 주소 '포천시'에도 '포천힐' 없음 → 제외)
    //   - '일동' → 일동레이크만(제일CC는 이름·주소 둘 다 무관 → 제외)
    //   순위: 이름 시작일치 > 이름 포함 > 주소만 매칭. 매칭 0이면 폴백 전체 유지([[course-matching-accuracy]]).
    const core = q.replace(/\s*(g\.?\s*c|c\.?\s*c|골프클럽|컨트리클럽|골프장|골프)\s*$/i, '').trim() || q;
    const rel = results.filter(r => (r.name || '').includes(core) || (r.loc || '').includes(core));
    const rank = (r) => {
      const n = r.name || '';
      if (n.startsWith(core)) return 0;
      if (n.includes(core)) return 1;
      return 2; // 주소만 매칭
    };
    const ordered = (rel.length ? rel : results).sort((a, b) => rank(a) - rank(b));
    return hideCuratedUmbrellas(ordered);
  } catch (e) {
    console.warn('[kakao] search failed:', e?.message);
    return [];
  }
}

// 좌표 기준 키워드 거리순 검색 (공통 헬퍼)
async function searchNearbyByKeyword(query, lat, lng, radius, filterRe) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];
  if (!isKeyConfigured()) return [];
  try {
    const { recordLocationAccess } = require('./locationAccessLog');
    recordLocationAccess({ providerName: 'kakao_local', purpose: `주변 ${query} 검색`, method: 'send' });
  } catch {}
  try {
    const url = `${KEYWORD_URL}?query=${encodeURIComponent(query)}&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=15`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) { console.warn('[kakao] nearby HTTP', res.status, query); return []; }
    const data = await res.json();
    return (data.documents || [])
      .filter(d => !filterRe || filterRe.test(d.category_name || '') || filterRe.test(d.place_name || ''))
      .map(d => ({
        kakaoId: d.id,
        name: d.place_name,
        category: d.category_name || '',
        loc: d.road_address_name || d.address_name || '',
        x: parseFloat(d.x),
        y: parseFloat(d.y),
        distance: parseInt(d.distance, 10) || 0,
        url: d.place_url,
      }));
  } catch (e) {
    console.warn('[kakao] nearby failed:', e?.message);
    return [];
  }
}

// 가까운 골프 연습장
export async function searchNearbyDrivingRanges(lat, lng, radius = 10000) {
  return searchNearbyByKeyword('골프 연습장', lat, lng, radius, /(연습장|골프장)/);
}

// 가까운 스크린골프
export async function searchNearbyScreenGolf(lat, lng, radius = 5000) {
  return searchNearbyByKeyword('스크린골프', lat, lng, radius, /(스크린|실내골프)/);
}

// 좌표 기준 반경 내 골프장 거리순 검색 — 코스 상세 '주변 골프장'
export async function searchNearbyGolfCourses(lat, lng, radius = 10000) {
  return searchNearbyByKeyword('골프장', lat, lng, radius, /골프장/);
}

// 좌표 기준 반경 내 카테고리 장소 거리순 검색 (공통)
//  code: FD6(음식점) | CE7(카페)
//  반환: [{ kakaoId, name, type, kind, loc, x, y, distance, phone, url }]
async function searchNearbyByCategory(code, lat, lng, radius) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];
  if (!isKeyConfigured()) {
    console.warn('[kakao] KAKAO_REST_API_KEY not configured.');
    return [];
  }
  try {
    // 거리순, 반경 radius(m, 최대 20000)
    const url = `${CATEGORY_URL}?category_group_code=${code}&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=15`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) { console.warn('[kakao] nearby HTTP', res.status, code); return []; }
    const data = await res.json();
    return (data.documents || []).map(d => ({
      kakaoId: d.id,
      name: d.place_name,
      // "음식점 > 한식 > 육류,고기" → 마지막 분류만
      type: (d.category_name || '').split('>').pop().trim() || (code === 'CE7' ? '카페' : '음식점'),
      kind: code === 'CE7' ? 'cafe' : 'food',
      loc: d.road_address_name || d.address_name || '',
      x: parseFloat(d.x), // 경도
      y: parseFloat(d.y), // 위도
      distance: parseInt(d.distance, 10) || 0,
      phone: d.phone || '',
      url: d.place_url || '',
    }));
  } catch (e) {
    console.warn('[kakao] nearby category failed:', code, e?.message);
    return [];
  }
}

// 골프장 주변 음식점(FD6) 거리순 검색
export async function searchNearbyRestaurants(lat, lng, radius = 3000) {
  return searchNearbyByCategory('FD6', lat, lng, radius);
}

// 골프장 주변 카페(CE7) 거리순 검색
export async function searchNearbyCafes(lat, lng, radius = 3000) {
  return searchNearbyByCategory('CE7', lat, lng, radius);
}

// 키워드로 음식점(FD6) 검색 — 맛집 직접 검색·저장용
// 골프장 좌표를 주면 그 주변(반경 20km) 거리순으로 정렬
// 반환: [{ kakaoId, name, type, loc, x, y, distance, phone, url }]
export async function searchRestaurantsByKeyword(query, lat, lng) {
  const q = (query || '').trim();
  if (!q || !isKeyConfigured()) return [];
  try {
    let url = `${KEYWORD_URL}?query=${encodeURIComponent(q)}&category_group_code=FD6&size=12`;
    if (typeof lat === 'number' && typeof lng === 'number') {
      url += `&x=${lng}&y=${lat}&radius=20000&sort=distance`;
    }
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    });
    if (!res.ok) { console.warn('[kakao] keyword food HTTP', res.status); return []; }
    const data = await res.json();
    return (data.documents || []).map(d => ({
      kakaoId: d.id,
      name: d.place_name,
      type: (d.category_name || '').split('>').pop().trim() || '음식점',
      loc: d.road_address_name || d.address_name || '',
      x: parseFloat(d.x),
      y: parseFloat(d.y),
      distance: parseInt(d.distance, 10) || 0,
      phone: d.phone || '',
      url: d.place_url || '',
    }));
  } catch (e) {
    console.warn('[kakao] keyword food failed:', e?.message);
    return [];
  }
}

// 골프장명 키워드 검색 → 첫 결과의 phone 등 메타정보 반환
export async function fetchCoursePlaceInfo(name) {
  if (!name || !isKeyConfigured()) return null;
  try {
    const fullQ = /(골프|골프장|cc|CC|컨트리클럽)/.test(name) ? name : name + ' 골프장';
    const url = `${KEYWORD_URL}?query=${encodeURIComponent(fullQ)}&size=5`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const d = (data.documents || []).find(it => (it.category_name || '').includes('골프장')) || data.documents?.[0];
    if (!d) return null;
    return {
      phone: d.phone || '',
      url: d.place_url || '',
      address: d.road_address_name || d.address_name || '',
    };
  } catch (e) {
    console.warn('[kakao] place info failed:', e?.message);
    return null;
  }
}

// 출발지/주소 검색 — 도로명·지번 주소 + 장소명(아파트·건물·랜드마크) 모두 매칭.
// 주소 API와 키워드 API를 함께 조회해 합침. 반환: [{ kakaoId, name, loc, x, y }]
//   name = 저장·표시용 라벨, loc = 보조 설명줄
export async function searchPlaces(query) {
  const q = (query || '').trim();
  if (!q) return [];
  if (!isKeyConfigured()) {
    console.warn('[kakao] KAKAO_REST_API_KEY not configured. src/constants/api.js 참고.');
    return [];
  }
  const headers = { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` };
  const out = [];
  const seen = new Set();
  const push = (name, loc, x, y, id) => {
    if (!name || !(x > 0) || !(y > 0)) return;
    const key = id || `${x},${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kakaoId: key, name, loc: loc || '', x, y });
  };
  try {
    const [addrRes, kwRes] = await Promise.all([
      fetch(`${ADDRESS_URL}?query=${encodeURIComponent(q)}&size=5`, { headers }).catch(() => null),
      fetch(`${KEYWORD_URL}?query=${encodeURIComponent(q)}&size=10`, { headers }).catch(() => null),
    ]);
    if (addrRes && addrRes.ok) {
      const data = await addrRes.json();
      (data.documents || []).forEach(d => {
        const road = d.road_address?.address_name;
        // 도로명 주소를 우선 라벨로, 지번은 보조줄
        push(road || d.address_name, road ? d.address_name : '', parseFloat(d.x), parseFloat(d.y), null);
      });
    }
    if (kwRes && kwRes.ok) {
      const data = await kwRes.json();
      (data.documents || []).forEach(d => {
        push(d.place_name, d.road_address_name || d.address_name || '', parseFloat(d.x), parseFloat(d.y), d.id);
      });
    }
    return out.slice(0, 12);
  } catch (e) {
    console.warn('[kakao] searchPlaces failed:', e?.message);
    return [];
  }
}

// 자동차 길찾기 — 출발/도착 좌표로 실제 소요시간 조회 (카카오모빌리티, 실시간 교통 반영)
// origin/destination: { x: 경도, y: 위도 }
// 반환: { durationMin, distanceM } | null
export async function getDrivingDirections(origin, destination) {
  if (!origin || !destination) return null;
  if (!(origin.x > 0) || !(origin.y > 0) || !(destination.x > 0) || !(destination.y > 0)) return null;
  if (!isKeyConfigured()) {
    console.warn('[kakao] KAKAO_REST_API_KEY not configured.');
    return null;
  }
  try {
    const { recordLocationAccess } = require('./locationAccessLog');
    recordLocationAccess({ providerName: 'kakao_mobility', purpose: '교통 소요시간 조회', method: 'send' });
  } catch {}
  try {
    const url = `${DIRECTIONS_URL}?origin=${origin.x},${origin.y}&destination=${destination.x},${destination.y}`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
    if (!res.ok) { console.warn('[kakao] directions HTTP', res.status); return null; }
    const data = await res.json();
    const route = data.routes?.[0];
    // result_code 0 = 정상. 그 외(예: 104 출발지·목적지 동일)는 실패 처리
    if (!route || route.result_code !== 0) {
      if (route) console.warn('[kakao] directions result', route.result_code, route.result_msg);
      return null;
    }
    const s = route.summary || {};
    return {
      durationMin: Math.round((s.duration || 0) / 60),
      distanceM: s.distance || 0,
    };
  } catch (e) {
    console.warn('[kakao] getDrivingDirections failed:', e?.message);
    return null;
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
