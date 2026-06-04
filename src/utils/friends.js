import {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, arrayUnion, arrayRemove, limit as fsLimit,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { createNotification } from './roundupNotifications';
import { getKakaoFriends } from './kakaoAuth';

// =============================================================
// friendships/{pairId} — 친구 관계
//
// 문서 ID: pairId = 정렬된 (작은uid)_(큰uid). 두 사용자 사이엔 doc 1개.
// 필드: users:[a,b], requesterUid, recipientUid, status:'pending'|'accepted', createdAt, updatedAt
//
// 신청 = pending doc 생성
// 수락 = pending → accepted (update, recipient만)
// 거절·취소(보낸이)·해지 = doc 삭제 (양쪽 누구나)
//
// 보안 규칙(firestore.rules friendships): create=requesterUid 본인+pending /
//   update=recipient의 pending→accepted만 / delete=양쪽 누구나
//
// 차단(users/{uid}.blockedUids)은 별도 — 친구 관계와 독립적으로 동작.
// =============================================================

const COLLECTION = 'friendships';

export const pairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

// ── 조회 ─────────────────────────────────────────────────────

// 내 친구 목록 — 양쪽이 수락한 friendships
export async function loadMyFriends() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('users', 'array-contains', uid),
    where('status', '==', 'accepted'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    const otherUid = data.users.find(u => u !== uid);
    return { id: d.id, otherUid, ...data };
  });
}

// 내 친구 목록 + 프로필(닉네임·본명) 한 번에 — 동반자/친구지정 선택 화면 표시용.
//   각 친구의 users 문서를 병렬 fetch해 [{ id, name(닉네임), realName }] 반환. 본명은 마스킹 표시에 사용 ([[realname-policy]]).
export async function loadMyFriendsEnriched() {
  const friends = await loadMyFriends();
  const uids = friends.map(f => f.otherUid).filter(Boolean);
  if (uids.length === 0) return [];
  const snaps = await Promise.all(uids.map(u => getDoc(doc(db, USERS, u)).catch(() => null)));
  return uids.map((u, i) => {
    const d = snaps[i]?.exists() ? snaps[i].data() : null;
    return { id: u, name: d?.nickname || '친구', realName: d?.realName || '' };
  });
}

// 받은 친구 신청 — recipientUid 본인 + pending
export async function loadReceivedRequests() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('recipientUid', '==', uid),
    where('status', '==', 'pending'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 보낸 친구 신청 — requesterUid 본인 + pending
export async function loadSentRequests() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('requesterUid', '==', uid),
    where('status', '==', 'pending'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── 신청·수락·거절·취소·해지 ────────────────────────────────

// 친구 신청 — pending doc 생성 (deterministic pairId로 중복 차단)
//   actorName(신청자 닉네임)은 수신자 알림 표시용 — 호출처에서 본인 닉네임 전달.
export async function sendFriendRequest(toUid, actorName = '') {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!toUid) throw new Error('toUid required');
  if (uid === toUid) throw new Error('Cannot friend self');
  const id = pairId(uid, toUid);
  const ref = doc(db, COLLECTION, id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const data = existing.data();
    if (data.status === 'accepted') throw new Error('Already friends');
    if (data.status === 'pending') throw new Error('Already requested');
  }
  await setDoc(ref, {
    users: [uid, toUid].sort(),
    requesterUid: uid,
    recipientUid: toUid,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // 수신자에게 친구 신청 알림 (인앱 + 배포 시 푸시). 실패해도 신청 자체엔 영향 X.
  createNotification({ type: 'friendRequest', recipientUid: toUid, actorName: actorName || '' })
    .catch(e => __DEV__ && console.warn('[sendFriendRequest] noti fail', e?.message));
  return id;
}

// 받은 신청 수락 — pending → accepted (수신자만)
export async function acceptFriendRequest(fromUid) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!fromUid) throw new Error('fromUid required');
  const id = pairId(uid, fromUid);
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
}

// 받은 신청 거절 — doc 삭제 (양쪽 누구나 가능)
export async function rejectFriendRequest(fromUid) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!fromUid) throw new Error('fromUid required');
  await deleteDoc(doc(db, COLLECTION, pairId(uid, fromUid)));
}

