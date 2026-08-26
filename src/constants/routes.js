// 탭 라우트 이름 상수 — App.js의 Tab.Screen name과 일치해야 함.
// 향후 탭 이름 변경 시 이 파일 한 곳만 바꾸면 됨. 문자열 리터럴 흩어짐 방지.
//
// 주의:
// - 한글 이름은 RN navigation에서 정상 작동 (테스트됨)
// - 'MY' 탭의 컴포넌트는 DiaryScreen (옛 명칭 유지). 가독성만 영향, 동작 OK.
// - ★탭 5→4 재편(2026-08-26): 라운지+친구 → '모임' 탭(MeetScreen)으로 통합.
//   진입 세그먼트는 파라미터로 — 친구 쪽은 { view: 'friends' } 또는 { openFinder },
//   모집 쪽은 { openPostId | openNoti | openView }(옛 라운지 파라미터 그대로).
export const ROUTES = {
  HOME: '홈',
  MEET: '모임',
  MY: 'MY',
  COURSE: '코스',
};
