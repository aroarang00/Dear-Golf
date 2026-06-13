// 친구 1:1 DM(다이렉트 메시지) 데이터 레이어 ([[dm-design]]).
//   conversations/{pairId} (메타) + conversations/{pairId}/messages/{msgId} (메시지).
//   pairId = 두 uid 정렬 조합 → 한 쌍당 방 하나(멱등). 친구끼리만, 낯선 사람 DM 없음.
//   비용 통제([[lounge-realtime]]): 1:1이라 관망자=2명, 대화방/목록 열린 동안만 onSnapshot 구독.
//   안 읽음·타이핑은 출시 후(비용 큰 실시간 상태) — 본체는 텍스트 송수신만.
import {
  collection, query, where, orderBy, limit as fsLimit, getDocs, getDoc,
  addDoc, setDoc, updateDoc, doc, serverTimestamp, onSnapshot, deleteField,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

const CONV = 'conversations';

// 두 uid → 결정적 방 id(정렬 조합). a·b 순서 무관하게 같은 방 ([[data-integrity-principles]] 멱등).
export function pairId(a, b) {
  return [a, b].sort().join('_');
}

// 내 uid 기준 상대 uid 추출 — conversation.participantUids[2]에서 나 아닌 쪽.
export function otherUidOf(conv, myUid) {
  const uids = Array.isArray(conv?.participantUids) ? conv.participantUids : [];
  return uids.find(u => u && u !== myUid) || null;
}

// 대화방 보장 — 없으면 메타 문서 생성, 있으면 그대로. 첫 진입 시 호출(메시지 0건이라도 방은 존재).
export async function ensureConversation(friendUid) {
  const uid = await getUid();
  if (!uid || !friendUid) throw new Error('dm: uid required');
  const id = pairId(uid, friendUid);
  const ref = doc(db, CONV, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participantUids: [uid, friendUid].sort(),
      lastMessage: '',
      lastSenderUid: null,
      lastAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}

// 메시지 전송 — messages에 1건 추가 + 대화방 메타(lastMessage·lastAt) 갱신.
//   방이 없으면 함께 생성(merge). 빈 문자열은 무시. body는 트림 후 저장.
//   replyTo(답장·인용) = {msgId, body, senderUid} 스냅샷 — body는 원본 전문(규칙이 원본과 일치 검증
//   = 인용 위조 차단, 표시부에서 잘라 씀). 없으면 필드 자체를 안 넣음(규칙 'replyTo' in data 분기).
export async function sendMessage(friendUid, text, replyTo = null) {
  const uid = await getUid();
  if (!uid || !friendUid) throw new Error('dm: uid required');
  const body = (text || '').trim();
  if (!body) return null;
  const id = pairId(uid, friendUid);
  // ★메시지를 먼저 씀 — Firestore 로컬 즉시반영(latency compensation)으로 내 화면에 바로 뜸(서버 왕복 안 기다림).
  //   기존엔 conv 메타 setDoc을 먼저 await해서 그 왕복(~0.5~1s)만큼 내 메시지가 늦게 떴음(주고받기 체감 느림 원인).
  //   conv는 입장 시 ensureConversation으로 이미 존재하므로 메시지 먼저 써도 규칙·정합성 안전.
  const msgRef = await addDoc(collection(db, CONV, id, 'messages'), {
    senderUid: uid,
    body,
    ...(replyTo?.msgId ? { replyTo: { msgId: replyTo.msgId, body: replyTo.body || '', senderUid: replyTo.senderUid || '' } } : {}),
    createdAt: serverTimestamp(),
  });
  // 대화 메타(목록 미리보기·lastAt 정렬)는 메시지 표시를 막지 않게 비동기로(await X) — 실패해도 메시지는 이미 전송됨.
  setDoc(doc(db, CONV, id), {
    participantUids: [uid, friendUid].sort(),
    lastMessage: body,
    lastSenderUid: uid,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((e) => { if (__DEV__) console.warn('[dm] conv meta', e?.message); });
  return msgRef.id;
}

// 공감(리액션) — 메시지 reactions 맵에 '내 uid 키'만 set/제거(보안규칙과 1:1 대응, 본문 불변).
//   emoji=null이면 해제. 실패(차단·친구해지 permission-denied)는 호출부에서 조용히 처리(차단 비노출 정책).
export async function setReaction(convId, msgId, emoji) {
  const uid = await getUid();
  if (!uid || !convId || !msgId) throw new Error('dm: reaction args');
  await updateDoc(doc(db, CONV, convId, 'messages', msgId), {
    [`reactions.${uid}`]: emoji || deleteField(),
  });
}

// 읽음 표시 — 내가 이 방을 본 시각(lastRead.{내uid})을 서버시간으로 갱신. 대화방 열림·새 메시지 수신 시 호출.
//   상대는 conversation 문서를 구독 중이라 자기 화면의 내 말풍선에 '읽음(✓✓)'이 실시간 반영됨.
//   실패(차단·친구해지 등)는 조용히 무시 — 읽음표시는 부가 정보라 막혀도 대화엔 영향 없음.
export async function markConversationRead(convId) {
  const uid = await getUid();
  if (!uid || !convId) return;
  try { await updateDoc(doc(db, CONV, convId), { [`lastRead.${uid}`]: serverTimestamp() }); }
  catch (e) { if (__DEV__) console.warn('[dm] markRead', e?.message); }
}

// 대화방 메타(conversation) 1건 실시간 구독 — lastRead 맵으로 상대의 읽음 시각을 받기 위함(대화방 열린 동안만, 1문서라 저렴).
export function subscribeConversation(convId, cb) {
  if (!convId) return () => {};
  return onSnapshot(doc(db, CONV, convId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => { if (__DEV__) console.warn('[dm] conversation snapshot', err?.message); });
}

// 대화방 메시지 실시간 구독 — 최근 limitN개. 대화방 열린 동안만(닫을 때 반환된 unsub 호출해 비용 차단).
//   createdAt desc로 받아 화면용으로 오래된→최신 순서로 뒤집어 전달.
export function subscribeMessages(convId, cb, limitN = 40) {
  if (!convId) return () => {};
  const q = query(
    collection(db, CONV, convId, 'messages'),
    orderBy('createdAt', 'desc'),
    fsLimit(limitN),
  );
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    msgs.reverse();
    cb(msgs);
  }, (err) => { if (__DEV__) console.warn('[dm] messages snapshot', err?.message); });
}

// 내 대화방 목록 1회 로드 — 참여 중 conversations, 최근 활동(lastAt)순. 빈 방(메시지 없음) 제외.
export async function loadMyConversations() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, CONV),
    where('participantUids', 'array-contains', uid),
    orderBy('lastAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.lastMessage);
}

// 내 대화방 목록 실시간 구독 — 목록 화면 열린 동안만. uid는 호출부에서(getUid는 async).
export function subscribeConversations(uid, cb) {
  if (!uid) return () => {};
  const q = query(
    collection(db, CONV),
    where('participantUids', 'array-contains', uid),
    orderBy('lastAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.lastMessage));
  }, (err) => { if (__DEV__) console.warn('[dm] conversations snapshot', err?.message); });
}
