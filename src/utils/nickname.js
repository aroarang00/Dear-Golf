// 닉네임 변경 제한 — 일반 30일/1회, 카카오 연동 15일/1회.
// Firestore의 lastNicknameChange로 동일 규칙을 백엔드에서 재검증할 것.

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
