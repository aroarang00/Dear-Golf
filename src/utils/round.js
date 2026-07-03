import {
  collection, query, where, orderBy, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp,
  arrayUnion, arrayRemove, writeBatch,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { uploadRoundMedia, uploadRoundMediaBestEffort } from './roundMedia';
import { resolveGroupAudience } from './friendGroups';

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
//   Q1 visibility=='friends'(친구 전체)  +  Q2 visibility=='group' && audienceUids array-contains me(나 포함 그룹 글)
//  ★Q2에 visibility=='group' 필수 — read 규칙 group절(visibility=='group' && uid in audienceUids)과 쿼리가 정합해야
//   Firestore가 쿼리를 허용함. visibility 필터를 빼면 "규칙 허용 문서만 반환" 보장 실패로 쿼리 전체 permission-denied
//   → catch에 삼켜져 그룹글이 통째로 안 보임(라운지 select가 scope=='select'를 거는 것과 동일 패턴, 2026-06-10 수정).
//  인덱스: (ownerUid, visibility, date desc) + (ownerUid, visibility, audienceUids CONTAINS, date desc).
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
      where('visibility', '==', 'group'),
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

// 친구의 '그룹 공개' 글 중 내가 볼 수 있는(audienceUids에 나 포함) 것의 '최신 작성시각(millis)' — 친구별 {uid: ms}.
//   친구탭 NEW: lastFriendPostAt(친구공개 전용)에 이걸 합쳐 '그룹 글 NEW'를 그룹 멤버에게만 띄운다(비대상자 누수 차단, [[friend_groups]] ⑤).
//   기존 인덱스 (ownerUid, visibility, audienceUids CONTAINS) prefix 재사용(orderBy 없음). 친구 수만큼 병렬, 대부분 빈 결과라 가벼움.
export async function loadVisibleGroupPostTimes(friendUids) {
  const me = await getUid();
  if (!me || !Array.isArray(friendUids) || !friendUids.length) return {};
  const base = collection(db, COLLECTION);
  const entries = await Promise.all(friendUids.filter(Boolean).map(async (fu) => {
    try {
      const snap = await getDocs(query(base,
        where('ownerUid', '==', fu),
        where('visibility', '==', 'group'),
        where('audienceUids', 'array-contains', me),
      ));
      let max = 0;
      snap.forEach((d) => {
        const c = d.data().createdAt;
        const ms = c?.toMillis ? c.toMillis() : 0;
        if (ms > max) max = ms;
      });
      return [fu, max];
    } catch (e) { if (__DEV__) console.warn('[round] visibleGroupTimes', fu, e?.message); return [fu, 0]; }
  }));
  return Object.fromEntries(entries);
}

// 내 group 공개 글들이 참조하는 그룹 id 집합 — 그룹 관리 화면의 '글 0' 삭제 가드용 ([[friend_groups]]).
//   인덱스 (ownerUid, visibility, date) 재사용. 내 글만이라 가벼움.
export async function loadMyUsedGroupIds() {
  const me = await getUid();
  if (!me) return new Set();
  try {
    const snap = await getDocs(query(collection(db, COLLECTION),
      where('ownerUid', '==', me), where('visibility', '==', 'group')));
    const s = new Set();
    snap.docs.forEach(d => {
      const gids = d.data().audienceGroupIds;
      if (Array.isArray(gids)) gids.forEach(g => g && s.add(g));
    });
    return s;
  } catch (e) {
    if (__DEV__) console.warn('[round] loadMyUsedGroupIds', e?.message);
    return new Set();
  }
}

// 내 group 공개 글들의 audienceUids를 현재 friendMeta로 재계산 — 완전 동적 피드 ([[friend_groups]] ⑥).
//   그룹 멤버십 변경·차단·끊기 후 호출. 가까운친구로 옮기면 과거글도 보이고, 빼면 숨겨짐.
//   바뀐 글만 batch 갱신(정렬 무시 비교). 내 글만이라 가벼움. 라운지(roundups)는 스냅샷이라 손 안 댐.
export async function recomputeMyGroupAudiences(friendMeta) {
  const me = await getUid();
  if (!me || !friendMeta) return;
  try {
    const snap = await getDocs(query(collection(db, COLLECTION),
      where('ownerUid', '==', me), where('visibility', '==', 'group')));
    if (snap.empty) return;
    const batch = writeBatch(db);
    let n = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      const gids = Array.isArray(data.audienceGroupIds) ? data.audienceGroupIds : [];
      const next = resolveGroupAudience(friendMeta, gids);   // 현재 멤버십 기준 재산출
      const cur = Array.isArray(data.audienceUids) ? data.audienceUids : [];
      const same = next.length === cur.length && next.every(u => cur.includes(u));
      if (!same) { batch.update(d.ref, { audienceUids: next, updatedAt: serverTimestamp() }); n++; }
    });
    if (n > 0) await batch.commit();
  } catch (e) {
    if (__DEV__) console.warn('[round] recomputeMyGroupAudiences', e?.message);
  }
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
    time: data.time || null,   // 티오프 시간('HH:MM') — 일정에서 자동채움(단체 제외) or 직접 입력. 없으면 null=표시 안 함
    course: data.course || '',
    courseId: data.courseId || null,
    courseLoc: data.courseLoc || null,      // 코스 주소 — 지역탭 분류가 userCourses 동기화에 의존하지 않게 기록에 직접 저장 ([[region-classification]])
    subCourse: data.subCourse || '',        // 코스(세부코스 라벨) — 선택 입력, 구장 매칭과 무관 ([[schedule-booker]])
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
  // 친구·그룹 공개면 사진/영상을 Storage 업로드(https) — 친구가 볼 수 있게. 실패=저장 중단(깨진 참조 방지).
  if (round.visibility === 'friends' || round.visibility === 'group') {
    round.photos = await uploadRoundMedia(uid, round.photos);
  } else if (Array.isArray(round.photos) && round.photos.length) {
    // 나만보기도 전량 계정 백업([[diary-media-backup-plan]] 2026-07-04) — 기기 유실·변경에도 기록 보존.
    //   단 오프라인 저장은 깨지면 안 되므로 best-effort: 실패 항목은 dgphoto:로 저장되고 백업 스위퍼가 후속 업로드.
    const { photos } = await uploadRoundMediaBestEffort(uid, round.photos);
    round.photos = photos;
  }
  const ref = await addDoc(collection(db, COLLECTION), round);
  // 친구 피드 새 글 시각 — 친구탭 NEW 점·새글순용. ★친구공개(friends)만 갱신:
  //   user 문서의 단일 필드라 모든 친구가 같은 값을 읽음 → 그룹 글에도 갱신하면 '대상 아닌 친구'에게도 NEW가 뜸
  //   (피드는 audienceUids로 막혀 비어있는데 NEW만 뜨는 어긋남). 그룹 글의 NEW는 FriendsTab이 'audienceUids에 나 포함'
  //   글을 따로 조회(loadVisibleGroupPostTimes)해 그룹 멤버에게만 띄운다. ([[friend_groups]] ⑤)
  if (round.visibility === 'friends') {
    try {
      await setDoc(doc(db, 'users', uid), { uid, lastFriendPostAt: serverTimestamp() }, { merge: true });
    } catch (e) { if (__DEV__) console.warn('[round] lastFriendPostAt', e?.message); }
  }
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
  // 새로 추가된 로컬 사진/영상 Storage 업로드(https는 멱등 스킵).
  //   친구·그룹 = 실패 throw(깨진 참조 방지) / 나만보기 = best-effort(오프라인 수정 보존, 스위퍼 후속) ([[diary-media-backup-plan]]).
  if (Array.isArray(updatable.photos) && updatable.photos.length) {
    const uid = await getUid();
    if (uid) {
      if (updatable.visibility === 'friends' || updatable.visibility === 'group') {
        updatable.photos = await uploadRoundMedia(uid, updatable.photos);
      } else {
        const { photos } = await uploadRoundMediaBestEffort(uid, updatable.photos);
        updatable.photos = photos;
      }
    }
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
