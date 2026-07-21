import { storage, STORAGE_KEYS } from './storage';
import { db, getUid } from './firebase';
import { sameCourseName } from './courseNameKey';   // 구장 이름 표기 차이 흡수(공용 규칙)
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// 골프장별 저장 맛집 — 로컬(AsyncStorage) 캐시 + Firestore(users/{uid}.savedRestaurants) 영속 백업.
// 구조: { [courseName]: [ { id, name, type, loc, x, y, kakaoId, memo, addedAt } ] }
// 골프장 식별은 이름(courseName)으로 — id가 COURSE_LOG/userCourses/preview 간 다르기 때문
//   ★로컬뿐이면 재설치(allowBackup=false)·타기기에서 저장 맛집이 다 사라짐 → users 문서에 미러(savedCourses와 동일 패턴,
//     규칙 변경 불필요=owner 임의필드 허용). 변경 시 전체 맵 미러, 시작 시 코스별 머지 복원. [[data-migration]]

async function loadAll() {
  return (await storage.load(STORAGE_KEYS.savedRestaurants, {})) || {};
}

// 이미 존재하는 서랍 중 같은 구장으로 보이는 키를 찾는다. 없으면 준 이름 그대로.
//   서랍이 '구장 이름' 문자열이라 표기가 조금만 달라도 갈린다("저장했는데 코스 맛집에 안 보임").
//   매칭 규칙은 courseNameKey에 모아둠(예약 AI 파싱에서도 같은 규칙을 쓴다).
function resolveKey(all, courseName) {
  if (!courseName) return courseName;
  if (all[courseName]) return courseName;              // 정확히 일치하면 그대로
  return Object.keys(all).find(k => sameCourseName(k, courseName)) || courseName;
}

// 전체 맵을 users/{uid}.savedRestaurants에 미러(merge). 실패해도 로컬엔 영향 X.
async function pushToFirestore(all) {
  try {
    const uid = await getUid();
    if (!uid) return;
    await setDoc(doc(db, 'users', uid), { uid, savedRestaurants: all || {}, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { if (__DEV__) console.warn('[savedRestaurants] firestore push 실패', e?.message); }
}

const totalCount = (m) => Object.values(m || {}).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0);

// 시작 시 복원 — 코스별로 Firestore와 로컬을 머지(kakaoId|이름 중복제거, 최근저장순)해 로컬 저장. 프레시 설치=Firestore로 복원.
export async function syncSavedRestaurantsFromFirestore() {
  try {
    const uid = await getUid();
    if (!uid) return await loadAll();
    const snap = await getDoc(doc(db, 'users', uid));
    const rd = snap.exists() ? snap.data().savedRestaurants : null;
    const remote = (rd && typeof rd === 'object') ? rd : {};
    const local = await loadAll();
    const merged = {};
    for (const cn of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const r = Array.isArray(remote[cn]) ? remote[cn] : [];
      const l = Array.isArray(local[cn]) ? local[cn] : [];
      const seen = new Set();
      const list = [];
      for (const item of [...r, ...l]) {
        if (!item || !item.name) continue;
        const k = item.kakaoId ? `k:${item.kakaoId}` : `n:${(item.name || '').trim()}`;
        if (seen.has(k)) continue;
        seen.add(k);
        list.push(item);
      }
      list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      merged[cn] = list;
    }
    await storage.save(STORAGE_KEYS.savedRestaurants, merged);
    if (totalCount(merged) !== totalCount(remote)) pushToFirestore(merged); // 로컬 전용 항목 역반영
    return merged;
  } catch (e) {
    if (__DEV__) console.warn('[savedRestaurants] firestore sync 실패', e?.message);
    return await loadAll();
  }
}

// 특정 골프장에 저장된 맛집 목록 (최근 저장 순)
export async function getSavedRestaurants(courseName) {
  if (!courseName) return [];
  const all = await loadAll();
  return all[resolveKey(all, courseName)] || [];
}

// 맛집 저장 — 같은 kakaoId 또는 같은 이름이 이미 있으면 그 항목 반환 (중복 방지)
export async function addSavedRestaurant(courseName, rest) {
  if (!courseName || !rest?.name) return null;
  const all = await loadAll();
  const key = resolveKey(all, courseName);   // 같은 구장의 다른 표기로 서랍이 갈리지 않게
  const list = all[key] || [];
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
  all[key] = [item, ...list];
  await storage.save(STORAGE_KEYS.savedRestaurants, all);
  pushToFirestore(all); // 영속 백업
  return item;
}

// 저장 맛집 삭제
export async function removeSavedRestaurant(courseName, id) {
  if (!courseName) return;
  const all = await loadAll();
  const courseKey = resolveKey(all, courseName);   // 저장과 같은 서랍을 봐야 함(다른 표기로 들어와도)
  all[courseKey] = (all[courseKey] || []).filter(r => r.id !== id);
  await storage.save(STORAGE_KEYS.savedRestaurants, all);
  pushToFirestore(all);
}

// 저장 맛집 수정 (이름·메모 등)
export async function updateSavedRestaurant(courseName, id, patch) {
  if (!courseName) return;
  const all = await loadAll();
  const courseKey = resolveKey(all, courseName);
  all[courseKey] = (all[courseKey] || []).map(r => (r.id === id ? { ...r, ...patch } : r));
  await storage.save(STORAGE_KEYS.savedRestaurants, all);
  pushToFirestore(all);
}
