// 차단 헬퍼 — 모집글 양방향 숨김 + 일일 차단 한도(5명).
// Firestore 연동 시 동일 규칙을 백엔드(보안 규칙·Cloud Functions)에서 검증할 것.

export const DAILY_BLOCK_LIMIT = 5;

// 'YYYY.MM.DD' 오늘 문자열
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 오늘 남은 차단 가능 횟수
export function remainingBlocksToday(profile) {
  if (profile?.blockCountDate !== todayStr()) return DAILY_BLOCK_LIMIT;
  return Math.max(0, DAILY_BLOCK_LIMIT - (profile?.blockCountToday || 0));
}

// 차단 추가. 한도 초과면 {ok:false, reason:'limit'} 반환.
export function blockUser(profile, targetId) {
  if (!targetId) return { ok: false, reason: 'invalid' };
  const blocked = profile?.blockedUsers || [];
  if (blocked.includes(targetId)) return { ok: true, profile };  // 이미 차단됨 → 멱등
  const today = todayStr();
  const sameDay = profile?.blockCountDate === today;
  const countToday = sameDay ? (profile?.blockCountToday || 0) : 0;
  if (countToday >= DAILY_BLOCK_LIMIT) return { ok: false, reason: 'limit' };
  return {
    ok: true,
    profile: {
      ...profile,
      blockedUsers: [...blocked, targetId],
      blockCountDate: today,
      blockCountToday: countToday + 1,
    },
  };
}

// 차단 해제 — 일일 한도 카운터는 줄이지 않음(해제 후 재차단으로 한도 우회 방지).
export function unblockUser(profile, targetId) {
  const blocked = profile?.blockedUsers || [];
  return {
    ok: true,
    profile: {
      ...profile,
      blockedUsers: blocked.filter(id => id !== targetId),
    },
  };
}

// 모집글이 내 시야에서 보여야 하는지 판단.
// - 내가 author를 차단 → 안 보임
// - author가 나를 차단(post.authorBlockedUids 포함) → 안 보임
// 더미 데이터에서는 post.authorId 또는 post.author(이름) 둘 다 매칭 시도.
export function isPostVisible(post, myProfile, myId) {
  const blocked = myProfile?.blockedUsers || [];
  const authorKey = post.authorId || post.author;
  if (authorKey && blocked.includes(authorKey)) return false;
  if (myId && Array.isArray(post.authorBlockedUids) && post.authorBlockedUids.includes(myId)) return false;
  return true;
}
