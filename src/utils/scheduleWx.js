import { getCombinedForecast } from './kma';
import { findUserCourseById, ensureCourseCoord } from './userCourses';
import { searchGolfCourses } from './golfCourses';
import { reverseGeocode } from './location';
import { getDrivingDirections } from './directions';

// 일정 좌표 해석 — WeatherTransportPopup과 동일한 3단계 폴백.
//   1) 일정에 박힌 courseX/Y  2) courseId로 내 코스 좌표  3) 코스명으로 골프장 검색(직접입력 일정 등).
export async function resolveScheduleCoords(schedule) {
  if (Number.isFinite(schedule.courseX) && Number.isFinite(schedule.courseY)) { // Number.isFinite — NaN 좌표 통과 차단(typeof NaN==='number'). NaN이면 아래 courseId/이름 폴백으로 회복
    return { x: schedule.courseX, y: schedule.courseY, loc: schedule.courseLoc || null };
  }
  if (schedule.courseId) {
    try {
      const c = await ensureCourseCoord(await findUserCourseById(schedule.courseId));
      if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return { x: c.x, y: c.y, loc: c.loc || schedule.courseLoc || null };
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
    const lo = Number.isFinite(day.tmin) ? Math.round(day.tmin) : null;
    const hi = Number.isFinite(day.tmax) ? Math.round(day.tmax) : null;
    // 온도 — 최저/최고 함께(둘 다 있으면 'lo°/hi°', 하나만 있으면 그것만)
    const temp = (lo != null && hi != null) ? `${lo}°/${hi}°`
               : (hi != null ? `${hi}°` : (lo != null ? `${lo}°` : ''));
    if (!sky && !temp) return null; // 데이터 없는 폴백 슬롯
    const pop = Number.isFinite(day.pop) ? Math.round(day.pop) : null;
    // 준비물용 강수확률 = 라운딩 시간창(티오프 −1h ~ +6h, 18홀+식사)의 최대 POP — '아침 티인데 밤에만 비'는
    //   우비 제외, '3부 티에 밤 비'는 포함(2026-07-05). 시간 슬롯 없거나 티오프 시각 없으면 하루 최대 POP 폴백.
    //   detail(공유 텍스트)의 강수확률은 관례대로 '그날' 기준 유지.
    let prepPop = pop;
    try {
      const [hh] = String(schedule.time || '').split(':').map(Number);
      const slots = f?.slotsByDate?.[schedule.date.replace(/\./g, '')] || [];
      if (Number.isFinite(hh) && slots.length) {
        const win = slots.filter(sl => { const h = parseInt(sl.fcstTime, 10) / 100; return h >= hh - 1 && h <= hh + 6; });
        if (win.length) prepPop = Math.round(Math.max(...win.map(sl => parseFloat(sl.POP) || 0)));
      }
    } catch { /* 폴백=하루 최대 */ }
    const summary = [sky, temp].filter(Boolean).join(' '); // 카드·D-0용(예: '맑음 18°/24°')
    const tempDetail = (lo != null && hi != null) ? `최저 ${lo}° · 최고 ${hi}°` : (hi != null ? `최고 ${hi}°` : (lo != null ? `최저 ${lo}°` : null));
    const detail = [sky, tempDetail, pop != null ? `강수확률 ${pop}%` : null]
      .filter(Boolean).join(' · '); // 텍스트 공유용(최저/최고·강수확률)
    return { summary, detail, icon: day.icon || null, hi, lo, pop: prepPop }; // icon=실제 예보 이모지(맑음 ☀️·구름 ⛅·흐림 ☁️·비 🌧 등, kma skyToIcon). hi/lo=최고/최저°, pop=라운딩 시간창 최대 강수확률(D-0 준비물 분기용 — 아이콘은 정오 기준이라 오후 비를 놓침)
  } catch {
    return null;
  }
}

// 출발지↔구장 예상 소요(분) — 홈 D-0 카드 우측 교통 표시용. home={x,y}(마이페이지 저장 출발지) 없으면 null.
//   경로 API 1회 호출(TMap 우선·카카오 폴백). 구장 좌표 못 구하거나 실패하면 null(호출부는 표시 생략).
//   reverse=true → 구장→집(올 때, 라운딩 종료 후). 기본 false → 집→구장(갈 때).
export async function getScheduleDriveMin(schedule, home, { reverse = false, arrivalAt = null } = {}) {
  if (!home || !Number.isFinite(home.x) || !Number.isFinite(home.y)) return null; // Number.isFinite — NaN 출발지 좌표 차단(typeof NaN==='number')
  try {
    const cc = await resolveScheduleCoords(schedule);
    if (!cc) return null;
    const origin = reverse ? { x: cc.x, y: cc.y } : { x: home.x, y: home.y };
    const dest   = reverse ? { x: home.x, y: home.y } : { x: cc.x, y: cc.y };
    // 갈 때만 '도착 목표 시각(arrivalAt)' 기준 미래 교통 예측 — 귀가는 라이브라 현재 기준 유지.
    const r = await getDrivingDirections(origin, dest, { arrivalAt: reverse ? null : arrivalAt });
    return r ? r.durationMin : null;
  } catch {
    return null;
  }
}
