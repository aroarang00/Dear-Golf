// 라운딩 모집 공통 상수·헬퍼

// 전체공개(낯선 사람) 모집 활성화 여부 — 2026-06-01 출시 시 비활성화 ([[roundup-public-disabled]])
// false면 앱 전역에서 '전체공개' 옵션·'전체' 탭이 사라지고 친구공개·친구지정만 노출.
// 향후 유저 증가 + 안전망(매너/신고/강퇴/신뢰등급) 검증 후 true로 부활. 관련 코드·정책은 전부 보존.
export const ROUNDUP_PUBLIC_ENABLED = false;

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
// ageGroup:  'any' | '2030' | '4050' | '6070' | 'mixed'
// skill:     'any' | 'pro' | 'mid' | 'high' | 'beginner'  — pro=80↓, mid=80~90, high=90~100, beginner=100↑
// tags:      해시태그 다중 선택 (분위기·연령·수준 자유 표현)
export const COMPANION_OPTIONS = [
  ['any', '상관없음'], ['male', '남성만'], ['female', '여성만'], ['couple', '커플'], ['mixed', '혼성'],
];
export const AGEGROUP_OPTIONS = [
  ['any', '상관없음'], ['2030', '20·30대'], ['4050', '40·50대'], ['6070', '60대 이상'], ['mixed', '다양한 연령'],
];
export const SKILL_OPTIONS = [
  ['any', '상관없음'], ['beginner', '100타 이상'], ['high', '90-100타'], ['mid', '80-90타'], ['pro', '80타 이하'],
];
// 라운딩 성격 태그 — 모든 공개범위에서 노출(친구모집·친구지정 포함, [[roundup-friend-redesign]]).
// 친구 세계에선 "누구를 거를까"(데모그래픽)가 아니라 "어떤 라운딩이냐"가 차별점.
// 낯선사람용 '○○환영'은 폐기, 분위기·목적 중심으로 교체. 여성전용은 태그 대신 친구지정으로.
export const TAG_OPTIONS = [
  '편하게즐겨요', '즐기는분위기', '스코어도전', '부담없이',
  '여유롭게', '부부·가족동반', '번개모임', '새코스탐방',
];

// 태그별 색상 — 전체공개 때처럼 태그마다 다른 색(soft=연한 배경/미선택, deep=진한 색/선택·텍스트).
// 생성폼·카드·상세에서 공통 사용. tagStyle()로 미정의 태그는 폴백.
// 라운지 시그니처 파스텔(FILTER_BADGE/SCOPE_BADGE) 한 가족으로 통일 — 연한 배경 + 어두운 muted 텍스트.
// 채도 높은 색은 라운지 톤과 따로 놀아서 배제(2026-06-01 사용자 피드백).
export const TAG_STYLE = {
  '편하게즐겨요':  { soft: '#D8E5C8', deep: '#3A5524' }, // green (ageGroup 계열)
  '즐기는분위기':  { soft: '#F3E8C0', deep: '#6B5310' }, // butter/gold
  '스코어도전':    { soft: '#C8D9E6', deep: '#1A3D52' }, // sky (companion 계열)
  '부담없이':      { soft: '#CFE6DA', deep: '#2A5A48' }, // mint
  '여유롭게':      { soft: '#D9C8E0', deep: '#4A2A5C' }, // lavender (skill 계열)
  '부부·가족동반': { soft: '#EBD3D9', deep: '#7A3550' }, // rose
  '번개모임':      { soft: '#ECD9C5', deep: '#7A4A24' }, // clay (beige 계열)
  '새코스탐방':    { soft: '#CCE0E2', deep: '#235A60' }, // teal
};
export function tagStyle(t) {
  return TAG_STYLE[t] || { soft: '#E8DCC8', deep: '#5A4500' };
}

// 초대장 예시 멘트 — 탭하면 '한마디'에 자동입력 ([[roundup-friend-redesign]]).
// 격식/편안 톤 분리. 카드가 흐트러지지 않게 각 40자 이내로 유지(입력칸 maxLength=40).
export const INVITE_SAMPLES = {
  formal: [
    '귀한 시간 내어 함께해 주시면 감사하겠습니다.',
    '좋은 분들과 뜻깊은 라운딩 나누고 싶습니다.',
    '오랜만에 함께 라운딩 한 번 하시죠.',
  ],
  casual: [
    '라베 갱신하러 가자!',
    '이번에 버디 한번 잡아보자~',
    '맛있는 것도 먹고 공치러 가자!',
  ],
};

export const COMPANION_LABEL = Object.fromEntries(COMPANION_OPTIONS);
export const AGEGROUP_LABEL = Object.fromEntries(AGEGROUP_OPTIONS);
export const SKILL_LABEL = Object.fromEntries(SKILL_OPTIONS);

// 동반자 조건 뱃지 색상 — 카드에 표시
export const FILTER_BADGE = {
  tag:       { bg: '#E8DCC8', fg: '#5A4500' },
  companion: { bg: '#C8D9E6', fg: '#1A3D52' },
  ageGroup:  { bg: '#D8E5C8', fg: '#3A5524' },
  skill:     { bg: '#D9C8E0', fg: '#4A2A5C' },
};

