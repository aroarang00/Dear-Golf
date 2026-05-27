// 만 나이 계산 — 카카오 OIDC 생년월일 기반 만 19세 검증 ([[age-policy]]).
// 한국은 2023년부터 "만 나이" 통일로 일반 international age와 동일.
//
// 입력: birthYear(YYYY), birthMonth(1~12), birthDay(1~31), now(테스트용 옵션)
// 반환: 만 나이 (정수)
//
// 정책 §1: 만 19세 이상만 가입 가능
// 정책 §2: 카카오 생년월일 동의 거부 시 가입 제한

export const ADULT_AGE = 19;

export function calculateAge(birthYear, birthMonth, birthDay, now = new Date()) {
  if (!birthYear || !birthMonth || !birthDay) return null;
  const by = parseInt(birthYear, 10);
  const bm = parseInt(birthMonth, 10);
  const bd = parseInt(birthDay, 10);
  if (isNaN(by) || isNaN(bm) || isNaN(bd)) return null;
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

// 카카오 birthday(MMDD) + birthyear(YYYY) 문자열을 받아 만 나이 반환.
// 둘 중 하나라도 없으면 null.
export function calculateAgeFromKakao(birthyear, birthday, now = new Date()) {
  if (!birthyear || !birthday || birthday.length !== 4) return null;
  const bm = birthday.slice(0, 2);
  const bd = birthday.slice(2, 4);
  return calculateAge(birthyear, bm, bd, now);
}

// 만 19세 이상 판정. 생년월일 없으면 false (모르면 성인 아님).
export function isAdultByKakao(birthyear, birthday, now = new Date()) {
  const age = calculateAgeFromKakao(birthyear, birthday, now);
  if (age === null) return false;
  return age >= ADULT_AGE;
}
