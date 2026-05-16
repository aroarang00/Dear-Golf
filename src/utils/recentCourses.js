import { storage, STORAGE_KEYS } from './storage';

// 골프장 검색 이력 — AsyncStorage 기반
// 각 항목: { name, loc, x, y, kakaoId, ts }
// 최신순으로 저장, kakaoId(없으면 name) 기준 중복 제거, 최대 MAX개 유지

const MAX = 10;

export async function getRecentCourses() {
  return (await storage.load(STORAGE_KEYS.recentCourses, [])) || [];
}

// 검색 결과를 탭했을 때 호출 — 최근 검색 목록 맨 앞에 추가(중복은 끌어올림)
export async function addRecentCourse({ name, loc, x, y, kakaoId }) {
  const list = await getRecentCourses();
  const entry = {
    name: (name || '').trim(),
    loc: (loc || '').trim(),
    x: typeof x === 'number' ? x : null,
    y: typeof y === 'number' ? y : null,
    kakaoId: kakaoId || null,
    ts: Date.now(),
  };
  const deduped = list.filter(c =>
    kakaoId ? c.kakaoId !== kakaoId : c.name !== entry.name
  );
  const next = [entry, ...deduped].slice(0, MAX);
  await storage.save(STORAGE_KEYS.recentCourses, next);
  return next;
}

export async function clearRecentCourses() {
  await storage.save(STORAGE_KEYS.recentCourses, []);
}
