// 라운딩 모집 공통 상수·헬퍼

// 공개범위 뱃지
export const SCOPE_BADGE = {
  all:     { label: '전체공개', bg: '#C8D9E6', fg: '#1A3D52' },
  friends: { label: '친구공개', bg: '#F5E6A8', fg: '#5A4500' },
  select:  { label: '친구지정', bg: '#6B1E2A', fg: '#F5E6A8' },
};

// 지역 필터 — 모집글 카드의 골프장 주소에서 자동 분류해 region 필드에 저장
export const REGION_OPTIONS = [
  ['all', '전체'],
  ['capital', '수도권'],
  ['gangwon', '강원'],
  ['chungcheong', '충청'],
  ['jeolla', '전라'],
  ['gyeongsang', '경상'],
  ['jeju', '제주'],
];
export const REGION_LABEL = Object.fromEntries(REGION_OPTIONS);

// 골프장 주소(예: '경기 용인', '제주특별자치도 서귀포') → region 키
export function regionFromAddress(addr) {
  if (!addr || typeof addr !== 'string') return null;
  if (/서울|경기|인천/.test(addr)) return 'capital';
  if (/강원/.test(addr)) return 'gangwon';
  if (/충남|충북|충청|대전|세종/.test(addr)) return 'chungcheong';
  if (/전남|전북|전라|광주/.test(addr)) return 'jeolla';
  if (/경남|경북|경상|대구|부산|울산/.test(addr)) return 'gyeongsang';
  if (/제주/.test(addr)) return 'jeju';
  return null;
}

// 동반자 조건 — 전체공개 모집에서만 표시 (친구공개·친구지정은 의미 없으므로 숨김)
// companion: 'any' | 'male' | 'female' | 'couple' | 'mixed'
// skill:     'any' | 'pro' | 'mid' | 'high' | 'beginner'  — pro=80↓, mid=80~90, high=90~100, beginner=100↑
// tags:      해시태그 다중 선택 (분위기·연령·수준 자유 표현)
export const COMPANION_OPTIONS = [
  ['any', '상관없음'], ['male', '남성만'], ['female', '여성만'], ['couple', '커플'], ['mixed', '혼성'],
];
export const SKILL_OPTIONS = [
  ['any', '상관없음'], ['beginner', '100타 이상'], ['high', '90-100타'], ['mid', '80-90타'], ['pro', '80타 이하'],
];
export const TAG_OPTIONS = [
  '젊은분위기', '시니어환영', '연령무관',
  '편안한라운딩', '즐기는라운딩',
  '초보환영', '실력자환영',
  '여성환영',
];

export const COMPANION_LABEL = Object.fromEntries(COMPANION_OPTIONS);
export const SKILL_LABEL = Object.fromEntries(SKILL_OPTIONS);

// 동반자 조건 뱃지 색상 — 카드에 표시
export const FILTER_BADGE = {
  tag:       { bg: '#E8DCC8', fg: '#5A4500' },
  companion: { bg: '#C8D9E6', fg: '#1A3D52' },
  skill:     { bg: '#D9C8E0', fg: '#4A2A5C' },
};

// 실력 — 카드용 짧은 표기 ('90-100타' → '90타대')
export function skillLabelShort(skill) {
  if (!skill || skill === 'any') return null;
  const SHORT = { beginner: '100타+', high: '90타대', mid: '80타대', pro: '80타-' };
  return SHORT[skill] || SKILL_LABEL[skill] || null;
}

// 라운딩 날짜까지 남은 일수로 대기자 응답 제한 시간(시간)을 계산
export function waitlistRespondHours(dateStr) {
  if (!dateStr) return 24;   // 오픈형(날짜 미정)은 기본 24시간
  const [y, m, d] = dateStr.split('.').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / 86400000);
  if (days >= 7) return 24;
  if (days >= 3) return 6;
  return 1;
}

// 맞춤 모집 — 사용자가 설정한 조건(roundupMatch)이 의미 있게 채워졌는지
export function hasRoundupMatch(cfg) {
  if (!cfg) return false;
  return (cfg.regions?.length > 0) || (cfg.days?.length > 0) || !!cfg.dateFrom || !!cfg.femaleOnly;
}

// 맞춤 모집 — 모집글이 사용자의 조건(roundupMatch)에 맞는지.
// 지역·여성 조건 AND (요일 일치 OR 특정 기간 내). 오픈형(날짜 미정)은 요일/기간을 보지 않는다.
export function matchesRoundup(post, cfg) {
  if (!post || !hasRoundupMatch(cfg)) return false;
  const regions = cfg.regions || [];
  const days = cfg.days || [];
  const dateFrom = cfg.dateFrom || null;
  const dateTo = cfg.dateTo || dateFrom; // 끝 날짜 미지정 시 시작 날짜 하루
  const femaleOnly = !!cfg.femaleOnly;
  // 지역 — 지정했으면 post.region이 포함돼야 함
  if (regions.length > 0 && (!post.region || !regions.includes(post.region))) return false;
  // 여성 환영 — companion이 'female'인 모집만
  if (femaleOnly && post.companion !== 'female') return false;
  // 오픈형(날짜 미정) — 지역·여성 조건만 통과하면 포함
  if (post.type === 'open' || !post.date) return true;
  // 확정형 — 요일 일치 또는 특정 기간 내 (요일 미선택 시 요일 무관)
  const isWeekend = post.day === '토' || post.day === '일';
  const dayMatch = days.length === 0
    || (days.includes('weekend') && isWeekend)
    || (days.includes('weekday') && !isWeekend);
  // 날짜 문자열 'YYYY.MM.DD'는 자릿수 고정이라 사전순 비교 = 날짜순 비교
  const dateMatch = !!dateFrom && post.date >= dateFrom && post.date <= dateTo;
  return dayMatch || dateMatch;
}

// 더미 참여자 이름 — seed 기반 결정적 선택 (렌더마다 동일)
const NAME_POOL = ['김도윤', '이서준', '박하준', '정시우', '최주원', '강민재', '윤지호', '임예성', '한도현', '오건우', '서주아', '문하린'];
export function pickNames(seed, count) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return Array.from({ length: Math.max(0, count) }, (_, i) => NAME_POOL[(h + i) % NAME_POOL.length]);
}
