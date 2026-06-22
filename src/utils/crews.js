import {
  collection, collectionGroup, query, where, orderBy, limit, getDocs, onSnapshot,
  setDoc, addDoc, updateDoc, deleteDoc, getDoc, doc, serverTimestamp, arrayUnion, arrayRemove, increment,
} from 'firebase/firestore';
import { db } from './firebase';

// =============================================================
// crews/{crewId} — 친구 소수 그룹 공유 앨범 (docs/crew-space-design.md)
//
// 멤버십 = scheduleGroups 패턴(초대/수락 셀프토글, cross-user 쓰기 0 = CF 불필요).
//   crews/{crewId}: { creatorUid, name, memberUids[], audienceUids[], declinedUids[], names{uid:name},
//                     notice?, noticeBy?, noticeAt?, postCount?, lastPostAt?, createdAt, updatedAt }
//   crews/{crewId}/posts/{postId}:            { authorUid, text, media:[{url,type,poster?}], commentCount?, createdAt }
//   crews/{crewId}/posts/{postId}/comments/{commentId}: { authorUid, body, parentId?(대댓글), createdAt }
//
// 표시 이름은 보는 사람 각자 별명(friendDisplayName)으로 화면에서 resolve — 저장은 authorUid(+names 폴백).
// =============================================================

const COL = 'crews';
const MAX_CREWS = 30;     // 1인당 소프트 캡
const MAX_MEMBERS = 20;   // 크루당

