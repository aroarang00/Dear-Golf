import { storage, STORAGE_KEYS } from './storage';
import { db, getUid } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// 내 저장 골프장(위시리스트) — 좋아하는/가보고 싶은 구장 단순 저장. ★기록·일정(userCourses)과 무관.
//   자유롭게 추가/삭제(orphan 걱정 없음). 식별키 = kakaoId 우선, 없으면 이름.
//   구조: [ { name, loc, x, y, kakaoId, addedAt } ] (최근 저장 순).
//   ★로컬(AsyncStorage) 캐시 + Firestore(users/{uid}.savedCourses) 영속 백업 — 재설치(allowBackup=false)·타기기 보존
//     (userCourses와 동일 패턴, users 문서 규칙이 owner 임의필드 허용이라 규칙 변경 불필요). [[data-migration]]

const keyOf = (c) => (c?.kakaoId ? `k:${c.kakaoId}` : `n:${(c?.name || '').trim()}`);

export async function getSavedCourses() {
  const list = await storage.load(STORAGE_KEYS.savedCourses, []);
  return Array.isArray(list) ? list : [];
}

// 전체 배열을 users/{uid}.savedCourses에 미러(merge). 실패해도 로컬엔 영향 X.
async function pushSavedCoursesToFirestore(list) {
  try {
    const uid = await getUid();
    if (!uid) return;
    await setDoc(doc(db, 'users', uid), { uid, savedCourses: list, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { if (__DEV__) console.warn('[savedCourses] firestore push 실패', e?.message); }
}

// 시작 시 복원 — Firestore와 로컬을 머지(keyOf 중복제거, 최근저장순)해 로컬 저장. 프레시 설치=Firestore로 복원.
export async function syncSavedCoursesFromFirestore() {
  try {
    const uid = await getUid();
    if (!uid) return await getSavedCourses();
    const snap = await getDoc(doc(db, 'users', uid));
    const remote = snap.exists() && Array.isArray(snap.data().savedCourses) ? snap.data().savedCourses : [];
    const local = await getSavedCourses();
    const seen = new Set();
    const merged = [];
    for (const c of [...remote, ...local]) {
      if (!c) continue;
      const k = keyOf(c);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(c);
    }
    merged.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    await storage.save(STORAGE_KEYS.savedCourses, merged);
    if (merged.length !== remote.length) pushSavedCoursesToFirestore(merged); // 로컬 전용 항목 역반영
    return merged;
  } catch (e) {
    if (__DEV__) console.warn('[savedCourses] firestore sync 실패', e?.message);
    return await getSavedCourses();
  }
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
  pushSavedCoursesToFirestore(next); // 영속 백업
  return next;
}

// 저장 해제(자유 — 기록 연결 무관). 반환 = 갱신된 목록
export async function removeSavedCourse(course) {
  const list = await getSavedCourses();
  const k = keyOf(course);
  const next = list.filter(c => keyOf(c) !== k);
  await storage.save(STORAGE_KEYS.savedCourses, next);
  pushSavedCoursesToFirestore(next);
  return next;
}

// 순서 저장(↑/↓ 재정렬) — 전체 배열 덮어쓰기. 반환 = 저장된 목록
export async function saveSavedCoursesOrder(list) {
  const next = Array.isArray(list) ? list : [];
  await storage.save(STORAGE_KEYS.savedCourses, next);
  pushSavedCoursesToFirestore(next);
  return next;
}

// 토글 — 반환 { saved, list }
export async function toggleSavedCourse(course) {
  const saved = await isCourseSaved(course);
  const list = saved ? await removeSavedCourse(course) : await addSavedCourse(course);
  return { saved: !saved, list };
}
