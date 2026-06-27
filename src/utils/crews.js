import {
  collection, collectionGroup, query, where, orderBy, limit, getDocs, onSnapshot,
  setDoc, updateDoc, deleteDoc, getDoc, doc, serverTimestamp, arrayUnion, arrayRemove, increment, runTransaction, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// =============================================================
// crews/{crewId} — 친구 소수 그룹 공유 앨범 (docs/crew-space-design.md)
//
// 멤버십 = scheduleGroups 패턴(초대/수락 셀프토글, cross-user 쓰기 0 = CF 불필요).
//   crews/{crewId}: { creatorUid, name, memberUids[], audienceUids[], declinedUids[], names{uid:name},
//                     notice?, noticeBy?, noticeAt?, postCount?, lastPostAt?, createdAt, updatedAt }
//   crews/{crewId}/posts/{postId}:            { authorUid, text, media:[{uri,type,poster?}], commentCount?, likedBy[], lastCommentBy?, lastCommentText?, lastCommentAt?, createdAt }
//   crews/{crewId}/posts/{postId}/comments/{commentId}: { authorUid, body, parentId?(대댓글), likedBy[], createdAt }
//
// 표시 이름은 보는 사람 각자 별명(friendDisplayName)으로 화면에서 resolve — 저장은 authorUid(+names 폴백).
// =============================================================

const COL = 'crews';
const MAX_MEMBERS = 20;   // 크루당
const DESC_MAX = 15;      // 크루 성격(설명) 글자수 — 목록·헤더서 한 줄(약 16자부터 …로 잘림)이라 보이는 만큼만 입력 허용
// 크루 색 팔레트 — 골프 톤(잔디·하늘·노을·라벤더·버건디·네이비). 명함/아바타 액센트와 결 맞춤.
//   기본 이미지는 이 색 배경 + 크루명 이니셜로 합성(사진 미업로드 시).
const CREW_COLORS = ['#5E7E42', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#1A3D52', '#7FA86B', '#B5654A'];

// ── 크루 생성 ── (creatorUid=크루장, memberUids=[me], audience=초대 친구)
//   themeColor/imageUrl/description = 크루 정체성(색·프로필사진·성격). adminUids=운영진(생성 시 빈 배열).
export async function createCrew({ creatorUid, creatorName = '', name, friendUids = [], names = {}, themeColor = '', imageUrl = null, description = '' }) {
  if (!creatorUid || !(name || '').trim()) return null;
  const aud = [...new Set((friendUids || []).filter((u) => u && u !== creatorUid))].slice(0, MAX_MEMBERS - 1);
  const ref = doc(collection(db, COL));
  await setDoc(ref, {
    creatorUid,                 // = 크루장(마스터). 탈퇴 시 운영진에게 승계.
    adminUids: [],              // 운영진 — 크루장이 임명. 공지·게시물삭제 권한.
    name: name.trim(),
    themeColor: themeColor || CREW_COLORS[0],
    imageUrl: imageUrl || null, // null이면 색+이니셜 기본 이미지로 렌더
    description: (description || '').trim().slice(0, DESC_MAX),
    memberUids: [creatorUid],
    audienceUids: aud,
    declinedUids: [],
    names: { [creatorUid]: creatorName || '', ...names },
    notice: '',
    postCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── 내 크루 구독 (멤버) — 최근활동순 정렬은 클라(즐겨찾기 우선) ──
export function subscribeMyCrews(uid, cb) {
  if (!uid) { cb([]); return () => {}; }
  const q = query(collection(db, COL), where('memberUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeMyCrews', e?.message); cb([]); });
}

// ── 내 크루 1회 조회 (공유 시트 등 단발성 — 구독 불필요한 곳) ──
export async function loadMyCrews(uid) {
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(db, COL), where('memberUids', 'array-contains', uid)));
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    return list;
  } catch (e) { if (__DEV__) console.warn('[crews] loadMyCrews', e?.message); return []; }
}

// ── 내게 온 초대 구독 (audience, 미수락·미거절) ──
export function subscribeCrewInvites(uid, cb) {
  if (!uid) { cb([]); return () => {}; }
  const q = query(collection(db, COL), where('audienceUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => {
      const c = d.data();
      if ((c.memberUids || []).includes(uid)) return;   // 이미 멤버
      if ((c.declinedUids || []).includes(uid)) return;  // 거절함
      list.push({ id: d.id, ...c });
    });
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrewInvites', e?.message); cb([]); });
}

// ── 단일 크루 구독 — 멤버/앨범 화면이 멤버·공지 변화를 실시간 반영(초대·탈퇴 후 즉시) ──
export function subscribeCrew(crewId, cb) {
  if (!crewId) { cb(null); return () => {}; }
  return onSnapshot(doc(db, COL, crewId), (d) => {
    cb(d.exists() ? { id: d.id, ...d.data() } : null);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrew', e?.message); cb(null); });
}

export { MAX_MEMBERS, CREW_COLORS, DESC_MAX };

// ── 크루 프로필 변경 (이름·색·이미지·성격) — 크루장만(보안 규칙) ──
export async function updateCrewProfile(crewId, { name, themeColor, imageUrl, description } = {}) {
  if (!crewId) return;
  const upd = { updatedAt: serverTimestamp() };
  if (typeof name === 'string' && name.trim()) upd.name = name.trim();
  if (typeof themeColor === 'string' && themeColor) upd.themeColor = themeColor;
  if (imageUrl !== undefined) upd.imageUrl = imageUrl || null;
  if (typeof description === 'string') upd.description = description.trim().slice(0, DESC_MAX);
  await updateDoc(doc(db, COL, crewId), upd);
}

// ── 운영진 임명/해제 — 크루장만(보안 규칙). add=true 임명, false 해제 ──
export async function toggleCrewAdmin(crewId, uid, add) {
  if (!crewId || !uid) return;
  await updateDoc(doc(db, COL, crewId), {
    adminUids: add ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

// ── 크루 삭제/해체 — 크루장만(보안 규칙). 하위 posts·comments 정리는 후속(빈 크루 위주) ──
export async function deleteCrew(crewId) {
  if (!crewId) return;
  await deleteDoc(doc(db, COL, crewId));
}

// ── 초대 수락 — audience가 memberUids에 자기 uid만 토글(셀프) ──
export async function acceptCrewInvite(crewId, uid, myName = '') {
  if (!crewId || !uid) return;
  // 트랜잭션 — 정원(20) 초과 차단. N명이 동시에 수락해 20을 넘기던 것 방지(create/invite 시트만 가드돼 있었음).
  return await runTransaction(db, async (tx) => {
    const ref = doc(db, COL, crewId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('not-found');
    const members = Array.isArray(snap.data().memberUids) ? snap.data().memberUids : [];
    if (members.includes(uid)) return;                          // 이미 멤버 — 멱등
    if (members.length >= MAX_MEMBERS) throw new Error('full');  // 정원 초과
    const upd = { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() };
    if (myName) upd[`names.${uid}`] = myName;
    tx.update(ref, upd);
  });
}
// ── 초대 거절 — declinedUids 자기 토글 ──
export async function declineCrewInvite(crewId, uid) {
  if (!crewId || !uid) return;
  await updateDoc(doc(db, COL, crewId), { declinedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}

// ── 친구 더 초대 (멤버 누구나) — audience 추가 + declined 제거(재초대) + 이름맵 보강 ──
export async function inviteToCrew(crewId, friendUids = [], names = {}) {
  const aud = [...new Set((friendUids || []).filter(Boolean))];
  if (!crewId || !aud.length) return;
  const upd = { audienceUids: arrayUnion(...aud), declinedUids: arrayRemove(...aud), updatedAt: serverTimestamp() };
  Object.keys(names).forEach((u) => { if (names[u]) upd[`names.${u}`] = names[u]; });
  await updateDoc(doc(db, COL, crewId), upd);
}

// ── 탈퇴 — 본인 memberUids 제거 + declinedUids 추가(재초대 전엔 초대 재노출 방지) ──
//   크루장이 탈퇴하면 운영진 첫 번째에게 자동 승계(현재 멤버인 운영진 우선). 운영진이 없으면 주인 없는 크루로
//   남는데 2차(자동 해체 등)에서 처리. 운영진이 탈퇴하면 운영진 목록에서도 제거. 트랜잭션으로 일관 처리.
export async function leaveCrew(crewId, uid) {
  if (!crewId || !uid) return;
  return await runTransaction(db, async (tx) => {
    const ref = doc(db, COL, crewId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const d = snap.data();
    if (!Array.isArray(d.memberUids) || !d.memberUids.includes(uid)) return; // 멱등 — 이미 빠짐
    const upd = {
      memberUids: arrayRemove(uid),
      declinedUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    };
    if (d.creatorUid === uid) {
      const admins = (Array.isArray(d.adminUids) ? d.adminUids : []).filter((u) => u !== uid && d.memberUids.includes(u));
      if (admins.length) {
        upd.creatorUid = admins[0];          // 운영진 첫 번째 승계
        upd.adminUids = arrayRemove(admins[0]); // 새 크루장은 운영진 목록에서 빼기(중복 방지)
      } else {
        // 운영진이 없으면 남은 첫 멤버에게 승계 — 주인 없는 크루(아무도 관리·삭제 못 함) 방지.
        //   남은 멤버가 없으면(마지막 1인 탈퇴) 빈 크루라 승계 불필요(CF onCrewEmptied가 정리).
        const nextMember = d.memberUids.find((u) => u !== uid);
        if (nextMember) upd.creatorUid = nextMember;
      }
    } else if (Array.isArray(d.adminUids) && d.adminUids.includes(uid)) {
      upd.adminUids = arrayRemove(uid);
    }
    tx.update(ref, upd);
  });
}

// 크루명 변경은 '나만 보는 별명'(기기 로컬, CrewListScreen aliasMap)으로 대체 — 서버 name은 생성 시 고정(전원 그룹명 동시변경 방지).

// ── 공지 설정 (텍스트만, 최신이 기존 대체, 멤버 누구나) ──
export async function setCrewNotice(crewId, notice, uid) {
  if (!crewId) return;
  await updateDoc(doc(db, COL, crewId), {
    notice: (notice || '').trim(), noticeBy: uid || null, noticeAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// ── 게시물 ──
export async function addCrewPost(crewId, { authorUid, text = '', media = [], roundupId = null, roundupHost = null, roundupShare = false }) {
  if (!crewId || !authorUid) return null;
  // 글 생성 + 최근활동/postCount를 한 배치로 원자화 — 분리 시 메타 갱신 실패로 postCount가 안 올라
  //   NEW 신호(postCount>seen)가 글을 놓치던 드리프트 방지. lastPostBy=작성자 → 내 글은 새 글 표시 제외.
  const ref = doc(collection(db, COL, crewId, 'posts'));
  const batch = writeBatch(db);
  const data = { authorUid, text: (text || '').trim(), media: media || [], commentCount: 0, likedBy: [], createdAt: serverTimestamp() };
  if (roundupId) {
    data.roundupId = roundupId;                 // 크루에 첨부/생성한 모집(있을 때만) — 미니카드로 렌더
    if (roundupHost) data.roundupHost = roundupHost; // 주최자 uid — 비친구라 모집을 못 읽을 때 '주최자와 친구 맺기' 안내 타겟
    if (roundupShare) data.roundupShare = true; // true=라운지 모집 공유(피드 광고 글), 없음=크루서 만든 모집(상단 핀)
  }
  batch.set(ref, data);
  batch.update(doc(db, COL, crewId), { postCount: increment(1), lastPostAt: serverTimestamp(), lastPostBy: authorUid, updatedAt: serverTimestamp() });
  await batch.commit();
  return ref.id;
}
// ── 목록 행 '내 글 새 반응' 점(7b) — 내 글 중 sinceMs 이후 '남이 단 댓글'이 있으면 true.
//   posts where authorUid==me & lastCommentAt>since (복합 인덱스 authorUid+lastCommentAt). 최근 5개만 보고
//   남이 단 것(lastCommentBy≠me)이 하나라도 있으면 true. sinceMs=0(기준 없음)·인덱스 전엔 false(앱 안 죽음).
//   좋아요는 시각(likedAt)이 없어 v1 제외 — 댓글 기준. 목록 진입 시 크루별 1회 조회(CF 없이).
export async function hasNewCommentsOnMyPosts(crewId, myUid, sinceMs = 0) {
  if (!crewId || !myUid || !sinceMs) return false;
  try {
    const q = query(
      collection(db, COL, crewId, 'posts'),
      where('authorUid', '==', myUid),
      where('lastCommentAt', '>', new Date(sinceMs)),
      orderBy('lastCommentAt', 'desc'),
      limit(5),
    );
    const snap = await getDocs(q);
    let found = false;
    snap.forEach((d) => { const c = d.data(); if (c.lastCommentBy && c.lastCommentBy !== myUid) found = true; });
    return found;
  } catch (e) {
    if (__DEV__) console.warn('[crews] hasNewComments', e?.code, e?.message);
    return false;
  }
}
export function subscribeCrewPosts(crewId, cb) {
  if (!crewId) { cb([]); return () => {}; }
  const q = query(collection(db, COL, crewId, 'posts'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrewPosts', e?.message); cb([]); });
}
export async function deleteCrewPost(crewId, postId) {
  if (!crewId || !postId) return;
  // 삭제 + postCount-1 원자화 — 감소가 분리돼 실패하면 카운터가 높게 남아 '유령 NEW'가 뜨던 드리프트 방지.
  const batch = writeBatch(db);
  batch.delete(doc(db, COL, crewId, 'posts', postId));
  batch.update(doc(db, COL, crewId), { postCount: increment(-1), updatedAt: serverTimestamp() });
  await batch.commit();
}
// ── 게시물 수정 — 작성자 본인(본문·미디어). editedAt 기록(작성자 불변) ──
export async function editCrewPost(crewId, postId, { text = '', media = [] }) {
  if (!crewId || !postId) return;
  await updateDoc(doc(db, COL, crewId, 'posts', postId), {
    text: (text || '').trim(), media: media || [], editedAt: serverTimestamp(),
  });
}
// ── 게시물 좋아요 토글 — likedBy 배열에 본인 uid만 셀프토글(멤버 누구나, 규칙 selfMembershipToggled).
//   on=true 좋아요(arrayUnion), false 취소(arrayRemove). 더블탭 like는 on=true로 호출(멱등). 푸시 없음(인앱만). ──
export async function togglePostLike(crewId, postId, uid, on) {
  if (!crewId || !postId || !uid) return;
  await updateDoc(doc(db, COL, crewId, 'posts', postId), {
    likedBy: on ? arrayUnion(uid) : arrayRemove(uid),
  });
}

// ── 댓글 / 대댓글 (parentId 있으면 대댓글) ──
export async function addCrewComment(crewId, postId, { authorUid, body = '', parentId = null }) {
  const text = (body || '').trim();
  if (!crewId || !postId || !authorUid || !text) return null;
  // 댓글 생성 + commentCount/최신댓글 미리보기를 한 배치로 원자화 — 분리 시 메타 실패로 카운트·미리보기가 어긋나던 드리프트 방지.
  //   '내 글 새 반응' 신호(#7)·피드 한 줄 미리보기용 비정규화. 표시 이름은 보는 사람이 resolve → uid만 저장.
  const ref = doc(collection(db, COL, crewId, 'posts', postId, 'comments'));
  const batch = writeBatch(db);
  batch.set(ref, { authorUid, body: text, parentId: parentId || null, likedBy: [], createdAt: serverTimestamp() });
  batch.update(doc(db, COL, crewId, 'posts', postId), {
    commentCount: increment(1), lastCommentBy: authorUid, lastCommentText: text, lastCommentAt: serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
}
export function subscribeCrewComments(crewId, postId, cb) {
  if (!crewId || !postId) { cb([]); return () => {}; }
  const q = query(collection(db, COL, crewId, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(300));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[crews] subscribeCrewComments', e?.message); cb([]); });
}
// ── 댓글 삭제 — newLatest: 삭제 대상이 '최신 댓글'일 때 남는 최신({by,text,at}) 또는 null(댓글 0개). 미전달=미리보기 불변 ──
export async function deleteCrewComment(crewId, postId, commentId, { newLatest } = {}) {
  if (!crewId || !postId || !commentId) return;
  // 삭제 + commentCount-1(+미리보기 갱신)을 한 배치로 원자화 — 감소가 분리돼 실패하면 카운트가 높게 남던 드리프트 방지.
  const meta = { commentCount: increment(-1) };
  if (newLatest !== undefined) {
    meta.lastCommentBy = newLatest ? (newLatest.by || null) : null;
    meta.lastCommentText = newLatest ? (newLatest.text || '') : '';
    meta.lastCommentAt = newLatest ? (newLatest.at || null) : null;
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, COL, crewId, 'posts', postId, 'comments', commentId));
  batch.update(doc(db, COL, crewId, 'posts', postId), meta);
  await batch.commit();
}
// ── 댓글 수정 — 작성자 본인(본문). editedAt 기록(작성자·parentId 불변). isLatest면 미리보기 텍스트도 갱신 ──
export async function editCrewComment(crewId, postId, commentId, { body = '', isLatest = false }) {
  const text = (body || '').trim();
  if (!crewId || !postId || !commentId || !text) return;
  await updateDoc(doc(db, COL, crewId, 'posts', postId, 'comments', commentId), {
    body: text, editedAt: serverTimestamp(),
  });
  if (isLatest) updateDoc(doc(db, COL, crewId, 'posts', postId), { lastCommentText: text })
    .catch((e) => __DEV__ && console.warn('[crews] comment edit meta', e?.message));
}
// ── 댓글 좋아요 토글 — likedBy 셀프토글(게시물 좋아요와 동일 규칙) ──
export async function toggleCommentLike(crewId, postId, commentId, uid, on) {
  if (!crewId || !postId || !commentId || !uid) return;
  await updateDoc(doc(db, COL, crewId, 'posts', postId, 'comments', commentId), {
    likedBy: on ? arrayUnion(uid) : arrayRemove(uid),
  });
}
