// 라운지 '익명 참여' — 랜덤 골프 닉네임 ([[roundup-anonymous-participation]], 2026-06-15).
//  카카오VX식: 마커 없이 일반 닉처럼 자연스럽게 묻히게(공무원·부부 등 "시선" 부담 완화).
//  ★결정적 생성: 같은 (uid, postId) → 항상 같은 닉(모집 내 고정), 다른 모집 → 다른 닉(크로스모집 추적 방지).
//   저장 X — 누구나 uid+postId로 동일 계산. 모집 문서엔 anonymousUids 플래그만 둔다.
//   호스트는 이 함수를 쓰지 않고 항상 실명을 본다(displayParticipantName 분기).

// 단어풀 — 골프·자연 테마, 긍정·중립만(벙커·캐디 등 민감/부정 제외). 형용사×명사 = 가독성 좋은 핸들.
const ADJ = [
  '초록빛', '싱그러운', '잔잔한', '상쾌한', '느긋한', '따스한', '화창한', '푸른',
  '산뜻한', '청명한', '고요한', '든든한', '시원한', '포근한', '우아한', '가뿐한',
  '빛나는', '여유로운', '정갈한', '늠름한', '차분한', '온화한', '맑은', '드넓은',
];
const NOUN = [
  '버디', '페어웨이', '그린', '라운딩', '티샷', '퍼팅', '드라이버', '아이언',
  '잔디', '솔숲', '바람', '햇살', '이슬', '언덕', '새벽', '노을',
  '단풍', '구름', '호수', '골퍼', '깃대', '코스', '클럽', '라운드',
];

// djb2 — 짧고 결정적인 문자열 해시(암호용 아님, 분산용).
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

// 익명 참여자 랜덤 닉 — 예: '초록빛버디'. uid·postId가 비면 '익명 참여자' 폴백.
export function anonNick(uid, postId) {
  if (!uid) return '익명 참여자';
  const h = hashStr(`${postId || ''}::${uid}`);
  const adj = ADJ[h % ADJ.length];
  const noun = NOUN[Math.floor(h / ADJ.length) % NOUN.length];
  return adj + noun;
}

// 참여자 표시 이름 해석 — 익명이면 랜덤 닉, 아니면 realName. 단 보는 사람이 호스트면 항상 실명.
//  post.anonymousUids 에 uid가 있으면 익명. 본인이 봐도(자기 자신) 랜덤 닉(어떻게 보이는지 인지) — 호출부에서 '(나)'·뱃지 부가.
export function displayParticipantName(post, uid, realName, viewerUid) {
  if (!post || !uid) return realName || '동반자';
  const anon = Array.isArray(post.anonymousUids) && post.anonymousUids.includes(uid);
  if (!anon) return realName || '동반자';
  const viewerIsHost = !!viewerUid && post.authorUid === viewerUid;
  if (viewerIsHost) return realName || '동반자'; // 호스트는 코디·검증 위해 실명
  return anonNick(uid, post.id);
}

// 특정 uid가 이 모집에서 익명 참여 중인지
export function isAnonParticipant(post, uid) {
  return !!post && !!uid && Array.isArray(post.anonymousUids) && post.anonymousUids.includes(uid);
}
