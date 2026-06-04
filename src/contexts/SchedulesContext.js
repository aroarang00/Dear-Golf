import React, { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { loadMySchedules, createSchedule, updateSchedule, deleteSchedule } from '../utils/schedule';
import { syncRoundToCalendar, removeRoundFromCalendar } from '../utils/deviceCalendar';
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
  addSchedule: async () => {},
  editSchedule: async () => {},
  removeSchedule: async () => {},
  setSchedules: () => {},
});

export function SchedulesProvider({ children }) {
  const [schedules, setSchedulesRaw] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  // edit 시 부분 patch만 와도 전체 일정으로 합쳐 캘린더를 갱신하기 위한 최신 스냅샷
  const schedulesRef = useRef([]);
  useEffect(() => { schedulesRef.current = schedules; }, [schedules]);

  // 초기 로드 + uid 변경 시 재로드 — 익명→카카오 settle 등 uid가 바뀌면 올바른 계정 일정으로 자동 갱신.
  //   기존엔 1회만 로드라 uid 확정 전 익명으로 로드되면 카카오 일정이 안 떴음([[auth-relink-and-seed-cleanup]]).
  useEffect(() => {
    let prevUid;
    const unsub = onAuthStateChanged(auth, async (user) => {
      const uid = user?.uid || null;
      if (uid === prevUid) return;
      prevUid = uid;
      try {
        const loaded = await loadMySchedules();
        setSchedulesRaw(normalizeSchedules(loaded));
      } catch (e) {
        console.warn('[SchedulesContext] Firestore 로드 실패', e?.message);
        setSchedulesRaw([]);
      } finally {
        setHydrated(true);
      }
    });
    return unsub;
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
    await deleteSchedule(id);
    setSchedulesRaw(prev => prev.filter(s => s.id !== id));
    removeRoundFromCalendar(id);
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
      addSchedule,
      editSchedule,
      removeSchedule,
      setSchedules: setSchedulesCompat,
    }}>
      {children}
    </SchedulesContext.Provider>
  );
}
