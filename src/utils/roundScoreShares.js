import {
  collection, query, where, onSnapshot,
  addDoc, setDoc, updateDoc, doc, serverTimestamp, arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeScoreRow } from './scorecardOcr';   // 파대비/오버파 오독 → 홀 합으로 총타 정규화
import { normalizeCourseName } from './top100';       // 구장명 표기 차이('서울한양CC'·'한양 CC') 흡수
import { roundsOnly } from './diaryKind';

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

// 공유 + 선택한 행 → 스코어 필드만(총타·홀별·파·버디). 새 기록을 만들 때(buildDerivedRound)와
//   이미 있는 내 기록에 스코어만 넣을 때(ScoreShareInbox '스코어만 넣기') 같은 계산을 쓴다.
export function scoreFieldsFromShare(share, selectedRow) {
  // 정규화(멱등) — 공유 생성 시 이미 맞춘 값은 그대로 통과하고, 이 수정 전에 전송된 옛 공유(오버파/파대비 total)만 홀 합으로 교정.
  const row = normalizeScoreRow(selectedRow, Array.isArray(share?.pars) ? share.pars : null);
  const holes = Array.isArray(row?.holes) ? row.holes : null;
  const total = Number.isFinite(row?.total) ? row.total : (parseInt(row?.total) || 0);
  // 홀별 합이 총타와 어긋나면(OCR 저신뢰) 홀별·버디를 버려 헤드라인 총타와 표가 모순되지 않게 — 일반 저장(DiaryAddModal)과 동일 정책.
  const holesOk = Array.isArray(holes) && holes.length > 0 && holes.every(h => Number.isFinite(h)) && holes.reduce((s, h) => s + h, 0) === total;
  return {
    score: total,
    holeScores: holesOk ? holes : null,
    holePars: Array.isArray(share.pars) ? share.pars : null,
    // par(총) — OCR 홀별 par 합이 있으면 그 값, 없으면 정규 72. createRound와 동일하게 항상 숫자 보장.
    par: Array.isArray(share.pars) && share.pars.length
      ? (share.pars.reduce((s, p) => s + (Number(p) || 0), 0) || 72)
      : 72,
    birdieCount: holesOk ? countBirdies(holes, share.pars) : 0,
  };
}

// 이 공유가 가리키는 '내' 일정 — 같은 날짜 중 구장명이 같은 것, 없으면 그날 일정이 하나뿐일 때 그것.
//   ★공유 문서의 scheduleId는 '보낸 사람' 일정 id라 내 폰에선 아무것도 가리키지 않는다(2026-10-01 중복 원인).
export function findMyScheduleForShare(share, schedules) {
  const date = share?.date || '';
  if (!date) return null;
  const sameDay = (schedules || []).filter(s => s?.date === date && !s.overseas);
  if (!sameDay.length) return null;
  const key = normalizeCourseName(share?.course || '');
  return sameDay.find(s => key && normalizeCourseName(s.course || '') === key) || (sameDay.length === 1 ? sameDay[0] : null);
}

// 이 공유와 같은 라운딩의 '내' 기록 — 내가 이미 적어둔 기록이 있으면 새로 만들지 않고 물어본다.
//   같은 날짜 + (내 일정 id로 연결됐거나 구장명이 같음). 이 공유로 이미 만든 파생 기록(sourceShareId)은 제외.
export function findMyRoundForShare(share, diaries, mySchedule) {
  const date = share?.date || '';
  if (!date) return null;
  const key = normalizeCourseName(share?.course || '');
  return roundsOnly(diaries || []).find(d =>
    d.date === date && d.sourceShareId !== share.id
    && ((mySchedule && d.scheduleId === mySchedule.id) || (key && normalizeCourseName(d.course || '') === key))) || null;
}

// 공유 + 선택한 행 → 내 rounds 파생 payload(프리필). 수신자가 검토·수정 가능(visibility=private 기본).
//   scheduleId — 호출부가 findMyScheduleForShare로 찾은 '내' 일정 id. 공유 문서의 scheduleId(보낸 사람 것)는 절대 쓰지 않는다:
//   그걸 달고 저장되면 내 일정은 '미기록'으로 남고 이 기록은 따로 세어져 코스 모아보기에 한 라운딩이 둘로 뜬다(사용자 2026-10-01).
export function buildDerivedRound(share, selectedRow, { uid, nickname, scheduleId = null }) {
  // ★createRound(round.js)와 같은 필드 집합으로 맞춤 — 파생 라운드에 par·likes 등이 빠지면
  //   소비처(DiaryDetail의 score−par)가 NaN/undefined가 되고, 좋아요·표시가 일반 라운드와 비대칭이 된다([[firestore-rules-false-denial]]).
  return {
    ownerUid: uid,
    kind: 'round',                  // 일상(moment) 아님 — 정규 라운드
    course: share.course || '',
    courseId: share.courseId || null,
    courseLoc: share.courseLoc || null,
    subCourse: '',
    date: share.date || '',
    day: share.day || '',
    ...scoreFieldsFromShare(share, selectedRow),
    holeScoresShared: false,
    weather: '',
    memo: '',                       // 비워둠 — 수신자가 기록에서 보완(프리필+수락제)
    detailMemo: '',
    visibility: 'private',          // 나만보기 기본(스코어 민감)
    audienceUids: [],
    audienceGroupIds: [],
    starRating: 0,
    tags: [],
    photos: [],
    cost: null,
    companions: [
      { name: nickname || '', isMe: true },
      ...(share.authorUid ? [{ name: share.authorName || '', isMe: false, friendUid: share.authorUid }] : []),
    ],
    special: null,
    specialHole: null,
    specialPar: null,
    specialDist: '',
    specialBall: '',
    specialMemo: '',
    badge: null,
    overseas: false,
    country: '',
    likes: [],                      // 친구 좋아요 — 일반 라운드와 동일하게 빈 배열로 초기화(친구 공개 전환 대비)
    scheduleId: scheduleId || null,  // '내' 일정 연결(호출부가 찾아 넘김) — 보낸 사람 일정 id 금지
    sourceShareId: share.id,        // 출처(멱등·추적)
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// 수락 — 본인 rounds에 멱등 파생(setDoc 결정적 ID) + respondedUids에 본인 추가.
//  derivedRound는 buildDerivedRound 결과(또는 사용자가 수정한 것). 반환 = 생성된 round 문서 id.
export async function acceptScoreShare(share, uid, derivedRound) {
  if (!share?.id || !uid) return null;
  const roundId = `${share.id}_${uid}`;
  // merge — 재수락 시 문서를 통째로 갈아엎으면 그 사이 쌓인 likes·commentCount(친구 댓글 수)가 지워진다(리뷰 2026-09-23)
  await setDoc(doc(db, 'rounds', roundId), derivedRound, { merge: true }); // ownerUid==uid → 기존 rounds 규칙 통과. setDoc=멱등
  await updateDoc(doc(db, COLLECTION, share.id), { respondedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
  return roundId;
}

// 거절 — 파생 없이 respondedUids에 본인만 추가(카드 재노출 방지).
export async function declineScoreShare(shareId, uid) {
  if (!shareId || !uid) return;
  await updateDoc(doc(db, COLLECTION, shareId), { respondedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}
