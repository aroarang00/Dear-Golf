import { useState, useEffect, useMemo } from 'react';
import { getGolfCourses } from '../utils/golfCourses';
import { getTop100Courses, getManualTop100Checks } from '../utils/top100';
import { buildPassport, getVisitedChecks } from '../utils/passport';

// 골프 여권 요약 숫자 — 홈 레일 버튼·MY 배너 진입점용 ([[golf-passport]] 3단계, 2026-09-29)
//   재료(마스터·100대·직접 체크)는 전부 로컬 캐시라 가볍다. Firestore 동기화(sync*)는 여권 화면이 열릴 때만 한다.
//   ★focusTick: 화면 포커스 때 올려주면 직접 체크 변경(여권 화면에서 찍은 것)을 다시 읽는다.
export function usePassportCounts(diaries, schedules, focusTick = 0) {
  const [master, setMaster] = useState([]);
  const [top100, setTop100] = useState([]);
  const [manualKeys, setManualKeys] = useState([]);
  const [top100Checks, setTop100Checks] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([getGolfCourses(), getTop100Courses(), getVisitedChecks(), getManualTop100Checks()])
      .then(([m, t, v, c]) => { if (!alive) return; setMaster(m || []); setTop100(t || []); setManualKeys(v || []); setTop100Checks(c || []); setReady(true); })
      .catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [focusTick]);
  const pp = useMemo(
    () => (ready ? buildPassport({ master, top100, diaries: diaries || [], schedules: schedules || [], manualKeys, top100Checks }) : null),
    [ready, master, top100, diaries, schedules, manualKeys, top100Checks],
  );
  return { ready, stampCount: pp?.stampCount || 0, top100Count: pp?.top100Count || 0, recent: pp?.recent || [] };
}
