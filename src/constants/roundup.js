// 라운딩 모집 공통 상수·헬퍼

// 공개범위 뱃지
export const SCOPE_BADGE = {
  all:     { label: '전체공개', bg: '#C8D9E6', fg: '#1A3D52' },
  friends: { label: '친구공개', bg: '#F5E6A8', fg: '#5A4500' },
  select:  { label: '친구지정', bg: '#6B1E2A', fg: '#F5E6A8' },
};

// 동반자 조건 — 모집 필터 (모두 단일 선택)
// ageGroup:  'any' | '30s' | '40s' | '50s'  — 누구나/~30대/~40대/~50대
// companion: 'any' | 'male' | 'female' | 'couple' | 'mixed'
// skill:     'any' | 'pro' | 'mid' | 'high' | 'beginner'  — pro=80↓, mid=80~90, high=90~100, beginner=100↑
export const AGE_OPTIONS = [
  ['any', '누구나'], ['30s', '~30대'], ['40s', '~40대'], ['50s', '~50대'],
];
export const COMPANION_OPTIONS = [
  ['any', '상관없음'], ['male', '남성만'], ['female', '여성만'], ['couple', '커플'], ['mixed', '혼성'],
];
export const SKILL_OPTIONS = [
  ['any', '상관없음'], ['beginner', '100타 이상'], ['high', '90-100타'], ['mid', '80-90타'], ['pro', '80타 이하'],
];

export const AGE_LABEL = Object.fromEntries(AGE_OPTIONS);
export const COMPANION_LABEL = Object.fromEntries(COMPANION_OPTIONS);
export const SKILL_LABEL = Object.fromEntries(SKILL_OPTIONS);

// 동반자 조건 뱃지 색상 — 카드에 표시
export const FILTER_BADGE = {
  age:       { bg: '#E8DCC8', fg: '#5A4500' },
  companion: { bg: '#C8D9E6', fg: '#1A3D52' },
  skill:     { bg: '#D9C8E0', fg: '#4A2A5C' },
};

// 연령대 표시 라벨 — 단일 키. 'any'는 null 반환(뱃지 숨김).
export function ageLabelShort(ageGroup) {
  if (!ageGroup || ageGroup === 'any') return null;
  return AGE_LABEL[ageGroup] || null;
}
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

// 더미 참여자 이름 — seed 기반 결정적 선택 (렌더마다 동일)
const NAME_POOL = ['김도윤', '이서준', '박하준', '정시우', '최주원', '강민재', '윤지호', '임예성', '한도현', '오건우', '서주아', '문하린'];
export function pickNames(seed, count) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return Array.from({ length: Math.max(0, count) }, (_, i) => NAME_POOL[(h + i) % NAME_POOL.length]);
}
