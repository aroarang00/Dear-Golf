import { storage, STORAGE_KEYS } from './storage';

// 골프장별 저장 맛집 — AsyncStorage 기반
// 구조: { [courseName]: [ { id, name, type, loc, x, y, kakaoId, memo, addedAt } ] }
// 골프장 식별은 이름(courseName)으로 — id가 COURSE_LOG/userCourses/preview 간 다르기 때문

async function loadAll() {
  return (await storage.load(STORAGE_KEYS.savedRestaurants, {})) || {};
}

// 특정 골프장에 저장된 맛집 목록 (최근 저장 순)
export async function getSavedRestaurants(courseName) {
  if (!courseName) return [];
  const all = await loadAll();
  return all[courseName] || [];
}

// 맛집 저장 — 같은 kakaoId 또는 같은 이름이 이미 있으면 그 항목 반환 (중복 방지)
export async function addSavedRestaurant(courseName, rest) {
  if (!courseName || !rest?.name) return null;
  const all = await loadAll();
  const list = all[courseName] || [];
  const dup = list.find(r =>
    (rest.kakaoId && r.kakaoId === rest.kakaoId) || r.name === rest.name);
  if (dup) return dup;
  const item = {
    id: 'sr_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: (rest.name || '').trim(),
    type: rest.type || '',
    loc: rest.loc || '',
    x: Number.isFinite(rest.x) ? rest.x : null,
    y: Number.isFinite(rest.y) ? rest.y : null,
    kakaoId: rest.kakaoId || null,
    memo: (rest.memo || '').trim(),
    addedAt: Date.now(),
  };
  all[courseName] = [item, ...list];
  await storage.save(STORAGE_KEYS.savedRestaurants, all);
  return item;
}

// 저장 맛집 삭제
export async function removeSavedRestaurant(courseName, id) {
  if (!courseName) return;
  const all = await loadAll();
  all[courseName] = (all[courseName] || []).filter(r => r.id !== id);
  await storage.save(STORAGE_KEYS.savedRestaurants, all);
}

// 저장 맛집 수정 (이름·메모 등)
export async function updateSavedRestaurant(courseName, id, patch) {
  if (!courseName) return;
  const all = await loadAll();
  all[courseName] = (all[courseName] || []).map(r => (r.id === id ? { ...r, ...patch } : r));
  await storage.save(STORAGE_KEYS.savedRestaurants, all);
}
