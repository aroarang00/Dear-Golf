import {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, arrayUnion, arrayRemove, limit as fsLimit,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { createNotification } from './roundupNotifications';
import { getKakaoFriends } from './kakaoAuth';
import { loadFriendData } from './friendGroups';

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
// ★별명(customName)은 owner-only — 저장(공유 round/일정으로 전파됨)엔 절대 넣지 말 것(누출).
//   name=닉네임(저장 안전), customName은 표시 전용으로 분리 동봉. 동반자 저장은 name, 화면 표시는 customName||name resolve ([[friend_groups]])
export async function loadMyFriendsEnriched() {
  const friends = await loadMyFriends();
  const uids = friends.map(f => f.otherUid).filter(Boolean);
  if (uids.length === 0) return [];
  const [snaps, fdata] = await Promise.all([
    Promise.all(uids.map(u => getDoc(doc(db, USERS, u)).catch(() => null))),
    loadFriendData().catch(() => ({ friendMeta: {} })),
  ]);
  const meta = fdata?.friendMeta || {};
  return uids.map((u, i) => {
    const d = snaps[i]?.exists() ? snaps[i].data() : null;
    const nickname = d?.nickname || '친구';
    const customName = (meta[u]?.customName || '').trim() || null;
    // avatarUri — 원격 URL(카카오 등)만 유효, 로컬 키는 친구가 못 읽음(표시부에서 https 검사 후 사용, FriendsTab과 동일)
    return { id: u, name: nickname, nickname, customName, realName: d?.realName || '', avatarUri: d?.avatarUrl || null };
  });
}

// 원격(https) 아바타만 유효 — 로컬 키는 친구가 못 읽음(표시부 https 검사, FriendsTab과 동일).
const httpsOnly = (u) => (u && /^https?:/.test(u)) ? u : null;

// 크루/그룹 멤버 표시정보 resolve — 보는 사람 별명(customName) 우선 → 비친구는 닉네임 → 최후 namesFallback.
//   반환: uid → { name, avatarUri, self }. myUid는 '나'로 표시(별명·사진 누출 없이 보는 사람 기준 [[friend_groups]]).
export async function resolveMemberDisplay(uids, { myUid = null, namesFallback = {} } = {}) {
  const list = Array.from(new Set((uids || []).filter(Boolean)));
  const out = {};
  if (!list.length) return out;
  const friends = await loadMyFriendsEnriched().catch(() => []);
  const fmap = {};
  friends.forEach((f) => { fmap[f.id] = f; });
  const missing = list.filter((u) => u !== myUid && !fmap[u]);
  const profiles = missing.length ? await loadFriendProfiles(missing).catch(() => ({})) : {};
  list.forEach((u) => {
    if (u === myUid) { out[u] = { name: '나', avatarUri: null, self: true }; return; }
    const f = fmap[u];
    if (f) { out[u] = { name: f.customName || f.name || namesFallback[u] || '친구', avatarUri: httpsOnly(f.avatarUri) }; return; }
    const p = profiles[u];
    out[u] = { name: namesFallback[u] || p?.nickname || '친구', avatarUri: httpsOnly(p?.avatarUrl) };
  });
  return out;
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

// 친구/신청 상대들의 공개 프로필(users 문서) 일괄 로드 → uid→프로필 맵. 명함 카드 빌드용(FriendsTab·프리페치 공용).
//   FriendsTab의 인라인 profileByUid 매핑과 동일 필드.
export async function loadFriendProfiles(uids) {
  const list = Array.from(new Set((uids || []).filter(Boolean)));
  if (!list.length) return {};
  const snaps = await Promise.all(list.map(u => getDoc(doc(db, USERS, u)).catch(() => null)));
  const byUid = {};
  snaps.forEach((snap, i) => {
    if (!snap?.exists()) return;
    const d = snap.data();
    byUid[list[i]] = {
      nickname: d.nickname || '', realName: d.realName || '', statusMessage: d.statusMessage || '',
      lifeBest: d.lifeBest || 0, avgScore: d.avgScore || 0, totalRounds: d.totalRounds || 0,
      avatarUrl: d.avatarUrl || null,
      handicap: typeof d.handicap === 'number' ? d.handicap : null,
      lastFriendPostAt: d.lastFriendPostAt || null,
    };
  });
  return byUid;
}

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

// 닉네임 정확일치 검색 — users.nickname == q. 자기 자신 제외, 최대 20개.
// prefix 아님(앞부분 검색 X): 닉을 정확히 아는 지인만 매칭(낯선사람 브라우징↓, 카카오가 주 경로 [[roundup-public-disabled]]). 동명이인은 여럿 반환될 수 있어 마스킹 본명·아바타로 구분.
export async function searchUsersByNickname(qstr, maxResults = 20) {
  if (!qstr) return [];
  const me = await getUid();
  const q = query(
    collection(db, USERS),
    where('nickname', '==', qstr),
    fsLimit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs
    // realName도 반환 — 검색 결과에서 동명이인 구분용(마스킹 표시). 본명 미입력자는 빈 값 ([[realname-policy]])
    .map(d => ({ uid: d.data().uid || d.id, nickname: d.data().nickname || '', realName: d.data().realName || '' }))
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
