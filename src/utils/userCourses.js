import { storage, STORAGE_KEYS } from './storage';
import { addressToCoord } from './kakao';
import { db, getUid } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// 골프장 마스터 데이터 — 로컬(AsyncStorage) 캐시 + Firestore(users/{uid}.userCourses) 영속 백업.
//   각 항목: { id, name, loc, x, y, kakaoId }. 일정/다이어리는 courseId(=item.id)만 참조.
//   로컬뿐이면 재설치(allowBackup=false)·타기기에서 코스가 사라져 홈 카드 코스이동·GuideScreen 매칭이 깨짐
//   ([[data-migration]] 갭). 그래서 변경 시 전체 배열을 users 문서에 미러하고, 시작 시 머지 복원한다.

export async function getUserCourses() {
  return (await storage.load(STORAGE_KEYS.userCourses, [])) || [];
}

// 전체 배열을 users/{uid}.userCourses에 미러 (merge). 규칙: owner가 uid 유지하면 임의 필드 쓰기 허용.
async function pushUserCoursesToFirestore(list) {
  try {
    const uid = await getUid();
    if (!uid) return;
    await setDoc(doc(db, 'users', uid), { uid, userCourses: list, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    if (__DEV__) console.warn('[userCourses] firestore push 실패', e?.message);
  }
}

// 시작 시 복원 — Firestore의 userCourses와 로컬을 머지(id union, kakaoId 중복 제거)해 로컬에 저장.
//   프레시 설치: 로컬 빈 값 → Firestore 목록으로 복원. 로컬에만 있던 항목은 Firestore로 역반영.
export async function syncUserCoursesFromFirestore() {
  try {
    const uid = await getUid();
    if (!uid) return await getUserCourses();
    const snap = await getDoc(doc(db, 'users', uid));
    const remote = snap.exists() && Array.isArray(snap.data().userCourses) ? snap.data().userCourses : [];
    const local = await getUserCourses();
    const byId = new Map();
    for (const c of [...remote, ...local]) { if (c && c.id) byId.set(c.id, c); }
    const seenKakao = new Set();
    const merged = [];
    for (const c of byId.values()) {
      if (c.kakaoId) { if (seenKakao.has(c.kakaoId)) continue; seenKakao.add(c.kakaoId); }
      merged.push(c);
    }
    await storage.save(STORAGE_KEYS.userCourses, merged);
    if (merged.length !== remote.length) await pushUserCoursesToFirestore(merged); // 로컬 전용 항목 역반영
    return merged;
  } catch (e) {
    if (__DEV__) console.warn('[userCourses] firestore sync 실패', e?.message);
    return await getUserCourses();
  }
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
  const next = [...list, newCourse];
  await storage.save(STORAGE_KEYS.userCourses, next);
  pushUserCoursesToFirestore(next); // 영속 백업 (실패해도 로컬 등록엔 영향 X)
  return newCourse;
}

export async function updateUserCourse(id, patch) {
  const list = await getUserCourses();
  const updated = list.map(c => (c.id === id ? { ...c, ...patch } : c));
  await storage.save(STORAGE_KEYS.userCourses, updated);
  pushUserCoursesToFirestore(updated);
  return updated.find(c => c.id === id) || null;
}

export async function findUserCourseById(id) {
  if (!id) return null;
  const list = await getUserCourses();
  return list.find(c => c.id === id) || null;
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
