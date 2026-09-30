import { useRef, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';

// =============================================================
// 스크롤 방향에 따라 헤더·하단 탭바를 같이 숨기기 (2026-09-29, 골프 여권에서 첫 사용 — 사용자 요청)
//  - 내려 읽으면(손가락 위로) 숨고, 되돌리면(손가락 아래로) 나타난다. 맨 위 근처(minY)에선 항상 보인다.
//  - 탭바는 전역 Animated.Value 하나(tabBarHide)를 TabBar가 읽는다 — 화면마다 탭바를 건드리지 않고 값만 바꾼다.
//  - 화면이 언마운트되면 탭바를 반드시 복원한다(안 그러면 다른 탭에 가서도 탭바가 없다).
//  ★useNativeDriver: transform만 쓴다(레이아웃 애니 금지) — 스크롤 중 JS 스레드가 바빠도 부드럽게.
// =============================================================
export const tabBarHide = new Animated.Value(0);   // 0=보임, 1=숨김
let tabHiddenNow = false;
export function setTabBarHidden(hidden) {
  if (tabHiddenNow === hidden) return;
  tabHiddenNow = hidden;
  Animated.timing(tabBarHide, { toValue: hidden ? 1 : 0, duration: 200, useNativeDriver: true }).start();
}

// 화면 훅 — { hide(자기 헤더용 0/1), onScroll, show }. ScrollView에 onScroll={onScroll} scrollEventThrottle={16}.
//   show(): 강제로 다시 보이기 — 탭 화면(홈)은 언마운트되지 않으므로, 탭바가 숨은 채 다른 탭으로 넘어갈 때(blur) 직접 부른다.
//   threshold: 방향이 바뀐 뒤 이만큼 누적 이동해야 전환(손 떨림·관성 끝 미세 역주행 무시).
export function useScrollHide({ threshold = 12, minY = 48 } = {}) {
  const hide = useRef(new Animated.Value(0)).current;
  const lastY = useRef(0);
  const acc = useRef(0);
  const hiddenRef = useRef(false);
  const set = useCallback((h) => {
    if (hiddenRef.current === h) return;
    hiddenRef.current = h;
    Animated.timing(hide, { toValue: h ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    setTabBarHidden(h);
  }, [hide]);
  const onScroll = useCallback((e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y <= minY) { acc.current = 0; set(false); return; }               // 맨 위 근처 = 항상 보임
    const maxY = contentSize.height - layoutMeasurement.height;
    if (y > maxY) return;                                                  // 바닥 튕김(iOS bounce) 무시
    acc.current = Math.sign(acc.current) === Math.sign(dy) ? acc.current + dy : dy;
    if (acc.current > threshold) set(true);
    else if (acc.current < -threshold) set(false);
  }, [set, minY, threshold]);
  const show = useCallback(() => { acc.current = 0; set(false); }, [set]);
  useEffect(() => () => setTabBarHidden(false), []);   // 화면 이탈 시 탭바 복원
  return { hide, onScroll, show };
}
