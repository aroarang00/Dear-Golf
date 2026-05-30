import { STORAGE_KEYS, storage } from './storage';
import { db, getUid } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// 친구 신청 일 10건 한도 — [[friend-add-feature]] (스팸 신청 방지).
// 매일 자정 자동 초기화.
//
// 저장 위치:
//  - AsyncStorage(@dg_friend_request_count): 빠른 로컬 캐시 (단일 기기)
//  - users/{uid}.limits.friendRequest: Firestore 단일 소스 (멀티기기 우회 차단)
//  - increment 시 양쪽 동시 업데이트. App.js 마운트 시 syncFromFirestore로 max 머지.

const DAILY_LIMIT = 10;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export async function getFriendRequestCountToday() {
  const raw = await storage.load(STORAGE_KEYS.friendRequestCount, null);
  const today = todayStr();
  if (!raw || raw.date !== today) return 0;
  return raw.count || 0;
}

export async function getFriendRequestRemainingToday() {
  const used = await getFriendRequestCountToday();
  return Math.max(0, DAILY_LIMIT - used);
}

export async function isFriendRequestLimitReached() {
  const used = await getFriendRequestCountToday();
  return used >= DAILY_LIMIT;
}

export async function incrementFriendRequestCount() {
  const today = todayStr();
  const raw = await storage.load(STORAGE_KEYS.friendRequestCount, null);
  const baseCount = (!raw || raw.date !== today) ? 0 : (raw.count || 0);
  const next = { date: today, count: baseCount + 1 };
  await storage.save(STORAGE_KEYS.friendRequestCount, next);
  // Firestore write-through (실패해도 로컬 카운트는 유지)
  try {
    const uid = await getUid();
    if (uid) {
      await setDoc(doc(db, 'users', uid),
        { limits: { friendRequest: next }, updatedAt: serverTimestamp() },
        { merge: true });
    }
  } catch (e) {
    if (__DEV__) console.warn('[friendRequestLimit] firestore sync failed', e?.message);
  }
}

// App.js 마운트 시 1회 — Firestore 값과 로컬 값을 같은 날짜면 max로 머지 (멀티기기 우회 차단).
// 날짜가 다르면 0으로 자동 초기화.
export async function syncFriendRequestLimitFromFirestore() {
  try {
    const uid = await getUid();
    if (!uid) return;
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return;
    const remote = snap.data().limits?.friendRequest;
    if (!remote) return;
    const today = todayStr();
    const localRaw = await storage.load(STORAGE_KEYS.friendRequestCount, null);
    const localCount = (localRaw && localRaw.date === today) ? (localRaw.count || 0) : 0;
    const remoteCount = (remote.date === today) ? (remote.count || 0) : 0;
    const maxCount = Math.max(localCount, remoteCount);
    await storage.save(STORAGE_KEYS.friendRequestCount, { date: today, count: maxCount });
  } catch (e) {
    if (__DEV__) console.warn('[friendRequestLimit] sync from firestore failed', e?.message);
  }
}

export const FRIEND_REQUEST_DAILY_LIMIT = DAILY_LIMIT;
