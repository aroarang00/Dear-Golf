import React, { useState, useEffect, useCallback } from 'react';
import { authReady } from '../utils/firebase';
import { loadMyRounds, createRound, updateRound, deleteRound } from '../utils/round';

// 라운딩 다이어리 — 다이어리 화면과 내 프로필 피드가 같은 데이터를 공유한다.
// 2026-05-27: AsyncStorage(@dg_diaries) → Firestore rounds/{roundId} 마이그레이션.
// 옛 데이터는 [[data-migration]] 정책에 따라 폐기 — 새로 시작.
export const DiariesContext = React.createContext({
  diaries: [],
  hydrated: false,
  addDiary: async () => {},
  editDiary: async () => {},
  removeDiary: async () => {},
  setDiaries: () => {},
});

export function DiariesProvider({ children }) {
  const [diaries, setDiaries] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // 초기 로드 — 익명 인증 후 Firestore에서 내 다이어리 가져옴
  useEffect(() => {
    (async () => {
      try {
        await authReady;
        const loaded = await loadMyRounds();
        setDiaries(loaded);
      } catch (e) {
        console.warn('[DiariesContext] Firestore 로드 실패', e?.message);
        setDiaries([]);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // ── Firestore 동기화 헬퍼 (신규 패턴) ─────────────────────
  // 사용처는 setDiaries 대신 아래 함수들을 사용해야 Firestore에 저장됨.

  const addDiary = useCallback(async (data) => {
    const created = await createRound(data);
    setDiaries(prev => [created, ...prev]);
    return created;
  }, []);

  const editDiary = useCallback(async (id, patch) => {
    await updateRound(id, patch);
    setDiaries(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }, []);

  const removeDiary = useCallback(async (id) => {
    await deleteRound(id);
    setDiaries(prev => prev.filter(d => d.id !== id));
  }, []);

  // setDiaries는 호환용. 직접 호출 시 Firestore 동기화 X — 로컬 캐시만 변경됨.
  // 새 코드는 addDiary/editDiary/removeDiary 사용. 옛 호출처는 점진적 마이그레이션 중.
  const setDiariesCompat = useCallback((next) => {
    if (__DEV__) {
      console.warn('[DiariesContext] setDiaries는 deprecated — addDiary/editDiary/removeDiary 사용. Firestore 동기화 안 됨.');
    }
    setDiaries(next);
  }, []);

  return (
    <DiariesContext.Provider value={{
      diaries,
      hydrated,
      addDiary,
      editDiary,
      removeDiary,
      setDiaries: setDiariesCompat,
    }}>
      {children}
    </DiariesContext.Provider>
  );
}
