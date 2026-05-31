// 라운딩 통계 계산 — 순수 함수(Firestore 비의존). 여러 화면(MY 통계·마이페이지)에서 공유.

// 완료된 라운딩 수 = 다이어리 기록 + 기록 없는 지난 일정.
// 같은 날 36홀은 scheduleId/course+date 매칭으로 각각 셈, 예정(미래)·기록과 매칭된 일정은 제외.
export function countCompletedRounds(diaries, schedules) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const todayMs = t.getTime();
  const isPast = (date) => !!date && new Date(String(date).replace(/\./g, '-')).getTime() < todayMs;
  const ds = diaries || [];
  const unrecorded = (schedules || []).filter(s =>
    isPast(s.date) &&
    !ds.some(d => (s.id && d.scheduleId === s.id) || (!d.scheduleId && d.course === s.course && d.date === s.date))
  ).length;
  return ds.length + unrecorded;
}

// 표시용 총 라운딩 = 마이페이지에서 입력한 기준값 + 입력 이후 새로 완료된 라운딩.
// (입력 시점의 자동카운트를 baseCount로 스냅샷 → 그 이후 증가분만 더함)
// 입력한 적 없으면(base 0·baseCount 0) 순수 자동 카운트와 동일.
export function displayTotalRounds(userProfile, completedCount) {
  const base = userProfile?.totalRounds || 0;
  const baseCount = userProfile?.totalRoundsBaseCount || 0;
  return base + Math.max(0, completedCount - baseCount);
}
