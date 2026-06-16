import {
  collection, query, where, getDocs, onSnapshot,
  addDoc, setDoc, updateDoc, doc, serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// =============================================================
// roundScoreShares/{shareId} — 동반자 스코어 공유 (Phase C, docs/companion-design.md §11)
//
// 한 명이 라운딩 스코어(OCR 카드/총타)를 공유 → 수신자(동반자 friendUid)가 카드에서 '자기 행'을 골라
// 본인 rounds에 파생. ★자기파생: 파생은 rounds에 ownerUid==본인으로 setDoc(결정적 ID {shareId}_{uid}) →
//   기존 rounds 규칙 통과 + 멱등(중복 방지). cross-user 쓰기 0 = CF 불필요.
//
// 보안 규칙 (firestore.rules):
//  - read   : authorUid==me OR me in audienceUids
//  - create : authorUid==me, respondedUids==[], rows/audienceUids 리스트, course/date 문자열
//  - update : 수신자 respondedUids self-toggle만
//  - delete : author
//  - 쿼리   : where('audienceUids','array-contains', 내uid) — array-contains 단일이라 인덱스 불요(정렬은 클라)
// =============================================================

const COLLECTION = 'roundScoreShares';
const TTL_DAYS = 14; // 공유 문서 보관(이후 TTL/CF 정리). 영구 저장은 각자 '자기 행'(파생 round)만.

// 버디 등 = 홀 < 파 인 홀 수. pars 없으면 0.
function countBirdies(holes, pars) {
  if (!Array.isArray(holes) || !Array.isArray(pars)) return 0;
  let n = 0;
  for (let i = 0; i < holes.length; i++) {
    if (Number.isFinite(holes[i]) && Number.isFinite(pars[i]) && holes[i] < pars[i]) n++;
  }
  return n;
}

// 공유 생성 — rows는 OCR 전체 행([{idx,label,holes,total}]) 또는 총타 수동 행.
//  audienceUids = 그 라운딩 동반자 중 friendUid 있는 사람(실유저)만. 익명/비유저는 수신 대상 아님(마스킹).
export async function createScoreShare({ authorUid, authorName, round, rows, audienceUids }) {
  if (!authorUid || !Array.isArray(rows) || !rows.length) return null;
  const aud = (audienceUids || []).filter(Boolean);
  if (!aud.length) return null; // 받을 사람 없으면 생성 안 함
  const payload = {
    authorUid,
    authorName: authorName || '',
    course: round?.course || '',
    courseId: round?.courseId || null,
    courseLoc: round?.courseLoc || null,
    date: round?.date || '',
    day: round?.day || '',
    pars: Array.isArray(round?.holePars) ? round.holePars : null,
    rows: rows.map((r, i) => ({
      idx: i,
      label: r.label || `${i + 1}번째`,
      holes: Array.isArray(r.holes) ? r.holes : null,
      total: Number.isFinite(r.total) ? r.total : (parseInt(r.total) || 0),
    })),
    audienceUids: aud,
    respondedUids: [],
    ...(round?.scheduleId ? { scheduleId: round.scheduleId } : {}),
    ...(round?.roundupId ? { roundupId: round.roundupId } : {}),
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000),
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return ref.id;
}

// 내게 온 스코어 공유 구독 — audienceUids에 내 uid, 아직 응답(respondedUids) 안 한 것만. 최신순(클라 정렬).
//  반환 = unsubscribe 함수.
export function subscribeIncomingScoreShares(uid, cb) {
  if (!uid) { cb([]); return () => {}; }
  const q = query(collection(db, COLLECTION), where('audienceUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach(d => {
      const data = d.data();
      if ((data.respondedUids || []).includes(uid)) return; // 이미 응답 → 숨김
      if (data.authorUid === uid) return; // 본인 공유는 제외
      list.push({ id: d.id, ...data });
    });
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[scoreShare] subscribe fail', e?.message); cb([]); });
}

// 1회 조회 버전(폴백/초기 로드).
export async function loadIncomingScoreShares(uid) {
  if (!uid) return [];
  const q = query(collection(db, COLLECTION), where('audienceUids', 'array-contains', uid));
  const snap = await getDocs(q);
  const list = [];
  snap.forEach(d => {
    const data = d.data();
    if ((data.respondedUids || []).includes(uid)) return;
    if (data.authorUid === uid) return;
    list.push({ id: d.id, ...data });
  });
  list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return list;
}

// 공유 + 선택한 행 → 내 rounds 파생 payload(프리필). 수신자가 검토·수정 가능(visibility=private 기본).
export function buildDerivedRound(share, selectedRow, { uid, nickname }) {
  const holes = Array.isArray(selectedRow?.holes) ? selectedRow.holes : null;
  const total = Number.isFinite(selectedRow?.total) ? selectedRow.total : (parseInt(selectedRow?.total) || 0);
  return {
    ownerUid: uid,
    course: share.course || '',
    courseId: share.courseId || null,
    courseLoc: share.courseLoc || null,
    date: share.date || '',
    day: share.day || '',
    score: total,
    holeScores: holes,
    holePars: Array.isArray(share.pars) ? share.pars : null,
    birdieCount: countBirdies(holes, share.pars),
    weather: '',
    memo: '',                       // 비워둠 — 수신자가 기록에서 보완(프리필+수락제)
    visibility: 'private',          // 나만보기 기본(스코어 민감)
    starRating: 0,
    tags: [],
    photos: [],
    cost: null,
    companions: [
      { name: nickname || '', isMe: true },
      ...(share.authorUid ? [{ name: share.authorName || '', isMe: false, friendUid: share.authorUid }] : []),
    ],
    sourceShareId: share.id,        // 출처(멱등·추적)
    createdAt: serverTimestamp(),
  };
}

// 수락 — 본인 rounds에 멱등 파생(setDoc 결정적 ID) + respondedUids에 본인 추가.
//  derivedRound는 buildDerivedRound 결과(또는 사용자가 수정한 것). 반환 = 생성된 round 문서 id.
export async function acceptScoreShare(share, uid, derivedRound) {
  if (!share?.id || !uid) return null;
  const roundId = `${share.id}_${uid}`;
  await setDoc(doc(db, 'rounds', roundId), derivedRound); // ownerUid==uid → 기존 rounds 규칙 통과. setDoc=멱등
  await updateDoc(doc(db, COLLECTION, share.id), { respondedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
  return roundId;
}

// 거절 — 파생 없이 respondedUids에 본인만 추가(카드 재노출 방지).
export async function declineScoreShare(shareId, uid) {
  if (!shareId || !uid) return;
  await updateDoc(doc(db, COLLECTION, shareId), { respondedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}
