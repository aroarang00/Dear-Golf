import React, { useState, useEffect, useCallback } from 'react';
import { authReady } from '../utils/firebase';
import { loadMySchedules, createSchedule, updateSchedule, deleteSchedule } from '../utils/schedule';
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

  useEffect(() => {
    (async () => {
      try {
        await authReady;
        const loaded = await loadMySchedules();
        setSchedulesRaw(normalizeSchedules(loaded));
      } catch (e) {
        console.warn('[SchedulesContext] Firestore 로드 실패', e?.message);
        setSchedulesRaw([]);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const addSchedule = useCallback(async (data) => {
    const created = await createSchedule(data);
    setSchedulesRaw(prev => normalizeSchedules([...prev, created]));
    return created;
  }, []);

  const editSchedule = useCallback(async (id, patch) => {
    await updateSchedule(id, patch);
    setSchedulesRaw(prev => normalizeSchedules(prev.map(s => s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeSchedule = useCallback(async (id) => {
    await deleteSchedule(id);
    setSchedulesRaw(prev => prev.filter(s => s.id !== id));
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
