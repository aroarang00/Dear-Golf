import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { STORAGE_KEYS, storage } from './storage';
import { getScheduleDriveMin } from './scheduleWx'; // 자동 적용 시 기상·출발 역산용 이동시간(집→구장)
import { setSystemAlarm } from './nativeAlarm';     // 옵션 켜짐 시 시계앱 진짜 알람 자동 등록(안드 빌드에서만 동작)

// Android 알림 채널 — 8+(API26)에선 채널이 없거나 importance가 낮으면 heads-up 배너·소리가 안 뜰 수 있음
//   ('테스터별 조용히 옴/안 옴'의 흔한 원인). 고중요도 'default' 채널을 모듈 로드 시 1회 보장(권한 불필요).
//   ★원격 푸시가 이 채널을 쓰려면 CF의 Expo 푸시 페이로드에 channelId:'default'가 필요(후속 CF 배포분에서 추가).
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: '기본 알림',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6B1E2A',
  }).catch(() => {});
}

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
  // 동적 알람 — 발송 시각이 이동시간(driveMin)·개인설정(prepMin·arriveBufferMin)에 따라 달라짐.
  //   ALARM_TYPES(고정시점 체크박스·기본설정)엔 넣지 않음. body는 _scheduleRoundAlarms에서 계산시각으로 동적 생성.
  depart: { key: 'depart', label: '출발 알림',  title: '🚗 이제 출발할 시간이에요',         tail: '안전운전하세요!' },
  wake:   { key: 'wake',   label: '기상 알림',  title: '⛳ 골프 가는 날! 일어날 시간이에요', tail: '좋은 라운딩 되세요 😊' },
};
export const ALARM_TYPES = ['d3', 'd1', 'teeoff'];          // 고정시점 — 체크박스·기본설정·자동적용용
export const DYNAMIC_ALARM_TYPES = ['wake', 'depart'];      // 이동시간 역산 기반 — 출발지 좌표 있어야 계산
export const ALARM_DEFAULTS_FALLBACK = { d3: true, d1: true, teeoff: true };
export const MORNING_TEE_BEFORE_HOUR = 9;                   // 티오프가 이 시각 전이면 '오전티(1부)' — 기상 알림 의미 있음(한국 골프: 오전티 보통 9시 이전)
export const MORNING_WAKE_BEFORE_HOUR = 7;                  // 또는 역산 기상이 이 시각 전이면(낮티라도 먼 거리로 일찍 기상) 기상 알림 권함

// 이 라운드에 기상 알림이 의미 있는지 — 오전티(티오프<9시)거나, 역산 기상이 이른(<7시) 경우.
//   낮티(10:30+)·야간(3부)은 둘 다 아니라 false → 기상 알림 숨김/생략.
export function shouldOfferWake(timeline) {
  if (!timeline?.wake) return false;
  return timeline.teeoff.getHours() < MORNING_TEE_BEFORE_HOUR
    || timeline.wake.getHours() < MORNING_WAKE_BEFORE_HOUR;
}

// 부(部)별 기본 출발지 키 — 'home' | 'work'.
//   1부(오전티,<9시)=집 / 2·3부(오후·야간)=회사(저장돼 있으면, 없으면 집). 퇴근 후 직행이 흔해서.
export function defaultOriginKey(schedule, profile) {
  const [hh] = (schedule?.time || '08:00').split(':').map(Number);
  const hasWork = !!(profile?.workCoord && typeof profile.workCoord.x === 'number' && typeof profile.workCoord.y === 'number');
  if ((hh || 8) < MORNING_TEE_BEFORE_HOUR) return 'home'; // 오전티 → 집
  return hasWork ? 'work' : 'home';                       // 오후·야간 → 회사(있으면)
}

// 출발지 키 → 저장된 좌표({x,y}|null). 'current'(현재위치)는 비동기라 호출부에서 별도 처리.
export function originCoordOf(key, profile) {
  if (key === 'work') return profile?.workCoord || null;
  return profile?.departureCoord || null; // 'home'
}

