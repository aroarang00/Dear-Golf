// 공용 사용자 차단 훅 — 친구 차단의 단일 진실 소스([[block-nickname]]·[[friend-relationship]] 일반 차단=일방 친구 해지).
//   FriendsTab(친구 카드)·DMChatScreen(대화방 ⋯) 둘 다 이 훅을 써서 동작을 통일(로직 중복 제거).
//   화면별 후처리(목록에서 제거·대화방 닫기 등)는 호출부가 반환값으로 처리.
//
// 차단 1건 = ①일일 한도 체크 → ②로컬 프로필 갱신(blockedUsers·카운트) → ③Firestore write-through(blockedUids)
//   → ④친구 관계 종료(unfriend, friendships doc 삭제) → ⑤그룹·별명 정리 + 내 group 글 공개대상 재계산.
//   상대에겐 알림 안 감(블라인드). 반환 {ok, reason?, profile?, friendData?}.
import { useCallback, useContext } from 'react';
import { UserContext } from '../contexts/UserContext';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { blockUser, remainingBlocksToday } from '../utils/block';
import { blockUid as fsBlockUid, unfriend } from '../utils/friends';
import { setFriendMeta } from '../utils/friendGroups';
import { recomputeMyGroupAudiences } from '../utils/round';

export function useBlockUser() {
  const { userProfile, setUserProfile } = useContext(UserContext);

  // 오늘 차단 가능 횟수(호출부가 확인창 띄우기 전 가드용)
  const remaining = remainingBlocksToday(userProfile);

  const block = useCallback(async (targetId) => {
    if (remainingBlocksToday(userProfile) <= 0) return { ok: false, reason: 'limit' };
    const result = blockUser(userProfile, targetId);
    if (!result.ok) return result;  // { ok:false, reason:'limit'|'invalid' }
    // 로컬 프로필 즉시 반영(차단 목록·일일 카운트)
    setUserProfile(result.profile);
    storage.save(STORAGE_KEYS.profile, result.profile);
    // Firestore write-through — users/{myUid}.blockedUids (멀티기기 일관성)
    fsBlockUid(targetId).catch(e => { if (__DEV__) console.warn('[useBlockUser] fsBlockUid', e?.message); });
    // 차단은 친구 관계도 종료(일방) — friendships doc 삭제
    try { await unfriend(targetId); } catch (e) { if (__DEV__) console.warn('[useBlockUser] unfriend', e?.message); }
    // 그룹/별명에서 제거 + 내 group 글 공개대상 재계산(차단한 사람이 과거 글에서도 빠지게, [[friend_groups]] ⑥)
    let friendData = null;
    try {
      const updated = await setFriendMeta(targetId, {});
      if (updated) { friendData = updated; recomputeMyGroupAudiences(updated.friendMeta); }
    } catch (e) { if (__DEV__) console.warn('[useBlockUser] group cleanup', e?.message); }
    return { ok: true, profile: result.profile, friendData };
  }, [userProfile, setUserProfile]);

  return { block, remaining };
}
