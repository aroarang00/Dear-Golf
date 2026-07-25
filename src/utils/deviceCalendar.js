import * as Calendar from 'expo-calendar';
import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher'; // 안드: 날짜로 캘린더 앱 열기(인텐트)
import { STORAGE_KEYS, storage } from './storage';
import { searchGolfCoursesLocal } from './golfCourses'; // 캘린더 일정 골프 판별(로컬·오프라인)

// 라운딩 일정을 폰 기본 캘린더(삼성/구글/애플)에 자동 동기화.
// 생성한 이벤트 id를 일정 id별로 저장 — 일정 수정 시 갱신, 삭제 시 제거.

const ROUND_HOURS = 5; // 라운드 평균 소요 시간

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch (e) {
    return 'Asia/Seoul';
  }
}

// 캘린더 권한 요청 — 이미 허용돼 있으면 바로 true
async function ensurePermission() {
  try {
    const current = await Calendar.getCalendarPermissionsAsync();
    if (current.status === 'granted') return true;
    if (current.canAskAgain === false) return false;
    const asked = await Calendar.requestCalendarPermissionsAsync();
    return asked.status === 'granted';
  } catch (e) {
    console.warn('[calendar] permission', e?.message);
    return false;
  }
}

// 캘린더 계정 종류 → 사용자용 라벨 (구글/애플/삼성/기기)
function accountLabel(cal) {
  const t = `${cal?.source?.type || ''} ${cal?.source?.name || ''}`.toLowerCase();
  if (/google|gmail|com\.google/.test(t)) return '구글';
  if (/icloud|caldav|apple|me\.com|mobileme/.test(t)) return '애플';
  if (/samsung/.test(t)) return '삼성';
  if (/local/.test(t)) return '기기 기본';
  return cal?.source?.name || '기타';
}

// 연동 가능한(쓰기 가능) 캘린더 목록 — 피커용
export async function getAvailableCalendars() {
  const granted = await ensurePermission();
  if (!granted) return [];
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return (cals || [])
      .filter(c => c.allowsModifications)
      .map(c => ({ id: c.id, title: c.title, account: accountLabel(c), color: c.color }));
  } catch (e) {
    console.warn('[calendar] list', e?.message);
    return [];
  }
}

// 사용자가 고른 캘린더 — null(아직 안 물어봄) | '__auto__'(자동) | 캘린더 id
export async function getCalendarChoice() {
  return await storage.load(STORAGE_KEYS.calendarChoice, null);
}
export async function setCalendarChoice(id) {
  await storage.save(STORAGE_KEYS.calendarChoice, id || '__auto__');
}

// 쓰기 가능한 캘린더 id — 사용자가 고른 캘린더 우선, 없으면 자동 선택
async function getWritableCalendarId() {
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = (cals || []).filter(c => c.allowsModifications);
    // 사용자가 직접 고른 캘린더 우선 (목록에 아직 존재할 때만)
    const chosen = await storage.load(STORAGE_KEYS.calendarChoice, null);
    if (chosen && chosen !== '__auto__') {
      const hit = writable.find(c => c.id === chosen);
      if (hit) return hit.id;
    }
    if (Platform.OS === 'ios') {
      try {
        const def = await Calendar.getDefaultCalendarAsync();
        if (def?.allowsModifications) return def.id;
      } catch (e) { /* 기본 캘린더 조회 실패 — 아래 폴백 */ }
    }
    const pick = writable.find(c => c.isPrimary)
      || writable.find(c => c.accessLevel === Calendar.CalendarAccessLevel.OWNER)
      || writable[0];
    return pick?.id || null;
  } catch (e) {
    console.warn('[calendar] getWritableCalendar', e?.message);
    return null;
  }
}

