import React, { useState, useEffect } from 'react';
import { DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';

// 라운딩 다이어리 — 다이어리 화면과 내 프로필 피드가 같은 데이터를 공유한다.
export const DiariesContext = React.createContext({
  diaries: DIARY_DATA,
  setDiaries: () => {},
  hydrated: false,
});

export function DiariesProvider({ children }) {
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.diaries, DIARY_DATA);
      setDiaries(loaded);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    storage.save(STORAGE_KEYS.diaries, diaries);
  }, [diaries, hydrated]);

  return (
    <DiariesContext.Provider value={{ diaries, setDiaries, hydrated }}>
      {children}
    </DiariesContext.Provider>
  );
}
