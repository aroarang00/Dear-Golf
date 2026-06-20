import React, { useRef, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform } from 'react-native';
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
  // iOS는 모달 dismiss 애니메이션과 화면 전환이 같은 프레임에 겹치면 검은 화면→튕김이 난다.
  // 그래서 iOS에선 navigate를 보류해 두고 모달이 완전히 닫힌 뒤(onDismiss) 실행한다.
  // 안드는 Modal이 네이티브 Dialog라 이 경합이 없어 기존처럼 즉시 이동. ([[modal-navigation-pattern]])
  const pendingNavRef = useRef(null);
  const wrappedNav = useMemo(() => (navigation ? {
    navigate: (name, params) => {
      if (Platform.OS === 'ios') {
        pendingNavRef.current = { name, params };
        onCloseRef.current(); // 닫힘 → onDismiss에서 실제 이동
      } else {
        onCloseRef.current();
        navigation.navigate(name, params);
      }
    },
    addListener: (ev, cb) => navigation.addListener(ev, cb),
  } : undefined), [navigation]);

  // iOS 전용 — 모달이 닫힌 뒤 보류해 둔 화면 이동을 실행. 일반 닫기(뒤로가기)면 pending이 없어 무동작.
  const handleDismiss = () => {
    const p = pendingNavRef.current;
    if (p && navigation) { pendingNavRef.current = null; navigation.navigate(p.name, p.params); }
  };

  const [showInfo, setShowInfo] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onDismiss={handleDismiss}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 골프 그린(#6B8B5E, 지역색 강원과 동일) + 흰 글씨. 네이비는 라운지 전용 ([[navy-lounge-color]]) */}
          <View style={{ backgroundColor: '#6B8B5E', paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: '#fff' }}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: '#fff' }}>내 코스 모아보기</Text>
            </View>
            <TouchableOpacity onPress={() => setShowInfo(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 24, height: 24, borderRadius: 12,
                borderWidth: 1.5, borderColor: '#fff',
                alignItems: 'center', justifyContent: 'center',
              }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(14), color: '#fff', lineHeight: 17 }}>!</Text>
            </TouchableOpacity>
          </View>

          <CourseLogTab navigation={wrappedNav} />

          {/* 안내 팝업 — 다이어리 안 쓰는 사용자가 "왜 정보가 비어있지" 헷갈리지 않게. */}
          <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => setShowInfo(false)}
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 }}>
              <TouchableOpacity activeOpacity={1} onPress={() => { /* 컨텐츠 영역 탭은 닫지 않음 */ }}
                style={{ backgroundColor: C.bgPrimary, borderRadius: 16, padding: 22, width: '100%' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 12 }}>
                  내 코스 모아보기 안내
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, lineHeight: 20, marginBottom: 18 }}>
                  국내와 해외, 다녀온 골프장의 발자취가 한눈에 모이는 공간이에요.{'\n'}
                  일정만 등록해도 어디를 다녀왔는지 모두 확인할 수 있어요.{'\n\n'}
                  📊 상단 '스코어 통계'를 탭하면 평균·베스트·핸디와 스코어 추세를 한눈에 볼 수 있어요.{'\n\n'}
                  다이어리에 기록을 남기면 코스 평가·한줄 메모까지 함께 볼 수 있어요.
                </Text>
                <TouchableOpacity onPress={() => setShowInfo(false)} activeOpacity={0.85}
                  style={{ backgroundColor: C.charcoal, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>확인</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
