// =============================================================
// 계정 탈퇴 — Firestore 데이터 + Firebase 익명 계정 + 로컬 데이터 전부 삭제
// App Store/Play 스토어 심사 필수 요건 (계정 삭제 경로 제공)
// =============================================================
import { signInAnonymously, deleteUser } from 'firebase/auth';
import { collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db, getUid } from './firebase';
import { STORAGE_KEYS, storage } from './storage';

// Firestore에 쌓인 이 유저의 데이터 삭제 (현재는 골퍼 코멘트)
async function deleteFirestoreUserData(uid) {
  try {
    const snap = await getDocs(
      query(collection(db, 'courseComments'), where('authorUid', '==', uid)),
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.warn('[account] Firestore 데이터 삭제 실패', e?.message);
  }
}

// 계정 탈퇴 처리. 각 단계는 독립적으로 best-effort 실행 (한 단계 실패해도 나머지 진행).
export async function deleteAccount() {
  // 1. Firestore에 쌓인 내 데이터 삭제 (코멘트 등) — 계정 삭제 전에
  const uid = await getUid();
  if (uid) await deleteFirestoreUserData(uid);

  // 2. Firebase 익명 계정 삭제
  try {
    if (auth.currentUser) await deleteUser(auth.currentUser);
  } catch (e) {
    console.warn('[account] Firebase 계정 삭제 실패', e?.message);
  }

  // 3. 로컬 데이터 전부 초기화 — 신규 설치와 동일하게 빈 상태로
  await storage.clear();
  // 데모 데이터 폴백 방지 (신규 설치 로직과 동일)
  await storage.save(STORAGE_KEYS.schedules, []);
  await storage.save(STORAGE_KEYS.diaries, []);
  await storage.save(STORAGE_KEYS.hof, []);

  // 4. 앱 계속 사용을 위한 새 익명 세션 — 탈퇴한 계정과 무관한 빈 계정
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('[account] 새 익명 세션 생성 실패', e?.message);
  }
}
