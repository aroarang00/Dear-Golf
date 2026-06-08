import {
  collection, query, where, orderBy, getDocs, getDoc,
  addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  arrayUnion, arrayRemove, increment, runTransaction,
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
  // 주최자 소프트 취소(cancelledByHost) 모집은 라운지 목록에서 숨김 (문서는 보존 — 매너평가·보관용)
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.cancelledByHost);
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
  // 주최자 소프트 취소(cancelledByHost) 모집은 라운지 목록에서 숨김 (문서는 보존 — 매너평가·보관용)
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.cancelledByHost);
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
  // 주최자 소프트 취소(cancelledByHost) 모집은 라운지 목록에서 숨김 (문서는 보존 — 매너평가·보관용)
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.cancelledByHost);
}

// 나를 대상으로 한 친구지정(scope='select') 모집 — 작성 시점 해석된 audienceUids 기준.
//   include·exclude 모두 audienceUids로 통일돼 array-contains 하나로 안전 조회 ([[roundup-visibility-design]] 2026-06-01 정정).
//   orderBy 없이 받아 호출부(RoundupTab)에서 client 정렬. 인덱스 (scope, audienceUids CONTAINS).
//   내가 올린 select 모집은 loadMyRoundups가 따로 가져오므로 여기선 수신자 기준만.
export async function loadSelectRoundupsForMe(myUid) {
  if (!myUid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('scope', '==', 'select'),
    where('audienceUids', 'array-contains', myUid),
  );
  const snap = await getDocs(q);
  // 주최자 소프트 취소(cancelledByHost) 모집은 라운지 목록에서 숨김 (문서는 보존 — 매너평가·보관용)
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.cancelledByHost);
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
    // 친구지정(select) — selectMode·selectedUids는 원래 선택(수정 복원용), audienceUids는 해석된 실제 수신자
    //   ([[roundup-visibility-design]] 2026-06-01). select 아닐 땐 null/빈배열.
    selectMode: data.scope === 'select' ? (data.selectMode || 'include') : null,
    selectedUids: Array.isArray(data.selectedUids) ? data.selectedUids : [],
    audienceUids: Array.isArray(data.audienceUids) ? data.audienceUids : [],
    // 그룹 빠른선택으로 채운 경우 원본 그룹 id(수정 복원·표시용). 친구지정 audienceUids는 위에서 처리 ([[friend_groups]] Phase C)
    audienceGroupIds: Array.isArray(data.audienceGroupIds) ? data.audienceGroupIds : [],
    inviteStyle: data.scope === 'select' ? (data.inviteStyle || 'casual') : null,
    closed: false,
    word: data.word || '',
    kakaoOpenChatUrl: data.kakaoOpenChatUrl || null,
    ageGroup: data.ageGroup || null,
    companion: data.companion || null,
    skill: data.skill || null,
    region: data.region || null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    likedBy: [], // 좋아요(응원) 누른 uid — 규칙상 토글 전 필드가 존재해야 함 ([[roundup-friend-redesign]])
    openTime: Array.isArray(data.openTime) ? data.openTime : null,
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

// 참여 신청 — participantUids에 me 추가, joined +1.
// 보안 규칙: 참여자는 participantUids/waitlistUids/joined/teamJoined만 변경 + 본인 토글.
// 트랜잭션으로 정원을 서버에서 강제 — 선착순. 정원 1자리에 동시 수락이 몰려도 capacity 초과 차단
//   ([[data-integrity-principles]]). joined는 개별·팀 모두 증가하므로 capacity(개별=members+1, 팀=teams*4)와 직접 비교.
//   throw 'full'(정원 참/마감) / 'not-found'. 이미 참여자면 멱등(아무 변경 없이 성공).
export async function joinRoundup(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('not-found');
    const d = snap.data();
    const participants = Array.isArray(d.participantUids) ? d.participantUids : [];
    if (participants.includes(uid)) return; // 멱등 — 이미 확정된 참여자
    if (d.closed) throw new Error('full');   // 주최자 확정/마감
    if ((d.joined || 0) >= (d.capacity || 4)) throw new Error('full'); // 선착순 정원 초과 차단
    tx.update(ref, {
      participantUids: arrayUnion(uid),
      joined: increment(1),
      updatedAt: serverTimestamp(),
    });
  });
}

// 참여 취소 — participantUids에서 me 제거, joined -1
export async function leaveRoundup(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  // closed:false — 결원 발생 시 확정 해제 (이미 false면 diff에 안 잡혀 무해). [[roundup-penalty-policy]] §4
  await updateDoc(ref, {
    participantUids: arrayRemove(uid),
    joined: increment(-1),
    closed: false,
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

// ── 좋아요(응원) — 모두 공개, 멱등 토글 ───────────────────────
// likedBy 배열에 본인 uid만 add/remove. 카운트=likedBy.length. updatedAt은 건드리지 않음
// (보안규칙 changedKeysWithin(['likedBy'])과 일치 — 골퍼코멘트 좋아요와 동일 패턴).
// 주최자 본인은 자기 글 응원 불가(클라에서 버튼 비노출).
export async function toggleRoundupLike(postId, currentlyLiked) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, { likedBy: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid) });
}

