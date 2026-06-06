// 본명 마스킹 — 친구/동반자 검색·선택 화면에 표시용. 내부 매칭은 풀네임, 화면 표시만 마스킹 ([[realname-policy]]).
//   2글자: 홍* / 3글자: 홍*동 / 4글자+: 남**수 (첫·끝 보이고 가운데 *)
//   공백 포함(영문 등)은 정책상 예외 케이스 — 동일 규칙 적용(과노출 방지 우선).
export function maskKoreanName(name) {
  if (!name || typeof name !== 'string') return '';
  const n = name.trim();
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + '*';
  return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
}

// 닉네임 + (본명 있으면) 마스킹 본명 — 검색/선택 행 표시용. 예: "버디왕 · 김*프"
export function nameWithMaskedReal(nickname, realName) {
  const nick = (nickname || '').trim();
  const masked = maskKoreanName(realName);
  return masked ? `${nick} · ${masked}` : nick;
}
