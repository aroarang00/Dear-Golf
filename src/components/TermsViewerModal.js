import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';

// 약관·정책 본문 뷰어 — 온보딩 동의 화면·마이페이지 약관 메뉴에서 공통 사용.
// 본문은 src/constants/legalTexts.js에서 import해서 body로 전달.
// 외부 URL(deargolf.app)이 있는 경우 우측 상단 [웹에서 보기] 버튼 노출.
export function TermsViewerModal({ visible, onClose, title, body, externalUrl }) {
  const insets = useSafeAreaInsets();

  const handleExternal = () => {
    if (!externalUrl) return;
    Linking.openURL(externalUrl).catch(() => { /* 무시 — 외부 브라우저 없는 환경 */ });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top }}>
        {/* 헤더 — 화살표 옆 좌측 정렬 제목 (iOS 모달 헤더 표준) */}
        <View style={{ flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, marginLeft: 14, fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>
            {title}
          </Text>
          {externalUrl ? (
            <TouchableOpacity onPress={handleExternal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray }}>웹에서 보기</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 본문 — 스크롤 텍스트 */}
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 18, paddingBottom: 40 + insets.bottom }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, lineHeight: 22 }}>
            {body}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
