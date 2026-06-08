import {
  collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { uploadRoundMedia } from './roundMedia';

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

// 친구의 친구공개 다이어리 — feed. ([[friend_groups]] 그룹 공개 포함)
//  2쿼리 병합(Firestore OR 미지원):
//   Q1 visibility=='friends'(친구 전체)  +  Q2 audienceUids array-contains me(나 포함 그룹 글)
//  인덱스: (ownerUid, visibility, date desc) + (ownerUid, audienceUids CONTAINS, date desc).
export async function loadFriendRounds(friendUid) {
  if (!friendUid) return [];
  const me = await getUid();
  const base = collection(db, COLLECTION);
  const qs = [
    getDocs(query(base,
      where('ownerUid', '==', friendUid),
      where('visibility', '==', 'friends'),
      orderBy('date', 'desc'),
    )).catch(() => null),
  ];
  if (me) {
    qs.push(getDocs(query(base,
      where('ownerUid', '==', friendUid),
      where('audienceUids', 'array-contains', me),
      orderBy('date', 'desc'),
    )).catch(() => null));
  }
  const snaps = await Promise.all(qs);
  const map = new Map();           // doc id 기준 dedupe(겹침 없음 — 안전망)
  snaps.forEach(snap => snap && snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));
  return Array.from(map.values())
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // date desc
}

// ── 생성·수정·삭제 ─────────────────────────────────────────────

// 신규 다이어리 생성. visibility 기본값 'friends' ([[profile-diary-split]]).
export async function createRound(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const round = {
    ownerUid: uid,
    kind: data.kind === 'moment' ? 'moment' : 'round', // 일상(모멘트) 격리 플래그. 없으면 round(하위호환)
    visibility: data.visibility || 'friends',
    // 그룹 공개 — 작성 시점 그룹 멤버 uid 스냅샷 + 원본 그룹 선택(수정 복원용). group 아니면 빈 배열 ([[friend_groups]])
    audienceUids: data.visibility === 'group' && Array.isArray(data.audienceUids) ? data.audienceUids : [],
    audienceGroupIds: data.visibility === 'group' && Array.isArray(data.audienceGroupIds) ? data.audienceGroupIds : [],
    date: data.date || '',
    day: data.day || '',
    course: data.course || '',
    courseId: data.courseId || null,
    courseLoc: data.courseLoc || null,      // 코스 주소 — 지역탭 분류가 userCourses 동기화에 의존하지 않게 기록에 직접 저장 ([[region-classification]])
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
    likes: [], // 친구 좋아요 — uid 배열. 친구가 selfMembershipToggled로 자기 uid만 토글 (firestore.rules)
    // 일정 진입 동선으로 작성된 다이어리는 schedule id를 보존해 1:1 매칭 보장.
    // 같은 날 일정 N개 + 다이어리 매칭 시 course+date fallback의 비대칭 차단.
    scheduleId: data.scheduleId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  // 친구·그룹 공개면 사진/영상을 Storage 업로드(https) — 친구가 볼 수 있게. 나만보기는 로컬 유지 ([[friend-feed-design]]).
  if (round.visibility === 'friends' || round.visibility === 'group') {
    round.photos = await uploadRoundMedia(uid, round.photos);
  }
  const ref = await addDoc(collection(db, COLLECTION), round);
  return { id: ref.id, ...round };
}

// 기존 다이어리 수정. ownerUid는 변경 금지(보안 규칙 강제).
export async function updateRound(roundId, data) {
  if (!roundId) throw new Error('roundId required');
  const ref = doc(db, COLLECTION, roundId);
  const { ownerUid, id, createdAt, likes, ...updatable } = data; // 변경 금지·별도관리(likes) 필드 제거
  // 공개범위 바뀌면 그룹 audience 일관성 — group이면 스냅샷 유지, 아니면 비움 ([[friend_groups]])
  if (updatable.visibility) {
    if (updatable.visibility === 'group') {
      updatable.audienceUids = Array.isArray(updatable.audienceUids) ? updatable.audienceUids : [];
      updatable.audienceGroupIds = Array.isArray(updatable.audienceGroupIds) ? updatable.audienceGroupIds : [];
    } else {
      updatable.audienceUids = [];
      updatable.audienceGroupIds = [];
    }
  }
  // 친구·그룹 공개면 새로 추가된 로컬 사진/영상만 Storage 업로드(https는 멱등 스킵) ([[friend-feed-design]]).
  if ((updatable.visibility === 'friends' || updatable.visibility === 'group') && Array.isArray(updatable.photos)) {
    const uid = await getUid();
    if (uid) updatable.photos = await uploadRoundMedia(uid, updatable.photos);
  }
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

// 친구 좋아요 토글 — likes 배열에서 내 uid만 add/remove ([[friend-feed-design]]).
// firestore.rules: 친구공개 라운드에 한해 changedKeysWithin(['likes','updatedAt']) + selfMembershipToggled('likes')만 허용.
export async function toggleRoundLike(roundId, like) {
  const uid = await getUid();
  if (!uid || !roundId) return;
  const ref = doc(db, COLLECTION, roundId);
  await updateDoc(ref, {
    likes: like ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}
