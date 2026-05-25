// 탭 라우트 이름 상수 — App.js의 Tab.Screen name과 일치해야 함.
// 향후 탭 이름 변경 시 이 파일 한 곳만 바꾸면 됨. 문자열 리터럴 흩어짐 방지.
//
// 주의:
// - 한글 이름은 RN navigation에서 정상 작동 (테스트됨)
// - 'MY' 탭의 컴포넌트는 DiaryScreen (옛 명칭 유지). 가독성만 영향, 동작 OK.
export const ROUTES = {
  HOME: '홈',
  LOUNGE: '라운지',
  MY: 'MY',
  FRIENDS: '친구',
  COURSE: '코스',
};
