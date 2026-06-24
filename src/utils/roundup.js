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
    anonymousUids: [], // 익명 참여자 uid — 표시만 랜덤닉, 내부 신원·책임성은 그대로 ([[roundup-anonymous-participation]]). 호스트는 익명 불가

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

// 단체 조 편성 저장 — 주최자만. 조별 [티오프·세부코스·조편성(멤버/메모)] 한 블록 ([[event-model]] 간소화안).
//   teamPlan = [{ tee, subCourse, note }, ...] (조 순서). 신규 컬렉션·CF 없이 모집글 문서에 필드만 추가
//   (주최자 전체수정 권한으로 커버, 규칙 변경 0). 첫 조 티오프를 time과 동기화 → 카드·체크인·알람 트리거 유지.
// teamPlan = [{ course, flights:[{ tee, note }] }] — 세부코스 묶음 안에 티오프(=조)들. 묶임/갈림 자연 표현.
export async function updateRoundupTeamPlan(postId, { teamPlan, teamNotice }) {
  if (!postId) throw new Error('postId required');
  const plan = Array.isArray(teamPlan)
    ? teamPlan.map((g) => ({
        course: (g?.course || '').trim(),
        flights: Array.isArray(g?.flights)
          ? g.flights.map((f) => ({ tee: (f?.tee || '').trim(), note: (f?.note || '').trim() }))
          : [],
      }))
    : [];
  const patch = { teamPlan: plan, updatedAt: serverTimestamp() };
  if (teamNotice !== undefined) patch.teamNotice = (teamNotice || '').trim(); // 맨 위 주최자 메모(공지)
  const firstTee = plan[0]?.flights?.[0]?.tee;
  if (firstTee) patch.time = firstTee; // 첫 조(첫 코스 첫 티오프) = 집결/트리거 시간
  await updateDoc(doc(db, COLLECTION, postId), patch);
}

// ── 참여 신청·취소 (참여자 액션) ───────────────────────────────

// 참여 신청 — participantUids에 me 추가, joined +1.
// 보안 규칙: 참여자는 participantUids/waitlistUids/joined/teamJoined만 변경 + 본인 토글.
// 트랜잭션으로 정원을 서버에서 강제 — 선착순. 정원 1자리에 동시 수락이 몰려도 capacity 초과 차단
//   ([[data-integrity-principles]]). joined는 개별·팀 모두 증가하므로 capacity(개별=members+1, 팀=teams*4)와 직접 비교.
//   throw 'full'(정원 참/마감) / 'not-found'. 이미 참여자면 멱등(아무 변경 없이 성공).
// opts.anonymous=true 면 anonymousUids에도 본인 추가 → 명단·댓글·동반자 표시에서 랜덤닉(호스트만 실명).
//   내부 participantUids는 실 uid 그대로라 신뢰·매너·노쇼 추적 정상 ([[roundup-anonymous-participation]]).
export async function joinRoundup(postId, opts = {}) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const anonymous = !!opts.anonymous;
  const ref = doc(db, COLLECTION, postId);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('not-found');
    const d = snap.data();
    const participants = Array.isArray(d.participantUids) ? d.participantUids : [];
    if (participants.includes(uid)) return; // 멱등 — 이미 확정된 참여자
    const cap = d.capacity || ((d.teams || 1) > 1 ? d.teams * 4 : 4);  // 단체=teams*4, 개별=members+1(보통 4)
    // 빈자리 충원 — 개별·단체 모두 정원 미만이면 확정(closed) 상태여도 참여 허용('확정 후 결원=그 자리만 열림'으로 통일).
    //   closed 자체로는 안 막음 — 만석은 아래 정원 가드가 차단. 그래서 결원 자리에 대기자<빈자리여도 데드락 없음 ([[roundup-waitlist-autopromote]]).
    // 대기자 우선 — 대기자가 있으면(=만석이었던 자리) 비대기자 신규 참여를 막아 제3자 선참 차단(빈자리는 대기 순번
    //   자동 승격 전용). 대기자가 없을 때만 자유 충원. 개별·단체 공통.
    const wl = Array.isArray(d.waitlistUids) ? d.waitlistUids : [];
    if (wl.length > 0 && !wl.includes(uid)) throw new Error('full');
    if ((d.joined || 0) >= cap) throw new Error('full'); // 선착순 정원 초과 차단(단체·개별 공통)
    const update = {
      participantUids: arrayUnion(uid),
      joined: increment(1),
      updatedAt: serverTimestamp(),
    };
    if (anonymous) update.anonymousUids = arrayUnion(uid);
    tx.update(ref, update);
  });
}

