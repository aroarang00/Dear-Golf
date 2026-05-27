// 댓글 비속어 필터 — 명백한 한국어 비속어만 감지 ([[roundup-comments-policy]] §5).
// 우회 표현(자모 분리·띄어쓰기)은 적극 감지 안 함 — false positive 최소화. 의도적 우회자는 신고로 처리.
//
// 정책:
//  - 감지 시 업로드 차단 → 안내 "사용할 수 없는 표현이 포함됐어요"
//  - 차단 자체는 안내만, 추가 자동 패널티 없음 (반복 시도자는 신고 시스템으로)

// 명백한 한국어 비속어 — 보수적으로 시작, false positive 최소화
const PROFANITY_WORDS = [
  '시발', '씨발', '씨바', '쌍놈', '쌍년', '개새끼', '개색기', '개색끼',
  '병신', '븅신', '존나', '졸라', '좆같', '좆나',
  '미친놈', '미친년', '또라이', '돌아이',
  '느금마', '니애미', '니애비',
  '지랄', '꺼져', '뒤져',
  '엿같', '엿먹',
  '섹스', '섹쓰', '딸딸이', '자위',
];

// 영어 욕설은 작성 빈도 낮아 핵심만
const PROFANITY_WORDS_EN = [
  'fuck', 'shit', 'bitch', 'asshole',
];

// 본문에 비속어가 포함됐는지 검사. 공백·구두점을 무시하지 않고 원문 그대로 매칭(false positive 회피).
export function containsProfanity(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  for (const w of PROFANITY_WORDS) {
    if (text.includes(w)) return true;
  }
  for (const w of PROFANITY_WORDS_EN) {
    if (lower.includes(w)) return true;
  }
  return false;
}

export const PROFANITY_BLOCK_MESSAGE = '사용할 수 없는 표현이 포함됐어요';
