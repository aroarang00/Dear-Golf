import { createContext, useContext, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// 모달 내부 '다단계' 뒤로가기 처리 (크루처럼 한 모달 안에서 목록→앨범→작성… 화면을 쌓는 경우).
//  문제: 안드로이드 Modal은 하드웨어 백을 onRequestClose로 처리하는데, 단순히 모달을 닫게 해두면
//        내부 단계를 무시하고 통째로 닫혀 '홈으로 바로' 튄다(DM은 onRequestClose가 한 단계만 닫게 해 회피).
//  해결: 각 화면이 자기 백 핸들러를 Context의 ref에 LIFO로 등록 → 가장 깊은(최근 마운트) 화면이 current.
//        모달의 onRequestClose가 ref.current()를 호출하면 '한 단계만' 뒤로 간다. BackHandler도 병행 등록
//        (모달 밖·기기 차이 안전망). 핸들러는 멱등(같은 상태로 setState)이라 양쪽이 다 불려도 무해.
export const ModalBackContext = createContext(null);

export function useScreenBack(active, onBack) {
  const ref = useContext(ModalBackContext);
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { cb.current(); return true; });
    let prev;
    if (ref) { prev = ref.current; ref.current = () => cb.current(); }
    return () => {
      sub.remove();
      if (ref) ref.current = prev;   // LIFO 복원 — 깊은 화면 닫히면 직전 화면 핸들러로 되돌림
    };
  }, [active]);
}