// ── 주최자 액션 — 강퇴·마감 등 ───────────────────────────────

// 모집 마감 (정원 도달 또는 주최자 수동)
export async function closeRoundup(postId) {
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, { closed: true, updatedAt: serverTimestamp() });
}

// 주최자 모집 취소 — 소프트 취소 (하드 삭제 deleteRoundup 대신 표식만 남김).
// D-7 이내 + 전체공개 + 주최자 외 확정자 있는 모집에서만 호출(클라 onDelete 분기).
// 문서를 보존해야 ① functions (C)가 cancelledByHost 전환을 감지하고 ② 매너 평가를 집계할 수 있다.
// → 주최자 대상 매너 평가 윈도우가 '취소 시점부터' 48h 열림(라운딩이 안 열렸으므로 티오프 기준 X).
// 데이터 보관 정책(분쟁이력)에도 부합. 라운지 노출은 cancelledByHost로 필터.
export async function cancelRoundupByHost(postId) {
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  await updateDoc(ref, {
    closed: true,
    cancelledByHost: true,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}


// =============================================================
// roundupApplications/{appId} — 전체공개 모집 참여 신청
//
// Doc ID = `{roundupId}_{applicantUid}` (deterministic, 중복 신청 차단)
// status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
// 친구공개·친구지정 모집은 즉시 확정이라 이 컬렉션 사용 X (joinRoundup 직접 호출).
//
// 보안 규칙 (firestore.rules) update 3분기:
//  (1) 주최자: pending → accepted/rejected
//  (2) 신청자: pending → cancelled
//  (3) 신청자: rejected/cancelled → pending (재신청)
// =============================================================

const APP_COLLECTION = 'roundupApplications';
const appDocId = (roundupId, applicantUid) => `${roundupId}_${applicantUid}`;

// 참여 신청 — 신규 create 또는 거절/취소 후 재신청(update)
// authorUid·applicantName은 알림·이력 보존용 denorm 필드
export async function applyToRoundup(postId, authorUid, applicantName = '') {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId || !authorUid) throw new Error('postId and authorUid required');
  if (authorUid === uid) throw new Error('Cannot apply to own roundup');

  const id = appDocId(postId, uid);
  const ref = doc(db, APP_COLLECTION, id);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const cur = snap.data().status;
    if (cur === 'pending' || cur === 'accepted') {
      throw new Error('Already applied');
    }
    // rejected/cancelled → pending (재신청)
    await updateDoc(ref, { status: 'pending', updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, {
      roundupId: postId,
      applicantUid: uid,
      applicantName,
      authorUid,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}

// 신청자 본인 취소 (pending → cancelled)
export async function cancelApplication(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const id = appDocId(postId, uid);
  await updateDoc(doc(db, APP_COLLECTION, id), {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
}

// 주최자 수락 — applications status='accepted' + roundup.participantUids 추가
// ※ 두 단계 분리 호출 — 사이에 실패 시 정합성 깨질 수 있음.
//   정확한 트랜잭션은 Cloud Function 권장(기존 정원 처리 주석과 일관).
export async function acceptApplication(postId, applicantUid) {
  if (!postId || !applicantUid) throw new Error('postId and applicantUid required');
  await updateDoc(doc(db, APP_COLLECTION, appDocId(postId, applicantUid)), {
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, COLLECTION, postId), {
    participantUids: arrayUnion(applicantUid),
    joined: increment(1),
    updatedAt: serverTimestamp(),
  });
}

// 주최자 거절 (pending → rejected)
export async function rejectApplication(postId, applicantUid) {
  if (!postId || !applicantUid) throw new Error('postId and applicantUid required');
  await updateDoc(doc(db, APP_COLLECTION, appDocId(postId, applicantUid)), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

// 내가 신청한 모집 목록 — applied[postId] state 대체용
// pending(수락 대기) + accepted(이미 확정)를 같이 받아 라운지 카드 상태 표시에 활용
export async function loadMyApplications() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, APP_COLLECTION),
    where('applicantUid', '==', uid),
    where('status', 'in', ['pending', 'accepted']),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 주최자: 특정 모집글의 pending 신청 목록 — 상세 화면에서 수락/거절
export async function loadApplicationsForRoundup(postId) {
  if (!postId) return [];
  const q = query(
    collection(db, APP_COLLECTION),
    where('roundupId', '==', postId),
    where('status', '==', 'pending'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
