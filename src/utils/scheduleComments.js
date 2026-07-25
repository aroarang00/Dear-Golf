// 일정 '이야기'(댓글) — scheduleGroups/{groupId}/comments/{commentId}
//   전파(동반자 공유) 일정에서 동반자들이 이번 라운딩을 조율하는 스레드.
//   공지(memo)와 별개: 공지=결론(고정·확인), 댓글=과정(대화). 라운지 댓글(comments.js)과 동일 패턴을 가볍게.
//   권한(firestore.rules): read=로그인 / create=authorUid==me + 본문검증 / delete=본인만.
import {
  collection, query, orderBy, limit as fsLimit, getDocs, getCountFromServer,
  addDoc, deleteDoc, doc, setDoc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { containsProfanity } from './profanityFilter';
import { createNotification } from './roundupNotifications'; // @멘션 → 멘션된 사람에게만 푸시

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

// ===== 읽음 표시 — scheduleGroups/{groupId}/reads/{uid} = { at } =====
//   카톡식 '안 읽은 동반자 수'용. 각자 이야기를 열 때 본인 '읽은 시각'을 서버에 기록한다(문서 id=본인 uid).
const readsCol = (groupId) => collection(db, 'scheduleGroups', groupId, 'reads');

// 내가 이야기를 봤음 — 본인 reads 문서에 최신 시각 기록(merge). 실패해도 조용히(부가정보).
export async function markScheduleRead(groupId) {
  if (!groupId) return;
  const uid = await getUid();
  if (!uid) return;
  try { await setDoc(doc(readsCol(groupId), uid), { at: serverTimestamp() }, { merge: true }); }
  catch (e) { if (__DEV__) console.warn('[schedComments] markRead', e?.message); }
}

// 동반자들의 읽은 시각 실시간 구독 — {uid: ms}. 이야기 열린 동안만(작은 컬렉션, 동반자 몇 명뿐).
export function subscribeScheduleReads(groupId, onChange) {
  if (!groupId) return () => {};
  return onSnapshot(readsCol(groupId),
    snap => {
      const map = {};
      snap.docs.forEach(d => { map[d.id] = d.data()?.at?.toMillis?.() ?? 0; });
      onChange(map);
    },
    err => { if (__DEV__) console.warn('[schedComments] subscribeReads', err?.message); });
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
//   opts.mentions=[uid] : @멘션된 동반자. 저장 + 그 사람에게만 푸시(일반 댓글은 무알림 = 노이즈 0).
//   opts.course : 알림 문구용 구장명.
export async function addScheduleComment(groupId, authorName, body, opts = {}) {
  const uid = await getUid();
  if (!uid || !groupId) return { ok: false, reason: 'auth' };
  const trimmed = (body || '').trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.length > COMMENT_MAX) return { ok: false, reason: 'toolong' };
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' };
  const mentions = Array.isArray(opts.mentions) ? opts.mentions.filter(u => u && u !== uid) : [];
  const ref = await addDoc(col(groupId), {
    authorUid: uid, authorName: authorName || '', body: trimmed,
    ...(mentions.length ? { mentions } : {}),
    createdAt: serverTimestamp(),
  });
  // 멘션된 사람에게만 알림(createNotification이 본인 수신은 자동 스킵). 실패해도 댓글은 성공.
  for (const rid of mentions) {
    createNotification({
      recipientUid: rid, type: 'scheduleMention', actorName: authorName || '',
      postId: groupId, postTitle: opts.course || '', memoPreview: trimmed.slice(0, 40),
    }).catch(e => __DEV__ && console.warn('[schedComments] mention noti', e?.message));
  }
  return { ok: true, comment: { id: ref.id, authorUid: uid, authorName: authorName || '', body: trimmed, mentions, createdAt: Date.now() } };
}

// 삭제 — 본인만(규칙 authorUid==me 강제).
export async function deleteScheduleComment(groupId, commentId) {
  if (!groupId || !commentId) return;
  await deleteDoc(doc(db, 'scheduleGroups', groupId, 'comments', commentId));
}
