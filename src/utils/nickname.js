// 닉네임 최대 글자 수 — 10→6(2026-10-11): 기록 탭 명함에서 20px 한 줄(가계부·설정 알약 옆)을 어느 폰에서도 보장. 온보딩·설정 입력·시드 공통.
export const NICKNAME_MAX = 6;

// 닉네임 변경 제한 — 일반 30일/1회, 카카오 연동 15일/1회.
// Firestore의 lastNicknameChange로 동일 규칙을 백엔드에서 재검증할 것.

// 닉네임 검색 키 — 대소문자·공백 차이로 못 찾는 일을 없앤다(2026-10-05 "임블리" 건: 정확 일치만 돼
//   "Aims"를 "aims"로 치면 실패). users.nicknameKey에 저장하고 검색도 이 키로. 한글은 NFC 정규화(iOS 자소분리 대비).
//   정확 일치 원칙(앞글자 일부 검색 X — 모르는 사람 둘러보기 방지)은 그대로.
export function nicknameKey(nick) {
  let s = String(nick || '');
  if (typeof s.normalize === 'function') s = s.normalize('NFC');
  return s.toLowerCase().replace(/\s+/g, '');
}

export const NICKNAME_COOLDOWN_DAYS_DEFAULT = 30;
export const NICKNAME_COOLDOWN_DAYS_KAKAO = 15;

export function cooldownDaysFor(profile) {
  return profile?.kakaoLinked ? NICKNAME_COOLDOWN_DAYS_KAKAO : NICKNAME_COOLDOWN_DAYS_DEFAULT;
}

// 변경 가능 여부 + 다음 가능일까지 남은 일수.
// { canChange: boolean, nextDate: Date|null, daysLeft: number, cooldownDays: number }
export function nicknameChangeStatus(profile, now = new Date()) {
  const cooldownDays = cooldownDaysFor(profile);
  const last = profile?.lastNicknameChange ? new Date(profile.lastNicknameChange) : null;
  if (!last || isNaN(last.getTime())) {
    return { canChange: true, nextDate: null, daysLeft: 0, cooldownDays };
  }
  const next = new Date(last.getTime());
  next.setDate(next.getDate() + cooldownDays);
  if (now >= next) return { canChange: true, nextDate: null, daysLeft: 0, cooldownDays };
  const MS = 86400000;
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const next0 = new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime();
  const daysLeft = Math.max(1, Math.ceil((next0 - today0) / MS));
  return { canChange: false, nextDate: next, daysLeft, cooldownDays };
}

// 다음 가능일 짧은 표시 'YYYY.MM.DD'
export function formatNextDate(d) {
  if (!d) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
