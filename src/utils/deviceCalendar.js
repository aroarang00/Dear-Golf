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
