import {
  collection, query, where, getDocs, onSnapshot,
  setDoc, updateDoc, getDoc, doc, serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import { createNotification } from './roundupNotifications';
import { findUserCourseById, ensureCourseCoord } from './userCourses';

// =============================================================
// scheduleGroups/{groupId} — 일정 동반자 전파 (Phase B, docs/companion-design.md §5-1, [[schedule-propagation-spec]])
//
// 한 명이 본인 일정을 친구 동반자에게 공유(초대) → 수신자가 수락하면 '자기 일정'에 자기파생.
// ★자기파생: 파생은 수신자 schedules에 ownerUid==본인으로 setDoc(결정적 ID {groupId}_{uid}) →
//   기존 schedules 규칙 그대로 통과 + 멱등(중복 방지). cross-user 쓰기 0 = CF 불필요(roundScoreShares와 동일).
// 호스트 개념 없음: initiatorUid는 멱등 시드(출처 태그)일 뿐 권한 아님 — 멤버 전원 동등하게 수정/삭제.
// ★전파 일정 구분 표식 = schedule.groupId (friendUid 아님 — friendUid는 라벨/매칭 전용). 수정/삭제 시 멤버 알림은 Stage 4.
//
// 보안 규칙 (firestore.rules):
//  - read   : me in memberUids OR me in audienceUids  (resource==null 가드 — 결정적 ID 존재확인용)
//  - create : initiatorUid==me, memberUids==[me], declinedUids==[]
//  - update : initiator가 audienceUids 추가 / 수신자가 memberUids·declinedUids 본인 토글
//  - delete : initiator (TTL 정리는 후속 CF)
//  - 쿼리   : where('audienceUids','array-contains', 내uid)  (수락/거절 필터는 클라서 member/declined로)
// =============================================================

const COLLECTION = 'scheduleGroups';

// 결정적 groupId — 최초 공유자 uid + 그 일정 id. 같은 일정 재공유 시 같은 그룹(멱등).
export function scheduleGroupId(initiatorUid, sourceScheduleId) {
  return `${initiatorUid}_${sourceScheduleId}`;
}

// 일정 공유(초대) — 그룹 문서 생성(없으면) 또는 audienceUids 추가(있으면, 친구 더 초대).
//   schedule=공유할 내 일정 객체(본인 소유), friendUids=초대할 친구 uid 배열.
//   반환=groupId(호출부에서 내 일정에 groupId 스탬프 → 전파 일정으로 표식).
export async function shareScheduleToFriends({ schedule, initiatorUid, initiatorName, friendUids, names = {} }) {
  if (!schedule?.id || !initiatorUid) return null;
  const aud = [...new Set((friendUids || []).filter(u => u && u !== initiatorUid))];
  if (!aud.length) return null;
  // 초대 친구 이름맵(uid→이름) — 그룹에 저장해 표시 시 친구목록 조회 없이 이름 사용. 생성 시·나중 초대 모두 보강.
  const nameEntries = {};
  aud.forEach(u => { const nm = (names[u] || '').trim(); if (nm) nameEntries[u] = nm; });
  const groupId = scheduleGroupId(initiatorUid, schedule.id);
  const ref = doc(db, COLLECTION, groupId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    // 초대 추가 + 이름맵 보강(dot-notation 머지). 나중에 동반자 등록해도 이름 저장됨.
    const upd = { audienceUids: arrayUnion(...aud), updatedAt: serverTimestamp() };
    Object.keys(nameEntries).forEach(u => { upd[`names.${u}`] = nameEntries[u]; });
    await updateDoc(ref, upd);
  } else {
    // ★좌표를 미리 풀어 그룹에 저장 — 수신자(다른 계정)는 발신자의 per-user courseId로 좌표를 못 찾으므로
    //   계정 독립적인 좌표(courseX/Y)를 발신자가 해석해 박아둔다. 실패하면 수신자가 이름으로 폴백([[schedule-propagation-spec]]).
    let courseX = (typeof schedule.courseX === 'number') ? schedule.courseX : null;
    let courseY = (typeof schedule.courseY === 'number') ? schedule.courseY : null;
    if ((courseX == null || courseY == null) && schedule.courseId) {
      try {
        const c = await ensureCourseCoord(await findUserCourseById(schedule.courseId));
        if (c && typeof c.x === 'number' && typeof c.y === 'number') { courseX = c.x; courseY = c.y; }
      } catch (e) { if (__DEV__) console.warn('[scheduleShare] coord resolve fail', e?.message); }
    }
    await setDoc(ref, {
      initiatorUid,
      initiatorName: initiatorName || '',
      sourceScheduleId: schedule.id,
      course: schedule.course || '',
      courseId: schedule.courseId || null,
      courseLoc: schedule.courseLoc || null,
      courseLogId: schedule.courseLogId || null,
      courseKakaoId: schedule.courseKakaoId || null,
      courseX, courseY,
      date: schedule.date || '',
      day: schedule.day || '',
      time: schedule.time || '',
      members: typeof schedule.members === 'number' ? schedule.members : 4,
      names: { [initiatorUid]: initiatorName || '', ...nameEntries }, // uid→이름(호스트+초대친구). 표시 시 친구목록 조회 불필요
      audienceUids: aud,
      memberUids: [initiatorUid],   // 최초 공유자는 바로 멤버
      declinedUids: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return groupId;
}

// 내게 온 일정 초대 구독 — audienceUids에 내 uid, 아직 수락(memberUids)/거절(declinedUids) 안 한 것만. 최신순(클라 정렬).
//  반환 = unsubscribe 함수.
export function subscribeIncomingScheduleInvites(uid, cb) {
  if (!uid) { cb([]); return () => {}; }
  const q = query(collection(db, COLLECTION), where('audienceUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    cb(filterPending(snap, uid));
  }, (e) => { if (__DEV__) console.warn('[scheduleShare] subscribe fail', e?.message); cb([]); });
}

// 1회 조회 버전(폴백/초기 로드).
export async function loadIncomingScheduleInvites(uid) {
  if (!uid) return [];
  const q = query(collection(db, COLLECTION), where('audienceUids', 'array-contains', uid));
  const snap = await getDocs(q);
  return filterPending(snap, uid);
}

// 미응답(수락·거절 안 한) 초대만 추려 최신순. 본인이 보낸 그룹은 제외.
function filterPending(snap, uid) {
  const list = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.initiatorUid === uid) return;
    if ((data.memberUids || []).includes(uid)) return;
    if ((data.declinedUids || []).includes(uid)) return;
    list.push({ id: d.id, ...data });
  });
  list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return list;
}

// 그룹 → 내 schedules 파생 payload(프리필). 호출부에서 setDoc/캘린더 동기화에 사용.
export function buildDerivedSchedule(group, uid) {
  return {
    ownerUid: uid,
    course: group.course || '',
    // ★per-user id(courseId·courseLogId)는 발신자 계정 전용이라 수신자 계정에선 무효(findUserCourseById 실패) →
    //   날씨/코스연결이 깨짐. 계정 독립 식별자만 전파: 좌표(courseX/Y)·kakaoId·이름·주소.
    //   수신자는 좌표로 날씨, 이름/kakaoId로 자기 계정의 코스를 해석(resolveCourseLogId).
    courseId: null,
    courseLoc: group.courseLoc || null,
    courseLogId: null,
    courseKakaoId: group.courseKakaoId || null,
    courseX: (typeof group.courseX === 'number') ? group.courseX : null,
    courseY: (typeof group.courseY === 'number') ? group.courseY : null,
    date: group.date || '',
    day: group.day || '',
    time: group.time || '',
    members: typeof group.members === 'number' ? group.members : 4,
    // 초대한 사람을 동반자 라벨로(이름+friendUid). 나머지 멤버는 그룹에서 해석(UI).
    companions: group.initiatorUid ? [{ name: group.initiatorName || '', friendUid: group.initiatorUid }] : [],
    groupId: group.id,                       // ★전파 일정 표식
    sourceScheduleId: group.sourceScheduleId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

// 수락 시 자기파생 일정 문서 ID(결정적·멱등). 실제 setDoc은 SchedulesContext.addSharedSchedule(캘린더 동기화 포함).
export function derivedScheduleId(groupId, uid) {
  return `${groupId}_${uid}`;
}

// 그룹 멤버 합류 — 수락 시(자기파생 후) 또는 같은 일정 보유로 기존 일정에 groupId만 스탬프할 때(중복 방지 경로).
//   여기선 그룹 memberUids에 본인 추가만. 일정 doc 쓰기는 호출부(SchedulesContext).
export async function joinScheduleGroup(groupId, uid) {
  if (!groupId || !uid) return;
  await updateDoc(doc(db, COLLECTION, groupId), { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}

// 그룹 탈퇴 — 전파 일정 삭제 시 본인을 memberUids에서 제거 + declinedUids에 추가.
//   ★declinedUids에도 넣어야 — member에서만 빼면 filterPending이 '미응답'으로 보고 초대를 다시 띄움(사용자 2026-06-19).
//   member 제거=알림 중단, declined 추가=초대 재노출 방지. 둘 다 필요. ([[schedule-propagation-spec]])
export async function leaveScheduleGroup(groupId, uid) {
  if (!groupId || !uid) return;
  await updateDoc(doc(db, COLLECTION, groupId), {
    memberUids: arrayRemove(uid),
    declinedUids: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  });
}

// 거절 — 파생 없이 declinedUids에 본인만 추가(카드 재노출 방지). 사적·호스트 미통지([[roundup-invitation]] 정책 재사용).
export async function declineScheduleInvite(groupId, uid) {
  if (!groupId || !uid) return;
  await updateDoc(doc(db, COLLECTION, groupId), { declinedUids: arrayUnion(uid), updatedAt: serverTimestamp() });
}

// 그룹 1건 조회 — 전파 일정 수정/삭제 시 멤버 목록(알림 대상) 확보용(Stage 4).
export async function getScheduleGroup(groupId) {
  if (!groupId) return null;
  const snap = await getDoc(doc(db, COLLECTION, groupId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// 전파 일정 수정/삭제 시 그룹 멤버에게 알림(나 제외) — roundupNotifications 생성 → onNotificationCreated가 푸시.
//   type='scheduleChanged'|'scheduleCancelled'. course/date/time은 호출부가 '변경 후' 값을 넘김(스냅샷 아님).
//   v1=재알림 모델(데이터 자동 동기화 X) — 멤버는 알림 받고 본인 일정을 직접 갱신/삭제 ([[schedule-propagation-spec]]).
export async function notifyScheduleGroupMembers({ group, myUid, type, actorName, course, date, time }) {
  const members = (group?.memberUids || []).filter(u => u && u !== myUid);
  if (!members.length) return 0;
  await Promise.all(members.map(rid => createNotification({
    type,
    recipientUid: rid,
    actorName: actorName || '',
    postId: group.id,
    postTitle: course || group.course || '',
    scheduleDate: date || group.date || '',
    scheduleTime: time || group.time || '',
  }).catch(e => __DEV__ && console.warn('[scheduleGroup notify]', rid, e?.message))));
  return members.length;
}
