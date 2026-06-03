import { createContext } from 'react';

// 친구 탭 탭바 뱃지 — 받은 친구신청 수.
//   친구 관계 알림은 친구 탭 소관(라운지 알림함에서 분리, [[realname-policy]] 흐름과 무관한 IA 정돈).
//   App이 마운트·포그라운드 복귀 시 loadReceivedRequests로 갱신, FriendsTab이 자기 받은신청 변화 시 직접 반영.
//   코드베이스가 실시간 리스너(onSnapshot)를 안 쓰므로 동일하게 1회성 조회 + 갱신 트리거 방식.
export const FriendBadgeContext = createContext({
  friendReqCount: 0,
  setFriendReqCount: () => {},
  refreshFriendBadge: () => {},
});
