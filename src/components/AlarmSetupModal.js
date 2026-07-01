import React, { useState, useEffect, useContext } from 'react';
import { Modal, View, Text, TouchableOpacity, Linking, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpinnerPicker } from './common/SpinnerPicker'; // iOS/안드 스피너 차이 흡수(iOS '완료'로 닫기) — 직접 DateTimePicker는 매 변경마다 닫혀 iOS 스크롤 불가
import { showAppAlert, AppAlertHost } from './AppAlert';   // 풀스크린 모달 안에서도 알럿이 위로 보이게 모달 내부에 호스트 장착([[ios-modal-stacking]])
import { C, F, fs } from '../constants/colors';
import { TripleStripe } from './common/TripleStripe';
import { Icon } from './common/Icon'; // 커스텀 라인 아이콘 — 이모지 대신(OS 간 렌더 일관)
import { STORAGE_KEYS, storage } from '../utils/storage';
import { UserContext } from '../contexts/UserContext';
import {
  ALARM_DEFS, ALARM_TYPES, ALARM_DEFAULTS_FALLBACK, shouldOfferWake, defaultOriginKey,
  alarmTriggers, computeRoundTimeline, fmtClock, requestNotificationPermission, scheduleRoundAlarms,
} from '../utils/notifications';
import { getScheduleDriveMin } from '../utils/scheduleWx';
import { getCurrentLocation } from '../utils/location';
import { setSystemAlarm, SYSTEM_ALARM_SUPPORTED, openExactAlarmSettings } from '../utils/nativeAlarm';