// 'HH:MM' 표기 — 동적 알람 본문·UI 공용
export function fmtClock(date) {
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 일정 + 개인설정으로 라운드 타임라인 역산.
//   driveMin=집→구장 이동(분), prepMin=집에서 나갈 준비(분, 화장·짐 등), arriveBufferMin=구장 도착~티오프 여유(분).
//   teeoff − 도착여유 = 구장도착 / − 이동시간 = 출발 / − 준비시간 = 기상.
//   반환 { teeoff, arrive, depart, wake } — 입력이 모자라 못 구하는 항목은 null(부분 반환).
//   arriveAt('HH:MM' 또는 Date) = 라운드 전 식사·모임 시각이 있으면 그게 '도착 목표'(도착여유 무시).
export function computeRoundTimeline(schedule, { driveMin, prepMin, arriveBufferMin, arriveAt } = {}) {
  const [y, m, d] = (schedule?.date || '').split('.').map(Number);
  const [hh, mm] = (schedule?.time || '08:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  const teeoff = new Date(y, m - 1, d, hh || 8, mm || 0, 0, 0);
  // 도착 목표 — 식사·모임 시각(arriveAt) 우선, 없으면 티오프 − 도착여유.
  let arrive = null;
  if (arriveAt instanceof Date) arrive = arriveAt;
  else if (typeof arriveAt === 'string' && /^\d{1,2}:\d{2}$/.test(arriveAt)) {
    const [ah, am] = arriveAt.split(':').map(Number);
    arrive = new Date(y, m - 1, d, ah, am, 0, 0);
  } else if (Number.isFinite(arriveBufferMin)) {
    arrive = new Date(teeoff.getTime() - arriveBufferMin * 60000);
  }
  const depart = (arrive && Number.isFinite(driveMin)) ? new Date(arrive.getTime() - driveMin * 60000) : null;
  const wake   = (depart && Number.isFinite(prepMin)) ? new Date(depart.getTime() - prepMin * 60000) : null;
  return { teeoff, arrive, depart, wake, anchoredToMeal: !!arrive && arriveAt != null };
}

// 일정 객체 → 알람 시점별 발송 시각(Date). { d3, d1, teeoff } + opts 주어지면 { depart, wake } 추가.
//   opts={ driveMin, prepMin, arriveBufferMin } — 동적 알람 계산용(없으면 고정 3종만).
export function alarmTriggers(schedule, opts = {}) {
  const [y, m, d] = (schedule?.date || '').split('.').map(Number);
  const [hh, mm] = (schedule?.time || '08:00').split(':').map(Number);
  if (!y || !m || !d) return {};
  const teeoff = new Date(y, m - 1, d, hh || 8, mm || 0, 0, 0);

  const d3 = new Date(y, m - 1, d, 10, 0, 0, 0);
  d3.setDate(d3.getDate() - 3); // 3일 전 오전 10시

  const d1 = new Date(y, m - 1, d, 18, 0, 0, 0);
  d1.setDate(d1.getDate() - 1); // 전날 오후 6시

  const teeoff2h = new Date(teeoff.getTime() - 2 * 3600000); // 티오프 2시간 전

  const out = { d3, d1, teeoff: teeoff2h };

  // 동적 알람 — 이동시간 등 옵션이 있을 때만 역산해 추가
  const tl = computeRoundTimeline(schedule, opts);
  if (tl?.depart) out.depart = tl.depart;
  if (tl?.wake) out.wake = tl.wake;
  return out;
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

// 동적 알람(wake/depart) 본문 — 역산 시각을 보여줘 한눈에 확인되게.
function _dynamicBody(t, schedule, opts) {
  const tl = computeRoundTimeline(schedule, opts || {});
  if (t === 'wake' && tl?.wake) return `${schedule.course}\n${fmtClock(tl.wake)} 기상 · ${fmtClock(tl.depart)} 출발`;
  if (t === 'depart' && tl?.depart) return `${schedule.course}\n${fmtClock(tl.depart)} 출발 · ${fmtClock(tl.teeoff)} 티오프`;
  return `${schedule.course} · ${schedule.time}\n${ALARM_DEFS[t]?.tail || ''}`;
}

async function _scheduleRoundAlarms(schedule, types, opts) {
  if (!schedule?.id) return [];
  // 동적 알람(wake/depart) 재예약 시 opts 미전달이면 이전 저장 opts 재사용.
  //   이동시간(driveMin)은 출발지·구장 거리라 일정 시간 변경과 무관 → 옛 값 그대로 써도 정확.
  //   (편집 경로가 scheduleRoundAlarms(s, types)만 호출해도 wake/depart가 유지되게)
  const prevMap = await storage.load(STORAGE_KEYS.alarms, {});
  const effOpts = (opts && Object.keys(opts).length) ? opts : (prevMap[schedule.id]?.opts || {});

  await _cancelRoundAlarms(schedule.id); // 기존 예약분 먼저 정리
  const triggers = alarmTriggers(schedule, effOpts);
  const now = Date.now();
  const scheduled = [];

  // 기상 알림은 못 들을까 봐 '10분 후 한두 번 더' 반복 발송 가능(snoozeCount/Interval) — 시계앱 없이 인앱 알림에도 적용.
  const wakeReps = Math.max(1, Number.isFinite(effOpts.snoozeCount) ? effOpts.snoozeCount : 1);
  const wakeIntervalMs = (Number.isFinite(effOpts.snoozeIntervalMin) ? effOpts.snoozeIntervalMin : 10) * 60000;

  for (const t of types || []) {
    const when = triggers[t];
    const def = ALARM_DEFS[t];
    if (!when || !def || when.getTime() <= now) continue; // 지난 시점은 건너뜀
    const isDynamic = t === 'wake' || t === 'depart';
    const reps = t === 'wake' ? wakeReps : 1; // 기상만 반복(나머지는 1회)
    for (let i = 0; i < reps; i++) {
      const fireAt = i === 0 ? when : new Date(when.getTime() + i * wakeIntervalMs);
      if (fireAt.getTime() <= now) continue;
      const body = isDynamic ? _dynamicBody(t, schedule, effOpts) : `${schedule.course} · ${schedule.time}\n${def.tail}`;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: i === 0 ? def.title : '⛳ 아직 안 일어났나요?',
            body,
            data: { scheduleId: schedule.id, nav: 'home' },
            sound: 'default',
            // iOS — 기상·출발은 '시간 중요(Time Sensitive)'로: 집중모드/대부분의 방해금지를 뚫고 울림(완전 무음 스위치는 제외).
            //   iOS엔 시계앱 강제알람 API가 없어 이게 현실적 최선. 엔타이틀먼트는 app.config.js ios.entitlements.
            ...(isDynamic ? { interruptionLevel: 'timeSensitive' } : null),
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
        });
        scheduled.push({ type: t, id });
      } catch (e) {
        console.warn('[notifications] schedule', t, i, e?.message);
      }
    }
  }

  const map = await storage.load(STORAGE_KEYS.alarms, {});
  // types는 사용자가 켠 시점 전체를 기록(과거라 건너뛴 것 포함) — 수정 시 재예약 기준.
  // opts는 동적 알람(wake/depart) 재계산용으로 함께 저장.
  map[schedule.id] = { types: types || [], ids: scheduled, opts: effOpts };
  await storage.save(STORAGE_KEYS.alarms, map);
  return scheduled;
}

