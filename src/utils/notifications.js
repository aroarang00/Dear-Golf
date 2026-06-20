import * as Notifications from 'expo-notifications';
import { STORAGE_KEYS, storage } from './storage';

// 현재 열려 있는 DM 대화방 pairId — 포그라운드 중복 푸시 억제용 ([[dm-design]]).
//   그 방을 보고 있으면 메시지가 이미 실시간으로 보이므로 배너를 띄우지 않는다(앱이 백그라운드면
//   이 JS 핸들러가 호출되지 않아 OS가 정상 표시 — 억제는 '포그라운드+그 방'일 때만).
//   DMChatScreen이 진입 시 setActiveDmPair(pairId), 이탈 시 setActiveDmPair(null) 호출.
let _activeDmPairId = null;
export function setActiveDmPair(pairId) { _activeDmPairId = pairId || null; }

// 포그라운드에서도 알림 배너를 띄움 — 단, 지금 보고 있는 DM 대화방 메시지는 제외(중복 방지)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification?.request?.content?.data || {};
    const suppress = data.type === 'dm' && !!data.pairId && data.pairId === _activeDmPairId;
    return {
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: !suppress,
      shouldSetBadge: false,
    };
  },
});

// 알람 시점별 정의 — title은 알림 제목, tail은 본문 둘째 줄(행동 유도)
export const ALARM_DEFS = {
  d3:     { key: 'd3',     label: 'D-3 (3일 전 오전 10시)',  title: '⛳ 3일 후 라운딩이 있어요',     tail: '앱에서 날씨·교통을 미리 확인해보세요' },
  d1:     { key: 'd1',     label: 'D-1 (전날 오후 6시)',     title: '🌤️ 내일 라운딩 D-1이에요',     tail: '동반자에게 일정을 공유해보세요 →' },
  teeoff: { key: 'teeoff', label: '당일 (티오프 2시간 전)',  title: '🏌️ 오늘 라운딩 2시간 전이에요', tail: '빠뜨린 건 없는지 확인해보세요 😊' },
};
export const ALARM_TYPES = ['d3', 'd1', 'teeoff'];
export const ALARM_DEFAULTS_FALLBACK = { d3: true, d1: true, teeoff: true };

// 일정 객체 → 알람 시점별 발송 시각(Date). { d3, d1, teeoff }
export function alarmTriggers(schedule) {
  const [y, m, d] = (schedule?.date || '').split('.').map(Number);
  const [hh, mm] = (schedule?.time || '08:00').split(':').map(Number);
  if (!y || !m || !d) return {};
  const teeoff = new Date(y, m - 1, d, hh || 8, mm || 0, 0, 0);

  const d3 = new Date(y, m - 1, d, 10, 0, 0, 0);
  d3.setDate(d3.getDate() - 3); // 3일 전 오전 10시

  const d1 = new Date(y, m - 1, d, 18, 0, 0, 0);
  d1.setDate(d1.getDate() - 1); // 전날 오후 6시

  const teeoff2h = new Date(teeoff.getTime() - 2 * 3600000); // 티오프 2시간 전

  return { d3, d1, teeoff: teeoff2h };
}

// 알림 권한 요청 — 이미 허용돼 있으면 바로 true, 아니면 OS 팝업
export async function requestNotificationPermission() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return !!asked.granted;
  } catch (e) {
    console.warn('[notifications] permission', e?.message);
    return false;
  }
}

// 알람 예약/취소 작업 직렬화 큐 — 여러 작업이 동시에 storage 맵을 읽고 쓰며
// 서로의 결과를 덮어쓰는 경쟁 상태를 방지한다(빠른 토글, 연속 추가/삭제 등).
let opQueue = Promise.resolve();
function enqueue(task) {
  const next = opQueue.then(task, task);
  opQueue = next.catch(() => {});
  return next;
}

// --- 내부 구현 (큐 안에서만 호출) ---

async function _cancelRoundAlarms(scheduleId) {
  if (!scheduleId) return;
  const map = await storage.load(STORAGE_KEYS.alarms, {});
  const entry = map[scheduleId];
  if (entry?.ids?.length) {
    for (const { id } of entry.ids) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch (e) { /* 이미 발송/취소됨 */ }
    }
  }
  if (entry) {
    delete map[scheduleId];
    await storage.save(STORAGE_KEYS.alarms, map);
  }
}

async function _scheduleRoundAlarms(schedule, types) {
  if (!schedule?.id) return [];
  await _cancelRoundAlarms(schedule.id); // 기존 예약분 먼저 정리
  const triggers = alarmTriggers(schedule);
  const now = Date.now();
  const scheduled = [];

  for (const t of types || []) {
    const when = triggers[t];
    const def = ALARM_DEFS[t];
    if (!when || !def || when.getTime() <= now) continue; // 지난 시점은 건너뜀
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: def.title,
          body: `${schedule.course} · ${schedule.time}\n${def.tail}`,
          data: { scheduleId: schedule.id, nav: 'home' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
      scheduled.push({ type: t, id });
    } catch (e) {
      console.warn('[notifications] schedule', t, e?.message);
    }
  }

  const map = await storage.load(STORAGE_KEYS.alarms, {});
  // types는 사용자가 켠 시점 전체를 기록(과거라 건너뛴 것 포함) — 수정 시 재예약 기준
  map[schedule.id] = { types: types || [], ids: scheduled };
  await storage.save(STORAGE_KEYS.alarms, map);
  return scheduled;
}