// 준비시간(집에서 나갈 때까지)·도착여유(구장 도착~티오프) 칩 선택지(분).
//   기본값을 강요하지 않되, 처음엔 무난한 30분에서 시작 — 사람마다 칩으로 조정(여성 화장 1시간 ↔ 남성 5분).
const PREP_OPTS = [5, 15, 30, 60];
const ARRIVE_OPTS = [30, 60, 90]; // 구장 도착여유 — 최소 30분이 기본 에티켓, 90분은 오후티 등 여유. '바로'는 뺌
// 안드 시계앱(SET_ALARM)은 시·분만 받고 '날짜'를 못 넣음 → '가장 가까운 그 시각(오늘/내일)'에 울림.
//   라운드 당일 기상시각이 24시간 밖이면 지금 걸면 라운드가 아닌 오늘/내일에 잘못 울리므로, 전날(24h 이내)에만 등록 허용.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const arriveLabel = (m) => `${m}분`;
const DEFAULT_PREP = 30;
const DEFAULT_ARRIVE = 30;
// 'HH:MM' → '오전/오후 h:mm' (사용자가 설정한 시각을 또렷이 보여주기)
const fmtKorTime = (hhmm) => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}:${String(m).padStart(2, '0')}`;
};

// 라운드 전 식사·모임은 티오프보다 빨라야 함 — 고른 시각(hh,mm)이 티오프(scheduleTime 'HH:MM') 이상이면 true(거부).
const isAtOrAfterTee = (hh, mm, scheduleTime) => {
  const [th, tm] = String(scheduleTime || '').split(':').map(Number);
  if (!Number.isFinite(th)) return false;
  return (hh * 60 + mm) >= (th * 60 + (tm || 0));
};

// 섹션 카드 — 크림 배경 위 흰 카드 + 그림자로 또렷이. (모듈 상수 — 리렌더 영향 X)
const cardStyle = {
  backgroundColor: C.bgSecondary, borderRadius: 16, padding: 16, marginTop: 14,
  borderWidth: 1, borderColor: C.hairline,
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
};
// 칩·섹션제목·역산줄·토글 — 모듈 스코프 컴포넌트(부모 안에 두면 매 렌더 remount=렉). prop로만 동작.
const Chip = ({ label, on, onPress }) => (
  <TouchableOpacity activeOpacity={0.8} onPress={onPress}
    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgPrimary }}>
    <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(13), color: on ? C.burgundy : C.warmGray }}>{label}</Text>
  </TouchableOpacity>
);
const SectionTitle = ({ children }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
    <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: C.burgundy, marginRight: 8 }} />
    <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoalDeep }}>{children}</Text>
  </View>
);
// 역산 타임라인 한 줄 — 라벨(좌) · 시각(우 정렬)로 시각이 한눈에 맞춰 보이게.
//   accent=티오프(가장 중요한 앵커)는 와인색·굵게·크게, 나머지(기상/출발/모임)는 보조 톤.
// 아이콘은 모든 줄 동일 크기 + 고정폭 칸에 중앙정렬 → 라벨 시작점이 줄마다 안 어긋나게(정렬 맞춤).
//   티오프(accent)는 크기 차이로 키우기보다 색·굵기로 강조(시각만 과대해지지 않게 균형).
const TimeRow = ({ name, label, time, accent }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
    <View style={{ width: fs(22), alignItems: 'center' }}>
      <Icon name={name} size={fs(17)} color={accent ? C.burgundy : C.charcoal} />
    </View>
    <Text style={{ flex: 1, marginLeft: 8, fontFamily: accent ? F.sysB : F.sysM, fontSize: fs(accent ? 15 : 14), color: accent ? C.burgundy : C.charcoal }}>{label}</Text>
    <Text style={{ fontFamily: accent ? F.sysB : F.sysSb, fontSize: fs(accent ? 19 : 15), color: accent ? C.burgundy : C.charcoalDeep }}>{time}</Text>
  </View>
);
const ToggleRow = ({ on, past, onToggle, iconName, title, sub }) => (
  <TouchableOpacity activeOpacity={past ? 1 : 0.7} disabled={past} onPress={onToggle}
    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgPrimary, opacity: past ? 0.45 : 1 }}>
    <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? C.burgundy : C.warmGrayLight, backgroundColor: on ? C.burgundy : 'transparent' }}>
      {on && <Text style={{ color: C.butter, fontSize: fs(13), fontWeight: '700' }}>✓</Text>}
    </View>
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={iconName} size={fs(16)} color={C.charcoal} />
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>{title}</Text>
      </View>
      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>{sub}</Text>
    </View>
  </TouchableOpacity>
);

// 일정 추가 직후 뜨는 전체화면 알람 설정 화면 — 혼자 쓰는 사람의 핵심.
//   출발지 → (라운드 전 식사·모임 시각) → 기상/출발 역산 → 토글 → (안드) 시계앱 알람.
export function AlarmSetupModal({ visible, schedule, onClose, existing = null }) {
  const insets = useSafeAreaInsets(); // 루트 SafeAreaProvider 컨텍스트(투명 모달이라 유지됨) — 중첩 provider 없이 수동 적용
  const { userProfile, setUserProfile } = useContext(UserContext);
  const [picked, setPicked] = useState(ALARM_DEFAULTS_FALLBACK);
  const [dontAsk, setDontAsk] = useState(false);
  const [saving, setSaving] = useState(false);

  // 기상·출발(동적 알람) 상태 — 이동시간 역산 기반
  const [driveMin, setDriveMin] = useState(null);          // 출발지→구장 이동(분). null=미조회/불가
  const [driveLoading, setDriveLoading] = useState(false);
  const [prepMin, setPrepMin] = useState(DEFAULT_PREP);     // 집에서 나갈 준비시간
  const [arriveBufferMin, setArriveBufferMin] = useState(DEFAULT_ARRIVE); // 구장 도착여유
  const [wakeOn, setWakeOn] = useState(false);
  const [departOn, setDepartOn] = useState(false);
  const [originKey, setOriginKey] = useState('home'); // 'home'|'work'|'current' — 출발지(부별 기본)
  const [mealTime, setMealTime] = useState(null);     // 'HH:MM' | null — 라운드 전 식사·모임 시각(있으면 도착 목표)
  const [mealErr, setMealErr] = useState('');         // 티오프 이후 고르면 그 자리 인라인 경고(팝업은 풀스크린 모달 뒤로 깔려 부적합)
  const [showTimePicker, setShowTimePicker] = useState(false);
  // 시계앱 기상 알람 — 못 들을까 봐 여러 번(간격) 거는 사람용(안드)
  const [snoozeCount, setSnoozeCount] = useState(1);        // 1~3개
  const [snoozeIntervalMin, setSnoozeIntervalMin] = useState(10); // 5/10/15분 간격
  const [sysAlarmDone, setSysAlarmDone] = useState(false); // 이 일정에 '내 폰 알람 등록'을 눌렀는지(로컬 기록) — 버튼이 '등록하기' vs '등록함'을 구분
  const [sysAlarmWake, setSysAlarmWake] = useState(null);  // 등록한 기상 시각('HH:MM') — 지금 역산 시각과 다르면 '새로 등록'+이전시각 삭제 안내

  // 저장된 출발지(집·회사)
  const homeCoord = userProfile?.departureCoord;
  const workCoord = userProfile?.workCoord;
  const hasHome = !!(homeCoord && typeof homeCoord.x === 'number' && typeof homeCoord.y === 'number');
  const hasWork = !!(workCoord && typeof workCoord.x === 'number' && typeof workCoord.y === 'number');
  const hasAnyOrigin = hasHome || hasWork;

  const tlOpts = { driveMin, prepMin, arriveBufferMin, arriveAt: mealTime };
  const triggers = schedule ? alarmTriggers(schedule, tlOpts) : {};
  const now = Date.now();
  const isPast = (t) => !triggers[t] || triggers[t].getTime() <= now;

  // 역산 타임라인 — 이동시간 확보 시 기상·출발 시각 계산
  const timeline = (driveMin != null && schedule) ? computeRoundTimeline(schedule, tlOpts) : null;
  const baseTl = schedule ? computeRoundTimeline(schedule, {}) : null; // 티오프 시각(이동시간 없이도) — 피커 기본값용
  // 기상 알림은 '오전티(1부)'일 때만 권함 — 티오프<11시(2부부터는 출발만). 낮·야간은 숨김.
  const isMorningWake = shouldOfferWake(timeline);
  const departPast = isPast('depart');
  const wakePast = isPast('wake');
  // 시계앱 알람을 지금 걸어도 정확한지 — 기상시각이 24시간 이내(=라운드 전날/당일)일 때만. 그밖엔 오늘 잘못 울림.
  const wakeWithin24h = !!(timeline?.wake && timeline.wake.getTime() > now && timeline.wake.getTime() - now <= ONE_DAY_MS);
  // 등록한 기상 시각이 지금 역산 시각과 다르면(준비시간·도착여유·식사시각 변경 등) — 버튼을 '새로 등록'으로, 이전 시각 직접 삭제 안내.
  const sysAlarmCurWake = timeline?.wake ? fmtClock(timeline.wake) : null;
  const sysAlarmTimeChanged = sysAlarmDone && !!sysAlarmWake && !!sysAlarmCurWake && sysAlarmWake !== sysAlarmCurWake;

  useEffect(() => {
    if (visible) {
      setSaving(false);
      setDontAsk(!!userProfile.alarmPromptDisabled); // 현재 자동모드 상태를 체크박스에 반영 — 매번 언체크로 보여 '리셋됐나' 혼란 주던 것 해소
      setShowTimePicker(false);
      setMealTime(null);
      // 편집(기존 알람 있음)이면 그 값으로 프리필, 아니면 저장 기본값.
      const ex = (existing && Array.isArray(existing.types)) ? existing : null;
      const base = ex
        ? { d3: ex.types.includes('d3'), d1: ex.types.includes('d1'), teeoff: ex.types.includes('teeoff') }
        : (userProfile.alarmDefaults || ALARM_DEFAULTS_FALLBACK);
      setPicked({
        d3: !!base.d3 && !isPast('d3'),
        d1: !!base.d1 && !isPast('d1'),
        teeoff: !!base.teeoff && !isPast('teeoff'),
      });
      // 개인설정은 편집값 > 저장값(기억된 습관) > 기본
      setPrepMin(Number.isFinite(ex?.opts?.prepMin) ? ex.opts.prepMin : (Number.isFinite(userProfile.prepMin) ? userProfile.prepMin : DEFAULT_PREP));
      setArriveBufferMin(Number.isFinite(ex?.opts?.arriveBufferMin) ? ex.opts.arriveBufferMin : (Number.isFinite(userProfile.arriveBufferMin) ? userProfile.arriveBufferMin : DEFAULT_ARRIVE));
      // 스누즈도 편집값 > 저장값 > 기본(prep·arrive와 동일 우선순위 — 일정별 저장값이 프로필 기본에 덮이지 않게)
      setSnoozeCount(Number.isFinite(ex?.opts?.snoozeCount) ? ex.opts.snoozeCount : (Number.isFinite(userProfile.snoozeCount) ? userProfile.snoozeCount : 1));
      setSnoozeIntervalMin(Number.isFinite(ex?.opts?.snoozeIntervalMin) ? ex.opts.snoozeIntervalMin : (Number.isFinite(userProfile.snoozeIntervalMin) ? userProfile.snoozeIntervalMin : 10));
      setMealTime(ex?.opts?.arriveAt || null);
      setWakeOn(false);
      setDepartOn(false);
      setDriveMin(null);
      // 출발지 — 편집이면 저장한 선택(originKey) 복원, 없으면 부(部)별 기본(1부=집/2·3부=그외).
      //   ★저장값 우선 안 하면 오후티에서 홈으로 바꿔도 재진입 시 defaultOriginKey가 '그외'로 되돌림(사용자 2026-07-02).
      //   저장 좌표가 사라진 키(예: work 지웠는데 originKey='work')는 무효 처리해 기본으로 폴백.
      const savedOrigin = ex?.opts?.originKey;
      const originValid = savedOrigin === 'current'
        || (savedOrigin === 'home' && hasHome)
        || (savedOrigin === 'work' && hasWork);
      setOriginKey(originValid ? savedOrigin : defaultOriginKey(schedule, userProfile));
    }
  }, [visible, schedule]);

  // '내 폰 알람 등록함' 기록 로드 — 버튼이 '등록하기'(미등록) vs '등록함·다시 등록'(눌렀음)을 구분해 보이게.
  useEffect(() => {
    if (!visible || !schedule?.id) { setSysAlarmDone(false); setSysAlarmWake(null); return; }
    storage.load(STORAGE_KEYS.systemAlarmDone, {}).then(m => {
      const e = m && m[schedule.id];
      setSysAlarmDone(!!e);
      setSysAlarmWake((e && typeof e === 'object') ? (e.wake || null) : null); // 옛 형식(millis 숫자)은 시각 정보 없음
    }).catch(() => {});
  }, [visible, schedule]);

  // 출발지(originKey)별 이동시간 조회 — 출발지 바뀌면 재계산. 'current'는 GPS 1회(미리 예약이라 지금 위치 기준).
  useEffect(() => {
    // 저장 출발지(집·회사) 없으면 '골프 가는 길' 카드·토글이 숨겨지므로(아래 안내박스만) 이동시간 조회·자동 ON을 하지 않음.
    //   안 그러면 토글이 안 보이는데도 GPS로 driveMin이 채워져 출발/기상 알람이 조용히 예약됨([[smart-preround-timing-plan]]).
    if (!visible || !schedule || !hasAnyOrigin) return;
    let alive = true;
    setDriveMin(null);
    (async () => {
      let coord = null;
      if (originKey === 'work') coord = hasWork ? workCoord : null;
      else if (originKey === 'current') {
        const loc = await getCurrentLocation();
        if (loc) coord = { x: loc.lng, y: loc.lat };
      } else coord = hasHome ? homeCoord : null; // home
      if (!coord) { if (alive) setDriveLoading(false); return; }
      if (alive) setDriveLoading(true);
      try {
        // 도착 목표(만남시각 or 티오프−도착여유)에 '도착' 기준으로 미래 교통 예측 — 라운드 당일 그 시간대 교통으로 정확.
        const tgt = computeRoundTimeline(schedule, { arriveBufferMin, arriveAt: mealTime });
        const m = await getScheduleDriveMin(schedule, coord, { arrivalAt: tgt?.arrive || null });
        if (alive && Number.isFinite(m)) setDriveMin(m);
      } catch {}
      if (alive) setDriveLoading(false);
    })();
    return () => { alive = false; };
  }, [visible, schedule, originKey, mealTime]); // mealTime(만남시각) 바뀌면 그 시각 기준으로 재예측

  // 이동시간 확보 시 동적 알람 ON — 편집이면 기존 설정대로, 아니면 기본(출발 항상·기상 새벽만)
  useEffect(() => {
    if (driveMin == null) return;
    const ex = (existing && Array.isArray(existing.types)) ? existing : null;
    if (ex) {
      setDepartOn(ex.types.includes('depart') && !departPast);
      // ★isMorningWake 가드 — 아침티로 기상을 켜둔 일정의 티오프를 오후로 바꾸면 ex.types에 'wake'가 남아
      //   오후티인데 기상이 유지되던 버그 방지(사용자 2026-07-01). 오후티(11시~)면 강제로 꺼짐.
      setWakeOn(ex.types.includes('wake') && !wakePast && isMorningWake);
    } else {
      setDepartOn(!departPast);
      setWakeOn(isMorningWake && !wakePast);
    }
  }, [driveMin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!schedule) return null;

  // 개인설정 변경 시 프로필에 저장 — 다음 라운드부터 자동 적용(습관 기억)
  const persistProfile = (patch) => {
    const updated = { ...userProfile, ...patch };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
  };
  const pickPrep = (m) => { setPrepMin(m); persistProfile({ prepMin: m }); };
  const pickArrive = (m) => { setArriveBufferMin(m); persistProfile({ arriveBufferMin: m }); };

  // 시간 피커 기본값 — 이미 정했으면 그 시각, 아니면 티오프 1시간 전
  const pickerValue = (() => {
    const [y, m, d] = String(schedule.date || '').split('.').map(Number);
    if (mealTime && /^\d{1,2}:\d{2}$/.test(mealTime)) {
      const [hh, mm] = mealTime.split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0);
    }
    if (baseTl?.teeoff) return new Date(baseTl.teeoff.getTime() - 60 * 60000);
    return new Date(y || 2026, (m || 1) - 1, d || 1, 7, 0, 0, 0);
  })();
  // SpinnerPicker가 닫기(onClose)를 따로 처리 — 여기선 고른 값만 반영(iOS는 스크롤마다 호출되며 마지막 값 유지).
  const onPickTime = (date) => {
    if (!date) return;
    if (isAtOrAfterTee(date.getHours(), date.getMinutes(), schedule.time)) {
      setMealErr(`티오프(${schedule.time}) 전 시각을 골라주세요`); // 인라인 경고 — 고르는 즉시
      return;
    }
    setMealErr('');
    setMealTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
  };

  const pickSnoozeCount = (n) => { setSnoozeCount(n); persistProfile({ snoozeCount: n }); };
  const pickSnoozeInterval = (m) => { setSnoozeIntervalMin(m); persistProfile({ snoozeIntervalMin: m }); };

  // '내 폰 알람 등록 눌렀음'을 일정별 기록 — 버튼이 '등록함'으로 바뀌게(OS 등록여부 조회 불가, '눌렀음'만 기록).
  const markSystemAlarmDone = async () => {
    const w = timeline?.wake ? fmtClock(timeline.wake) : null; // 등록한 기상 시각 기록 — 시각 바뀐 채 재등록 시 이전 시각 삭제 안내용
    try {
      const m = await storage.load(STORAGE_KEYS.systemAlarmDone, {});
      m[schedule.id] = { at: Date.now(), wake: w };
      await storage.save(STORAGE_KEYS.systemAlarmDone, m);
    } catch {}
    setSysAlarmDone(true);
    setSysAlarmWake(w);
  };

  // 안드 폰 알람에 기상 알람 등록 — 무음 뚫고 울리게(자체 알림 보완).
  //   1개: 폰 알람 앱 열려 미리 채워짐(투명). 2~3개: 못 들을까 봐 간격으로 연속 등록(조용히 일괄 + 우리 알림).
  const addWakeToClock = async () => {
    if (!timeline?.wake) return;
    const base = timeline.wake.getTime();
    // 24h 안전망 — 버튼을 비활성으로 막아도, 시각이 24시간 밖이면 등록 자체를 거부(오늘 잘못 울림 방지).
    const okTime = (ms) => ms > Date.now() && ms - Date.now() <= ONE_DAY_MS;
    if (!okTime(base)) {
      showAppAlert('아직 등록할 수 없어요', '내 폰 알람은 날짜를 지정할 수 없어, 지금 걸면 라운드 당일이 아니라 오늘 울려요.\n라운드 전날 이 화면을 다시 열어 등록해주세요.');
      return;
    }
    if (snoozeCount <= 1) {
      const ok = await setSystemAlarm({ hour: timeline.wake.getHours(), minute: timeline.wake.getMinutes(), message: `${schedule.course} 기상` });
      if (!ok) showAppAlert('내 폰 알람을 열 수 없어요', '폰에 기본 알람(시계) 기능이 없거나 알람 추가를 지원하지 않을 수 있어요.');
      else markSystemAlarmDone();
      return;
    }
    let added = 0;
    for (let i = 0; i < snoozeCount; i++) {
      const t = new Date(base + i * snoozeIntervalMin * 60000);
      if (!okTime(t.getTime())) continue; // 24h 넘는 반복분은 건너뜀(그것만 오늘 잘못 울리는 것 방지)
      const ok = await setSystemAlarm({ hour: t.getHours(), minute: t.getMinutes(), message: `${schedule.course} 기상${i > 0 ? ` (+${i * snoozeIntervalMin}분)` : ''}`, skipUi: true });
      if (ok) added++;
    }
    if (added) { showAppAlert('내 폰 알람에 등록했어요', `기상 알람 ${added}개를 ${snoozeIntervalMin}분 간격으로 추가했어요.\n무음·방해금지에도 울려요. 폰 알람에서 확인하세요.`); markSystemAlarmDone(); }
    else showAppAlert('내 폰 알람을 열 수 없어요', '폰이 알람 추가를 지원하지 않을 수 있어요.');
  };

  const anyPicked = ALARM_TYPES.some(t => picked[t]) || (departOn && !departPast) || (wakeOn && !wakePast && isMorningWake);

  // 닫을 때 '다음부터 이대로 자동'이 켜져 있으면 — 지금 화면 설정 그대로 기본값에 저장(이후 팝업 없이 그대로 적용).
  //   ★끈 항목(예: D-3 해제)도 그대로 반영되게 picked·wake·depart를 alarmDefaults에 저장.
  const close = () => {
    // 체크 상태를 자동모드(alarmPromptDisabled)에 그대로 반영 — 켜면 자동(현재 화면 설정 저장), 끄면 다음부터 다시 매번 묻기.
    //   끈 항목(예: D-3 해제)도 그대로 반영되게 picked·wake·depart를 alarmDefaults에 저장.
    // ★functional setState — persistProfile(exactAlarmGuided 등)로 막 갱신된 최신값을 stale 캡처로 덮어,
    //   '정확알람 1회 안내'(exactAlarmGuided)가 매번 다시 뜨던 버그 방지. prev 기준으로 머지·저장.
    setUserProfile(prev => {
      const updated = {
        ...prev,
        alarmPromptDisabled: dontAsk,
        ...(dontAsk ? {
          alarmDefaults: { d3: !!picked.d3, d1: !!picked.d1, teeoff: !!picked.teeoff, wake: wakeOn, depart: departOn },
          prepMin, arriveBufferMin,
        } : {}),
      };
      storage.save(STORAGE_KEYS.profile, updated);
      return updated;
    });
    onClose && onClose();
  };

  const handleConfirm = async () => {
    if (saving) return;
    if (!anyPicked) { close(); return; }
    setSaving(true);
    const granted = await requestNotificationPermission();
    if (!granted) {
      setSaving(false);
      showAppAlert(
        '알림 권한이 필요해요',
        '라운딩 알람을 받으려면 알림 권한을 허용해주세요.',
        [
          { text: '나중에', style: 'cancel', onPress: () => close() },
          { text: '설정 열기', onPress: () => { Linking.openSettings(); close(); } },
        ],
      );
      return;
    }
    const types = ALARM_TYPES.filter(t => picked[t]);
    if (departOn && !departPast) types.push('depart');
    if (wakeOn && !wakePast && isMorningWake) types.push('wake'); // 오후티(11시~)면 기상 저장 안 함(이중 방어)
    // 동적 알람(기상·출발) 켜졌거나 '만남 시각'을 정했으면 — 역산 근거(이동시간·개인설정·식사시각)+스누즈를 저장.
    //   ★mealTime도 조건에 포함 — 안 그러면 식사시각만 정하고 출발/기상 알람을 안 켠 경우 arriveAt이 저장 안 돼 다시 열면 초기화됨.
    const opts = (departOn || wakeOn || mealTime)
      ? { driveMin, prepMin, arriveBufferMin, arriveAt: mealTime, snoozeCount, snoozeIntervalMin, originKey }
      : undefined;
    await scheduleRoundAlarms(schedule, types, opts);
    setSaving(false);

    // 안드 14+ — 정확한 기상·출발 시각엔 '알람 및 리마인더(정확한 알람)' 권한이 필요.
    //   미허용 시 expo-notifications가 부정확 알람으로 폴백해 몇 분 늦게 옴(분 단위가 중요한 기상·출발에만 안내).
    //   상태 조회 API가 없어 한 번만 안내(exactAlarmGuided 플래그). 닫기는 안내 응답 후에 — 모달이 먼저 닫히면 알럿이 사라짐.
    const needExactGuide = Platform.OS === 'android' && Number(Platform.Version) >= 34
      && (wakeOn || departOn) && !userProfile.exactAlarmGuided;
    if (needExactGuide) {
      persistProfile({ exactAlarmGuided: true });
      showAppAlert(
        '정확한 알람을 위해 한 가지만',
        '안드로이드 14부터는 앱이 정확한 시각에 깨우려면 "알람 및 리마인더" 권한이 필요해요.\n켜두면 기상·출발 알람이 분 단위로 정확히 울려요.',
        [
          { text: '나중에', style: 'cancel', onPress: () => close() },
          { text: '설정 열기', onPress: () => { openExactAlarmSettings(); close(); } },
        ],
      );
      return;
    }
    close();
  };

  // 헬퍼(Chip·SectionTitle·TimeRow·ToggleRow)·cardStyle는 모듈 상단으로 이동 — 컴포넌트 안에 두면
  //   매 렌더마다 새 함수로 재생성돼 칩/토글 탭 때 전체 remount(렉) 유발. 모듈 상수라 리렌더 영향 없음.

  // transparent 모달 + useSafeAreaInsets 수동 적용(ScheduleModal과 동일, 검증된 매끄러운 패턴).
  //   presentationStyle="fullScreen"은 iOS에서 inset이 0이 되고(상단 노치 밑으로 안 내려감),
  //   중첩 SafeAreaProvider는 열릴 때 레이아웃 패스가 더 생겨 덜컹댐 → 둘 다 피함.
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top }}>
        <TripleStripe />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 헤더 */}
          <View style={{ marginBottom: 8 }}><Icon name="bell" size={fs(30)} color={C.burgundy} /></View>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal }}>라운딩 알람</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 6 }}>
            출발지만 정하면 기상·출발 시각을 자동으로 계산해 알려드려요.
          </Text>

          {/* 일정 요약 */}
          <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 14, padding: 16, marginTop: 18 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: C.charcoal }} numberOfLines={1}>{schedule.course}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 5 }}>
              {schedule.date} {schedule.day} · {schedule.time}
            </Text>
          </View>

          {/* ── 골프 가는 길 ── */}
          {hasAnyOrigin ? (
            <View style={cardStyle}>
              <SectionTitle>골프 가는 길</SectionTitle>

              {/* 출발지 — 부별 기본, 탭해서 변경 */}
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, marginBottom: 6 }}>어디서 출발해요?</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  hasHome && { key: 'home', icon: 'home', label: '집', size: fs(18) },
                  hasWork && { key: 'work', icon: 'building', label: '그 외 출발지', size: fs(12) },
                  { key: 'current', icon: 'pin', label: '현재위치', size: fs(18) },
                ].filter(Boolean).map(o => {
                  const on = originKey === o.key;
                  return (
                    <TouchableOpacity key={o.key} activeOpacity={0.8} onPress={() => setOriginKey(o.key)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgPrimary }}>
                      <Icon name={o.icon} size={o.size} color={on ? C.burgundy : C.warmGray} />
                      <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(11), color: on ? C.burgundy : C.warmGray }}>{o.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {originKey === 'current' && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginTop: 5 }}>지금 위치 기준으로 계산해요</Text>
              )}

              {/* 라운드 전 식사·모임 시각 — 있으면 그 시각이 도착 목표(출발·기상이 그 기준으로 당겨짐) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="bowl" size={fs(16)} color={C.charcoal} />
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>라운드 전 식사·모임</Text>
                  </View>
                  {/* 시각은 오른쪽 버튼에 이미 보이므로 부제는 반복 없이 짧게(좁은 칸에서 두 줄 접힘 방지) */}
                  <Text style={{ fontFamily: mealTime ? F.sysSb : F.sys, fontSize: fs(11), color: mealTime ? C.burgundy : C.warmGray, marginTop: 2 }}>
                    {mealTime ? '이번 라운드만 적용돼요' : '먼저 만나면 그 시각 기준으로 계산'}
                  </Text>
                </View>
                {mealTime ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity onPress={() => setShowTimePicker(true)} activeOpacity={0.8}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, backgroundColor: C.burgundy }}>
                      <Icon name="pen" size={fs(12)} color={C.butter} />
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>{fmtKorTime(mealTime)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setMealTime(null); setMealErr(''); }} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>해제</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setShowTimePicker(true)} activeOpacity={0.8}
                    style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.burgundy }}>시각 설정</Text>
                  </TouchableOpacity>
                )}
              </View>
              {!!mealErr && (
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: C.burgundy, marginTop: 6 }}>⚠ {mealErr}</Text>
              )}
              <SpinnerPicker visible={showTimePicker} value={pickerValue} mode="time" is24Hour
                onPick={onPickTime} onClose={() => setShowTimePicker(false)} />

              {/* 역산 타임라인 + 조정 */}
              {driveLoading && !timeline?.depart ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 16 }}>이동시간 계산 중…</Text>
              ) : timeline?.depart ? (
                <>
                  <View style={{ backgroundColor: '#F5F0E4', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: C.burgundy, paddingVertical: 12, paddingHorizontal: 14, marginTop: 16 }}>
                    {isMorningWake && <TimeRow name="bell" label="기상" time={fmtClock(timeline.wake)} />}
                    <TimeRow name="car" label="출발" time={fmtClock(timeline.depart)} />
                    {mealTime && <TimeRow name="bowl" label="모임" time={mealTime} />}
                    {/* 티오프 = 모든 시각의 기준점(앵커) — 구분선으로 떼어내고 강조 */}
                    <View style={{ height: 1, backgroundColor: C.hairline, marginVertical: 7 }} />
                    <TimeRow name="flag" label="티오프" time={fmtClock(timeline.teeoff)} accent />
                    {/* 구장 소요시간 — 역산에 쓰인 이동시간(driveMin)을 그대로 노출(출발지→구장, 차로). 커스텀 car 아이콘(세이지) */}
                    {driveMin != null && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7, marginLeft: 2 }}>
                        <Icon name="car" size={fs(20)} color="#5E7E42" strokeWidth={2.3} />
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray }}>
                          구장까지 차로 약 {driveMin >= 60 ? `${Math.floor(driveMin / 60)}시간${driveMin % 60 ? ` ${driveMin % 60}분` : ''}` : `${driveMin}분`}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 준비시간 칩 — 기상 알림이 의미있는 새벽 티에만 */}
                  {isMorningWake && (
                    <>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal, marginTop: 14 }}>
                        집에서 나갈 준비 시간 <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray }}>(세면·화장·짐 챙기기)</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        {PREP_OPTS.map(m => <Chip key={m} label={`${m}분`} on={prepMin === m} onPress={() => pickPrep(m)} />)}
                      </View>
                    </>
                  )}

                  {/* 도착여유 칩 — 식사·모임 시각을 정하면 그게 도착 목표라 숨김 */}
                  {!mealTime && (
                    <>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.charcoal, marginTop: 14 }}>
                        구장 도착여유 <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray }}>(티오프 전)</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        {ARRIVE_OPTS.map(m => <Chip key={m} label={arriveLabel(m)} on={arriveBufferMin === m} onPress={() => pickArrive(m)} />)}
                      </View>
                    </>
                  )}

                  {/* 출발 알림 */}
                  <ToggleRow on={departOn} past={departPast} onToggle={() => setDepartOn(v => !v)}
                    iconName="car" title="출발 알림"
                    sub={departPast ? `${fmtClock(timeline.depart)} · 이미 지난 시각` : `${fmtClock(timeline.depart)}에 알려드려요`} />

                  {/* 기상 알림 — 새벽 티에만 */}
                  {isMorningWake && (
                    <>
                      <ToggleRow on={wakeOn} past={wakePast} onToggle={() => setWakeOn(v => !v)}
                        iconName="bell" title="기상 알림"
                        sub={wakePast ? `${fmtClock(timeline.wake)} · 이미 지난 시각` : `${fmtClock(timeline.wake)}에 깨워드려요`} />

                      {/* 기상 반복(스누즈) — 못 들을까 봐 '정한 시각에 한 번' vs '10분 후 한두 번 더'.
                          인앱 알림에 바로 적용(빌드 불필요). 시계앱 진짜 알람(무음 뚫고)은 안드 네이티브 빌드에서만 추가 노출. */}
                      {wakeOn && !wakePast && (
                        <View style={{ marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgPrimary }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Icon name="bell" size={fs(16)} color={C.charcoal} />
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>기상 알림 반복</Text>
                          </View>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.textSecondary, marginTop: 2 }}>
                            {snoozeCount > 1
                              ? `${fmtClock(timeline.wake)}부터 ${snoozeIntervalMin}분 간격으로 ${snoozeCount}번 울려요`
                              : `${fmtClock(timeline.wake)}에 한 번만 울려요`}
                          </Text>

                          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, marginTop: 10 }}>몇 번 깨울까요?</Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                            {[1, 2, 3].map(n => <Chip key={n} label={n === 1 ? '한 번만' : `${n}번`} on={snoozeCount === n} onPress={() => pickSnoozeCount(n)} />)}
                          </View>
                          {snoozeCount > 1 && (
                            <>
                              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, marginTop: 10 }}>간격</Text>
                              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                                {[5, 10, 15].map(m => <Chip key={m} label={`${m}분`} on={snoozeIntervalMin === m} onPress={() => pickSnoozeInterval(m)} />)}
                              </View>
                            </>
                          )}

                          {/* 시계앱 진짜 알람(무음·방해금지에도 울림) — 안드 네이티브 빌드에서만.
                              ★단, 시계앱은 날짜를 못 넣어 '가장 가까운 그 시각'에 울림 → 24h 밖이면 지금 걸면 오늘 잘못 울림.
                                그래서 24h 이내(전날/당일)에만 버튼 활성, 멀면 비활성 + '전날 등록' 안내. */}
                          {SYSTEM_ALARM_SUPPORTED && (
                            wakeWithin24h ? (
                              <>
                                {/* 3상태 — 미등록=버건디 CTA(벨+'등록하기') / 등록함·시각동일=회색('✓ 등록함·다시 등록') / 시각변경=버건디('새로 등록하기')+이전시각 삭제안내. */}
                                {(() => {
                                  const isAction = !sysAlarmDone || sysAlarmTimeChanged; // 버건디(누를 일 있음) vs 회색(이미 그 시각 등록됨)
                                  return (
                                    <TouchableOpacity activeOpacity={0.85} onPress={addWakeToClock}
                                      style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 10,
                                        backgroundColor: isAction ? C.burgundy : C.bgSecondary, borderWidth: isAction ? 0 : 1, borderColor: C.burgundy }}>
                                      {isAction && <Icon name="bell" size={fs(15)} color={C.butter} />}
                                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: isAction ? C.butter : C.burgundy }}>
                                        {!sysAlarmDone
                                          ? (snoozeCount > 1 ? `내 폰 알람에 ${snoozeCount}개 등록하기` : '내 폰 알람에 등록하기')
                                          : (sysAlarmTimeChanged ? '시간이 바뀌었어요 · 새로 등록하기' : '✓ 내 폰 알람에 등록함 · 다시 등록')}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })()}
                                <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: sysAlarmTimeChanged ? C.burgundy : C.warmGray, textAlign: 'center', marginTop: 5, lineHeight: 15 }}>
                                  {!sysAlarmDone
                                    ? '탭하면 폰 기본 알람에 추가돼\n무음·방해금지에도 울려요'
                                    : (sysAlarmTimeChanged
                                        ? `시각이 바뀌었어요 — 새로 등록하고,\n이전 ${sysAlarmWake} 알람은 폰 알람 앱에서 지워주세요`
                                        : '내 폰 기본 알람에 등록됐어요 · 무음에도 울려요\n수정·삭제는 폰 알람 앱에서 할 수 있어요')}
                                </Text>
                              </>
                            ) : (
                              <View style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Icon name="bell" size={fs(15)} color={C.charcoal} />
                                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>내 폰 알람은 라운드 전날 등록할 수 있어요</Text>
                                </View>
                                <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.textSecondary, marginTop: 4, lineHeight: 16 }}>
                                  지금 걸면 오늘 울려요. 인앱 기상 알림은 그날 정확히 울려요.
                                </Text>
                              </View>
                            )
                          )}

                          {/* iOS — 시계앱 강제알람 API가 없어 로컬 알림(timeSensitive)으로 깨운다. 집중모드·방해금지는 뚫지만
                              물리 무음 스위치는 못 뚫음(애플 설계) → 기상 놓침 방지 위해 무음 끄기 안내. (안드는 위 시계앱 알람이 무음도 뚫음) */}
                          {!SYSTEM_ALARM_SUPPORTED && (
                            <View style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Icon name="bell" size={fs(15)} color={C.charcoal} />
                                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>무음 스위치를 꺼두면 확실해요</Text>
                              </View>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.textSecondary, marginTop: 4, lineHeight: 16 }}>
                                아이폰은 옆면 무음 스위치가 켜져 있으면 기상 알림 소리가 안 나요. 집중모드·방해금지는 뚫지만 무음 스위치는 못 뚫어요.
                              </Text>
                              {/* iOS는 폰 알람 자동등록 API가 막혀 안내만 — '시계앱' 대신 '내 폰 알람'(안드 버튼과 동일 표현, 사용자 혼동 방지) */}
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: C.charcoal, marginTop: 8, lineHeight: 16 }}>
                                ⏰ 내 폰 알람에도 {sysAlarmCurWake ? `${sysAlarmCurWake}로 ` : ''}맞춰두세요.
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </>
              ) : (
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 14, lineHeight: 19 }}>
                  구장 위치를 못 찾아 이동시간을 계산할 수 없어요. 일정의 구장명을 확인해주세요.
                </Text>
              )}
            </View>
          ) : (
            <View style={{ backgroundColor: '#FBF6EE', borderWidth: 0.5, borderColor: C.hairline, borderRadius: 14, padding: 16, marginTop: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="car" size={fs(16)} color={C.charcoal} />
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>출발·기상 알림</Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 7, lineHeight: 18 }}>
                마이페이지에서 자주 가는 출발지를 저장하면, 이동시간을 계산해 출발·기상 시각을 자동으로 알려드려요.
              </Text>
            </View>
          )}

          {/* ── 그 밖의 알림 ── */}
          <View style={cardStyle}>
          <SectionTitle>그 밖의 알림</SectionTitle>
          {ALARM_TYPES.map(t => {
            const def = ALARM_DEFS[t];
            const past = isPast(t);
            const on = picked[t];
            return (
              <TouchableOpacity key={t} activeOpacity={past ? 1 : 0.7} disabled={past}
                onPress={() => setPicked(p => ({ ...p, [t]: !p[t] }))}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgSecondary, opacity: past ? 0.45 : 1 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: on ? C.burgundy : C.warmGrayLight, backgroundColor: on ? C.burgundy : 'transparent' }}>
                  {on && <Text style={{ color: C.butter, fontSize: fs(13), fontWeight: '700' }}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{def.label}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{past ? '이미 지난 시점이에요' : def.title}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          </View>

          {/* 다음부터 안 물어보고 이대로 자동 — 잘 보이게 카드로 */}
          <TouchableOpacity activeOpacity={0.8} onPress={() => setDontAsk(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, padding: 14, borderRadius: 14,
              borderWidth: 1.5, borderColor: dontAsk ? C.burgundy : C.hairline, backgroundColor: dontAsk ? '#F5EAEC' : C.bgSecondary }}>
            <View style={{ width: 24, height: 24, borderRadius: 7, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: dontAsk ? C.burgundy : C.warmGrayLight, backgroundColor: dontAsk ? C.burgundy : 'transparent' }}>
              {dontAsk && <Text style={{ color: C.butter, fontSize: fs(14), fontWeight: '700' }}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep }}>다음부터 안 물어보고 이대로 자동</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>다음부턴 '미리 만나는 시각'만 그때그때 정하면 돼요. 출발지·준비시간 등은 정해둔 대로 (마이페이지에서 변경)</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* 하단 고정 버튼 — 홈 인디케이터/내비바 위로(insets.bottom) */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 22, paddingTop: 10, paddingBottom: insets.bottom + 8, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
          <TouchableOpacity activeOpacity={0.8} onPress={close}
            style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>나중에</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} disabled={saving} onPress={handleConfirm}
            style={{ flex: 1.6, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: anyPicked ? C.burgundy : C.warmGrayLight }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter }}>
              {saving ? '설정 중…' : anyPicked ? '알람 설정' : '선택 안 함'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* 모달 내부 알럿 호스트 — 루트 호스트는 이 풀스크린 모달 뒤로 깔려 iOS에서 안 보임(권한 거부 안내 등). */}
      <AppAlertHost />
    </Modal>
  );
}

// '이대로 자동'(alarmPromptDisabled) 모드에서 일정 추가 시 뜨는 가벼운 프롬프트.
//   매 라운드 달라지는 '티오프 전 미리 만나는 시각'만 묻고, 나머지(출발지·준비·알람종류)는 저장설정대로 자동 적용.
//   onDone(arriveAt|null) — 부모가 applyDefaultAlarms(schedule, profile, { arriveAt })로 마무리.
export function QuickMealPrompt({ visible, schedule, onDone }) {
  const [mealTime, setMealTime] = useState(null); // 'HH:MM' | null
  const [mealErr, setMealErr] = useState('');     // 티오프 이후 경고(인라인)
  const [showPicker, setShowPicker] = useState(false);
  useEffect(() => { if (visible) { setMealTime(null); setMealErr(''); setShowPicker(false); } }, [visible]);
  if (!schedule) return null;

  const pickerValue = (() => {
    const [y, m, d] = String(schedule.date || '').split('.').map(Number);
    if (mealTime && /^\d{1,2}:\d{2}$/.test(mealTime)) {
      const [hh, mm] = mealTime.split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0);
    }
    // 기본값 = 티오프 1시간 전(식사·모임은 티오프 전이므로). 티오프 그 자체를 기본으로 두면 무심코 '티오프 이후'가 됨.
    const [th, tm] = String(schedule.time || '08:00').split(':').map(Number);
    const tee = new Date(y || 2026, (m || 1) - 1, d || 1, Number.isFinite(th) ? th : 8, tm || 0, 0, 0);
    return new Date(tee.getTime() - 60 * 60000);
  })();
  const onPick = (date) => {
    if (!date) return;
    if (isAtOrAfterTee(date.getHours(), date.getMinutes(), schedule.time)) {
      setMealErr(`티오프(${schedule.time}) 전 시각을 골라주세요`);
      return;
    }
    setMealErr('');
    setMealTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onDone(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
        <View style={{ width: '100%', maxWidth: 370, backgroundColor: C.bgPrimary, borderRadius: 22, padding: 24 }}>
          {/* 제목 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="bowl" size={fs(24)} color={C.burgundy} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoalDeep }}>라운드 전 미리 만나요?</Text>
          </View>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.textSecondary, lineHeight: 21, marginTop: 8 }}>
            먼저 만나 식사·모임하면 그 시각 기준으로{'\n'}출발·기상 알람을 계산해요.
          </Text>

          {/* 일정 요약 */}
          <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 14, padding: 15, marginTop: 16 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }} numberOfLines={1}>{schedule.course}</Text>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray, marginTop: 5 }}>{schedule.date} {schedule.day} · {schedule.time}</Text>
          </View>

          {/* 시각 선택 — 크게 */}
          <TouchableOpacity onPress={() => setShowPicker(true)} activeOpacity={0.8}
            style={{ marginTop: 16, paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1.5,
              borderColor: mealTime ? C.burgundy : C.hairline, backgroundColor: mealTime ? '#F5EAEC' : C.bgSecondary }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: mealTime ? C.burgundy : C.charcoal }}>
              {mealTime ? `🕘 ${fmtKorTime(mealTime)} 만남` : '🕘 미리 만나는 시각 선택'}
            </Text>
          </TouchableOpacity>
          <SpinnerPicker visible={showPicker} value={pickerValue} mode="time" is24Hour
            onPick={onPick} onClose={() => setShowPicker(false)} />
          {!!mealErr && (
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: C.burgundy, marginTop: 8, textAlign: 'center' }}>⚠ {mealErr}</Text>
          )}

          {/* 건너뛰기 안내 — 버튼 바로 위 */}
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18, marginTop: 14, textAlign: 'center' }}>
            안 만나면 건너뛰기 — 출발·기상은{'\n'}저장한 설정대로 자동 적용돼요
          </Text>

          {/* 버튼 — 크게 */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => onDone(null)}
              style={{ flex: 1, paddingVertical: 15, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.warmGray }}>건너뛰기</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} onPress={() => onDone(mealTime)}
              style={{ flex: 1.5, paddingVertical: 15, borderRadius: 14, alignItems: 'center', backgroundColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.butter }}>적용</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
