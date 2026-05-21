export const SCHEDULES_INIT = [
  { id: '1', course: '제이드팰리스 골프클럽', date: '2026.05.15', day: '금', time: '07:30', members: 4, dDay: 10, weather: '맑음 18°', wind: '북동 3m/s', duration: '1시간 23분', courseLogId: '1' },
  { id: '2', course: '안성베네스트 CC',       date: '2026.05.22', day: '금', time: '08:00', members: 3, dDay: 17, weather: '구름 15°', wind: '서 2m/s',   duration: '1시간 45분', courseLogId: '2' },
  { id: '3', course: '사우스링스 CC',         date: '2026.05.28', day: '목', time: '07:00', members: 4, dDay: 23, weather: '맑음 20°', wind: '남 1m/s',   duration: '2시간 10분', courseLogId: '3' },
  { id: '4', course: '포천베어크리크CC',      date: '2026.06.15', day: '월', time: '09:00', members: 4, dDay: 33, weather: '맑음 22°', wind: '북 2m/s',   duration: '1시간 30분', courseLogId: '4' },
];

export const HALL_OF_FAME = [
  { id: 'h1', type: 'HOLE IN ONE', date: '2024.09.15', course: '제이드팰리스 골프클럽', hole: 7, par: 3, distance: '156m', ball: 'Titleist Pro V1', companions: ['김민준', '이수연'], memo: '믿을 수가 없었다. 볼이 그냥 들어갔어' },
  { id: 'h2', type: 'EAGLE', date: '2025.03.30', course: '남촌 골프클럽', hole: 12, par: 5, distance: '490m', ball: 'Titleist Pro V1', companions: ['오세훈'], memo: '세컨샷이 핀에 딱 붙었다' },
];

export const DIARY_DATA = [
  { id: '1', date: '2025.03.30', day: '일', course: '남촌 골프클럽', score: 76, par: 72,
    memo: '베스트 갱신! 아이언이 살아났다', badge: '베스트', weather: '맑음',
    special: 'EAGLE', specialHole: 12,
    companions: [{ name: '지현', isMe: true }, { name: '김민준' }, { name: '이수연' }],
    photos: ['https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800','https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800','https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800'],
    detailMemo: '' },
  { id: '2', date: '2025.04.28', day: '월', course: '제이드팰리스 골프클럽', score: 92, par: 72,
    memo: '드라이버 컨디션 최고였던 날', badge: null, weather: '흐림',
    special: null,
    companions: [{ name: '지현', isMe: true }, { name: '박정호' }],
    photos: [],
    detailMemo: '' },
  { id: '3', date: '2025.02.14', day: '금', course: '블랙스톤 컨트리클럽', score: 88, par: 72,
    memo: '퍼팅이 아쉬웠지만 즐거웠음', badge: '버디', weather: '맑음',
    special: 'HOLE IN ONE', specialHole: 7,
    companions: [{ name: '지현', isMe: true }, { name: '최다은' }, { name: '오세훈' }],
    photos: ['https://images.unsplash.com/photo-1592919505780-303950717480?w=800','https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=800'],
    detailMemo: '' },
  { id: '4', date: '2025.01.20', day: '월', course: '파인크리크 골프장', score: 105, par: 72,
    memo: '바람 때문에 고생... 그래도 즐거웠음', badge: null, weather: '바람',
    special: null,
    companions: [{ name: '지현', isMe: true }],
    photos: [],
    detailMemo: '' },
];

