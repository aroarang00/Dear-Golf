import { storage, STORAGE_KEYS } from './storage';
import { db, getUid } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// 라운지 친구지정(select) 초대 '거절' 자동억제 — 로컬(AsyncStorage) + Firestore(users/{uid}.roundupSuppressed) 미러.
//   거절은 사적·호스트 미통지 정책이라 모집 문서엔 안 쓰고 '본인 문서'에만 둔다([[roundup-invitation]]).
//   ★재설치(allowBackup=false)·타기기에서 거절한 초대가 서버 미기록이라 되살아나던 것 방지(사용자 2026-07-01) —
//     savedCourses와 동일 패턴, users 문서 규칙이 owner 임의필드 허용이라 규칙 변경 불필요.
//   구조: { [postId]: true }

async function getLocal() {
  const m = await storage.load(STORAGE_KEYS.roundupSuppressed, {});
  return (m && typeof m === 'object') ? m : {};
}

// 전체 맵을 users/{uid}.roundupSuppressed에 미러(merge). 실패해도 로컬엔 영향 X.
//   ★맵은 억제(거절)만 추가돼 커지므로 전체 덮어써도 유실 없음 — 라운지처럼 상태 전체를 저장하는 곳에서
//     그대로 호출하면 read-modify-write 레이스 없이 항상 정합.
export async function pushRoundupSuppressed(map) {
  try {
    const uid = await getUid();
    if (!uid) return;
    await setDoc(doc(db, 'users', uid), { uid, roundupSuppressed: map || {}, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { if (__DEV__) console.warn('[roundupSuppressed] firestore push 실패', e?.message); }
}

// 거절 기록 — 로컬 즉시 반영 + Firestore 백업. 반환 = 갱신된 맵(호출부가 state에 반영).
export async function suppressRoundupInvite(postId) {
  if (!postId) return await getLocal();
  const cur = await getLocal();
  if (cur[postId]) return cur;
  const next = { ...cur, [postId]: true };
  await storage.save(STORAGE_KEYS.roundupSuppressed, next);
  pushRoundupSuppressed(next); // 영속 백업(비동기, 실패해도 로컬 유지)
  return next;
}

// 시작 시 복원 — Firestore ∪ 로컬 머지해 로컬에 저장. 프레시 설치=Firestore로 복원. 반환 = 머지된 맵.
export async function syncRoundupSuppressedFromFirestore() {
  try {
    const local = await getLocal();
    const uid = await getUid();
    if (!uid) return local;
    const snap = await getDoc(doc(db, 'users', uid));
    const remote = (snap.exists() && snap.data().roundupSuppressed && typeof snap.data().roundupSuppressed === 'object')
      ? snap.data().roundupSuppressed : {};
    const merged = { ...remote, ...local };
    await storage.save(STORAGE_KEYS.roundupSuppressed, merged);
    if (Object.keys(merged).length !== Object.keys(remote).length) pushRoundupSuppressed(merged); // 로컬 전용 항목 역반영
    return merged;
  } catch (e) {
    if (__DEV__) console.warn('[roundupSuppressed] firestore sync 실패', e?.message);
    return await getLocal();
  }
}
