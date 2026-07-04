import { createContext, useContext, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// 모달 내부 '다단계' 뒤로가기 처리 (크루처럼 한 모달 안에서 목록→앨범→작성… 화면을 쌓는 경우).
//  문제: 안드로이드 Modal은 하드웨어 백을 onRequestClose로 처리하는데, 단순히 모달을 닫게 해두면
//        내부 단계를 무시하고 통째로 닫혀 '홈으로 바로' 튄다(DM은 onRequestClose가 한 단계만 닫게 해 회피).
//  해결: 각 화면이 자기 백 핸들러를 Context의 ref에 LIFO로 등록 → 가장 깊은(최근 마운트) 화면이 current.
//        모달의 onRequestClose가 ref.current()를 호출하면 '한 단계만' 뒤로 간다. BackHandler도 병행 등록
//        (모달 밖·기기 차이 안전망). 핸들러는 멱등(같은 상태로 setState)이라 양쪽이 다 불려도 무해.
export const ModalBackContext = createContext(null);

// ★onBack은 반드시 멱등이어야 함 — 안드 하드웨어 백(BackHandler)과 모달 onRequestClose가 한 번에 둘 다 불릴 수 있어
//   같은 핸들러가 2번 실행될 수 있다(setState만 하는 핸들러는 무해). API 호출 등 비멱등 동작은 넣지 말 것.
// ★복원은 'prev 캡처'가 아니라 ref.stack(배열)에서 자기만 빼는 방식 — 크루 나가기처럼 멤버+앨범이 한 커밋에
//   같이 언마운트되면 React가 부모부터 cleanup해, prev 방식은 마지막(자식) cleanup이 ref를 '죽은 부모 핸들러'로
//   되돌려 목록 화면에서 하드웨어 백이 무반응이 됐다(onRequestClose가 no-op 핸들러만 호출). 스택 방식은
//   언마운트 순서와 무관하게 살아있는 화면 중 가장 깊은 핸들러가 남는다.
export function useScreenBack(active, onBack) {
  const ref = useContext(ModalBackContext);
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { cb.current(); return true; });
    let entry;
    if (ref) {
      entry = () => cb.current();
      if (!ref.stack) ref.stack = [];
      ref.stack.push(entry);
      ref.current = entry;
    }
    return () => {
      sub.remove();
      if (ref) {
        const i = ref.stack.indexOf(entry);
        if (i >= 0) ref.stack.splice(i, 1);
        ref.current = ref.stack.length ? ref.stack[ref.stack.length - 1] : null;
      }
    };
  }, [active]);
}
