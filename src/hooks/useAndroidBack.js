import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// 안드로이드 하드웨어/제스처 뒤로가기 처리.
// active가 true일 때 뒤로가기를 가로채 onBack을 실행하고, 네비게이션으로 넘기지 않는다.
// 오버레이·시트가 떠 있을 때 뒤로가기로 그것만 닫히게(앱이 홈으로 나가지 않게) 한다.
export function useAndroidBack(active, onBack) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cb.current();
      return true; // 이벤트 소비 — 네비게이션 뒤로/앱 종료로 흐르지 않게
    });
    return () => sub.remove();
  }, [active]);
}