async function _syncAlarmTypeAcrossSchedules(schedules, type, enabled) {
  const map = await storage.load(STORAGE_KEYS.alarms, {});
  const now = Date.now();
  for (const s of schedules || []) {
    if (!s?.id) continue;
    const triggers = alarmTriggers(s);
    const future = ALARM_TYPES.some(t => triggers[t] && triggers[t].getTime() > now);
    if (!future) continue; // 알람과 무관한 지난 일정은 건너뜀
    const current = map[s.id]?.types || [];
    const has = current.includes(type);
    if (has === enabled) continue; // 변화 없음
    const next = enabled ? [...current, type] : current.filter(t => t !== type);
    await _scheduleRoundAlarms(s, next);
    // 같은 큐 작업 안에서 다음 일정 판단을 위해 로컬 스냅샷도 갱신
    map[s.id] = { ...(map[s.id] || {}), types: next };
  }
}

// --- 공개 API (큐를 통해 직렬 실행) ---

// 일정에 대한 라운딩 알람 예약. types: ['d3','d1','teeoff'] 중 선택분.
export function scheduleRoundAlarms(schedule, types) {
  return enqueue(() => _scheduleRoundAlarms(schedule, types));
}

// 일정 삭제 시 — 해당 일정의 모든 예약 알람 취소
export function cancelRoundAlarms(scheduleId) {
  return enqueue(() => _cancelRoundAlarms(scheduleId));
}

// 고아 알람 정리 — OS에 예약돼 있지만 더 이상 존재하지 않는 일정의 알람을 취소.
//   ★삭제 경로가 알람 취소를 안 거쳤거나(과거: removeSchedule이 중앙 취소 안 함), 앱 재설치로 저장 맵이 유실된 경우
//    삭제된 일정의 D-3/D-1 알림이 계속 오던 문제 정리(사용자 2026-06-20). activeIds=현재 살아있는 일정 id 목록.
//   로컬 예약 알림은 라운딩 알람뿐(scheduleNotificationAsync 사용처가 여기 한 곳)이라 scheduleId 기준 판별이 안전.
async function _reconcileAlarms(activeIds) {
  const active = new Set((activeIds || []).filter(Boolean));
  // 1) OS가 실제로 들고 있는 예약분 기준 — scheduleId가 살아있는 일정에 없으면 취소(맵 유실분까지 확실히 제거).
  let scheduled = [];
  try { scheduled = await Notifications.getAllScheduledNotificationsAsync(); } catch { scheduled = []; }
  for (const n of scheduled) {
    const sid = n?.content?.data?.scheduleId;
    if (!sid || active.has(sid)) continue; // 일정 알람이 아니거나(가드) 살아있는 일정 → 보존
    try { await Notifications.cancelScheduledNotificationAsync(n.identifier); } catch { /* 이미 취소·발송됨 */ }
  }
  // 2) 저장 맵에서도 죽은 일정 엔트리 제거 — 다음 동기화가 깨끗한 상태에서 판단하게.
  const map = await storage.load(STORAGE_KEYS.alarms, {});
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!active.has(id)) { delete map[id]; changed = true; }
  }
  if (changed) await storage.save(STORAGE_KEYS.alarms, map);
}

// 앱 시작·일정 로드 후 호출 — 살아있는 일정 id만 넘기면 그 외 예약 알림을 전부 정리.
export function reconcileAlarms(activeIds) {
  return enqueue(() => _reconcileAlarms(activeIds));
}

// 마이페이지에서 알람 시점 하나를 켜고 끌 때 — 예정된 모든 일정에 즉시 반영.
// type 시점만 더하거나 빼고 나머지 시점은 일정별 설정 그대로 유지.
export function syncAlarmTypeAcrossSchedules(schedules, type, enabled) {
  return enqueue(() => _syncAlarmTypeAcrossSchedules(schedules, type, enabled));
}

// 팝업 없이 기본 알람 설정대로 예약 — '다시 묻지 않기'를 켠 사용자용
export async function applyDefaultAlarms(schedule, alarmDefaults) {
  const base = alarmDefaults || ALARM_DEFAULTS_FALLBACK;
  const types = ALARM_TYPES.filter(t => base[t]);
  if (!types.length) return;
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleRoundAlarms(schedule, types);
}

// 일정에 설정된 알람 시점 목록 반환 (없으면 null) — 수정 시 재예약 여부 판단용
export function getAlarmTypes(scheduleId) {
  return enqueue(async () => {
    if (!scheduleId) return null;
    const map = await storage.load(STORAGE_KEYS.alarms, {});
    return map[scheduleId]?.types || null;
  });
}
