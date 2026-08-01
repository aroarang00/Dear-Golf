import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { showToast } from './AppToast';

// =============================================================
// 안드 뒤로가기로 앱이 꺼지기 직전 한 번 잡아준다.
//   뒤로가기를 연달아 누르다 홈까지 오면 그 다음 한 번에 앱이 그냥 닫혀버려서, 닫힐 줄 모르고 눌렀다가
//   당황하는 일이 있었다. 첫 번째 눌림은 토스트로 알려주고 삼키고, 2초 안에 한 번 더 누르면 그때 닫는다.
//
// ★등록 순서가 전부다. BackHandler는 '나중에 등록된 것부터' 부르므로(LIFO), 이 핸들러는
//   화면·모달·네비게이션보다 먼저 등록돼야 마지막에 불린다 = 아무도 처리 안 한 뒤로가기만 받는다.
//   그래서 앱 루트의 맨 첫 자식으로 렌더할 것(자식 effect가 부모보다 먼저 도는 React 규칙 이용).
//   뒤에 두면 화면들의 뒤로가기(시트 닫기 등)를 가로채 먹어버린다.
// =============================================================
const WINDOW_MS = 2000;

export function AndroidExitGuard() {
  const armedRef = useRef(false);   // 첫 눌림을 받아둔 상태(이 안에 또 누르면 닫힘)
  const timerRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (armedRef.current) return false;   // false = 우리가 안 잡음 → 시스템이 앱을 닫는다
      armedRef.current = true;
      showToast('한 번 더 누르면 앱이 닫혀요', { duration: WINDOW_MS });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { armedRef.current = false; }, WINDOW_MS);
      return true;
    });
    return () => {
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return null;
}
