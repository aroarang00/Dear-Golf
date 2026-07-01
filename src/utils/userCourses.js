import { storage, STORAGE_KEYS } from './storage';
import { addressToCoord } from './kakao';
import { searchGolfCourses } from './golfCourses'; // 좌표 복원 폴백 — loc 없어도 코스명으로 카카오 골프장 검색
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
    for (const c of [...remote, ...local]) {
      if (!c || !c.id) continue;
      const prev = byId.get(c.id);
      // 같은 id면 '좌표 있는 버전' 우선 — 백필/타기기에서 채운 좌표가 옛 로컬 null을 덮게(사용자 2026-07-01).
      //   둘 다 있거나 둘 다 없으면 나중(local) 유지.
      if (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y) && !(Number.isFinite(c.x) && Number.isFinite(c.y))) continue;
      byId.set(c.id, c);
    }
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
  let cx = Number.isFinite(x) ? x : null;
  let cy = Number.isFinite(y) ? y : null;
  // ★좌표 없이 저장되면 그 구장은 날씨가 안 나온다(격자 변환 불가) → 저장 전에 loc(주소)·이름으로 좌표를 채운다
  //   (직접 입력 구장 대비, 출발지 지오코딩과 동일 취지. 사용자 2026-07-01).
  if (cx == null || cy == null) {
    let coord = (loc || '').trim() ? await addressToCoord(loc.trim()).catch(() => null) : null;
    if (!coord && (name || '').trim()) {
      try { const r = await searchGolfCourses(name.trim()); const t = r && r[0]; if (t && t.x > 0 && t.y > 0) coord = { x: t.x, y: t.y }; } catch {}
    }
    if (coord) { cx = coord.x; cy = coord.y; }
  }
  const newCourse = {
    id: 'uc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: (name || '').trim(),
    loc: (loc || '').trim(),
    x: cx,
    y: cy,
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
  if (Number.isFinite(course.x) && Number.isFinite(course.y)) return course; // Number.isFinite — NaN 좌표(typeof NaN==='number' 통과) 차단
  // 좌표 없으면 복원 — ①loc(주소) 카카오 지오코딩 ②없거나 실패하면 코스명으로 골프장 검색(카카오) 폴백.
  //   기존엔 loc만 써서, loc·좌표 둘 다 없이 저장된 구장(마스터 밖 검색 추가 등)은 날씨가 안 나왔다(사용자 2026-07-01, 예: 코브스윙CC).
  let coord = course.loc ? await addressToCoord(course.loc).catch(() => null) : null;
  if (!coord && course.name) {
    try {
      const results = await searchGolfCourses(course.name);
      const top = results && results[0];
      if (top && top.x > 0 && top.y > 0) coord = { x: top.x, y: top.y };
    } catch {}
  }
  if (!coord) return null;
  const updated = await updateUserCourse(course.id, { x: coord.x, y: coord.y });
  return updated || { ...course, x: coord.x, y: coord.y };
}
