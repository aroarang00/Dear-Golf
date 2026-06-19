import { getCombinedForecast } from './kma';
import { findUserCourseById, ensureCourseCoord } from './userCourses';

// 일정의 '해당일' 날씨 한 줄 요약 — 공유 카드(ScheduleShareCard) 코스명 위 표시용.
//   getCombinedForecast가 D-0~10(단기+중기) 예보라 그 범위 안에서만 값 반환, 밖이면 null(카드가 줄을 숨김).
//   좌표 해석: 일정에 박힌 courseX/Y 우선 → 없으면 courseId로 내 코스 조회 → 둘 다 없으면 null.
//   반환 예: '맑음 24°' · '흐림 19°' · (예보 없음) null. 공유는 잦지 않아 매번 fetch해도 무방(getCombinedForecast 자체 캐시).
export async function getScheduleWxSummary(schedule) {
  if (!schedule?.date) return null;
  try {
    let x = (typeof schedule.courseX === 'number') ? schedule.courseX : null;
    let y = (typeof schedule.courseY === 'number') ? schedule.courseY : null;
    let loc = schedule.courseLoc || null;
    if ((x == null || y == null) && schedule.courseId) {
      const c = await ensureCourseCoord(await findUserCourseById(schedule.courseId));
      if (c && typeof c.x === 'number' && typeof c.y === 'number') { x = c.x; y = c.y; loc = loc || c.loc; }
    }
    if (x == null || y == null) return null;
    const f = await getCombinedForecast({ lat: y, lng: x, loc });
    const day = (f?.days || []).find(d => d?.date === schedule.date);
    if (!day) return null; // 예보 범위 밖(D-11+) → 표시 안 함
    const sky = (day.sky || '').trim();
    const t = Number.isFinite(day.tmax) ? Math.round(day.tmax)
            : (Number.isFinite(day.tmin) ? Math.round(day.tmin) : null);
    if (!sky && t == null) return null; // 데이터 없는 폴백 슬롯
    return t != null ? `${sky} ${t}°`.trim() : sky;
  } catch {
    return null;
  }
}
