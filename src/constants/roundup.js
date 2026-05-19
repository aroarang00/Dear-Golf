// 라운딩 모집 공통 상수·헬퍼

// 공개범위 뱃지
export const SCOPE_BADGE = {
  all:     { label: '전체공개', bg: '#C8D9E6', fg: '#1A3D52' },
  friends: { label: '친구공개', bg: '#F5E6A8', fg: '#5A4500' },
  select:  { label: '친구지정', bg: '#6B1E2A', fg: '#F5E6A8' },
};

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
