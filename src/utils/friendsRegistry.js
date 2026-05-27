import { STORAGE_KEYS, storage } from './storage';

// 친구 관련 상태 영구 저장 — 라운지 등 다른 화면에서 친구 상태 조회용.
// 출시 전 더미 단계: AsyncStorage. Phase 3에 friendships 컬렉션으로 이관.
// sentFriendRequests: 내가 친구 신청 보낸 사용자 id 배열 (수락 전 상태)

let cache = null;

async function load() {
  if (cache !== null) return cache;
  const arr = await storage.load(STORAGE_KEYS.sentFriendRequests, []);
  cache = Array.isArray(arr) ? arr : [];
  return cache;
}

export async function getSentFriendRequests() {
  return await load();
}

export async function isFriendRequestSent(targetId) {
  if (!targetId) return false;
  const list = await load();
  return list.includes(targetId);
}

export async function addSentFriendRequest(targetId) {
  if (!targetId) return false;
  const list = await load();
  if (list.includes(targetId)) return false; // 멱등
  const next = [...list, targetId];
  cache = next;
  await storage.save(STORAGE_KEYS.sentFriendRequests, next);
  return true;
}

export async function removeSentFriendRequest(targetId) {
  if (!targetId) return false;
  const list = await load();
  if (!list.includes(targetId)) return false;
  const next = list.filter(id => id !== targetId);
  cache = next;
  await storage.save(STORAGE_KEYS.sentFriendRequests, next);
  return true;
}

// 캐시 무효화 (테스트·계정 탈퇴 후)
export function _invalidateCache() {
  cache = null;
}
