import React, { useState, useEffect, useCallback } from 'react';
import { auth } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
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
  reloadDiaries: async () => {},
  setDiaries: () => {},
});

export function DiariesProvider({ children }) {
  const [diaries, setDiaries] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  // 초기 로드 + uid 변경 시 재로드 — 익명→카카오 settle 등 uid가 바뀌면 올바른 계정 데이터로 자동 갱신.
  //   기존엔 시작 시 1회만 로드라, uid 확정 전 익명으로 로드되면 카카오 데이터가 안 떴음([[auth-relink-and-seed-cleanup]]).
  useEffect(() => {
    let prevUid; // 같은 uid 중복 로드 방지
    const unsub = onAuthStateChanged(auth, async (user) => {
      const uid = user?.uid || null;
      if (uid === prevUid) return;
      prevUid = uid;
      // 로그인 settle 전(null)·uid 전환 중엔 hydrated를 내려 로딩 유지 — 빈 데이터로 hydrate되며
      //   MY '첫 기록 남기기'(신규가입 안내)가 깜빡이던 문제 방지([[home-empty-state-flash]], [[auth-relink-and-seed-cleanup]]).
      //   세션 복원은 비동기라 첫 콜백이 null로 한 번 오고, 익명→카카오 settle 시 uid가 바뀜.
      setHydrated(false);
      if (!uid) return;  // 아직 로그인 전 — 실제 uid 콜백을 기다림(앱은 항상 익명 폴백 로그인됨)
      try {
        const loaded = await loadMyRounds();
        setDiaries(loaded);
      } catch (e) {
        console.warn('[DiariesContext] Firestore 로드 실패', e?.message);
        setDiaries([]);
      } finally {
        setHydrated(true);
      }
    });
    return unsub;
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

  // 내 다이어리 재로드 — 타인발 변경(친구 좋아요 등)은 마운트 1회 로드로는 안 들어옴.
  //   화면 포커스 시 호출해 likes 등 최신 상태 반영([[friend-feed-design]] 좋아요).
  const reloadDiaries = useCallback(async () => {
    try {
      const loaded = await loadMyRounds();
      setDiaries(loaded);
    } catch (e) {
      if (__DEV__) console.warn('[DiariesContext] reload 실패', e?.message);
    }
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
      reloadDiaries,
      setDiaries: setDiariesCompat,
    }}>
      {children}
    </DiariesContext.Provider>
  );
}
