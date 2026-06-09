import {
  collection, query, where, orderBy, limit as fsLimit, getDocs, onSnapshot,
  addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// roundupNotifications/{notiId} — 라운지 인앱 알림
//
// 보안 규칙 (firestore.rules):
//  - read   : recipientUid == me
//  - create : actorUid == me  AND  recipientUid != me  (본인이 본인에게 X)
//  - update : recipientUid == me  AND  read 필드만 변경
//  - delete : recipientUid == me
//
// 푸시 발송(FCM)은 Phase 5 Cloud Functions에서 onCreate 트리거로 처리.
// 현재는 인앱 알림만 (사용자가 라운지 탭/알림함 진입 시 표시).
//
// type 종류:
//  - apply       : 다른 사용자가 내 모집에 참여 신청 → 주최자에게
//  - confirmed   : 내 신청이 수락됨 → 신청자에게
//  - cancel      : 다른 참여자가 취소 → 주최자에게
//  - kicked      : 주최자가 강퇴 → 강퇴된 자에게 (블라인드, actorName 비공개)
//  - slotOpen    : 대기자 자리 열림 → 대기자에게 (Cloud Functions 트리거)
//  - comment     : 내 모집/참여 모집에 댓글 (Cloud Functions 트리거)
//  - mannerEval  : 매너 평가 권유 (티오프+5h, Cloud Functions 트리거)
// =============================================================

const COLLECTION = 'roundupNotifications';

// 알림 생성 — 본인이 actor, 대상이 recipient.
// type/postId/postTitle은 필수, 그 외 옵션 (actorName, status 등).
// payload는 보안 규칙이 허용하는 필드만 포함.
export async function createNotification(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  if (!data.recipientUid || data.recipientUid === uid) return null;
  if (!data.type) throw new Error('type required');
  const noti = {
    type: data.type,
    actorUid: uid,
    actorName: data.actorName || '',
    recipientUid: data.recipientUid,
    postId: data.postId || null,
    postTitle: data.postTitle || '',
    status: data.status || null,
    // scheduleDate — 취소 알림 등에서 날짜 식별용(확정형). 없으면 생략. create 규칙은 필드 제한 없음.
    ...(data.scheduleDate ? { scheduleDate: data.scheduleDate } : {}),
    read: false,
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), noti);
  return { id: ref.id, ...noti };
}

// 친구지정·포함 초대 알림 — 선택한 친구들에게 1회씩 ([[roundup-invitation]]).
//   멱등: 문서 ID = `invite_{postId}_{recipientUid}` (결정적). 같은 모집 재발송해도 중복 X.
//   신규 모집 생성 시에만 호출(수정 시 재알림 X). 본인·빈 값은 건너뜀.
export async function createInviteNotifications(postId, postTitle, recipientUids, actorName = '') {
  const uid = await getUid();
  if (!uid || !postId || !Array.isArray(recipientUids)) return;
  await Promise.all(
    recipientUids
      .filter(rid => rid && rid !== uid)
      .map(rid => setDoc(doc(db, COLLECTION, `invite_${postId}_${rid}`), {
        type: 'invite',
        actorUid: uid,
        actorName: actorName || '',
        recipientUid: rid,
        postId,
        postTitle: postTitle || '',
        status: null,
        read: false,
        createdAt: serverTimestamp(),
      }).catch(e => __DEV__ && console.warn('[invite noti] fail', rid, e?.message)))
  );
}

// 동반자에게 일정 알리기 — 주최자가 확정 동반자 전원에게 리마인드 1회 발송 ([[project_roundup_kakao_chat]]).
//   멱등 X — 주최자가 다시 눌러 재발송 가능(횟수 제한 없음). 매번 새 문서(addDoc).
//   본인·빈 값은 건너뜀. 푸시는 onNotificationCreated가 자동 처리(배포 후).
export async function createScheduleNotices(post, recipientUids, actorName = '') {
  const uid = await getUid();
  if (!uid || !post?.id || !Array.isArray(recipientUids)) return 0;
  const targets = recipientUids.filter(rid => rid && rid !== uid);
  await Promise.all(
    targets.map(rid => addDoc(collection(db, COLLECTION), {
      type: 'scheduleNotice',
      actorUid: uid,
      actorName: actorName || '',
      recipientUid: rid,
      postId: post.id,
      postTitle: post.course || '',
      scheduleDate: post.date || '',
      scheduleTime: post.time || '',
      priority: 'normal',
      read: false,
      createdAt: serverTimestamp(),
    }).catch(e => __DEV__ && console.warn('[scheduleNotice] fail', rid, e?.message)))
  );
  return targets.length;
}

// 내가 받은 알림 — 최신순. 인덱스 (recipientUid, createdAt desc) 사용.
export async function loadMyNotifications(maxResults = 50) {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('recipientUid', '==', uid),
    orderBy('createdAt', 'desc'),
    fsLimit(maxResults),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 내가 받은 알림 실시간 구독 — loadMyNotifications와 동일 쿼리라 인덱스(recipientUid, createdAt desc) 재사용.
//   onChange(list)에 최신순 배열 전달. 본인 수신분만, maxResults 한도 → 비용 좁게 ([[lounge-realtime]] ③).
//   read 여부·type 필터는 호출부에서 (구독은 단순 유지, 인덱스 추가 회피). 반환값 호출로 구독 해제.
export function subscribeMyNotifications(onChange, maxResults = 50) {
  let unsub = null, cancelled = false;
  (async () => {
    const uid = await getUid();
    if (!uid || cancelled) return;
    const q = query(
      collection(db, COLLECTION),
      where('recipientUid', '==', uid),
      orderBy('createdAt', 'desc'),
      fsLimit(maxResults),
    );
    unsub = onSnapshot(q,
      snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { if (__DEV__) console.warn('[subscribeMyNotifications]', err?.message); });
  })();
  return () => { cancelled = true; if (unsub) unsub(); };
}

// 읽음 처리 — 단건
export async function markNotificationRead(notiId) {
  if (!notiId) return;
  await updateDoc(doc(db, COLLECTION, notiId), { read: true });
}

// 전체 읽음 — 메모리 필터 후 일괄 업데이트 (보조 인덱스 회피)
export async function markAllNotificationsRead(loaded) {
  const list = Array.isArray(loaded) ? loaded : await loadMyNotifications(100);
  const unread = list.filter(n => !n.read);
  await Promise.all(unread.map(n => markNotificationRead(n.id)
    .catch(e => __DEV__ && console.warn('[roundupNotifications] markRead fail', e?.message))));
}

// 알림 삭제 — 본인 알림만 (수신자 본인)
export async function deleteNotification(notiId) {
  if (!notiId) return;
  await deleteDoc(doc(db, COLLECTION, notiId));
}