// --- 공개 API (큐를 통해 직렬 실행) ---

// 일정에 대한 라운딩 알람 예약. types: ['d3','d1','teeoff','wake','depart'] 중 선택분.
//   opts={ driveMin, prepMin, arriveBufferMin } — wake/depart 역산용(고정 3종만 켜면 불필요).
//   opts 생략 시 직전 저장값 재사용(편집 재예약 등) — _scheduleRoundAlarms 참고.
export function scheduleRoundAlarms(schedule, types, opts) {
  return enqueue(() => _scheduleRoundAlarms(schedule, types, opts));
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

// 팝업 없이 기본 설정대로 예약 — '라운드마다 직접 설정' 끈 사용자(=대부분, 온보딩서 한 번 정함).
//   profile = userProfile 전체. alarmDefaults(고정 3종 + wake/depart) + prepMin·arriveBufferMin·departureCoord 사용.
//   기상·출발(동적)은 출발지 저장돼 이동시간 역산될 때만, 기상은 '새벽 티'(역산 기상<오전7시)일 때만 자동 적용.
//   arriveAt('HH:MM') = 라운드마다 달라지는 '전 식사·모임 시각'(자동 모드에서 그날만 입력받아 넘김). 있으면 그 시각이 도착 목표.
export async function applyDefaultAlarms(schedule, profile, { arriveAt } = {}) {
  const base = profile?.alarmDefaults || ALARM_DEFAULTS_FALLBACK;
  const types = ALARM_TYPES.filter(t => base[t]); // 고정 3종(d3/d1/teeoff)

  // 동적 알람(기상·출발) — 켜져 있고 출발지 있으면 이동시간 역산해 추가.
  //   출발지는 부(部)별 기본: 1부=집 / 2·3부=회사(없으면 집). 자동 경로라 현재위치(GPS)는 안 씀.
  let opts;
  let wakeDate = null; // 시계앱 자동 등록용 — 기상 알람이 걸린 경우의 기상 시각
  const originKey = defaultOriginKey(schedule, profile);
  const origin = originCoordOf(originKey, profile);
  const wantDynamic = (base.wake || base.depart);
  if (wantDynamic && origin && typeof origin.x === 'number' && typeof origin.y === 'number') {
    try {
      const driveMin = await getScheduleDriveMin(schedule, origin);
      if (Number.isFinite(driveMin)) {
        const prepMin = Number.isFinite(profile.prepMin) ? profile.prepMin : 30;
        const arriveBufferMin = Number.isFinite(profile.arriveBufferMin) ? profile.arriveBufferMin : 30;
        const tl = computeRoundTimeline(schedule, { driveMin, prepMin, arriveBufferMin, arriveAt });
        if (base.depart && tl?.depart) types.push('depart');
        if (base.wake && shouldOfferWake(tl)) { types.push('wake'); wakeDate = tl.wake; } // 오전티(1부)만 — 낮·야간 자동 제외
        opts = { driveMin, prepMin, arriveBufferMin, arriveAt: arriveAt || null,
          snoozeCount: Math.max(1, Number.isFinite(profile.snoozeCount) ? profile.snoozeCount : 1),
          snoozeIntervalMin: Number.isFinite(profile.snoozeIntervalMin) ? profile.snoozeIntervalMin : 10 };
      }
    } catch (e) { if (__DEV__) console.warn('[notifications] applyDefault dynamic', e?.message); }
  }

  if (!types.length) return;
  const granted = await requestNotificationPermission();
  if (!granted) return;
  await scheduleRoundAlarms(schedule, types, opts);

  // 시계앱 자동 등록(옵션) — 기상 알람이 걸렸고 사용자가 켜둔 경우만. 안드 네이티브 빌드에서만 실제 동작(아니면 no-op).
  //   못 들을까 봐 거는 횟수·간격(snoozeCount/Interval)대로 조용히(skipUi) 시계앱에 등록.
  if (profile?.autoSystemAlarm && wakeDate && wakeDate.getTime() > Date.now()) {
    const count = Math.max(1, Number.isFinite(profile.snoozeCount) ? profile.snoozeCount : 1);
    const interval = Number.isFinite(profile.snoozeIntervalMin) ? profile.snoozeIntervalMin : 10;
    const baseMs = wakeDate.getTime();
    for (let i = 0; i < count; i++) {
      const t = new Date(baseMs + i * interval * 60000);
      await setSystemAlarm({ hour: t.getHours(), minute: t.getMinutes(), message: `${schedule.course} 기상`, skipUi: true });
    }
  }
}

// 일정에 설정된 알람 시점 목록 반환 (없으면 null) — 수정 시 재예약 여부 판단용
export function getAlarmTypes(scheduleId) {
  return enqueue(async () => {
    if (!scheduleId) return null;
    const map = await storage.load(STORAGE_KEYS.alarms, {});
    return map[scheduleId]?.types || null;
  });
}

// 일정에 설정된 알람 전체 설정 반환 — { types, opts } | null. 일정 시트의 '라운드 알람' 표시·편집 프리필용.
export function getAlarmConfig(scheduleId) {
  return enqueue(async () => {
    if (!scheduleId) return null;
    const map = await storage.load(STORAGE_KEYS.alarms, {});
    const e = map[scheduleId];
    return e ? { types: e.types || [], opts: e.opts || {} } : null;
  });
}