// ── 크루 생성 ── (creatorUid=me, memberUids=[me], audience=초대 친구)
export async function createCrew({ creatorUid, creatorName = '', name, friendUids = [], names = {} }) {
  if (!creatorUid || !(name || '').trim()) return null;
  const aud = [...new Set((friendUids || []).filter((u) => u && u !== creatorUid))].slice(0, MAX_MEMBERS - 1);
  const ref = doc(collection(db, COL));
  await setDoc(ref, {
    creatorUid,
    name: name.trim(),
    memberUids: [creatorUid],
    audienceUids: aud,
    declinedUids: [],
    names: { [creatorUid]: creatorName || '', ...names },
    notice: '',
    postCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── 내 크루 구독 (멤버) — 최근활동순 정렬은 클라(즐겨찾기 우선) ──
export function subscribeMyCrews(uid, cb) {
  if (!uid) { cb([]); return () => {}; }
  const q = query(collection(db, COL), where('memberUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeMyCrews', e?.message); cb([]); });
}

// ── 내게 온 초대 구독 (audience, 미수락·미거절) ──
export function subscribeCrewInvites(uid, cb) {
  if (!uid) { cb([]); return () => {}; }
  const q = query(collection(db, COL), where('audienceUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => {
      const c = d.data();
      if ((c.memberUids || []).includes(uid)) return;   // 이미 멤버
      if ((c.declinedUids || []).includes(uid)) return;  // 거절함
      list.push({ id: d.id, ...c });
    });
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrewInvites', e?.message); cb([]); });
}

// ── 단일 크루 구독 — 멤버/앨범 화면이 멤버·공지 변화를 실시간 반영(초대·탈퇴 후 즉시) ──
export function subscribeCrew(crewId, cb) {
  if (!crewId) { cb(null); return () => {}; }
  return onSnapshot(doc(db, COL, crewId), (d) => {
    cb(d.exists() ? { id: d.id, ...d.data() } : null);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrew', e?.message); cb(null); });
}

// 내가 든 크루 수 — 생성/가입 캡 체크용
export async function myCrewCount(uid) {
  if (!uid) return 0;
  const snap = await getDocs(query(collection(db, COL), where('memberUids', 'array-contains', uid)));
  return snap.size;
}
export { MAX_CREWS, MAX_MEMBERS };

// ── 초대 수락 — audience가 memberUids에 자기 uid만 토글(셀프) ──
export async function acceptCrewInvite(crewId, uid, myName = '') {
  if (!crewId || !uid) return;
  const upd = { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() };
  if (myName) upd[`names.${uid}`] = myName;
  await updateDoc(doc(db, COL, crewId), upd);
}
// ── 초대 거절 — declinedUids 자기 토글 ──
export async function declineCrewInvite(crewId, uid) {
  if (!crewId || !uid) return;
  await updateDoc(doc(db, COL, crewId), { declinedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}

// ── 친구 더 초대 (멤버 누구나) — audience 추가 + declined 제거(재초대) + 이름맵 보강 ──
export async function inviteToCrew(crewId, friendUids = [], names = {}) {
  const aud = [...new Set((friendUids || []).filter(Boolean))];
  if (!crewId || !aud.length) return;
  const upd = { audienceUids: arrayUnion(...aud), declinedUids: arrayRemove(...aud), updatedAt: serverTimestamp() };
  Object.keys(names).forEach((u) => { if (names[u]) upd[`names.${u}`] = names[u]; });
  await updateDoc(doc(db, COL, crewId), upd);
}

// ── 탈퇴 — 본인 memberUids 제거 + declinedUids 추가(재초대 전엔 초대 재노출 방지) ──
export async function leaveCrew(crewId, uid) {
  if (!crewId || !uid) return;
  await updateDoc(doc(db, COL, crewId), {
    memberUids: arrayRemove(uid), declinedUids: arrayUnion(uid), updatedAt: serverTimestamp(),
  });
}

// ── 이름 변경 (전원 동등 — 멤버 누구나) ──
export async function renameCrew(crewId, name) {
  if (!crewId || !(name || '').trim()) return;
  await updateDoc(doc(db, COL, crewId), { name: name.trim(), updatedAt: serverTimestamp() });
}

// ── 공지 설정 (텍스트만, 최신이 기존 대체, 멤버 누구나) ──
export async function setCrewNotice(crewId, notice, uid) {
  if (!crewId) return;
  await updateDoc(doc(db, COL, crewId), {
    notice: (notice || '').trim(), noticeBy: uid || null, noticeAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// ── 게시물 ──
export async function addCrewPost(crewId, { authorUid, text = '', media = [] }) {
  if (!crewId || !authorUid) return null;
  const ref = await addDoc(collection(db, COL, crewId, 'posts'), {
    authorUid, text: (text || '').trim(), media: media || [], commentCount: 0, createdAt: serverTimestamp(),
  });
  // 크루 최근활동 갱신(목록 정렬·새 글 표시용)
  updateDoc(doc(db, COL, crewId), { postCount: increment(1), lastPostAt: serverTimestamp(), updatedAt: serverTimestamp() })
    .catch((e) => __DEV__ && console.warn('[crews] post meta', e?.message));
  return ref.id;
}
export function subscribeCrewPosts(crewId, cb) {
  if (!crewId) { cb([]); return () => {}; }
  const q = query(collection(db, COL, crewId, 'posts'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrewPosts', e?.message); cb([]); });
}
export async function deleteCrewPost(crewId, postId) {
  if (!crewId || !postId) return;
  await deleteDoc(doc(db, COL, crewId, 'posts', postId));
  updateDoc(doc(db, COL, crewId), { postCount: increment(-1), updatedAt: serverTimestamp() })
    .catch((e) => __DEV__ && console.warn('[crews] post dec', e?.message));
}

// ── 댓글 / 대댓글 (parentId 있으면 대댓글) ──
export async function addCrewComment(crewId, postId, { authorUid, body = '', parentId = null }) {
  if (!crewId || !postId || !authorUid || !(body || '').trim()) return null;
  const ref = await addDoc(collection(db, COL, crewId, 'posts', postId, 'comments'), {
    authorUid, body: body.trim(), parentId: parentId || null, createdAt: serverTimestamp(),
  });
  updateDoc(doc(db, COL, crewId, 'posts', postId), { commentCount: increment(1) })
    .catch((e) => __DEV__ && console.warn('[crews] comment meta', e?.message));
  return ref.id;
}
export function subscribeCrewComments(crewId, postId, cb) {
  if (!crewId || !postId) { cb([]); return () => {}; }
  const q = query(collection(db, COL, crewId, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(300));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrewComments', e?.message); cb([]); });
}
export async function deleteCrewComment(crewId, postId, commentId) {
  if (!crewId || !postId || !commentId) return;
  await deleteDoc(doc(db, COL, crewId, 'posts', postId, 'comments', commentId));
  updateDoc(doc(db, COL, crewId, 'posts', postId), { commentCount: increment(-1) })
    .catch((e) => __DEV__ && console.warn('[crews] comment dec', e?.message));
}
