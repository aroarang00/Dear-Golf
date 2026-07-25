// 일정 '이야기'(댓글) — scheduleGroups/{groupId}/comments/{commentId}
//   전파(동반자 공유) 일정에서 동반자들이 이번 라운딩을 조율하는 스레드.
//   공지(memo)와 별개: 공지=결론(고정·확인), 댓글=과정(대화). 라운지 댓글(comments.js)과 동일 패턴을 가볍게.
//   권한(firestore.rules): read=로그인 / create=authorUid==me + 본문검증 / delete=본인만.
import {
  collection, query, orderBy, limit as fsLimit, getDocs, getCountFromServer,
  addDoc, deleteDoc, doc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { containsProfanity } from './profanityFilter';

const col = (groupId) => collection(db, 'scheduleGroups', groupId, 'comments');
export const COMMENT_MAX = 500;

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
export function subscribeScheduleComments(groupId, onChange, max = 100) {
  if (!groupId) return () => {};
  const q = query(col(groupId), orderBy('createdAt', 'desc'), fsLimit(max));
  return onSnapshot(q,
    snap => onChange(snap.docs.map(mapDoc).reverse()),
    err => { if (__DEV__) console.warn('[schedComments] subscribe', err?.message); });
}

// 댓글 개수 — 시트 미리보기('이야기 N')용. 서버 카운트(문서 전량 로드 회피).
export async function countScheduleComments(groupId) {
  if (!groupId) return 0;
  try { const s = await getCountFromServer(col(groupId)); return s.data().count || 0; }
  catch (e) { return 0; }
}

// 최근 1개 — 시트 미리보기 본문용.
export async function loadLatestScheduleComment(groupId) {
  if (!groupId) return null;
  try {
    const snap = await getDocs(query(col(groupId), orderBy('createdAt', 'desc'), fsLimit(1)));
    return snap.docs[0] ? mapDoc(snap.docs[0]) : null;
  } catch (e) { return null; }
}

// 작성 — 본인만(규칙 강제). 빈 본문·길이초과·욕설 차단. 낙관적 표시용 comment 반환.
export async function addScheduleComment(groupId, authorName, body) {
  const uid = await getUid();
  if (!uid || !groupId) return { ok: false, reason: 'auth' };
  const trimmed = (body || '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > COMMENT_MAX) return { ok: false, reason: 'toolong' };
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' };
  const ref = await addDoc(col(groupId), {
    authorUid: uid, authorName: authorName || '', body: trimmed, createdAt: serverTimestamp(),
  });
  return { ok: true, comment: { id: ref.id, authorUid: uid, authorName: authorName || '', body: trimmed, createdAt: Date.now() } };
}

// 삭제 — 본인만(규칙 authorUid==me 강제).
export async function deleteScheduleComment(groupId, commentId) {
  if (!groupId || !commentId) return;
  await deleteDoc(doc(db, 'scheduleGroups', groupId, 'comments', commentId));
}