// 실력 — 카드용 짧은 표기 ('90-100타' → '90타대')
export function skillLabelShort(skill) {
  if (!skill || skill === 'any') return null;
  const SHORT = { beginner: '100타+', high: '90타대', mid: '80타대', pro: '80타-' };
  return SHORT[skill] || SKILL_LABEL[skill] || null;
}

// 연령대 — 카드용 짧은 표기 ('any' → 표시 안 함)
export function ageGroupLabelShort(ageGroup) {
  if (!ageGroup || ageGroup === 'any') return null;
  return AGEGROUP_LABEL[ageGroup] || null;
}

// 모집이 "확정" 상태인지 판정 — D-7 이내 매너 -5 패널티 분기의 유일한 트리거.
// 확정 = 주최자가 명시적으로 [확정] 버튼을 누른 시점(closed=true)만.
// 만석 자동 마감은 "확정"으로 보지 않음 (2026-05-28 정책 변경):
//   만석 상태에서도 댓글로 조율되며 참여자 이동이 생길 수 있어,
//   자동 확정 → 매너 차감은 항의 빌미가 됨 (사용자 결정).
// 미확정 상태에선 D-7 이내라도 자유 취소 가능 (패널티 X).
// 카드 '마감' 뱃지·'모집 완료'·자동 일정 등록은 만석 기준 그대로 (별개 동선 — "신규 참여 X"의 의미).
export function isRoundupConfirmed(post) {
  return !!post?.closed;
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

// 시간대 슬롯 — 주중/주말 × 1·2·3부 (맞춤모집 매칭축, [[roundup-friend-redesign]]).
// 1부=이른 아침, 2부=낮, 3부=오후·야간 (대략 — 골프장·계절마다 경계가 달라 엄격 시각 X). 슬롯키: 'weekday-1'·'weekend-3' 등.
export const TEE_DAYTYPES = [['weekday', '주중'], ['weekend', '주말']];
export const TEE_PARTS = [['1', '1부'], ['2', '2부'], ['3', '3부']];
export const TEE_PART_HINT = { '1': '이른 아침', '2': '낮', '3': '오후·야간' };
// 확정형 티오프 시간('HH:MM') → 부(部) 분류. 대략 경계.
export function teePartOf(time) {
  const h = parseInt(String(time || '').split(':')[0], 10);
  if (isNaN(h)) return null;
  if (h < 11) return '1';   // ~10:59 이른 아침
  if (h < 14) return '2';   // 11:00~13:59 낮
  return '3';               // 14:00~ 오후·야간
}

// 맞춤 모집 — 사용자가 설정한 조건(roundupMatch)이 의미 있게 채워졌는지
export function hasRoundupMatch(cfg) {
  if (!cfg) return false;
  return (cfg.slots?.length > 0) || !!cfg.dateFrom;
}

// 맞춤 모집 — 모집글이 사용자의 조건(roundupMatch)에 맞는지.
// 시간대 슬롯(주중/주말×부) 일치 OR 특정 기간 내. 지역·동반자 조건은 친구모집 전환으로 폐기([[roundup-friend-redesign]]).
export function matchesRoundup(post, cfg) {
  if (!post || !hasRoundupMatch(cfg)) return false;
  const slots = cfg.slots || [];
  const dateFrom = cfg.dateFrom || null;
  const dateTo = cfg.dateTo || dateFrom; // 끝 날짜 미지정 시 시작 날짜 하루
  const hasSlots = slots.length > 0;
  const hasPeriod = !!dateFrom;

  // 오픈형(날짜·시간 미정) — 부(部)가 없어 기간으론 못 거름. 슬롯의 주중/주말 선호로만 느슨 매칭.
  if (post.type === 'open' || !post.date) {
    if (!hasSlots) return true;             // 기간만 설정 → 날짜 미정 오픈형은 일단 노출
    const pref = post.openTime || [];       // ['weekday'|'weekend']
    if (pref.length === 0) return true;     // 모집이 '상관없음'이면 통과
    const wantWeekday = slots.some(s => s.startsWith('weekday'));
    const wantWeekend = slots.some(s => s.startsWith('weekend'));
    return (wantWeekday && pref.includes('weekday')) || (wantWeekend && pref.includes('weekend'));
  }

  // 확정형 — 요일×부 슬롯 일치 / 기간 내. 둘 다 설정 시 OR, 하나만 설정 시 그것만.
  // 날짜 문자열 'YYYY.MM.DD'는 자릿수 고정이라 사전순 비교 = 날짜순 비교.
  const dayType = (post.day === '토' || post.day === '일') ? 'weekend' : 'weekday';
  const part = teePartOf(post.time);
  const slotHit = hasSlots && !!part && slots.includes(`${dayType}-${part}`);
  const dateHit = hasPeriod && post.date >= dateFrom && post.date <= dateTo;
  if (hasSlots && hasPeriod) return slotHit || dateHit;
  return hasSlots ? slotHit : dateHit;
}

// 더미 참여자 이름 — seed 기반 결정적 선택 (렌더마다 동일)
const NAME_POOL = ['김도윤', '이서준', '박하준', '정시우', '최주원', '강민재', '윤지호', '임예성', '한도현', '오건우', '서주아', '문하린'];
export function pickNames(seed, count) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return Array.from({ length: Math.max(0, count) }, (_, i) => NAME_POOL[(h + i) % NAME_POOL.length]);
}
