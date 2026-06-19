import { getCombinedForecast } from './kma';
import { findUserCourseById, ensureCourseCoord } from './userCourses';
import { searchGolfCourses } from './golfCourses';
import { reverseGeocode } from './location';

// 일정 좌표 해석 — WeatherTransportPopup과 동일한 3단계 폴백.
//   1) 일정에 박힌 courseX/Y  2) courseId로 내 코스 좌표  3) 코스명으로 골프장 검색(직접입력 일정 등).
async function resolveCoords(schedule) {
  if (typeof schedule.courseX === 'number' && typeof schedule.courseY === 'number') {
    return { x: schedule.courseX, y: schedule.courseY, loc: schedule.courseLoc || null };
  }
  if (schedule.courseId) {
    try {
      const c = await ensureCourseCoord(await findUserCourseById(schedule.courseId));
      if (c && typeof c.x === 'number' && typeof c.y === 'number') return { x: c.x, y: c.y, loc: c.loc || schedule.courseLoc || null };
    } catch {}
  }
  if (schedule.course) {
    try {
      const results = await searchGolfCourses(schedule.course);
      const top = results && results[0];
      if (top && top.x > 0 && top.y > 0) {
        const loc = top.loc || (await reverseGeocode(top.y, top.x)) || schedule.courseLoc || '';
        return { x: top.x, y: top.y, loc };
      }
    } catch {}
  }
  return null;
}

// 일정의 '해당일' 날씨 한 줄 요약 — 공유 카드(ScheduleShareCard) 코스명 위 표시용.
//   ★3일 이내(D-0~D-3)만 — 단기예보만 신뢰. 그 밖(D-4+)·지난 라운딩은 null → 카드가 '3일 전부터 표시' 안내.
//   반환 예: '맑음 24°' · '흐림 19°' · (범위 밖) null. 공유는 잦지 않아 매번 fetch해도 무방(getCombinedForecast 자체 캐시).
export async function getScheduleWxSummary(schedule) {
  if (!schedule?.date) return null;
  if (typeof schedule.dDay === 'number' && (schedule.dDay < 0 || schedule.dDay > 3)) return null; // 3일 밖·지난 일정 → fetch 생략
  try {
    const cc = await resolveCoords(schedule);
    if (!cc) return null;
    const f = await getCombinedForecast({ lat: cc.y, lng: cc.x, loc: cc.loc });
    const days = f?.days || [];
    const idx = days.findIndex(d => d?.date === schedule.date);
    if (idx < 0 || idx > 3) return null; // 3일 밖(또는 매칭 실패) → 미표시
    const day = days[idx];
    const sky = (day.sky || '').trim();
    const t = Number.isFinite(day.tmax) ? Math.round(day.tmax)
            : (Number.isFinite(day.tmin) ? Math.round(day.tmin) : null);
    if (!sky && t == null) return null; // 데이터 없는 폴백 슬롯
    return t != null ? `${sky} ${t}°`.trim() : sky;
  } catch {
    return null;
  }
}
