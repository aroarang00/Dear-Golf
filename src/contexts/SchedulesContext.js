import React, { useState, useEffect, useCallback } from 'react';
import { SCHEDULES_INIT } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { normalizeSchedules } from '../utils/helpers';

export const SchedulesContext = React.createContext({
  schedules: SCHEDULES_INIT,
  setSchedules: () => {},
  hydrated: false,
});

export function SchedulesProvider({ children }) {
  const [schedules, setSchedulesRaw] = useState(SCHEDULES_INIT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.schedules, SCHEDULES_INIT);
      setSchedulesRaw(normalizeSchedules(loaded));
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    storage.save(STORAGE_KEYS.schedules, schedules);
  }, [schedules, hydrated]);

  const setSchedules = useCallback((updater) => {
    setSchedulesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return normalizeSchedules(next);
    });
  }, []);

  return (
    <SchedulesContext.Provider value={{ schedules, setSchedules, hydrated }}>
      {children}
    </SchedulesContext.Provider>
  );
}
