// 라운지 모집 댓글 헬퍼 — 로컬 state 기반 ([[roundup-comments-policy]]).
// Firebase 마이그레이션 시 Firestore 서브컬렉션 `roundups/{postId}/comments/{commentId}`로 이관 예정.
// 현재 단계: RoundupTab 전체가 더미 데이터라 댓글도 동일 패턴 (안정화 원칙: 한 번에 한 영역).
//
// 정책:
//  - 작성·열람: 주최자 + 참여 확정자만 (pending/waitlist 신청자 불가)
//  - 삭제: 본인만 (주최자도 타인 댓글 삭제 불가)
//  - 수정: 불가 — 삭제 후 재작성
//  - 고정: 주최자가 1개 고정 (추가 시 기존 자동 해제)
//  - 티오프 후 쓰기 자동 비활성, 읽기는 유지

import {
  collection, query, orderBy, getDocs, addDoc, deleteDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { containsProfanity } from './profanityFilter';

// 댓글 객체 스키마:
//  { id, postId, authorUid, authorName, body, createdAt, pinned, pinnedAt }
//  - id          : 'c' + timestamp (로컬). Firestore 시 자동 ID.
//  - createdAt   : ms epoch (Date.now()). Firestore 시 serverTimestamp().
//  - pinned      : boolean. 한 모집글당 1개만 true.
//  - pinnedAt    : ms epoch (정렬용, pinned=false면 null).

// 댓글 정렬 — 고정 댓글 최상단 + 시간 역순 (최신 위로)
export function sortComments(comments) {
  return [...comments].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.createdAt - a.createdAt;
  });
}

// 사용자가 이 모집글의 댓글을 작성·열람할 권한이 있는지 — 주최자 + 참여 확정자만
export function canAccessComments(post, myId, myName) {
  if (!post || !myId) return false;
  const isAuthor = post.authorUid === myId || post.author === myName;
  if (isAuthor) return true;
  const participantUids = post.participantUids || [];
  return participantUids.includes(myId);
}

// 티오프 시각 지났는지 — 댓글 쓰기 자동 비활성 판정
export function isAfterTeeOff(post) {
  if (!post?.date) return false; // 오픈형(날짜 미정)은 항상 쓰기 가능
  const [y, m, d] = post.date.split('.').map(Number);
  const [hh, mm] = (post.time || '07:00').split(':').map(Number);
  const teeOff = new Date(y, m - 1, d, hh, mm).getTime();
  if (Number.isNaN(teeOff)) return false;
  return Date.now() > teeOff;
}

// 댓글 작성 — 비속어 필터 통과 + 본문 trim. 차단 시 {ok:false, reason:'profanity'} 반환.
export function createComment(postId, author, body) {
  const trimmed = (body || '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' };
  return {
    ok: true,
    comment: {
      id: 'c' + Date.now(),
      postId,
      authorUid: author.uid || null,
      authorName: author.name || '',
      body: trimmed,
      createdAt: Date.now(),
      pinned: false,
      pinnedAt: null,
    },
  };
}

// 댓글 삭제 권한 — 본인만 (주최자도 타인 댓글 삭제 불가)
export function canDeleteComment(comment, myId, myName) {
  if (!comment) return false;
  if (comment.authorUid && comment.authorUid === myId) return true;
  return comment.authorName === myName;
}

// 댓글 고정 토글 — 주최자만 (호출 측에서 권한 체크 후 사용).
// 새 댓글을 고정하면 기존 고정 자동 해제 (한 모집글당 1개 유지).
export function togglePinComment(comments, commentId) {
  const target = comments.find(c => c.id === commentId);
  if (!target) return comments;
  if (target.pinned) {
    return comments.map(c => c.id === commentId ? { ...c, pinned: false, pinnedAt: null } : c);
  }
  const now = Date.now();
  return comments.map(c => {
    if (c.id === commentId) return { ...c, pinned: true, pinnedAt: now };
    if (c.pinned) return { ...c, pinned: false, pinnedAt: null };
    return c;
  });
}

// =============================================================
// Firestore 서브컬렉션 — roundups/{postId}/comments/{commentId}
//   2026-05-30 연동. 권한: create=authorUid==me / delete=본인 / pin=changedKeysWithin (클라가 주최자만 노출)
//   createdAt은 저장 시 serverTimestamp, 로드 시 ms로 변환 (UI·sortComments가 ms 숫자 기대).
// =============================================================

const commentsCol = (postId) => collection(db, 'roundups', postId, 'comments');

// 모집글 댓글 로드 — createdAt 오름차순으로 받아 ms 변환 (정렬·고정은 sortComments가 처리)
export async function loadComments(postId) {
  if (!postId) return [];
  const snap = await getDocs(query(commentsCol(postId), orderBy('createdAt', 'asc')));
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      postId,
      authorUid: data.authorUid || null,
      authorName: data.authorName || '',
      body: data.body || '',
      createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
      pinned: !!data.pinned,
      pinnedAt: data.pinnedAt?.toMillis?.() ?? null,
    };
  });
}

// 댓글 작성 — 비속어·빈값 검증(createComment 재사용) 후 Firestore 저장.
//   반환: {ok:false, reason} 또는 {ok:true, comment} (낙관적 UI용 ms createdAt 포함)
export async function addCommentToFirestore(postId, authorName, body) {
  const uid = await getUid();
  if (!uid) return { ok: false, reason: 'auth' };
  const r = createComment(postId, { uid, name: authorName }, body);
  if (!r.ok) return r;
  const ref = await addDoc(commentsCol(postId), {
    authorUid: uid,
    authorName: authorName || '',
    body: r.comment.body,
    pinned: false,
    pinnedAt: null,
    createdAt: serverTimestamp(),
  });
  // 낙관적 표시용 — createdAt은 로컬 ms (다음 로드 때 서버값으로 대체됨)
  return { ok: true, comment: { ...r.comment, id: ref.id, authorUid: uid, authorName: authorName || '', createdAt: Date.now() } };
}

// 댓글 삭제 — 본인만 (규칙이 authorUid==me 강제). 호출 측에서도 canDeleteComment로 사전 차단.
export async function deleteCommentFromFirestore(postId, commentId) {
  if (!postId || !commentId) return;
  await deleteDoc(doc(db, 'roundups', postId, 'comments', commentId));
}

// 댓글 고정 토글 — 주최자만(클라 노출 제어). 새로 고정 시 기존 고정 해제(있으면).
//   currentComments: 현재 로컬 목록 — 기존 고정 댓글 식별용.
export async function pinCommentInFirestore(postId, commentId, currentComments) {
  if (!postId || !commentId) return;
  const target = (currentComments || []).find(c => c.id === commentId);
  if (!target) return;
  if (target.pinned) {
    // 고정 해제
    await updateDoc(doc(db, 'roundups', postId, 'comments', commentId), { pinned: false, pinnedAt: null });
    return;
  }
  // 기존 고정 댓글이 있으면 먼저 해제 (한 모집글당 1개 유지)
  const prevPinned = (currentComments || []).find(c => c.pinned && c.id !== commentId);
  if (prevPinned) {
    await updateDoc(doc(db, 'roundups', postId, 'comments', prevPinned.id), { pinned: false, pinnedAt: null });
  }
  await updateDoc(doc(db, 'roundups', postId, 'comments', commentId), { pinned: true, pinnedAt: serverTimestamp() });
}
