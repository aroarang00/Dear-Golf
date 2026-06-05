// =============================================================
// 전국 골프장 마스터(golfCourses) — Firestore 조회 + 로컬 우선 검색
// 시딩: scripts/seedGolfCourses.mjs (공공데이터 477개 + 카카오 로컬 매칭)
//
// 검색 전략: 로컬(큐레이션된 477개) 우선 → 결과 0건일 때만 카카오로 보완.
//   - 카카오의 분류 노이즈·45개 인기순 컷·변형쿼리 곡예를 회피
//   - kakaoId가 end-to-end로 일관됨 ([[course-matching-unification]])
// 반환 형태는 기존 카카오 검색과 동일: { kakaoId(string), name, loc, x(number), y(number), url }
// =============================================================
import { collection, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { normalizeCourseName } from './top100';
import { searchGolfCoursesKakao } from './kakao';

const CACHE_KEY = '@dg_golfcourses_v1';
const TTL = 24 * 60 * 60 * 1000; // 하루 (거의 안 바뀌는 마스터 데이터)

let memCache = null;   // [{ kakaoId, name, input, loc, x, y, url }]
let inflight = null;   // 진행 중 fetch dedupe

// Firestore 문서 → 검색 결과 형태. road를 loc로, url은 kakaoId로 합성(마스터엔 url 없음).
function toEntry(v) {
  const kakaoId = String(v.kakaoId || '');
  return {
    kakaoId,
    name: v.name || '',
    input: v.input || v.name || '',          // 공공데이터 원본명(풀네임) — 별칭 검색용. 결과엔 노출 안 함
    loc: v.road || v.addr || '',
    x: typeof v.x === 'number' ? v.x : parseFloat(v.x),
    y: typeof v.y === 'number' ? v.y : parseFloat(v.y),
    url: kakaoId ? `http://place.map.kakao.com/${kakaoId}` : '',
  };
}

async function fetchFromFirestore() {
  const snap = await getDocs(collection(db, 'golfCourses'));
  const list = snap.docs.map(d => toEntry(d.data()));
  if (list.length) {
    memCache = list;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), list })).catch(() => {});
  }
  return memCache || [];
}

// 전체 마스터 목록 — 메모리 → 디스크 캐시(TTL) → Firestore 순. top100.js와 동일 패턴.
export async function getGolfCourses() {
  if (memCache) return memCache;

  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.list) && p.list.length) {
        memCache = p.list;
        // 신선하지 않으면 백그라운드 갱신만 (UI는 즉시 캐시 반환)
        if (Date.now() - p.ts >= TTL && !inflight) {
          inflight = fetchFromFirestore().finally(() => { inflight = null; });
        }
        return memCache;
      }
    }
  } catch {}

  if (!inflight) inflight = fetchFromFirestore().finally(() => { inflight = null; });
  try {
    return await inflight;
  } catch (e) {
    console.warn('[golfCourses] 불러오기 실패', e?.message);
    return [];
  }
}

// 로컬 마스터 검색 — 정규화 매칭. 결과 형태는 카카오 검색과 동일.
//  랭킹: 정규화 완전일치 > name 시작일치 > name 포함 > 원본명(input) 포함 > 주소(loc)만 매칭
//  지역/도시명("춘천")도 loc 포함으로 자동 지원. 정규화로 다 사라진 입력("골프")은 원문 substring 폴백.
export async function searchGolfCoursesLocal(query) {
  const q = (query || '').trim();
  if (!q) return [];
  const all = await getGolfCourses();
  if (!all.length) return [];

  const core = normalizeCourseName(q);
  const rawLower = q.toLowerCase().replace(/\s+/g, '');

  const scored = [];
  for (const c of all) {
    const nName = normalizeCourseName(c.name);
    const nInput = normalizeCourseName(c.input);
    const loc = (c.loc || '').toLowerCase();
    let rank = -1;
    if (core) {
      if (nName === core) rank = 0;
      else if (nName.startsWith(core)) rank = 1;
      else if (nName.includes(core)) rank = 2;
      else if (nInput.includes(core)) rank = 3;
      else if (loc.includes(rawLower)) rank = 4;
    } else {
      // 골프 유형어만 입력해 정규화 결과가 빈 경우 — 원문으로 느슨히 매칭
      if ((c.name || '').toLowerCase().includes(rawLower) || nInput.includes(rawLower) || loc.includes(rawLower)) rank = 2;
    }
    if (rank >= 0) scored.push({ c, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || (a.c.name || '').localeCompare(b.c.name || ''));
  // input은 내부 검색용 — 결과 객체에선 제외(기존 카카오 반환 형태와 동일 유지)
  return scored.map(({ c }) => ({ kakaoId: c.kakaoId, name: c.name, loc: c.loc, x: c.x, y: c.y, url: c.url }));
}

// 골프장 검색 진입점 — 로컬 우선, 결과 0건일 때만 카카오로 보완.
//  (마스터에 없는 신규·누락 구장은 카카오 폴백이 커버. 병합은 안 함 — 카카오 노이즈 재유입 방지)
export async function searchGolfCourses(query) {
  const q = (query || '').trim();
  if (!q) return [];
  try {
    const local = await searchGolfCoursesLocal(q);
    if (local.length) return local;
  } catch (e) {
    console.warn('[golfCourses] 로컬 검색 실패 — 카카오 폴백', e?.message);
  }
  return searchGolfCoursesKakao(q);
}
