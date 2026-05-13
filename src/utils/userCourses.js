import { storage, STORAGE_KEYS } from './storage';

// 골프장 마스터 데이터 — AsyncStorage 기반
// 각 항목: { id, name, loc, x, y, kakaoId }
// 일정/다이어리는 courseId(=item.id)만 참조

export async function getUserCourses() {
  return (await storage.load(STORAGE_KEYS.userCourses, [])) || [];
}

// 카카오 검색 결과 또는 직접 입력으로 새 골프장 등록
// 같은 kakaoId가 이미 있으면 그 항목 반환 (중복 등록 방지)
export async function addUserCourse({ name, loc, x, y, kakaoId }) {
  const list = await getUserCourses();
  if (kakaoId) {
    const found = list.find(c => c.kakaoId === kakaoId);
    if (found) return found;
  }
  const newCourse = {
    id: 'uc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: (name || '').trim(),
    loc: (loc || '').trim(),
    x: typeof x === 'number' ? x : null,
    y: typeof y === 'number' ? y : null,
    kakaoId: kakaoId || null,
  };
  await storage.save(STORAGE_KEYS.userCourses, [...list, newCourse]);
  return newCourse;
}

export async function updateUserCourse(id, patch) {
  const list = await getUserCourses();
  const updated = list.map(c => (c.id === id ? { ...c, ...patch } : c));
  await storage.save(STORAGE_KEYS.userCourses, updated);
  return updated.find(c => c.id === id) || null;
}

export async function findUserCourseById(id) {
  if (!id) return null;
  const list = await getUserCourses();
  return list.find(c => c.id === id) || null;
}

export async function deleteUserCourse(id) {
  const list = await getUserCourses();
  await storage.save(STORAGE_KEYS.userCourses, list.filter(c => c.id !== id));
}
