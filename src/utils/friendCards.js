// 친구/받은신청 → 명함 카드 객체 빌더. FriendsTab의 인라인 빌드(toMinimal/received)와 동일 로직을
//   프리페치가 재사용해 '미리 만든 카드'를 캐시 → 첫 진입 즉시 시드(stale-while-revalidate)용.
//   ⚠️ FriendsTab 인라인 빌드와 필드가 일치해야 함(변경 시 양쪽 같이). [[friend_groups]]

// profileByUid[uid] = { nickname, realName, statusMessage, lifeBest, avgScore, totalRounds, avatarUrl, handicap, lastFriendPostAt }
//   groupTimes = { uid: 내가볼수있는 그룹공개글 최신millis } — 활동순 정렬을 화면과 일치시켜 시드 후 재정렬(널뛰기) 방지.
export function buildFriendCard(uid, profileByUid, friendMeta, groupTimes) {
  const p = (profileByUid || {})[uid] || {};
  const meta = (friendMeta || {})[uid] || {};
  const nickname = p.nickname || '친구';
  const cn = (meta.customName || '').trim();
  return {
    id: uid,
    nickname,                          // 원본 닉네임(별명 편집 시 placeholder·복원용)
    name: cn || nickname,              // 표시 이름 — 별명 우선
    customName: cn,
    groupIds: Array.isArray(meta.groupIds) ? meta.groupIds : [],
    realName: p.realName || '',
    statusMessage: p.statusMessage || '',
    avatarUri: p.avatarUrl || null,
    style: '',
    hostedCount: 0, attendedCount: 0, mannerScore: 0,
    recent: null,
    stats: { rounds: p.totalRounds || 0, avg: p.avgScore || null, best: p.lifeBest || null, handicap: p.handicap ?? null },
    lastPostAt: Math.max(p.lastFriendPostAt?.toMillis ? p.lastFriendPostAt.toMillis() : 0, (groupTimes || {})[uid] || 0), // 친구공개 최신 + 내가 볼 수 있는 그룹글 최신 (FriendsTab toMinimal과 동일)
    feed: [],
    togetherCount: 0,
  };
}

// 받은신청 카드 — 차단 필터는 사용자별이라 호출처(FriendsTab)에서 id 기준으로 적용.
export function buildReceivedCard(requesterUid, profileByUid) {
  const p = (profileByUid || {})[requesterUid] || {};
  return {
    id: requesterUid,
    name: p.nickname || '친구',
    realName: p.realName || '',
    statusMessage: p.statusMessage || '',
    avatarUri: p.avatarUrl || null,
    hostedCount: 0, attendedCount: 0, mannerScore: 0, avg: p.avgScore || null,
    stats: { rounds: p.totalRounds || 0, courses: 0, avg: p.avgScore || null, best: p.lifeBest || null, handicap: p.handicap ?? null },
  };
}