export const COURSE_LOG = [
  { id: '1', name: '제이드팰리스 골프클럽', loc: '경기 용인',   visits: 3, best: 89, avg: 94, memo: '7번홀 OB 조심, 된장찌개 맛있음', tags: ['★★★★', '넓은 페어웨이', '그린 빠름'] },
  { id: '2', name: '남촌 골프클럽',         loc: '경기 남양주', visits: 2, best: 76, avg: 88, memo: '18번홀 파3 어려움', tags: ['★★★★★', '베스트코스'] },
  { id: '3', name: '블랙스톤 컨트리클럽',  loc: '충북 음성',   visits: 4, best: 88, avg: 95, memo: '퍼팅 그린 관리 최고', tags: ['★★★', '관리 최상'] },
  { id: '4', name: '포천베어크리크CC',      loc: '경기 포천',   visits: 2, best: 88, avg: 94, memo: '그린이 정말 빠릅니다. 퍼팅 연습 충분히 하고 가세요', tags: ['★★★★', '산악 코스', '그린 빠름'] },
];

export const COURSE_COMMENTS = [
  { id: 'cc1', courseId: '1', txt: '그린이 정말 빠릅니다. 퍼팅 연습 충분히 하고 가세요', who: 'J***', likes: 87 },
  { id: 'cc2', courseId: '1', txt: '7번홀 OB 위험 구간이라 안전하게 가는 게 좋아요', who: 'P***', likes: 45 },
  { id: 'cc3', courseId: '1', txt: '클럽하우스 된장찌개 강추합니다', who: 'L***', likes: 28 },
  { id: 'cc4', courseId: '2', txt: '18번홀 파3 정말 어려워요. 한 클럽 더 잡으세요', who: 'K***', likes: 62 },
  { id: 'cc5', courseId: '2', txt: '베스트 코스라는 평이 괜히 있는 게 아니네요', who: 'S***', likes: 31 },
  { id: 'cc6', courseId: '3', txt: '그린 관리는 최상급, 페어웨이 좁은 편이라 정확성 필수', who: 'M***', likes: 54 },
  { id: 'cc7', courseId: '3', txt: '캐디 친절하고 시설도 깔끔합니다', who: 'C***', likes: 22 },
  { id: 'cc8', courseId: '4', txt: '코스 전장이 길어요. 드라이버 거리 잘 나오는 분께 유리합니다', who: 'W***', likes: 71 },
  { id: 'cc9', courseId: '4', txt: '산악 코스라 업힐 라이가 많아요. 클럽 한 단계 길게 잡으세요', who: 'Y***', likes: 49 },
  { id: 'cc10', courseId: '4', txt: '그린이 빠른 편, 퍼팅 연습 추천', who: 'H***', likes: 26 },
];

export const FAVORITES_INIT = ['2'];

export const MEMO_MAP = {
  '1': { text: '7번홀 OB 조심, 클럽하우스 된장찌개 맛있음', date: '2025.10.03', courseId: '1' },
};

export const MY_RESTAURANTS  = [{ id: '1', name: '천안 한우명가', type: '한우구이', dist: '500m', memo: '라운딩 후 꼭 가기. 1++ 등심 추천' }];

export const USER_RESTAURANTS = [
  { id: '2', name: '미락 숯불갈비', type: '갈비', dist: '1.2km', rating: '4.8' },
  { id: '3', name: '순두부마을', type: '순두부찌개', dist: '800m', rating: '4.5' },
];

export const COURSE_TAGS = {
  '코스 관리':   ['관리 최상', '관리 보통', '관리 아쉬움'],
  '코스 특성':   ['그린 빠름', '그린 느림', '넓은 페어웨이', '좁은 페어웨이', '전장 길음', '전장 짧음'],
  '시설':        ['클하 맛집', '세차 가능', '락커 좋음'],
  '경관 · 특징': ['뷰 좋음', '레이디 우대', '야간 가능'],
  '난이도':      ['벙커 많음', '언듈레이션 심함', 'OB 많음', '워터헤저드 많음'],
  '해외 특화':   ['오션뷰', '마운틴뷰', '리조트형', '열대코스', '링크스형', '챔피언십코스'],
};

