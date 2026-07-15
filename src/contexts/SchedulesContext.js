import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { auth } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { loadMySchedules, createSchedule, updateSchedule, deleteSchedule, setScheduleDoc } from '../utils/schedule';
import { syncRoundToCalendar, removeRoundFromCalendar } from '../utils/deviceCalendar';
import { cancelRoundAlarms, reconcileAlarms } from '../utils/notifications';
import { normalizeSchedules } from '../utils/helpers';

// 라운딩 예정 일정 — Firestore schedules/{scheduleId} 단일 소스.
// 2026-05-29: AsyncStorage(@dg_schedules) → Firestore 마이그레이션.
// 옛 데이터는 [[data-migration]] 정책에 따라 폐기 — 새로 시작.
//
// 사용처는 setSchedules 대신 addSchedule/editSchedule/removeSchedule을 호출해야 Firestore에 저장됨.
// 옛 호출처 호환을 위해 setSchedules(compat)도 유지하나 Firestore 동기화 X.
export const SchedulesContext = React.createContext({
  schedules: [],
  hydrated: false,
  loadFailed: false,
  addSchedule: async () => {},
  editSchedule: async () => {},
  removeSchedule: async () => {},
  addSharedSchedule: async () => {},
  setSchedules: () => {},
});

export function SchedulesProvider({ children }) {
  const [schedules, setSchedulesRaw] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // edit 시 부분 patch만 와도 전체 일정으로 합쳐 캘린더를 갱신하기 위한 최신 스냅샷
  const schedulesRef = useRef([]);
  useEffect(() => { schedulesRef.current = schedules; }, [schedules]);

  // 초기 로드 + uid 변경 시 재로드 — 익명→카카오 settle 등 uid가 바뀌면 올바른 계정 일정으로 자동 갱신.
  //   기존엔 1회만 로드라 uid 확정 전 익명으로 로드되면 카카오 일정이 안 떴음([[auth-relink-and-seed-cleanup]]).
  //
  // ★로드 실패는 '자가복구'한다([[read-failure-disguise]], 테스터 2026-07-09 일정·친구·피드 동시 소실).
  //   ① 실패해도 기존 목록을 유지(빈 배열로 덮으면 '일정 없음'으로 위장) ② 백오프 재시도
  //   ③ 그래도 실패했으면 다음 포그라운드 복귀 때 한 번 더(성공 시엔 재로드 안 함 — 불필요한 read 0).
  useEffect(() => {
    let cancelled = false;
    let curUid = null;      // 현재 로드 대상 uid — 늦게 온 응답이 새 계정 데이터를 덮지 않게 하는 가드
    let retryTimer = null;
    let tries = 0;
    const failedRef = { current: false };
    const BACKOFF = [2000, 6000, 15000];

    const loadFor = async (uid) => {
      try {
        const loaded = await loadMySchedules();
        if (cancelled || uid !== curUid) return;  // uid가 바뀐 뒤 도착한 옛 응답 폐기
        const norm = normalizeSchedules(loaded);
        setSchedulesRaw(norm);
        setLoadFailed(false);
        failedRef.current = false;
        tries = 0;
        // 고아 알람 정리 — 이미 삭제됐는데 OS에 남은 예약 알림(D-3/D-1 등) 제거. 로드 성공 시에만(빈 로드로 오취소 방지).
        reconcileAlarms(norm.map(s => s.id));
      } catch (e) {
        if (cancelled || uid !== curUid) return;
        // 빈 배열로 덮지 않는다 — 서버 데이터는 멀쩡하고 표시만 무너지는 것(재로그인하면 복구되던 증상).
        console.warn('[SchedulesContext] Firestore 로드 실패 — 기존 일정 유지', e?.message);
        setLoadFailed(true);
        failedRef.current = true;
        if (tries < BACKOFF.length) {
          const delay = BACKOFF[tries++];
          if (retryTimer) clearTimeout(retryTimer); // 동시 loadFor(백오프+포그라운드 복귀 경합) 시 고아 타이머 방지
          retryTimer = setTimeout(() => { if (!cancelled && curUid) loadFor(curUid); }, delay);
        }
      } finally {
        if (!cancelled && uid === curUid) setHydrated(true);
      }
    };

    let prevRealUid = null; // 마지막 실(non-null) uid — 진짜 계정 전환과 세션 흔들림(A→null→A)을 구분
    const unsub = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid || null;
      if (uid === curUid) return;
      curUid = uid;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      tries = 0;
      failedRef.current = false;
      setLoadFailed(false);
      // 로그인 settle 전(null)·uid 전환 중엔 hydrated를 내려 로딩 유지 — 빈 데이터로 hydrate되며
      //   홈 '첫 라운딩' 등 빈 CTA가 깜빡이던 문제 방지([[home-empty-state-flash]], [[auth-relink-and-seed-cleanup]]).
      setHydrated(false);
      if (!uid) return;  // 아직 로그인 전 — 실제 uid 콜백을 기다림(앱은 항상 익명 폴백 로그인됨)
      // 진짜 계정 전환(다른 실uid) — 새 계정 첫 로드가 실패해도 이전 계정 일정이 남아 보이지 않게 즉시 비움.
      //   null 경유 재수신(세션 흔들림)은 전환이 아니므로 기존 데이터 유지(FriendsTab과 동일 정신).
      if (prevRealUid && prevRealUid !== uid) setSchedulesRaw([]);
      prevRealUid = uid;
      loadFor(uid);
    });

    // 포그라운드 복귀 — 직전 로드가 '실패'했을 때만 재시도(성공 상태면 read 낭비 없음)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && !cancelled && curUid && failedRef.current) { tries = 0; loadFor(curUid); }
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      sub.remove();
      unsub();
    };
  }, []);

  // 캘린더 동기화는 여기 한 곳에서만 — 모든 경로(홈·MY·라운지 모집확정/취소)가 add/edit/remove를 거치므로
  // 일정 캘린더가 항상 일관되게 따라온다. (멱등·다가오는 라운딩만, deviceCalendar 내부 처리)
  const addSchedule = useCallback(async (data) => {
    const created = await createSchedule(data);
    setSchedulesRaw(prev => normalizeSchedules([...prev, created]));
    syncRoundToCalendar(created);
    return created;
  }, []);

  const editSchedule = useCallback(async (id, patch) => {
    await updateSchedule(id, patch);
    setSchedulesRaw(prev => normalizeSchedules(prev.map(s => s.id === id ? { ...s, ...patch } : s)));
    const cur = schedulesRef.current.find(s => s.id === id);
    syncRoundToCalendar({ ...(cur || {}), ...patch, id }); // 부분 patch도 최신 스냅샷과 합쳐 갱신
  }, []);

  const removeSchedule = useCallback(async (id) => {
    // 낙관적 제거 — 서버 왕복을 기다리지 않고 카드를 즉시 지운다. 비낙관적(await 후 제거)이면
    //   네트워크 지연 동안 카드가 남아 있다가, 시트 닫힘 애니메이션과 리스트 변경이 겹쳐
    //   안드에서 삭제한 D-day 카드가 한 번 더 그려졌다 사라지는 잔상(깜빡임)이 났다(2026-06-28).
    const snapshot = schedulesRef.current;
    setSchedulesRaw(prev => prev.filter(s => s.id !== id));
    try {
      await deleteSchedule(id);
    } catch (e) {
      setSchedulesRaw(normalizeSchedules(snapshot)); // 실패 시 복원 — 서버가 최종 정합
      throw e;
    }
    removeRoundFromCalendar(id);
    cancelRoundAlarms(id); // 예약 알람도 중앙에서 취소 — 모든 삭제 경로가 remove를 거치므로 누락 없음(캘린더와 동일 패턴)
  }, []);

  // 일정 전파 수락 — 결정적 ID로 자기파생 일정 setDoc(멱등) + 로컬 즉시 반영 + 캘린더 동기화 ([[schedule-propagation-spec]]).
  //   createSchedule(addDoc 랜덤ID)와 달리 결정적 ID라야 중복 안 생김(재시도·재수락 멱등).
  const addSharedSchedule = useCallback(async (schedId, data) => {
    await setScheduleDoc(schedId, data);
    const sched = { id: schedId, ...data };
    setSchedulesRaw(prev => normalizeSchedules([...prev.filter(s => s.id !== schedId), sched]));
    syncRoundToCalendar(sched);
    return sched;
  }, []);

  // setSchedules는 호환용. 직접 호출 시 Firestore 동기화 X — 로컬 캐시만 변경됨.
  // 새 코드는 addSchedule/editSchedule/removeSchedule 사용. 옛 호출처는 점진적 마이그레이션 중.
  const setSchedulesCompat = useCallback((updater) => {
    if (__DEV__) {
      console.warn('[SchedulesContext] setSchedules는 deprecated — addSchedule/editSchedule/removeSchedule 사용. Firestore 동기화 안 됨.');
    }
    setSchedulesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return normalizeSchedules(next);
    });
  }, []);

  return (
    <SchedulesContext.Provider value={{
      schedules,
      hydrated,
      loadFailed,
      addSchedule,
      editSchedule,
      removeSchedule,
      addSharedSchedule,
      setSchedules: setSchedulesCompat,
    }}>
      {children}
    </SchedulesContext.Provider>
  );
}