// 내가 보낸 신청 취소 — doc 삭제
export async function cancelSentRequest(toUid) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!toUid) throw new Error('toUid required');
  await deleteDoc(doc(db, COLLECTION, pairId(uid, toUid)));
}

// 친구 끊기 — accepted doc 삭제
export async function unfriend(otherUid) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!otherUid) throw new Error('otherUid required');
  await deleteDoc(doc(db, COLLECTION, pairId(uid, otherUid)));
}

// 친구 여부 1회성 체크 (서버 조회) — 자주 호출 X. 목록 캐시 비교를 우선.
export async function isFriend(otherUid) {
  const uid = await getUid();
  if (!uid || !otherUid) return false;
  const snap = await getDoc(doc(db, COLLECTION, pairId(uid, otherUid)));
  return snap.exists() && snap.data().status === 'accepted';
}

// =============================================================
// users/{uid}.blockedUids — 차단 목록 (owner-only)
//
// 차단 사실은 상대에게 노출되지 않음 (정책 [[block-nickname]] / [[report-block-policy]]).
// 일일 한도(5명)는 클라이언트 카운트 유지.
// =============================================================

const USERS = 'users';

// 내 차단 목록 — users/{uid} 문서의 blockedUids 필드
export async function loadMyBlockedUids() {
  const uid = await getUid();
  if (!uid) return [];
  const snap = await getDoc(doc(db, USERS, uid));
  if (!snap.exists()) return [];
  const arr = snap.data().blockedUids;
  return Array.isArray(arr) ? arr : [];
}

// 사용자 차단 — users/{uid} 문서가 없으면 생성
export async function blockUid(targetUid) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!targetUid || targetUid === uid) throw new Error('Invalid target');
  const ref = doc(db, USERS, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      blockedUids: [targetUid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      blockedUids: arrayUnion(targetUid),
      updatedAt: serverTimestamp(),
    });
  }
}

// 닉네임 prefix 검색 — users.nickname >= q && <= q + . 자기 자신 제외, 최대 20개.
// Firestore는 부분 일치 미지원이라 prefix만. 차단된 사용자 필터는 호출 측에서 추가.
export async function searchUsersByNickname(qstr, maxResults = 20) {
  if (!qstr) return [];
  const me = await getUid();
  const q = query(
    collection(db, USERS),
    where('nickname', '>=', qstr),
    where('nickname', '<=', qstr + ''),
    fsLimit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ uid: d.data().uid || d.id, nickname: d.data().nickname || '' }))
    .filter(p => p.uid && p.uid !== me);
}

// 카카오 친구 id 배열 → Dear Golf 가입자(users) 매칭. kakaoId 'in' 쿼리는 10개 제한이라 배치 처리.
export async function findUsersByKakaoIds(kakaoIds) {
  const ids = [...new Set((kakaoIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    try {
      const snap = await getDocs(query(collection(db, USERS), where('kakaoId', 'in', batch)));
      snap.forEach(d => out.push({ uid: d.data().uid || d.id, nickname: d.data().nickname || '', kakaoId: d.data().kakaoId || '' }));
    } catch (e) {
      if (__DEV__) console.warn('[friends] findUsersByKakaoIds batch 실패', e?.message);
    }
  }
  return out;
}

// 카카오 친구 중 Dear Golf 가입자 — friends scope 동의 시 매칭. 본인 제외.
//   반환: { status: 'ok'|'no-consent'|'error', users:[{uid, nickname}] }
export async function findKakaoFriendUsers() {
  const res = await getKakaoFriends();
  if (!res.ok) {
    return { status: res.error === 'no-consent' ? 'no-consent' : 'error', users: [] };
  }
  const me = await getUid();
  const matched = await findUsersByKakaoIds(res.friends.map(f => f.kakaoId));
  return { status: 'ok', users: matched.filter(u => u.uid && u.uid !== me) };
}

// 차단 해제
export async function unblockUid(targetUid) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!targetUid) throw new Error('targetUid required');
  await updateDoc(doc(db, USERS, uid), {
    blockedUids: arrayRemove(targetUid),
    updatedAt: serverTimestamp(),
  });
}
