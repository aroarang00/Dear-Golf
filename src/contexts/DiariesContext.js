import React, { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '../utils/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { loadMyRounds, createRound, updateRound, deleteRound } from '../utils/round';
import { sweepDiaryMediaBackup } from '../utils/mediaBackup';
import { deleteRoundMediaFiles } from '../utils/roundMedia';

// 라운딩 다이어리 — 다이어리 화면과 내 프로필 피드가 같은 데이터를 공유한다.
// 2026-05-27: AsyncStorage(@dg_diaries) → Firestore rounds/{roundId} 마이그레이션.
// 옛 데이터는 [[data-migration]] 정책에 따라 폐기 — 새로 시작.
export const DiariesContext = React.createContext({
  diaries: [],
  hydrated: false,
  loadFailed: false,
  addDiary: async () => {},
  editDiary: async () => {},
  removeDiary: async () => {},
  reloadDiaries: async () => {},
  setDiaries: () => {},
});

export function DiariesProvider({ children }) {
  const [diaries, setDiaries] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  // 로드 실패 구분 — 실패를 빈 배열로 흡수하면 오프라인이 '기록 없음(신규 안내)'으로 위장됨.
  //   화면은 이 플래그로 "불러오지 못했어요 + 재시도"를 보여준다(기록이 이미 있으면 기존 데이터 유지).
  const [loadFailed, setLoadFailed] = useState(false);

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
        setLoadFailed(false);
        scheduleBackupSweep(loaded); // 미백업(dgphoto:) 미디어 후속 업로드 + 기존 데이터 소급([[diary-media-backup-plan]])
      } catch (e) {
        console.warn('[DiariesContext] Firestore 로드 실패', e?.message);
        setDiaries([]);
        setLoadFailed(true); // '기록 없음'과 구분 — 화면에서 재시도 안내
      } finally {
        setHydrated(true);
      }
    });
    return unsub;
  }, []);

  // 백업 스위퍼 — 콜드스타트 부하를 피해 지연 실행. 로드된 배열 재사용(추가 read 0).
  //   갱신된 문서는 컨텍스트에도 반영해 로컬 상태·서버가 같은 https 참조를 보게.
  const sweepTimerRef = useRef(null);
  const scheduleBackupSweep = useCallback((loaded) => {
    if (sweepTimerRef.current) clearTimeout(sweepTimerRef.current);
    sweepTimerRef.current = setTimeout(async () => {
      const updated = await sweepDiaryMediaBackup(loaded);
      if (updated.length) {
        const byId = Object.fromEntries(updated.map((u) => [u.id, u.photos]));
        setDiaries((prev) => prev.map((d) => (byId[d.id] ? { ...d, photos: byId[d.id] } : d)));
      }
    }, 12000);
  }, []);
  useEffect(() => () => { if (sweepTimerRef.current) clearTimeout(sweepTimerRef.current); }, []);

  // ── Firestore 동기화 헬퍼 (신규 패턴) ─────────────────────
  // 사용처는 setDiaries 대신 아래 함수들을 사용해야 Firestore에 저장됨.

  // 최신 diaries 미러 — 삭제·수정 시 '이전 photos'를 읽어 Storage 고아 파일을 정리하기 위함(stale closure 회피)
  const diariesRef = useRef([]);
  useEffect(() => { diariesRef.current = diaries; }, [diaries]);

  const addDiary = useCallback(async (data) => {
    const created = await createRound(data);
    setDiaries(prev => [created, ...prev]);
    return created;
  }, []);

  const editDiary = useCallback(async (id, patch) => {
    const prevPhotos = diariesRef.current.find(d => d.id === id)?.photos;
    await updateRound(id, patch);
    setDiaries(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
    // 수정으로 빠진 미디어의 서버 파일 즉시 삭제 — 고아 파일 비용 누수 방지(2026-07-04). best-effort(실패해도 수정은 유효).
    if (Array.isArray(prevPhotos) && Array.isArray(patch?.photos)) {
      const keep = new Set(patch.photos.map(p => (p && typeof p === 'object' ? p.uri : p)));
      const removed = prevPhotos.filter(p => !keep.has(p && typeof p === 'object' ? p.uri : p));
      if (removed.length) deleteRoundMediaFiles(removed);
    }
  }, []);

  const removeDiary = useCallback(async (id) => {
    const target = diariesRef.current.find(d => d.id === id);
    await deleteRound(id);
    setDiaries(prev => prev.filter(d => d.id !== id));
    // 문서 삭제 성공 후 서버 미디어 파일도 즉시 삭제(사용자 2026-07-04 "삭제하면 바로 파일도 삭제")
    if (target?.photos?.length) deleteRoundMediaFiles(target.photos);
  }, []);

  // 내 다이어리 재로드 — 타인발 변경(친구 좋아요 등)은 마운트 1회 로드로는 안 들어옴.
  //   화면 포커스 시 호출해 likes 등 최신 상태 반영([[friend-feed-design]] 좋아요).
  const reloadDiaries = useCallback(async () => {
    try {
      const loaded = await loadMyRounds();
      setDiaries(loaded);
      setLoadFailed(false); // 초기 로드 실패 후 재시도 성공 시 오류 상태 해제
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
      loadFailed,
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
