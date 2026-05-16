import { storage, STORAGE_KEYS } from './storage';

// 골프장별 사용자 코멘트 — { [courseId]: [ {id, txt, who, date, likes, likedByMe, mine}, ... ] }
// mock 코멘트는 저장하지 않고, 사용자가 직접 쓴 코멘트(mine)만 영구 보관한다.

async function getAll() {
  return (await storage.load(STORAGE_KEYS.courseComments, {})) || {};
}

export async function getCourseComments(courseId) {
  if (!courseId) return [];
  const all = await getAll();
  return all[courseId] || [];
}

// 해당 골프장의 사용자 코멘트 목록 전체를 교체 저장
export async function setCourseCommentsForCourse(courseId, comments) {
  if (!courseId) return;
  const all = await getAll();
  all[courseId] = comments || [];
  await storage.save(STORAGE_KEYS.courseComments, all);
}