// 참여 취소 — participantUids에서 me 제거, joined -1
// 트랜잭션 — 실제 참여자일 때만 차감. 가드 없이 increment(-1)만 하면 더블탭·재시도로
//   joined가 participantUids.length보다 작아지거나 음수가 되어 정원·만석 판정이 깨진다(언더플로우 방지).
export async function leaveRoundup(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('not-found');
    const d = snap.data();
    const participants = Array.isArray(d.participantUids) ? d.participantUids : [];
    if (!participants.includes(uid)) return; // 이미 빠진 상태 — 멱등(아무 변경 없이 성공)
    // 결원 처리 — closed는 건드리지 않는다(개별·단체 통일). '확정 후 결원=그 자리만 열림': 대기자 있으면 CF가
    //   자동 승격, 없으면 joinRoundup이 빈자리 충원 허용. 확정은 유지되어 일정도 안 깨지고, 대기자<빈자리여도
    //   데드락 없음(예전엔 개별만 closed:false로 풀어 자유 재모집했는데, 빈자리 충원이 그 역할을 대신함). ([[roundup-waitlist-autopromote]])
    const update = {
      participantUids: arrayRemove(uid),
      joined: increment(-1),
      updatedAt: serverTimestamp(),
    };
    // 익명 참여였으면 anonymousUids에서도 정리(있을 때만 — 불필요한 필드 변경/규칙거부 회피)
    const anonList = Array.isArray(d.anonymousUids) ? d.anonymousUids : [];
    if (anonList.includes(uid)) update.anonymousUids = arrayRemove(uid);
    tx.update(ref, update);
  });
}

// 대기 신청 — opts.anonymous면 anonymousUids에도 추가. 승격 시 그대로 승계(별도로 다시 안 물음 [[roundup-anonymous-participation]]).
//   트랜잭션 가드: ① 이미 참여자면 거부(participant+waitlist 중복 방지) ② 빈자리 있으면(미만석) 거부 —
//   대기는 '만석'일 때만 의미. 안 막으면 미만석 대기 등록 즉시 CF 자동승격 게이트가 발동해 선착 규칙을 우회한다.
export async function joinWaitlist(postId, opts = {}) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('not-found');
    const d = snap.data();
    if (Array.isArray(d.participantUids) && d.participantUids.includes(uid)) throw new Error('already-joined');
    const wl = Array.isArray(d.waitlistUids) ? d.waitlistUids : [];
    if (wl.includes(uid)) return; // 이미 대기 — 멱등(헛쓰기·규칙거부 회피)
    const cap = d.capacity || ((d.teams || 1) > 1 ? d.teams * 4 : 4);
    if ((d.joined || 0) < cap) throw new Error('not-full'); // 빈자리 있으면 대기 아니라 바로 참여 대상
    const update = {
      waitlistUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    };
    if (opts.anonymous) update.anonymousUids = arrayUnion(uid);
    tx.update(ref, update);
  });
}

// 대기 취소 — 실제 대기자일 때만 쓰기(멱등). 가드 없이 무조건 arrayRemove 하면 이미 빠진 상태(더블탭·stale UI)에서
//   waitlistUids가 실제론 안 바뀌어 selfMembershipToggled 규칙이 거부함(false-denial). leaveRoundup과 동일 패턴.
//   익명이었으면 anonymousUids도 정리(미포함이면 손대지 않아 불필요한 필드 변경 회피).
export async function leaveWaitlist(postId) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!postId) throw new Error('postId required');
  const ref = doc(db, COLLECTION, postId);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('not-found');
    const d = snap.data();
    const waitlist = Array.isArray(d.waitlistUids) ? d.waitlistUids : [];
    if (!waitlist.includes(uid)) return; // 이미 빠진 상태 — 멱등(헛쓰기로 인한 규칙 거부 방지)
    const update = {
      waitlistUids: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    };
    const anonList = Array.isArray(d.anonymousUids) ? d.anonymousUids : [];
    if (anonList.includes(uid)) update.anonymousUids = arrayRemove(uid);
    tx.update(ref, update);
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
// 트랜잭션 — 신청서 accepted와 정원 +1을 원자적으로(중간 실패 시 "accepted인데 명단엔 없음" 방지).
//   + 정원 초과 수락 차단(throw 'full'). 이미 참여자면 멱등(중복 +1 방지).
export async function acceptApplication(postId, applicantUid) {
  if (!postId || !applicantUid) throw new Error('postId and applicantUid required');
  const appRef = doc(db, APP_COLLECTION, appDocId(postId, applicantUid));
  const postRef = doc(db, COLLECTION, postId);
  return await runTransaction(db, async (tx) => {
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists()) throw new Error('not-found');
    const p = postSnap.data();
    const participants = Array.isArray(p.participantUids) ? p.participantUids : [];
    if (participants.includes(applicantUid)) return; // 이미 확정 — 정원 중복 증가 방지(멱등)
    const cap = p.capacity || (p.teams > 1 ? p.teams * 4 : 4);
    if ((p.joined || 0) >= cap) throw new Error('full'); // 정원 초과 수락 차단
    tx.update(appRef, { status: 'accepted', updatedAt: serverTimestamp() });
    tx.update(postRef, {
      participantUids: arrayUnion(applicantUid),
      joined: increment(1),
      updatedAt: serverTimestamp(),
    });
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
