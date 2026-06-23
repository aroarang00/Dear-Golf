import { friendDisplayName } from './friendGroups';

// 일정 동반자 이름 목록 — 수동 companions + 전파 그룹(memberUids=수락 / audienceUids=초대중) 보강.
//   본인(myUid)·중복·거절(declinedUids) 제외. 이름: 별명(friendMeta) → 그룹 저장명(group.names) →
//   친구목록 닉네임(friendNames 폴백, 옛 그룹) → 호스트명 순.
//   ScheduleSheetModal(홈 바텀시트)·MyScheduleTab(일정 캘린더 카드) 공용 — 캘린더 카드가 companions만 읽어
//   '친구 초대'(audience)로 들어온 동반자가 누락되던 것 해소(2026-06-24, [[schedule-propagation-spec]]).
export function buildCompanionNames(schedule, { group = null, friendMeta = {}, friendNames = {}, myUid = null } = {}) {
  const out = [];
  const seen = new Set();
  const gMembers = group?.memberUids || [];
  const gAudience = group?.audienceUids || [];
  const gDeclined = group?.declinedUids || [];
  (schedule?.companions || []).forEach((c) => {
    if (typeof c === 'string') { if (c) out.push(c); return; }
    const nm = friendDisplayName(friendMeta, c?.friendUid, c?.name);
    if (!nm) return;
    const uid = c?.friendUid;
    if (uid) seen.add(uid);
    if (uid && group && gDeclined.includes(uid)) return; // 거절/탈퇴자 제외
    // 내가 동반자로 넣어 초대한 사람이라도 아직 수락(member) 안 했으면 '(초대중)'.
    const pending = !!(uid && group && gAudience.includes(uid) && !gMembers.includes(uid));
    out.push(pending ? `${nm}(초대중)` : nm);
  });
  if (group) {
    [...gMembers, ...gAudience].forEach((uid) => {
      if (!uid || uid === myUid || seen.has(uid)) return;
      seen.add(uid);
      if (gDeclined.includes(uid)) return;
      const cn = (friendMeta?.[uid]?.customName || '').trim();
      const nm = cn || group.names?.[uid] || friendNames[uid] || (uid === group.initiatorUid ? group.initiatorName : '');
      if (nm) out.push(gMembers.includes(uid) ? nm : `${nm}(초대중)`);
    });
  }
  return out;
}
