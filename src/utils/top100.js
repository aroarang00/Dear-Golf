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
//  - 공백/문장부호 제거, 컨트리클럽↔CC · 골프클럽↔GC 표기 통일
export function normalizeCourseName(name) {
  let s = (name || '').toLowerCase().trim();
  s = s.replace(/\s+/g, '');
  s = s.replace(/컨트리클럽|컨트리|c\.?c\.?(?![a-z])/g, 'cc');
  s = s.replace(/골프앤리조트|골프&리조트|골프링크스|골프리조트|골프클럽|골프장|골프|g\.?c\.?(?![a-z])/g, 'gc');
  s = s.replace(/리조트/g, '');
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

// 방문한 골프장 이름 배열 → 100대 코스 중 방문한 코스 목록(순위순)
export function matchVisitedTop100(top100List, visitedNames) {
  const visitedSet = new Set((visitedNames || []).map(normalizeCourseName).filter(Boolean));
  return (top100List || []).filter(c => visitedSet.has(normalizeCourseName(c.name)));
}

// 사용자가 100대 코스 목록에서 직접 체크한 순위(rank) 배열 — 로컬 저장
export async function getManualTop100Checks() {
  const list = await storage.load(STORAGE_KEYS.top100Checks, []);
  return Array.isArray(list) ? list : [];
}
export async function saveManualTop100Checks(ranks) {
  await storage.save(STORAGE_KEYS.top100Checks, Array.isArray(ranks) ? ranks : []);
}
