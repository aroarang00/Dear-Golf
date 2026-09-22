// 라운딩·일상 글 댓글 — rounds/{roundId}/comments/{commentId}
//   친구 피드 카드(DiaryCard)의 말풍선에서 열리는 스레드. 일정 '이야기'(scheduleComments.js)와 같은 모양을 가볍게.
//   ★권한(firestore.rules) = 그 글을 볼 수 있는 사람(주인·친구공개면 친구·그룹공개면 audienceUids).
//     읽기·쓰기 모두 부모 글을 get()으로 대조한다. 삭제 = 본인 또는 글 주인.
//   ★댓글 수(commentCount)는 부모 글 문서에 둔다 — 카드에 숫자를 보이려고 카드마다 서브컬렉션을 세면 읽기가 폭증.
//     좋아요(likes)와 같은 방식으로 '글 볼 수 있는 사람이 ±1만' 규칙으로 허용. 댓글 생성/삭제와 한 배치로 묶어
//     둘 중 하나만 성공해 숫자가 어긋나는 일을 막는다.
//   알림(글 주인에게)은 2단계 — 여기선 안 보낸다(2026-09-22 결정).
import {
  collection, query, orderBy, limit as fsLimit, getDocs, doc, writeBatch, increment, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { containsProfanity } from './profanityFilter';

const col = (roundId) => collection(db, 'rounds', roundId, 'comments');
export const ROUND_COMMENT_MAX = 300;   // 규칙(firestore.rules)과 같은 값 — 한쪽만 바꾸면 저장이 거부된다

function mapDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    authorUid: data.authorUid || null,
    authorName: data.authorName || '',
    body: data.body || '',
    // 저장은 serverTimestamp, UI는 ms 숫자 기대 → 변환(직후 낙관적 표시는 Date.now())
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
  };
}

// 최근 max개 실시간 구독 — 스레드 열린 동안만. 시간순(위=옛, 아래=새)으로 정렬해 콜백.
export function subscribeRoundComments(roundId, onChange, onError, max = 100) {
  if (!roundId) return () => {};
  const q = query(col(roundId), orderBy('createdAt', 'desc'), fsLimit(max));
  return onSnapshot(q,
    snap => onChange(snap.docs.map(mapDoc).reverse()),
    err => { if (__DEV__) console.warn('[roundComments] subscribe', err?.message); onError?.(err); });
}

// 최근 n개 — 카드 밑 미리보기용(2026-09-22 하이브리드: 카드에 최근 댓글 1~2줄 + '모두 보기' → 시트).
//   댓글이 있는 카드만 한 번 읽고, 같은 (글, 댓글 수)면 다시 안 읽는다(모듈 캐시). 시트가 열려 최신 목록을 받으면
//   setLatestCache로 덮어써 다음 마운트에서도 읽기 없이 맞는다. 실패는 빈 배열(부가 정보).
const latestCache = new Map();   // `${roundId}:${count}` → [comment]
export const latestKey = (roundId, count) => `${roundId}:${count}`;
export function setLatestCache(roundId, count, list) { latestCache.set(latestKey(roundId, count), list); }
export async function loadLatestRoundComments(roundId, count, n = 2) {
  if (!roundId || !count) return [];
  const key = latestKey(roundId, count);
  if (latestCache.has(key)) return latestCache.get(key);
  try {
    const snap = await getDocs(query(col(roundId), orderBy('createdAt', 'desc'), fsLimit(n)));
    const list = snap.docs.map(mapDoc).reverse();
    latestCache.set(key, list);
    return list;
  } catch (e) { return []; }
}

// 작성 — 본인만(규칙 강제). 빈 본문·길이초과·욕설 차단. 댓글 문서 + 부모 commentCount +1 을 한 배치로.
export async function addRoundComment(roundId, authorName, body) {
  const uid = await getUid();
  if (!uid || !roundId) return { ok: false, reason: 'auth' };
  const trimmed = (body || '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > ROUND_COMMENT_MAX) return { ok: false, reason: 'toolong' };
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' };
  const ref = doc(col(roundId));
  const batch = writeBatch(db);
  batch.set(ref, { authorUid: uid, authorName: authorName || '', body: trimmed, createdAt: serverTimestamp() });
  batch.update(doc(db, 'rounds', roundId), { commentCount: increment(1) });
  await batch.commit();
  return { ok: true, comment: { id: ref.id, authorUid: uid, authorName: authorName || '', body: trimmed, createdAt: Date.now() } };
}

// 삭제 — 본인 또는 글 주인(규칙 강제). 부모 commentCount -1 을 한 배치로.
//   ★hasCount=false(부모 숫자가 이미 0이거나 없음)면 빼지 않는다 — 규칙이 음수를 거부해 삭제까지 막힌다.
export async function deleteRoundComment(roundId, commentId, { hasCount = true } = {}) {
  if (!roundId || !commentId) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'rounds', roundId, 'comments', commentId));
  if (hasCount) batch.update(doc(db, 'rounds', roundId), { commentCount: increment(-1) });
  await batch.commit();
}
