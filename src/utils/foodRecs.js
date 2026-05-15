import { storage, STORAGE_KEYS } from './storage';

// 사용자가 추천(♥)한 맛집 — AsyncStorage 기반
// 구조: { [kakaoId]: true }

export async function getFoodRecs() {
  return (await storage.load(STORAGE_KEYS.foodRecs, {})) || {};
}

// 추천 토글 — 갱신된 전체 맵 반환
export async function toggleFoodRec(kakaoId) {
  const recs = await getFoodRecs();
  if (!kakaoId) return recs;
  if (recs[kakaoId]) delete recs[kakaoId];
  else recs[kakaoId] = true;
  await storage.save(STORAGE_KEYS.foodRecs, recs);
  return recs;
}

// 추천수 시드 — kakaoId 해시 기반 결정적 기본 추천수
// (백엔드 없는 프로토타입용 — 골퍼 커뮤니티 추천수처럼 보이게)
export function seedRecCount(kakaoId) {
  const s = String(kakaoId || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 28;
}
