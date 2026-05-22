import React, { useRef, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { CourseLogTab } from './CourseLogTab';

// 내 코스기록 — 코스 탭 헤더에서 진입하는 전체화면 페이지.
// 라운딩 통계는 MY 탭에 있으므로 여기선 코스 목록만 보여준다.
export function CourseLogModal({ visible, onClose, navigation }) {
  // CourseLogTab 내부에서 다른 탭으로 이동할 땐 이 모달을 먼저 닫는다.
  // navigation 식별자 기준으로 메모이즈 — CourseLogTab의 리스너 effect가 매 렌더 재실행되지 않게.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wrappedNav = useMemo(() => (navigation ? {
    navigate: (name, params) => { onCloseRef.current(); navigation.navigate(name, params); },
    addListener: (ev, cb) => navigation.addListener(ev, cb),
  } : undefined), [navigation]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 웜그레이 + 버터 글씨 (네이비는 라운지 전용) */}
          <View style={{ backgroundColor: C.warmGray, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.butter }}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.butter }}>내 코스기록</Text>
            </View>
          </View>

          <CourseLogTab navigation={wrappedNav} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
