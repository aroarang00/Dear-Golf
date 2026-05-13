import { storage, STORAGE_KEYS } from './storage';
import { addressToCoord } from './kakao';

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

// 좌표 보장: x/y 없으면 loc으로 카카오 주소검색해서 채움 + 캐시. 갱신된 course 반환, 실패 시 null.
// 카카오 검색 없이 손으로 등록한 코스도 KMA 단기예보(격자 변환)에 쓸 수 있게 보충.
export async function ensureCourseCoord(course) {
  if (!course) return null;
  if (typeof course.x === 'number' && typeof course.y === 'number') return course;
  if (!course.loc) return null;
  const coord = await addressToCoord(course.loc);
  if (!coord) return null;
  const updated = await updateUserCourse(course.id, { x: coord.x, y: coord.y });
  return updated || { ...course, x: coord.x, y: coord.y };
}
