import { storage, STORAGE_KEYS } from './storage';
import { db, getUid } from './firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// 사용자가 추천(♥)한 맛집 — 로컬 캐시 + Firestore(users/{uid}.foodRecs) 영속 백업.
// 구조: { [kakaoId]: true }  (재설치/타기기 보존, savedRestaurants와 동일 패턴·규칙 변경 불필요). [[data-migration]]

export async function getFoodRecs() {
  return (await storage.load(STORAGE_KEYS.foodRecs, {})) || {};
}

// 추천 토글 — 갱신된 전체 맵 반환
export async function toggleFoodRec(kakaoId) {
  const recs = await getFoodRecs();
  if (!kakaoId) return recs;
  if (recs[kakaoId]) delete recs[kakaoId];
  else recs[kakaoId] = true;
  await storage.save(STORAGE_KEYS.foodRecs, recs);
  pushFoodRecsToFirestore(recs); // 영속 백업
  return recs;
}

async function pushFoodRecsToFirestore(recs) {
  try {
    const uid = await getUid();
    if (!uid) return;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    // ★updateDoc으로 foodRecs 맵 전체 교체 — merge:true면 깊은 병합이라 해제한 ♥ 키가 Firestore에 남아
    //   재시작·타기기 union 복원 때 되살아남(친구 별명 setFriendMeta와 동일 함정, 2026-07-02). 없으면 생성만 setDoc.
    if (snap.exists()) {
      await updateDoc(ref, { foodRecs: recs || {}, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, { uid, foodRecs: recs || {}, updatedAt: serverTimestamp() });
    }
  } catch (e) { if (__DEV__) console.warn('[foodRecs] push 실패', e?.message); }
}
// 시작 시 복원 — Firestore와 로컬 맵 union(♥ 키 합집합). 프레시 설치=Firestore로 복원.
export async function syncFoodRecsFromFirestore() {
  try {
    const uid = await getUid();
    if (!uid) return await getFoodRecs();
    const snap = await getDoc(doc(db, 'users', uid));
    const rd = snap.exists() ? snap.data().foodRecs : null;
    const remote = (rd && typeof rd === 'object') ? rd : {};
    const local = await getFoodRecs();
    const merged = { ...remote, ...local };
    await storage.save(STORAGE_KEYS.foodRecs, merged);
    if (Object.keys(merged).length !== Object.keys(remote).length) pushFoodRecsToFirestore(merged); // 로컬 전용 역반영
    return merged;
  } catch (e) {
    if (__DEV__) console.warn('[foodRecs] sync 실패', e?.message);
    return await getFoodRecs();
  }
}

// 추천수 시드 — kakaoId 해시 기반 결정적 기본 추천수
// (백엔드 없는 프로토타입용 — 골퍼 커뮤니티 추천수처럼 보이게)
export function seedRecCount(kakaoId) {
  const s = String(kakaoId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 28;
}
