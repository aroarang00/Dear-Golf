import { STORAGE_KEYS, storage } from './storage';

// 친구 신청 일 10건 한도 — [[friend-add-feature]] (스팸 신청 방지).
// 매일 자정 자동 초기화.

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
  await storage.save(STORAGE_KEYS.friendRequestCount, {
    date: today,
    count: baseCount + 1,
  });
}

export const FRIEND_REQUEST_DAILY_LIMIT = DAILY_LIMIT;
