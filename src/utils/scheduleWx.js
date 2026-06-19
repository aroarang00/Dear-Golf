import { getCombinedForecast } from './kma';
import { findUserCourseById, ensureCourseCoord } from './userCourses';
import { searchGolfCourses } from './golfCourses';
import { reverseGeocode } from './location';
import { getDrivingDirections } from './directions';

// 일정 좌표 해석 — WeatherTransportPopup과 동일한 3단계 폴백.
//   1) 일정에 박힌 courseX/Y  2) courseId로 내 코스 좌표  3) 코스명으로 골프장 검색(직접입력 일정 등).
export async function resolveScheduleCoords(schedule) {
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

// 일정의 '해당일' 날씨 — 공유 카드/텍스트 공유용.
//   ★3일 이내(D-0~D-3)만 — 단기예보만 신뢰. 그 밖(D-4+)·지난 라운딩은 null.
//   반환 { summary, detail } — summary='맑음 24°'(카드 코스명 위, 간결) / detail='맑음 · 최고 24° · 강수확률 30%'(텍스트 공유).
//   공유는 잦지 않아 매번 fetch해도 무방(getCombinedForecast 자체 캐시).
export async function getScheduleWxSummary(schedule) {
  if (!schedule?.date) return null;
  if (typeof schedule.dDay === 'number' && (schedule.dDay < 0 || schedule.dDay > 3)) return null; // 3일 밖·지난 일정 → fetch 생략
  try {
    const cc = await resolveScheduleCoords(schedule);
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
    const pop = Number.isFinite(day.pop) ? Math.round(day.pop) : null;
    const summary = t != null ? `${sky} ${t}°`.trim() : sky; // 카드용(간결)
    const detail = [sky, t != null ? `최고 ${t}°` : null, pop != null ? `강수확률 ${pop}%` : null]
      .filter(Boolean).join(' · '); // 텍스트 공유용(기온·강수확률)
    return { summary, detail, icon: day.icon || null }; // icon=실제 예보 이모지(맑음 ☀️·구름 ⛅·흐림 ☁️·비 🌧 등, kma skyToIcon)
  } catch {
    return null;
  }
}

// 출발지→구장 예상 소요(분) — 홈 D-0 카드 우측 교통 표시용. home={x,y}(마이페이지 저장 출발지) 없으면 null.
//   경로 API 1회 호출(TMap 우선·카카오 폴백). 구장 좌표 못 구하거나 실패하면 null(호출부는 표시 생략).
export async function getScheduleDriveMin(schedule, home) {
  if (!home || typeof home.x !== 'number' || typeof home.y !== 'number') return null;
  try {
    const cc = await resolveScheduleCoords(schedule);
    if (!cc) return null;
    const r = await getDrivingDirections({ x: home.x, y: home.y }, { x: cc.x, y: cc.y });
    return r ? r.durationMin : null;
  } catch {
    return null;
  }
}
