import { createContext } from 'react';

// 친구 탭 탭바 뱃지 — 받은 친구신청 수.
//   친구 관계 알림은 친구 탭 소관(라운지 알림함에서 분리, [[realname-policy]] 흐름과 무관한 IA 정돈).
//   App이 마운트·포그라운드 복귀 시 loadReceivedRequests로 갱신, FriendsTab이 자기 받은신청 변화 시 직접 반영.
//   코드베이스가 실시간 리스너(onSnapshot)를 안 쓰므로 동일하게 1회성 조회 + 갱신 트리거 방식.
export const FriendBadgeContext = createContext({
  friendReqCount: 0,
  setFriendReqCount: () => {},
  refreshFriendBadge: () => {},
  // 홈 탭 뱃지 — 받은 일정 전파 초대 수(어느 탭에서든 보이게). 홈 배너와 별개 신호 ([[schedule-propagation-spec]])
  scheduleInviteCount: 0,
  // 라운지 탭 뱃지 + 홈 배너 — 받은 친구지정(select) '미응답' 초대. 푸시 꺼도 어디서든 인지 ([[roundup-invitation]]).
  //   roundupInvites는 가리기(로컬 roundupHidden) 반영된 목록, count는 그 길이. decline은 로컬 가리기 처리.
  roundupInviteCount: 0,
  roundupInvites: [],
  declineRoundupInvite: () => {},
  refreshRoundupHidden: () => {},
});
