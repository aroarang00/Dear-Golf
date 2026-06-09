// =============================================================
// 계정 탈퇴 — Firestore 데이터 cascade delete + Firebase 계정 + 로컬 데이터 전부 삭제
// 정책: [[account-deletion]] A안 — 콘텐츠 전부 삭제, 정지 이력만 banned_users 보존 (D2 별도)
// App Store/Play 스토어 심사 필수 요건 (계정 삭제 경로 제공)
// =============================================================
import { signInAnonymously, deleteUser, OAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
  collection, query, where, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc,
  arrayRemove, increment, serverTimestamp,
} from 'firebase/firestore';
import { auth, db, getUid } from './firebase';
import { STORAGE_KEYS, storage } from './storage';
import { createNotification } from './roundupNotifications';

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

// 본인이 참여·대기 중인 다른 사람 모집에서 uid 제거 (정원 -1) + 주최자에게 이탈 알림
async function leaveJoinedRoundups(uid, actorName) {
  try {
    const snap = await getDocs(query(
      collection(db, 'roundups'),
      where('participantUids', 'array-contains', uid),
    ));
    await Promise.all(snap.docs.map(async (d) => {
      const data = d.data();
      if (data.authorUid === uid) return; // 본인 작성 모집은 cancelOwnRoundups에서 처리
      // 정식 참여취소(leaveRoundup)와 동일하게 — closed:false로 확정 해제(결원 처리), updatedAt 갱신.
      // (확정모집에서도 규칙상 참여자 셀프 제거 허용: changedKeysWithin + selfMembershipToggled)
      try {
        await updateDoc(d.ref, {
          participantUids: arrayRemove(uid),
          joined: increment(-1),
          closed: false,
          updatedAt: serverTimestamp(),
        });
        // 주최자에게 알림 — 참여 취소와 동일('cancel'). 탈퇴로 자리가 빔 → 주최자가 인원 변화를 인지.
        await createNotification({
          type: 'cancel', recipientUid: data.authorUid, actorName: actorName || '',
          postId: d.id, postTitle: data.course || '',
        }).catch(() => {});
      } catch (e) {
        if (__DEV__) console.warn('[account] leave participant fail', e?.message);
      }
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

// 본인이 주최한 모집 — 삭제 '전에' 참여자 전원에게 취소 알림(주최자 탈퇴).
//   roundupCancelled 수신 클라가 연결된 본인 일정도 자동 정리(RoundupTab) → 고아 일정 방지.
async function cancelOwnRoundups(uid, actorName) {
  try {
    const snap = await getDocs(query(
      collection(db, 'roundups'),
      where('authorUid', '==', uid),
    ));
    await Promise.all(snap.docs.map(async (d) => {
      const data = d.data();
      const parts = (Array.isArray(data.participantUids) ? data.participantUids : [])
        .filter(u => u && u !== uid);
      await Promise.all(parts.map(rid => createNotification({
        type: 'roundupCancelled', recipientUid: rid, actorName: actorName || '',
        postId: d.id, postTitle: data.course || '', scheduleDate: data.date || '',
      }).catch(() => {})));
      await deleteDoc(d.ref).catch(e => __DEV__ && console.warn('[account] own roundup delete fail', e?.message));
    }));
  } catch (e) {
    console.warn('[account] own roundups 쿼리 실패', e?.message);
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
  // 알림 표시용 닉네임 — users 문서 삭제 전에 확보(주최자/참여자 알림의 actorName).
  let actorName = '';
  try {
    const us = await getDoc(doc(db, 'users', uid));
    if (us.exists()) actorName = us.data().nickname || us.data().displayName || '';
  } catch {}
  // ★모집 정리는 friendships·users 삭제 '전에' + 인증 살아있는 이 시점에 (알림 생성 actorUid 필요).
  //   ① 참여 모집에서 빠짐 + 주최자에게 'cancel' 알림 ([[account-deletion]] §8)
  //   ② 본인 주최 모집은 참여자에게 'roundupCancelled' 알림 후 삭제 (고아 일정도 클라가 자동 정리)
  await leaveJoinedRoundups(uid, actorName);
  await cancelOwnRoundups(uid, actorName);
  await Promise.all([
    deleteByQuery('courseComments', 'authorUid', uid),
    deleteByQuery('rounds', 'ownerUid', uid),
    deleteByQuery('schedules', 'ownerUid', uid),
    deleteByQuery('roundupApplications', 'applicantUid', uid),
    deleteByQuery('roundupNotifications', 'recipientUid', uid), // 받은 알림(유령 카드) 정리
    deleteFriendships(uid),
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
  //   ★카카오 연동 계정은 토큰이 오래되면 deleteUser가 requires-recent-login으로 실패 →
  //    계정이 안 지워진 채 재로그인하면 같은 uid로 부활(탈퇴가 무효화)하던 근본 버그.
  //    실패 시 카카오 재인증(fresh idToken)으로 reauthenticate 후 재시도.
  const user = auth.currentUser;
  if (user) {
    try {
      await deleteUser(user);
    } catch (e) {
      const isKakao = user.providerData?.some(p => p.providerId === 'oidc.kakao');
      if (e?.code === 'auth/requires-recent-login' && isKakao) {
        try {
          const { loginWithKakao } = require('./kakaoAuth');
          const r = await loginWithKakao();
          if (r?.ok && r.idToken) {
            const cred = new OAuthProvider('oidc.kakao').credential({ idToken: r.idToken });
            await reauthenticateWithCredential(user, cred);
            await deleteUser(user);
          } else {
            console.warn('[account] 재인증용 카카오 토큰 없음 — 계정 삭제 보류');
          }
        } catch (e2) {
          console.warn('[account] 재인증 후 계정 삭제 실패', e2?.message);
        }
      } else {
        console.warn('[account] Firebase 계정 삭제 실패', e?.message);
      }
    }
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