export const COURSE_TAG_COLORS = {
  '코스 관리':   { bg: '#3D3935', text: '#F5E6A8' },
  '코스 특성':   { bg: '#F5E6A8', text: '#5A4500' },
  '시설':        { bg: '#C8D9E6', text: '#1A3D52' },
  '경관 · 특징': { bg: '#6B1E2A', text: '#F5E6A8' },
  '난이도':      { bg: '#8B8680', text: '#fff' },
  '해외 특화':   { bg: '#C8D9E6', text: '#1A3D52' },
};

// GOLF_DB는 카카오 로컬 API 검색 + USER_COURSES(AsyncStorage)로 대체됨
// src/utils/kakao.js, src/utils/userCourses.js 참고

export const RECOMMENDED_COURSES = [
  { id: 'r1', name: '클럽나인브릿지', loc: '제주', tags: ['★★★★★', '국내 TOP'] },
  { id: 'r2', name: '핀크스 골프클럽', loc: '제주', tags: ['★★★★★', '오션뷰'] },
  { id: 'r3', name: '레이크사이드CC', loc: '경기 고양', tags: ['★★★★', '접근 편리'] },
  { id: 'r4', name: '해슬리나인브릿지', loc: '경기 여주', tags: ['★★★★★', '명문 코스'] },
];

export const OVERSEAS_COURSE_LOG = [
  { id: 'o1', name: '나루토 골프클럽', loc: '일본 오사카', country: '일본', flag: '🇯🇵', visits: 2, best: 88, avg: 94, memo: '코스 관리 최고, 뷰가 아름다움', tags: ['★★★★★', '오션뷰'] },
  { id: 'o2', name: '블랙마운틴 CC', loc: '태국 후아힌', country: '태국', flag: '🇹🇭', visits: 1, best: 92, avg: 92, memo: '열대 코스, 캐디 서비스 훌륭', tags: ['★★★★', '리조트형'] },
  { id: 'o3', name: '발리 국립 GC', loc: '인도네시아 발리', country: '인도네시아', flag: '🇮🇩', visits: 1, best: 95, avg: 95, memo: '발리 여행 중 라운딩, 뷰 최고', tags: ['★★★★', '열대우림'] },
];

export const TOP_100_COURSES = [
  { rank: 1,  name: '클럽나인브릿지',    loc: '제주', visited: false },
  { rank: 2,  name: '핀크스 골프클럽',   loc: '제주', visited: false },
  { rank: 3,  name: '해슬리나인브릿지',  loc: '경기 여주', visited: false },
  { rank: 4,  name: '레이크사이드CC',    loc: '경기 고양', visited: false },
  { rank: 5,  name: '남촌 골프클럽',     loc: '경기 남양주', visited: true },
  { rank: 6,  name: '블랙스톤 컨트리클럽', loc: '충북 음성', visited: true },
  { rank: 7,  name: '제이드팰리스 골프클럽', loc: '경기 용인', visited: true },
  { rank: 8,  name: '스카이72 골프앤리조트', loc: '인천 영종도', visited: false },
  { rank: 9,  name: '오크밸리CC',        loc: '강원 원주', visited: false },
  { rank: 10, name: '가평베네스트 CC',   loc: '경기 가평', visited: false },
  { rank: 11, name: '골든비치CC',        loc: '강원 강릉', visited: false },
  { rank: 12, name: '웰링턴CC',          loc: '경기 여주', visited: false },
  { rank: 13, name: '안성베네스트 CC',   loc: '경기 안성', visited: false },
  { rank: 14, name: '사우스링스 CC',     loc: '경기 안성', visited: false },
  { rank: 15, name: '파인크리크 골프장', loc: '경기 평택', visited: false },
  { rank: 16, name: '트리니티클럽',      loc: '경기 용인', visited: false },
  { rank: 17, name: '베어크리크 GC',     loc: '경기 용인', visited: false },
  { rank: 18, name: '88CC',             loc: '경기 여주', visited: false },
  { rank: 19, name: '아시아나CC',        loc: '전남 영광', visited: false },
  { rank: 20, name: '엘리시안 제주',     loc: '제주', visited: false },
];

