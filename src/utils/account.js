// =============================================================
// 계정 탈퇴 — Firestore 데이터 cascade delete + Firebase 계정 + 로컬 데이터 전부 삭제
// 정책: [[account-deletion]] A안 — 콘텐츠 전부 삭제, 정지 이력만 banned_users 보존 (D2 별도)
// App Store/Play 스토어 심사 필수 요건 (계정 삭제 경로 제공)
// =============================================================
import { signInAnonymously, deleteUser } from 'firebase/auth';
import {
  collection, query, where, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc,
  arrayRemove, increment, serverTimestamp,
} from 'firebase/firestore';
import { auth, db, getUid } from './firebase';
import { STORAGE_KEYS, storage } from './storage';

// best-effort 삭제 — Promise.all로 병렬, 개별 실패는 경고만
async function deleteByQuery(coll, field, uid) {
  try {
    const snap = await getDocs(query(collection(db, coll), where(field, '==', uid)));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(e => {
      if (__DEV__) console.warn(`[account] ${coll} doc delete fail`, e?.message);
    })));
  } catch (e) {
    console.warn(`[account] ${coll} 쿼리 실패`, e?.message);
  }
}

// 본인이 참여·대기 중인 다른 사람 모집에서 uid 제거 (정원 -1)
async function leaveJoinedRoundups(uid) {
  try {
    const snap = await getDocs(query(
      collection(db, 'roundups'),
      where('participantUids', 'array-contains', uid),
    ));
    await Promise.all(snap.docs.map(d => {
      if (d.data().authorUid === uid) return null; // 본인 작성 모집은 별도 삭제
      return updateDoc(d.ref, {
        participantUids: arrayRemove(uid),
        joined: increment(-1),
      }).catch(e => __DEV__ && console.warn('[account] leave participant fail', e?.message));
    }));
  } catch (e) {
    console.warn('[account] participant 쿼리 실패', e?.message);
  }
  try {
    const snap = await getDocs(query(
      collection(db, 'roundups'),
      where('waitlistUids', 'array-contains', uid),
    ));
    await Promise.all(snap.docs.map(d => {
      if (d.data().authorUid === uid) return null;
      return updateDoc(d.ref, { waitlistUids: arrayRemove(uid) })
        .catch(e => __DEV__ && console.warn('[account] leave waitlist fail', e?.message));
    }));
  } catch (e) {
    console.warn('[account] waitlist 쿼리 실패', e?.message);
  }
}

// friendships — users array-contains uid → 양방향 doc 삭제
async function deleteFriendships(uid) {
  try {
    const snap = await getDocs(query(
      collection(db, 'friendships'),
      where('users', 'array-contains', uid),
    ));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(e => {
      if (__DEV__) console.warn('[account] friendship delete fail', e?.message);
    })));
  } catch (e) {
    console.warn('[account] friendships 쿼리 실패', e?.message);
  }
}

// 본인 작성 컬렉션 cascade
async function deleteFirestoreUserData(uid) {
  await Promise.all([
    deleteByQuery('courseComments', 'authorUid', uid),
    deleteByQuery('rounds', 'ownerUid', uid),
    deleteByQuery('schedules', 'ownerUid', uid),
    deleteByQuery('roundups', 'authorUid', uid),
    deleteByQuery('roundupApplications', 'applicantUid', uid),
    deleteFriendships(uid),
    leaveJoinedRoundups(uid),
  ]);
  // 본인 users 문서 삭제 (마지막 — 보안 규칙상 본인만 가능)
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (e) {
    if (__DEV__) console.warn('[account] users doc delete fail', e?.message);
  }
}

// 카카오 sub로 banned_users 매칭 확인 — 재가입 차단 ([[account-deletion]] §3).
// 반환: { banned: false } | { banned: true, permanent: boolean, reason, unblockAt? }
export async function checkBannedByKakaoSub(kakaoSub) {
  if (!kakaoSub) return { banned: false };
  try {
    const snap = await getDoc(doc(db, 'banned_users', String(kakaoSub)));
    if (!snap.exists()) return { banned: false };
    const data = snap.data();
    const unblockAt = data.unblockAt;
    if (!unblockAt) {
      return { banned: true, permanent: true, reason: data.reason || 'unknown' };
    }
    if (new Date(unblockAt).getTime() > Date.now()) {
      return { banned: true, permanent: false, reason: data.reason || 'unknown', unblockAt };
    }
    // 정지 기간 만료 — Cloud Functions가 doc 삭제 처리할 예정. 클라이언트는 통과 처리.
    return { banned: false };
  } catch (e) {
    if (__DEV__) console.warn('[account] banned check 실패', e?.message);
    return { banned: false }; // 네트워크 실패 시 통과 (사용성 우선, Phase 5에서 보강)
  }
}

// 정지 상태 사용자의 카카오 sub + 정지 정보를 banned_users에 보존 ([[account-deletion]] §5).
// 자발적 탈퇴(정상 사용자)는 호출 X. Phase 5 Cloud Functions로 이관 권장.
//
// 변호사 권고 (B-3): 영구 정지 sub는 5년 보존 후 파기 (영구 보존 X — PIPA 최소수집·파기 원칙).
// 미성년 사후 해지는 만 19세 도달일까지 — restrictUntil이 그 시점으로 설정됨.
async function preserveBanIfRestricted(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data.isRestricted || !data.kakaoId) return;
    const reason = data.restrictReason || 'unknown';
    // restrictUntil이 null이면 영구 정지 — 변호사 권고에 따라 5년 후 자동 파기
    const FIVE_YEARS_MS = 5 * 365 * 24 * 3600 * 1000;
    const unblockAt = data.restrictUntil
      || new Date(Date.now() + FIVE_YEARS_MS).toISOString();
    await setDoc(doc(db, 'banned_users', String(data.kakaoId)), {
      kakaoSub: String(data.kakaoId),
      reason,
      unblockAt,
      bannedAt: serverTimestamp(),
    });
  } catch (e) {
    if (__DEV__) console.warn('[account] banned_users 보존 실패', e?.message);
  }
}

// 계정 탈퇴 처리. 각 단계는 best-effort (한 단계 실패해도 나머지 진행).
export async function deleteAccount() {
  const uid = await getUid();
  // 0. 정지 사용자라면 카카오 sub + 정지 정보 보존 (재가입 차단용) — users 문서 삭제 전
  if (uid) await preserveBanIfRestricted(uid);
  // 1. Firestore cascade delete — 본인 데이터 + 참여 중 모집에서 uid 제거
  if (uid) await deleteFirestoreUserData(uid);

  // 2. Firebase 계정 삭제 (익명 또는 카카오 연동된 계정)
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
