import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// rounds/{roundId} — 라운딩 1회 기록 (구 diaries + 친구 feed 통합)
//
// 보안 규칙 (firestore.rules):
//  - read   : ownerUid == me  OR  (visibility=='friends' AND areFriends(me, ownerUid))
//  - create : ownerUid == me  AND  visibility in ['friends','private']
//  - update : ownerUid == me  AND  ownerUid 변조 금지
//  - delete : ownerUid == me
//
// 데이터 마이그레이션 정책 ([[data-migration]]):
//  옛 AsyncStorage(@dg_diaries) 데이터는 이관 X. Firestore부터 새로 시작.
//
// 사진(photos): 현재는 로컬 URI 저장. Firebase Storage 이관은 별도 작업.
// =============================================================

const COLLECTION = 'rounds';

// ── 조회 ──────────────────────────────────────────────────────

// 내 다이어리 목록 — date 내림차순. 인덱스 (ownerUid, date desc) 사용.
export async function loadMyRounds() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('ownerUid', '==', uid),
    orderBy('date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 친구의 친구공개 다이어리 — feed. (ownerUid, visibility, date desc) 인덱스 사용.
export async function loadFriendRounds(friendUid) {
  if (!friendUid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('ownerUid', '==', friendUid),
    where('visibility', '==', 'friends'),
    orderBy('date', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── 생성·수정·삭제 ─────────────────────────────────────────────

// 신규 다이어리 생성. visibility 기본값 'friends' ([[profile-diary-split]]).
export async function createRound(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const round = {
    ownerUid: uid,
    visibility: data.visibility || 'friends',
    date: data.date || '',
    day: data.day || '',
    course: data.course || '',
    courseId: data.courseId || null,
    score: typeof data.score === 'number' ? data.score : null,
    holeScores: Array.isArray(data.holeScores) ? data.holeScores : null, // 스코어카드 OCR 18홀(숫자), 없으면 null
    holeScoresShared: !!data.holeScoresShared, // 홀별 상세 친구 공개 여부. 기본 false=나만보기 (친구 뷰 구현 시 가림 제어)
    holePars: Array.isArray(data.holePars) ? data.holePars : null, // 홀별 par (스코어카드 par 행). 버디 자동집계용, 없으면 null
    par: typeof data.par === 'number' ? data.par : 72,
    birdieCount: typeof data.birdieCount === 'number' ? data.birdieCount : 0, // 버디 수 (스코어카드 자동/수동)
    memo: data.memo || '',
    detailMemo: data.detailMemo || '',
    weather: data.weather || null,
    starRating: typeof data.starRating === 'number' ? data.starRating : 0,
    tags: Array.isArray(data.tags) ? data.tags : [],
    cost: data.cost || null,
    photos: Array.isArray(data.photos) ? data.photos : [],
    companions: Array.isArray(data.companions) ? data.companions : [],
    special: data.special || null,
    specialHole: data.specialHole || null,
    specialPar: data.specialPar || null,
    specialDist: data.specialDist || '',
    specialBall: data.specialBall || '',
    specialMemo: data.specialMemo || '',
    badge: data.badge || null,
    overseas: !!data.overseas,
    country: data.overseas ? (data.country || '') : '',
    // 일정 진입 동선으로 작성된 다이어리는 schedule id를 보존해 1:1 매칭 보장.
    // 같은 날 일정 N개 + 다이어리 매칭 시 course+date fallback의 비대칭 차단.
    scheduleId: data.scheduleId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), round);
  return { id: ref.id, ...round };
}

// 기존 다이어리 수정. ownerUid는 변경 금지(보안 규칙 강제).
export async function updateRound(roundId, data) {
  if (!roundId) throw new Error('roundId required');
  const ref = doc(db, COLLECTION, roundId);
  const { ownerUid, id, createdAt, ...updatable } = data; // 변경 금지 필드 제거
  await updateDoc(ref, {
    ...updatable,
    updatedAt: serverTimestamp(),
  });
}

// 다이어리 삭제 — 본인만 가능 (보안 규칙).
export async function deleteRound(roundId) {
  if (!roundId) throw new Error('roundId required');
  const ref = doc(db, COLLECTION, roundId);
  await deleteDoc(ref);
}
