// =============================================================
// 100대 골프코스 — Firestore(top100Courses) 조회 + 골프장명 매칭
// 시딩: scripts/seedTop100.mjs · 출처: 한국골프관광협회 2024-2025
// =============================================================
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { STORAGE_KEYS, storage } from './storage';

const CACHE_KEY = '@dg_top100_v1';
const TTL = 24 * 60 * 60 * 1000; // 하루 (거의 안 바뀌는 고정 데이터)

let memCache = null;       // [{ rank, name, region }]
let inflight = null;       // 진행 중 fetch dedupe

// 골프장명 정규화 — 사용자가 자유 입력한 이름과 100대 코스 목록을 느슨하게 매칭
//  - 공백/문장부호 제거, 골프장 유형어(CC/GC/골프&리조트 등) 제거
//  - 다중 코스 구분어(올드/뉴 등 '코스')도 제거 — 같은 골프장의 표기 차이 흡수
//    예: '라비에벨CC 올드코스' 와 '라비에벨 골프 & 리조트' 가 모두 '라비에벨'로 매칭
export function normalizeCourseName(name) {
  let s = (name || '').toLowerCase().trim();
  s = s.replace(/\s+/g, '');
  // 골프장 유형어 제거 — CC/GC/컨트리클럽/골프&리조트 등 표기 차이 흡수
  s = s.replace(/컨트리클럽|컨트리|골프앤리조트|골프&리조트|골프링크스|골프리조트|골프클럽|골프장|골프|리조트|클럽/g, '');
  s = s.replace(/c\.?c\.?(?![a-z])|g\.?c\.?(?![a-z])/g, '');
  // 코스 구분어 제거 — 끝에 오는 '(수식어)코스' (다중 코스 골프장: 라비에벨 올드/뉴 등)
  s = s.replace(/(올드|뉴|듄스|이스트|웨스트|사우스|노스|동|서|남|북|챔피언|퍼블릭|레이크|마운틴|밸리|힐|레이디스|old|new|dunes|east|west|south|north)?(코스|course)$/g, '');
  s = s.replace(/[·.,&\-_'"()]/g, '');
  return s;
}

async function fetchFromFirestore() {
  const snap = await getDocs(query(collection(db, 'top100Courses'), orderBy('rank')));
  const list = snap.docs.map(d => {
    const v = d.data();
    return { rank: v.rank, name: v.name, region: v.region || '' };
  });
  if (list.length) {
    memCache = list;
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), list })).catch(() => {});
  }
  return memCache || [];
}

// 100대 코스 목록 (순위순). 메모리 → 디스크 캐시 → Firestore 순으로 해석.
export async function getTop100Courses() {
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
    console.warn('[top100] 불러오기 실패', e?.message);
    return [];
  }
}

// 다중코스 리조트 큐레이션 — master는 코스단위명(예 '파인비치골프링크스 오시아노코스'→정규화 '파인비치오시아노')이라
//   top100 구장명과 완전일치 안 됨. 건별 prefix(normalizeCourseName 거친 형태)로 정밀 매핑(사용자 2026-06-17).
//   ★일괄 normalize 변경 금지 정책([[multicourse-resort-policy]]) — 여기 건별로만.
//
//  두 모드(리조트마다 다름):
//   - 'resort': 리조트 안 어느 코스를 갔든 1곳 인정(구장단위). 네이티브 구장명 일치 + prefix.
//       예 파인비치 = 오시아노·파인·비치 9홀 어느 거든 인정.
//   - 'course': 그 리조트의 '특정 코스만' 100대. ★네이티브 구장명 일치를 끄고 지정 prefix만 인정 —
//       안 끄면 형제 코스가 정규화로 구장명에 붕괴(예 '클럽72 레이크코스'→수식어 '레이크' 제거→'72'=구장명)해 오인식됨.
//       예 클럽72 = 하늘·레이크·클래식·오션 각각 별개 18홀이고 100대는 '하늘코스'만 → '72하늘'만 인정.
const TOP100_CURATION = {
  12: { mode: 'resort', prefixes: ['파인비치'] },     // 파인비치 골프링크스 — 오시아노·파인·비치 9홀(구장단위)
  21: { mode: 'course', prefixes: ['72하늘'] },        // 클럽72 — 하늘코스만 100대(레이크·클래식·오션 제외)
  22: { mode: 'resort', prefixes: ['소노펠리체'] },   // 소노펠리체 CC — 비발디파크·델피노 (★사용자 확인 대기)
  45: { mode: 'resort', prefixes: ['휘닉스평창'] },   // 휘닉스 평창 CC — 휘닉스CC
  78: { mode: 'resort', prefixes: ['무주덕유산'] },   // 덕유산 CC — 무주덕유산CC
};

// 방문한 골프장 이름 배열 → 100대 코스 중 방문한 코스 목록(순위순)
//  ①기본: 정규화 완전일치 ②큐레이션 대상: resort=네이티브+prefix / course=지정 prefix만(네이티브 무시)
export function matchVisitedTop100(top100List, visitedNames) {
  const visitedNorm = (visitedNames || []).map(normalizeCourseName).filter(Boolean);
  const visitedSet = new Set(visitedNorm);
  return (top100List || []).filter(c => {
    const cur = TOP100_CURATION[c.rank];
    if (cur) {
      if (cur.prefixes.some(p => visitedNorm.some(v => v.startsWith(p)))) return true;
      // course 모드는 네이티브 구장명 일치를 끔(특정 코스만 100대). resort 모드만 네이티브도 인정.
      return cur.mode === 'resort' && visitedSet.has(normalizeCourseName(c.name));
    }
    return visitedSet.has(normalizeCourseName(c.name));
  });
}

// 사용자가 100대 코스 목록에서 직접 체크한 순위(rank) 배열 — 로컬 저장
export async function getManualTop100Checks() {
  const list = await storage.load(STORAGE_KEYS.top100Checks, []);
  return Array.isArray(list) ? list : [];
}
export async function saveManualTop100Checks(ranks) {
  await storage.save(STORAGE_KEYS.top100Checks, Array.isArray(ranks) ? ranks : []);
}
