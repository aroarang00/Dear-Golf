// 라운딩 모집 공통 상수·헬퍼

// 공개범위 뱃지
export const SCOPE_BADGE = {
  all:     { label: '전체공개', bg: '#C8D9E6', fg: '#1A3D52' },
  friends: { label: '친구공개', bg: '#F5E6A8', fg: '#5A4500' },
  select:  { label: '친구지정', bg: '#6B1E2A', fg: '#F5E6A8' },
};

// 동반자 조건 — 모집 필터
// ageGroups: 중복 선택 가능 (배열). 빈 배열·null·['any']는 '상관없음'으로 해석.
// companion: 단일 선택 ('any' | 'male' | 'female' | 'couple' | 'mixed')
// skill:     단일 선택 ('any' | 'pro' | 'mid' | 'high' | 'beginner')  — pro=80타 이하, mid=80~90, high=90~100, beginner=100타+
export const AGE_OPTIONS = [
  ['20s', '20대'], ['30s', '30대'], ['40s', '40대'], ['50s', '50대'], ['60+', '60대 이상'],
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

// 연령대 배열 → "20·30대" 같은 짧은 라벨로
export function ageLabelShort(ageGroups) {
  if (!ageGroups || ageGroups.length === 0 || ageGroups.includes('any')) return null;
  const order = ['20s', '30s', '40s', '50s', '60+'];
  const sorted = [...ageGroups].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (sorted.length === 1) return AGE_LABEL[sorted[0]];
  const parts = sorted.map(k => k === '60+' ? '60+' : k.replace('s', ''));
  return parts.join('·') + '대';
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
