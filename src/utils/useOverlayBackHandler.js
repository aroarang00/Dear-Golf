import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

// 자체 오버레이(position:absolute View, RN Modal 아님)가 열려있을 때
// 안드로이드 뒤로가기를 누르면 오버레이를 닫는다.
// RN Modal은 onRequestClose가 자동 처리하므로 이 훅은 자체 오버레이 전용.
//
// 한 컴포넌트에서 여러 오버레이가 있으면 각각 호출. BackHandler 스택 LIFO라
// 마지막에 등록된(가장 최근에 열린) 오버레이가 먼저 닫힘.
//
// 사용 예:
//   useOverlayBackHandler(!!alert, () => setAlert(null));
//   useOverlayBackHandler(showPhotoViewer, () => setShowPhotoViewer(false));
export function useOverlayBackHandler(visible, onClose) {
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true; // 이벤트 소비 — 네비게이션·앱 종료로 넘어가지 않음
    });
    return () => sub.remove();
  }, [visible, onClose]);
}
