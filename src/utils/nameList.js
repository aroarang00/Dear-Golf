// 이름 목록 표시 — 너무 길면 "A · B · C · D 외 N명"으로(부분 잘린 이름 없이 깔끔하게).
//   골프 동반자는 보통 한 팀 4명 이하라 maxShown=4면 일반 케이스는 다 보이고, 단체(5+)만 '외 N명'.
//   (별명 6자 제한 + 카드의 numberOfLines=1과 함께 이름이 행을 깨지 않게 하는 방어 — '한 명만 잘림' 방지)
export function formatNameList(names, { maxShown = 4, sep = ' · ' } = {}) {
  const arr = (names || []).map(n => (n == null ? '' : String(n))).filter(Boolean);
  if (arr.length <= maxShown) return arr.join(sep);
  return arr.slice(0, maxShown).join(sep) + ` 외 ${arr.length - maxShown}명`;
}