export const FRIENDS_DATA = [
  { id: 'f1', nickname: '김민준', realName: '김민준', rounds: 28, best: 82, lastCourse: '남촌 골프클럽', lastDate: '2025.05.01', photos: ['https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400'] },
  { id: 'f2', nickname: '이수연', realName: '이수연', rounds: 15, best: 91, lastCourse: '블랙스톤 CC', lastDate: '2025.04.28', photos: ['https://images.unsplash.com/photo-1592919505780-303950717480?w=400'] },
  { id: 'f3', nickname: '오세훈', realName: '오세훈', rounds: 42, best: 78, lastCourse: '제이드팰리스', lastDate: '2025.04.20', photos: [] },
];

// 신규 유저 초기 프로필 — 빈 상태로 시작, 온보딩에서 채워진다
export const USER_PROFILE_INIT = {
  realName: '',
  nickname: '',
  avgScore: 0,
  lifeBest: 0,
  totalRounds: 0,
  hasFirstSingle: false,
  onboardingDone: false,
  departure: '',
  departureCoord: null, // { x, y } — 출발지 검색에서 선택 시 저장되는 정확 좌표
  phone: '',
  alarmDefaults: { d3: true, d1: true, teeoff: true }, // 새 일정 추가 시 기본 알람 시점
  alarmPromptDisabled: false, // true면 일정 추가 시 알람 팝업 없이 기본값 자동 적용
  avatarUri: null,   // 프로필 사진 URI (직접 업로드 또는 카카오 프로필)
  kakaoLinked: false, // 카카오 로그인 연동 여부
  kakaoId: null,      // 카카오 사용자 ID
  // 라운딩 모집 활동 — 활동 등급 산출 기준
  hostedCount: 0,            // 주최 완료 횟수
  attendedCount: 0,          // 참석 완료 횟수
  cancelDayBeforeCount: 0,   // 전날 취소 횟수
  cancelDayCount: 0,         // 당일 취소 횟수
  noshowCount: 0,            // 노쇼 횟수
  // 매너 — 평가 시스템
  mannerScore: 70,                   // 매너 점수 (0~100, 신규 70점 시작)
  mannerEvaluationPending: false,    // 평가 대기 — true면 다음 모집 신청 비활성화
  // 이용 제한
  isRestricted: false,       // 이용 제한 여부
  restrictUntil: null,       // 이용 제한 해제 날짜 (ISO 문자열)
  // 친구에게 공개 여부 — 내 프로필을 친구가 볼 때 노출되는 항목
  privacy: { stats: true, feed: true, phone: false },
  // 차단 — 양방향 모집글 숨김. 친구 숨김(친구 목록 한정)과 별개, 통합 필터링.
  // blockCountDate가 오늘이면 blockCountToday가 일일 차단 한도(5) 카운터로 사용됨.
  blockedUsers: [],          // 차단한 사용자 ID 배열
  blockCountToday: 0,        // 오늘 차단한 횟수
  blockCountDate: null,      // 차단 카운터의 기준 날짜 ('YYYY.MM.DD')
  // 닉네임 변경 제한 — 일반 30일/1회, 카카오 연동 15일/1회
  lastNicknameChange: null,  // 마지막 변경 시각 (ISO 문자열)
  // 라운지 — 모르는 사람 모집 숨김. true면 '전체' 탭이 사라지고 친구 모집만 보임.
  hideStrangerRoundups: false,
  // 라운지 맞춤 모집 조건 — 새 모집글이 이 조건에 맞으면 라운지에서 알려줌(인앱).
  // regions: 관심 지역 키 배열 / dayType: 'weekend'|'weekday'|'any' / date: 'YYYY.MM.DD'|null(특정 날짜)
  roundupMatch: { regions: [], dayType: 'any', date: null },
};
