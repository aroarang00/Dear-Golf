import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { STORAGE_KEYS, storage } from './storage';

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

// 쓰기 가능한 캘린더 id — iOS는 기본 캘린더, Android는 기본/소유 캘린더
async function getWritableCalendarId() {
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (Platform.OS === 'ios') {
      try {
        const def = await Calendar.getDefaultCalendarAsync();
        if (def?.allowsModifications) return def.id;
      } catch (e) { /* 기본 캘린더 조회 실패 — 아래 폴백 */ }
    }
    const writable = (cals || []).filter(c => c.allowsModifications);
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