// 일정 객체 → 이벤트 시작/종료 Date
function eventDates(schedule) {
  const [y, m, d] = (schedule?.date || '').split('.').map(Number);
  const [hh, mm] = (schedule?.time || '08:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, hh || 8, mm || 0, 0, 0);
  const end = new Date(start.getTime() + ROUND_HOURS * 3600000);
  return { start, end };
}

// 라운딩 일정을 기기 캘린더에 추가(또는 이미 있으면 갱신)
export async function syncRoundToCalendar(schedule) {
  if (!schedule?.id) return;
  const dates = eventDates(schedule);
  if (!dates) return;
  // 기기 캘린더는 '다가오는 라운딩'만 — 지난(완료) 라운딩은 넣지 않음(과거 기록은 MY 라운딩 기록이 담당).
  // 단일화로 과거 백킹 일정까지 동기화되며 캘린더가 과거 이벤트로 밀리는 것 방지.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  if (dates.start.getTime() < todayStart.getTime()) return;
  const granted = await ensurePermission();
  if (!granted) return;
  try {
    const details = {
      title: `⛳ ${schedule.course || '라운딩'}`,
      startDate: dates.start,
      endDate: dates.end,
      location: schedule.course || '',
      notes: `${schedule.members ? schedule.members + '명 · ' : ''}Dear Golf 라운딩 일정`,
      timeZone: deviceTimeZone(),
    };
    const map = await storage.load(STORAGE_KEYS.calendarEvents, {});
    const existingId = map[schedule.id];
    if (existingId) {
      try {
        await Calendar.updateEventAsync(existingId, details);
        return;
      } catch (e) {
        // 사용자가 캘린더에서 직접 삭제했을 수 있음 — 새로 생성
      }
    }
    // ★캘린더에서 '가져오기'로 만든 일정은 그 이벤트가 이미 캘린더에 있다. 새로 만들면 원본과 나란히
    //   두 개가 남는다(사용자 2026-07-23). 그래서 원본을 새로 만들지 않고 '입양'해 그 자리에 갱신한다.
    //   한 번 입양하면 map에 박혀 이후 수정은 위 existingId 경로로 간다.
    //   실패(원본이 읽기 전용 캘린더거나 이미 지워짐)하면 새로 만들지 않는다 — 중복을 만드느니
    //   캘린더에 안 넣는 게 낫다. 어차피 원본이 읽기 전용이면 사용자 캘린더엔 이미 보인다.
    if (schedule.calendarSourceId) {
      try {
        await Calendar.updateEventAsync(schedule.calendarSourceId, details);
        map[schedule.id] = schedule.calendarSourceId;
        await storage.save(STORAGE_KEYS.calendarEvents, map);
        return;
      } catch (e) {
        console.warn('[calendar] adopt source failed — skip create to avoid duplicate', e?.message);
        return;
      }
    }
    const calId = await getWritableCalendarId();
    if (!calId) return;
    const eventId = await Calendar.createEventAsync(calId, details);
    map[schedule.id] = eventId;
    await storage.save(STORAGE_KEYS.calendarEvents, map);
  } catch (e) {
    console.warn('[calendar] sync', e?.message);
  }
}

// 일정 삭제 시 — 연결된 캘린더 이벤트도 제거
export async function removeRoundFromCalendar(scheduleId) {
  if (!scheduleId) return;
  try {
    const map = await storage.load(STORAGE_KEYS.calendarEvents, {});
    const eventId = map[scheduleId];
    if (!eventId) return;
    try { await Calendar.deleteEventAsync(eventId); } catch (e) { /* 이미 삭제됨 */ }
    delete map[scheduleId];
    await storage.save(STORAGE_KEYS.calendarEvents, map);
  } catch (e) {
    console.warn('[calendar] remove', e?.message);
  }
}

// ── 캘린더에서 가져오기(읽기) ──────────────────────────────────
// 폰 캘린더(구글·애플·삼성 전부)에서 앞으로 N일치 일정을 읽어 골프 여부를 판별.
//   AI 호출 없음 — 키워드 + 골프장 DB(로컬) 대조만. 완전 오프라인·무료.
// 반환: { granted, events:[{ id, title, location, start(Date), allDay, isGolf, course{name,loc,kakaoId}|null }] }
//   정렬: 골프 우선 → 시간 오름차순. granted=false면 권한 거부.
const GOLF_HINT = /골프|라운[딩드]|부킹|티오프|tee\s*off|컨트리|country\s*club|\bC\.?C\b|\bG\.?C\b|⛳/i;

export async function getUpcomingGolfEvents({ days = 60 } = {}) {
  const granted = await ensurePermission();
  if (!granted) return { granted: false, events: [] };
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const ids = (cals || []).map(c => c.id).filter(Boolean);
    if (!ids.length) return { granted: true, events: [] };

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + days * 86400000);
    const raw = await Calendar.getEventsAsync(ids, start, end);

    const seen = new Set();
    const out = [];
    for (const ev of raw || []) {
      if (!ev?.startDate) continue;
      const startDate = new Date(ev.startDate);
      if (isNaN(startDate.getTime())) continue;
      const title = (ev.title || '').trim();
      const location = (ev.location || '').trim();
      // 중복 제거 — 구글·삼성 계정에 같은 일정이 이중 등록되는 경우(제목+시각 동일)
      const dedupKey = `${title}|${startDate.getTime()}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const hay = `${title} ${location}`;
      let isGolf = GOLF_HINT.test(hay);
      // 장소(우선)·제목을 골프장 DB와 대조 → 매칭되면 골프로 확정 + 구장 프리필용 정보 확보
      let course = null;
      try {
        const hits = await searchGolfCoursesLocal(location || title);
        if (hits && hits.length) { course = hits[0]; isGolf = true; }
      } catch (e) { /* DB 미로드 등 — 키워드 판별만 사용 */ }

      out.push({ id: ev.id, title, location, start: startDate, allDay: !!ev.allDay, isGolf, course });
    }
    out.sort((a, b) => (a.isGolf === b.isGolf ? a.start - b.start : (a.isGolf ? -1 : 1)));
    return { granted: true, events: out };
  } catch (e) {
    console.warn('[calendar] getUpcomingGolfEvents', e?.message);
    return { granted: true, events: [], error: e?.message };
  }
}

// 'YYYY.MM.DD' — 앱 일정 date 포맷과 동일 (셀 매칭 키)
function ymdKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

// 공휴일 캘린더 판별 — 캘린더 제목/계정명에 공휴일 키워드가 있으면 그 캘린더 이벤트는 '공휴일'로 취급.
//   (한국 폰엔 '대한민국 공휴일'·'Holidays in South Korea' 류 캘린더가 계정별로 기본 존재)
const HOLIDAY_CAL_HINT = /공휴일|휴일|명절|국경일|holiday/i;

// ── 캘린더 칸에 겹쳐 보여줄 '일반 일정' 읽기 ──────────────────────
// 보고 있는 달(임의 기간)의 폰 캘린더 이벤트를 모든 계정에서 읽어, 골프·공휴일은 제외하고
//   개인 일정만 날짜별로 묶어 반환. 더블부킹 방지용 표시 — AI 없음, 완전 오프라인.
//   ※공휴일은 폰 캘린더가 기기마다 부실(삼성=연휴 누락)해 여기서 다루지 않고, 앱 내장 표(constants/holidays)가 담당.
//     그래서 폰의 '공휴일 캘린더' 이벤트는 개인 일정과 겹치지 않도록 건너뜀.
// 반환: { granted, byDate: { 'YYYY.MM.DD': [{ id, title, start(Date), allDay }] } }
export async function getGeneralEventsInRange(rangeStart, rangeEnd) {
  const granted = await ensurePermission();
  if (!granted) return { granted: false, byDate: {} };
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const ids = (cals || []).map(c => c.id).filter(Boolean);
    if (!ids.length) return { granted: true, byDate: {} };

    // 공휴일(및 기념일·절기 등) 캘린더 id — 이 캘린더 이벤트는 개인 일정에서 제외(내장 표가 공휴일 담당)
    const holidayCalIds = new Set(
      (cals || [])
        .filter(c => HOLIDAY_CAL_HINT.test(`${c.title || ''} ${c.source?.name || ''}`))
        .map(c => c.id)
    );

    const raw = await Calendar.getEventsAsync(ids, rangeStart, rangeEnd);

    const seen = new Set();
    const byDate = {};
    for (const ev of raw || []) {
      if (!ev?.startDate) continue;
      const startDate = new Date(ev.startDate);
      if (isNaN(startDate.getTime())) continue;
      const title = (ev.title || '').trim();
      if (!title) continue;
      // 공휴일/기념일 캘린더 이벤트는 건너뜀 (내장 표가 공휴일을 그림)
      if (holidayCalIds.has(ev.calendarId)) continue;
      const location = (ev.location || '').trim();
      // 중복 제거 — 여러 계정에 같은 일정이 이중 등록되는 경우(제목+시각 동일)
      const dedupKey = `${title}|${startDate.getTime()}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      // 골프 일정은 이미 캘린더 동그라미로 표시되므로 제외(중복 표시 방지)
      const hay = `${title} ${location}`;
      let isGolf = GOLF_HINT.test(hay);
      if (!isGolf) {
        try {
          const hits = await searchGolfCoursesLocal(location || title);
          if (hits && hits.length) isGolf = true;
        } catch (e) { /* DB 미로드 — 키워드 판별만 사용 */ }
      }
      if (isGolf) continue;

      const key = ymdKey(startDate);
      (byDate[key] || (byDate[key] = [])).push({
        id: ev.id, title, start: startDate, allDay: !!ev.allDay,
      });
    }
    // 날짜별 정렬 — 종일 일정 먼저, 그 다음 시간 오름차순
    for (const key of Object.keys(byDate)) {
      byDate[key].sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : (a.allDay ? -1 : 1)));
    }
    return { granted: true, byDate };
  } catch (e) {
    console.warn('[calendar] getGeneralEventsInRange', e?.message);
    return { granted: true, byDate: {}, error: e?.message };
  }
}

// 폰 캘린더 앱에서 해당 일정 열기 — 개인 일정(폰 이벤트 id 있음) 제목 탭 시
export async function openDeviceEvent(eventId) {
  if (!eventId) return false;
  try {
    await Calendar.openEventInCalendarAsync({ id: eventId });
    return true;
  } catch (e) {
    console.warn('[calendar] openDeviceEvent', e?.message);
    return false;
  }
}

// 폰 캘린더 앱을 '해당 날짜'로 열기 — 공휴일(내장 표라 이벤트 id 없음) 탭 시.
//   iOS: calshow:<2001년 기준 초> / 안드: 캘린더 time 인텐트(<epoch ms>).
export async function openDeviceCalendarAt(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Platform.OS === 'ios') {
      const REF_2001 = Date.UTC(2001, 0, 1, 0, 0, 0); // NSDate 기준일
      const secs = Math.floor((d.getTime() - REF_2001) / 1000);
      await Linking.openURL(`calshow:${secs}`);
    } else {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: `content://com.android.calendar/time/${d.getTime()}`,
      });
    }
    return true;
  } catch (e) {
    console.warn('[calendar] openDeviceCalendarAt', e?.message);
    return false;
  }
}
