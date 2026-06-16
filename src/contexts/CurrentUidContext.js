import { createContext, useContext } from 'react';

// 단일 uid 소스 — onAuthStateChanged를 App 최상위 한 곳에서 구독해 현재 안정 uid를 노출한다.
//   화면마다 getUid()를 따로 호출/캐싱하면 익명→카카오 settle·재설치(시나리오 ②)로 uid가
//   바뀌어도 stale해진다. DiariesContext의 검증된 반응 패턴(prevUid 가드)을 트리 전체로 일반화.
//   ([[uid-stabilization-plan]])
//
//   value = 현재 uid (없으면 null). 로그인 settle 전엔 잠깐 null일 수 있으므로 소비처는 null 가드 필요.
//   Provider는 App.js가 직접 onAuthStateChanged 구독 결과를 value로 내려준다(구독 1개로 통일).
export const CurrentUidContext = createContext(null);

export function useCurrentUid() {
  return useContext(CurrentUidContext);
}
