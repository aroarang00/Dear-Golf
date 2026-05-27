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
