import React from 'react';
import { View, Text, TouchableOpacity, Modal, Linking, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';

// 앱 내 웹뷰 시트 — 구장 홈페이지 등 일반 웹링크를 탭 이탈 없이 연다(맛집 상세와 같은 결).
//   ★예약사이트(카카오/골팡) 로그인·결제는 embedded 웹뷰에서 막히거나 어색할 수 있어, 상단에 '외부로 열기' 폴백 제공.
//   전체화면 Modal(상세시트가 아니라 브라우저 성격). url 없으면 렌더 안 함.
export function WebSheet({ visible, url, title, onClose }) {
  const insets = useSafeAreaInsets();
  if (!url) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top }}>
        {/* 헤더 — 닫기(✕) + 제목 + 외부로 열기 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
          borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={fs(22)} color={C.charcoal} />
          </TouchableOpacity>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>{title || '홈페이지'}</Text>
          {/* 웹뷰에서 안 열리거나 로그인/결제가 필요할 때 시스템 브라우저로 */}
          <TouchableOpacity onPress={() => Linking.openURL(url).catch(() => {})} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>외부로 열기</Text>
          </TouchableOpacity>
        </View>
        <WebView
          source={{ uri: url }}
          style={{ flex: 1 }}
          startInLoadingState
          renderLoading={() => (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
              <ActivityIndicator color={C.burgundy} />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}
