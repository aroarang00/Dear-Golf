import { createContext, useContext } from 'react';

// ★임시 진단(2026-09-17) — 친구 피드 첫 카드만 흐린 문제 추적.
//   프로덕션(OTA)에서만 확인 가능해 콘솔 대신 '화면 오버레이'로 본다. 친구 프로필의
//   '라운딩 · 일상 피드' 제목을 길게 누르면 켜짐(숨김). 원인 잡으면 이 파일째 제거.
export const DiagContext = createContext(false);
export const useDiag = () => useContext(DiagContext);
