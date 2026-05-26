import {
  collection, query, where, orderBy, getDocs, getDoc,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  arrayUnion, arrayRemove, increment,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// roundups/{postId} — 라운딩 모집글
//
// 보안 규칙 (firestore.rules):
//  - read   : scope=='all' OR authorUid==me OR (scope=='friends' AND areFriends)
//  - create : authorUid==me + scope in ['all','friends'] + participantUids/waitlistUids 배열
//  - update : 주최자(전체) OR 참여자(participantUids/waitlistUids/joined/teamJoined 토글만)
//  - delete : 주최자
//
// 인덱스 (firestore.indexes.json):
//  - (scope, createdAt desc): 전체 모집 / 친구 모집
//  - (authorUid, createdAt desc): 내 모집 / 친구별 모집
//
// 정원 처리는 Cloud Function(트랜잭션) 이관 권장 — 현재는 클라이언트 직접 (스팸·중복 가능).
// =============================================================

const COLLECTION = 'roundups';

// ── 조회 ──────────────────────────────────────────────────────

// 전체공개 모집 (scope='all') — createdAt 내림차순
export async function loadAllRoundups() {
  const q = query(
    collection(db, COLLECTION),
    where('scope', '==', 'all'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 내가 작성한 모집글 (전체공개 + 친구공개 모두)
export async function loadMyRoundups() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 특정 친구가 작성한 친구공개 모집 — friends 탭에서 친구별로 호출
export async function loadFriendRoundups(friendUid) {
  if (!friendUid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('authorUid', '==', friendUid),
    where('scope', '==', 'friends'),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 단일 모집글 조회 (상세 화면)
export async function loadRoundup(postId) {
  if (!postId) return null;
  const snap = await getDoc(doc(db, COLLECTION, postId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ── 생성·수정·삭제 (주최자) ──────────────────────────────────

export async function createRoundup(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const post = {
    authorUid: uid,
    authorName: data.authorName || '',
    type: data.type || 'fixed',
    course: data.course || '',
    courseKakaoId: data.courseKakaoId || null,
    date: data.date || null,
    day: data.day || null,
    time: data.time || null,
    teams: typeof data.teams === 'number' ? data.teams : 1,
    capacity: typeof data.capacity === 'number' ? data.capacity : 4,
    joined: 1, // 주최자 본인 포함 시작값
    teamJoined: Array.isArray(data.teamJoined) ? data.teamJoined : [1],
    participantUids: [uid], // 주최자도 참여자에 포함
    waitlistUids: [],
    scope: data.scope || 'all',
    closed: false,
    word: data.word || '',
    kakaoOpenChatUrl: data.kakaoOpenChatUrl || null,
    ageGroup: data.ageGroup || null,
    companion: data.companion || null,
    skill: data.skill || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), post);
  return { id: ref.id, ...post };
}

// 주최자 전체 수정 (제목·날짜·정원 등). authorUid 변조 금지(규칙 강제).
export async function updateRoundupAsAuthor(postId, data) {
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  const { authorUid, id, createdAt, ...updatable } = data;
  await updateDoc(ref, { ...updatable, updatedAt: serverTimestamp() });
}

// 모집글 삭제 — 주최자만
export async function deleteRoundup(postId) {
  if (!postId) throw new Error('postId required');
  await deleteDoc(doc(db, COLLECTION, postId));
}

// ── 참여 신청·취소 (참여자 액션) ───────────────────────────────

// 참여 신청 — participantUids에 me 추가, joined +1
// 보안 규칙: 참여자는 participantUids/waitlistUids/joined/teamJoined만 변경 + 본인 토글
export async function joinRoundup(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, {
    participantUids: arrayUnion(uid),
    joined: increment(1),
    updatedAt: serverTimestamp(),
  });
}

// 참여 취소 — participantUids에서 me 제거, joined -1
export async function leaveRoundup(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, {
    participantUids: arrayRemove(uid),
    joined: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

// 대기 신청
export async function joinWaitlist(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, {
    waitlistUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

// 대기 취소
export async function leaveWaitlist(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, {
    waitlistUids: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

// ── 주최자 액션 — 강퇴·마감 등 ───────────────────────────────

// 주최자가 참여자를 강퇴 (uid 제거 + joined -1)
// 강퇴 정책: 월 2회 한도·누적 10회→2개월 정지는 별도 카운트 시스템에서 ([[roundup-kick-policy]])
export async function kickParticipant(postId, targetUid) {
  if (!postId || !targetUid) throw new Error('postId and targetUid required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, {
    participantUids: arrayRemove(targetUid),
    joined: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

// 모집 마감 (정원 도달 또는 주최자 수동)
export async function closeRoundup(postId) {
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, { closed: true, updatedAt: serverTimestamp() });
}
