// =============================================================
// 계정 탈퇴 — Firestore 데이터 cascade delete + Firebase 계정 + 로컬 데이터 전부 삭제
// 정책: [[account-deletion]] A안 — 콘텐츠 전부 삭제, 정지 이력만 banned_users 보존 (D2 별도)
// App Store/Play 스토어 심사 필수 요건 (계정 삭제 경로 제공)
// =============================================================
import { signInAnonymously, deleteUser, OAuthProvider, reauthenticateWithCredential, signOut, revokeAccessToken } from 'firebase/auth';
import {
  collection, query, where, getDocs, getDoc, setDoc, deleteDoc, doc, updateDoc,
  arrayRemove, increment, serverTimestamp,
} from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { auth, db, getUid, storage as fbStorage } from './firebase';
import { STORAGE_KEYS, storage } from './storage';
import { createNotification } from './roundupNotifications';
import { leaveCrew } from './crews';

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
      // 현 leaveRoundup과 통일 — closed는 건드리지 않는다(개별·단체 공통). '확정 후 결원=그 자리만 열림'으로
      //   빈자리 충원이 재모집 역할 대체([[roundup-waitlist-autopromote]]). ★옛 코드의 closed:false(개별 재오픈)는 제거 —
      //   계정삭제로 확정이 풀려 남은 멤버 자동등록 일정이 reconcile에서 삭제되던 결함 차단(2026-06-27).
      //   (확정모집에서도 규칙상 참여자 셀프 제거 허용: changedKeysWithin + selfMembershipToggled)
      try {
        const upd = { participantUids: arrayRemove(uid), joined: increment(-1), updatedAt: serverTimestamp() };
        await updateDoc(d.ref, upd);
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

// 크루 전체 탈퇴 — 안 하면 탈퇴 uid가 멤버 목록에 유령으로 남음(이름은 names 동결값, 친추 버튼은 막다른길.
//   2026-07-04 탈퇴 테스트서 발견). leaveCrew 재사용 = 크루장 승계·운영진 제거·declinedUids까지 기존 로직 그대로,
//   마지막 1인이면 빈 크루가 되고 CF(onCrewUpdated)가 정리. 본인 크루 게시글·댓글은 카톡처럼 보존(작성자명 동결).
async function leaveAllCrews(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'crews'), where('memberUids', 'array-contains', uid)));
    await Promise.all(snap.docs.map(d => leaveCrew(d.id, uid).catch(e => {
      if (__DEV__) console.warn('[account] crew leave fail', d.id, e?.message);
    })));
  } catch (e) {
    console.warn('[account] crews 쿼리 실패', e?.message);
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
    leaveAllCrews(uid),   // 크루 유령 멤버 방지 — DM 스레드는 카톡처럼 보존(상대의 대화 기록 유지)
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

  // 1.5 Storage 미디어 정리 — 다이어리(rounds)·아바타·DM 사진 폴더 삭제.
  //   미디어 전량 백업([[diary-media-backup-plan]]) 도입으로 나만보기 사진도 서버에 있음 —
  //   안 지우면 탈퇴 후 고아 파일이 영구 과금. best-effort(파일별 실패 무시), 계정 삭제 전(권한 필요).
  if (uid) {
    for (const dir of [`rounds/${uid}`, `avatars/${uid}`, `dmImages/${uid}`]) {
      try {
        const { items } = await listAll(ref(fbStorage, dir));
        await Promise.all(items.map(it => deleteObject(it).catch(() => {})));
      } catch (e) {
        if (__DEV__) console.warn('[account] Storage 정리 실패', dir, e?.message);
      }
    }
  }

  // 2. Firebase 계정 삭제 (익명 또는 카카오 연동된 계정)
  //   ★카카오 연동 계정은 토큰이 오래되면 deleteUser가 requires-recent-login으로 실패 →
  //    계정이 안 지워진 채 재로그인하면 같은 uid로 부활(탈퇴가 무효화)하던 근본 버그.
  //    실패 시 카카오 재인증(fresh idToken)으로 reauthenticate 후 재시도.
  const user = auth.currentUser;
  const isApple = user?.providerData?.some(p => p.providerId === 'apple.com');
  // 2-A. Apple 로그인 계정 — App Store 5.1.1(v): 탈퇴 시 애플 토큰 해지(revoke) 의무.
  //   해지엔 fresh authorizationCode가 필요해 애플 로그인 시트를 한 번 더 띄운다(탈퇴는 드물어 허용).
  //   같은 fresh credential로 재인증까지 해두면 아래 deleteUser의 requires-recent-login도 예방.
  //   전 과정 best-effort — 시트 취소/실패해도 탈퇴(삭제)는 계속 진행.
  if (user && isApple) {
    try {
      const { getAppleReauthMaterial } = require('./appleAuth');
      const m = await getAppleReauthMaterial();
      if (m) {
        try { await reauthenticateWithCredential(user, m.credential); } catch (e) {
          if (__DEV__) console.warn('[account] 애플 재인증 실패', e?.code || e?.message);
        }
        if (m.authorizationCode) {
          try { await revokeAccessToken(auth, m.authorizationCode); } catch (e) {
            if (__DEV__) console.warn('[account] 애플 토큰 해지 실패', e?.code || e?.message);
          }
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[account] 애플 재인증 자료 획득 실패', e?.message);
    }
  }
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

  // 2.5 카카오 연결 끊기(unlink) — 안 하면 카카오 계정의 '연결된 서비스'와 동의 항목(친구목록 등)이 남아
  //   재가입 때 동의 화면이 다시 안 뜸(탈퇴는 말 그대로 탈퇴여야 — 사용자 결정 2026-07-04). 카카오 가이드도
  //   회원 탈퇴 시 unlink 권장. ★위 deleteUser의 재인증 경로가 카카오 로그인을 쓰므로 반드시 계정 삭제 '뒤'에.
  try {
    const { unlink } = require('@react-native-kakao/user');
    await unlink();
  } catch (e) {
    if (__DEV__) console.warn('[account] 카카오 unlink 실패(미연동 등)', e?.message);
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

// =============================================================
// 로그아웃 — 서버 데이터는 보존(재로그인 시 복원), 이 기기에서만 계정 분리.
// 용도: 폰 대여·중고 양도 등 기기-계정 분리(정식 출시 전 추가, 2026-07-04).
// ★사진·영상 미디어는 로컬 전용(서버 백업 없음)이라 로컬 초기화와 함께 유실됨 —
//   호출부(마이페이지)에서 반드시 명시적 경고 후 진행. 각 단계 best-effort.
// =============================================================
export async function logoutAccount() {
  // 1. 이 기기의 푸시 토큰을 계정에서 제거 — 안 지우면 로그아웃 후에도(다음 폰 주인에게)
  //    이전 계정의 알림이 이 기기로 계속 배달되는 보안 구멍.
  try {
    const uid = await getUid();
    if (uid) {
      await setDoc(doc(db, 'users', uid), {
        uid, // users 규칙(request.resource.data.uid == uid) 충족
        pushToken: null, pushUpdatedAt: serverTimestamp(),
      }, { merge: true });
    }
  } catch (e) {
    if (__DEV__) console.warn('[account] 로그아웃 푸시토큰 해제 실패', e?.message);
  }

  // 2. 카카오 세션 로그아웃 — 다음 사용자가 '카카오로 시작'할 때 이전 계정 자동로그인 방지
  try {
    const { logout } = require('@react-native-kakao/user');
    await logout();
  } catch (e) {
    if (__DEV__) console.warn('[account] 카카오 로그아웃 실패(미연동 등)', e?.message);
  }

  // 3. Firebase 세션 종료
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('[account] signOut 실패', e?.message);
  }

  // 4. 로컬 데이터 전부 초기화 — 신규 설치와 동일(탈퇴 3단계와 동일 처리)
  await storage.clear();
  await storage.save(STORAGE_KEYS.schedules, []);
  await storage.save(STORAGE_KEYS.diaries, []);
  await storage.save(STORAGE_KEYS.hof, []);

  // 5. 새 익명 세션 — 온보딩 화면이 뜨는 동안 Firestore 접근이 죽지 않게(탈퇴와 동일)
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('[account] 새 익명 세션 생성 실패', e?.message);
  }
}
