import { storage, STORAGE_KEYS } from './storage';

// 내 저장 골프장(위시리스트) — 좋아하는/가보고 싶은 구장 단순 저장. ★기록·일정(userCourses)과 무관.
//   자유롭게 추가/삭제(orphan 걱정 없음). AsyncStorage 로컬. 식별키 = kakaoId 우선, 없으면 이름.
//   구조: [ { name, loc, x, y, kakaoId, addedAt } ] (최근 저장 순).

const keyOf = (c) => (c?.kakaoId ? `k:${c.kakaoId}` : `n:${(c?.name || '').trim()}`);

export async function getSavedCourses() {
  const list = await storage.load(STORAGE_KEYS.savedCourses, []);
  return Array.isArray(list) ? list : [];
}

// 위시리스트에 있는지 — kakaoId 우선, 없으면 이름 일치
export async function isCourseSaved(course) {
  if (!course) return false;
  const list = await getSavedCourses();
  const k = keyOf(course);
  return list.some(c => keyOf(c) === k);
}

// 저장 추가(중복이면 무시). 반환 = 갱신된 목록
export async function addSavedCourse(course) {
  if (!course?.name) return await getSavedCourses();
  const list = await getSavedCourses();
  const k = keyOf(course);
  if (list.some(c => keyOf(c) === k)) return list;
  const item = {
    name: (course.name || '').trim(),
    loc: course.loc || '',
    x: Number.isFinite(course.x) ? course.x : null,
    y: Number.isFinite(course.y) ? course.y : null,
    kakaoId: course.kakaoId || null,
    addedAt: Date.now(),
  };
  const next = [item, ...list];
  await storage.save(STORAGE_KEYS.savedCourses, next);
  return next;
}

// 저장 해제(자유 — 기록 연결 무관). 반환 = 갱신된 목록
export async function removeSavedCourse(course) {
  const list = await getSavedCourses();
  const k = keyOf(course);
  const next = list.filter(c => keyOf(c) !== k);
  await storage.save(STORAGE_KEYS.savedCourses, next);
  return next;
}

// 순서 저장(↑/↓ 재정렬) — 전체 배열 덮어쓰기. 반환 = 저장된 목록
export async function saveSavedCoursesOrder(list) {
  const next = Array.isArray(list) ? list : [];
  await storage.save(STORAGE_KEYS.savedCourses, next);
  return next;
}

// 토글 — 반환 { saved, list }
export async function toggleSavedCourse(course) {
  const saved = await isCourseSaved(course);
  const list = saved ? await removeSavedCourse(course) : await addSavedCourse(course);
  return { saved: !saved, list };
}
