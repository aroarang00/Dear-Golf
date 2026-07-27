import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Linking, ActivityIndicator, Platform, BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';

// 앱 내 웹뷰 시트 — 구장 홈페이지 등 일반 웹링크를 탭 이탈 없이 연다(맛집 상세와 같은 결).
//   ★예약사이트(카카오/골팡) 로그인·결제는 embedded 웹뷰에서 막히거나 어색할 수 있어, 상단에 '외부로 열기' 폴백 제공.
//   전체화면 Modal(상세시트가 아니라 브라우저 성격). url 없으면 렌더 안 함.
//   ★asOverlay — 다른 Modal(DM·모집 상세) '안'에서 열 땐 반드시 이걸 쓴다. 네이티브 Modal을 또 띄우면
//     안드에서 '모달 위 모달'의 WebView가 흰 화면으로 안 그려진다(RestaurantDetailSheet와 동일 대응).
//     이때는 절대위치 View로 부모 Modal 위에 겹쳐 그리므로, 호출부는 화면을 꽉 채우는 flex:1 View 안에 둘 것.
export function WebSheet({ visible, url, title, onClose, asOverlay = false }) {
  const insets = useSafeAreaInsets();
  // 오버레이는 Modal onRequestClose가 없어 안드 하드웨어 백을 직접 처리(맛집 상세와 동일).
  useEffect(() => {
    if (!asOverlay || !visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose && onClose(); return true; });
    return () => sub.remove();
  }, [asOverlay, visible, onClose]);
  if (!url) return null;
  if (asOverlay && !visible) return null; // 오버레이는 Modal visible이 없어 직접 게이트

  const body = (
    <View style={asOverlay
      ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000, backgroundColor: C.bgPrimary, paddingTop: insets.top }
      : { flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top }}>
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
        // ★네이버 지도 등은 앱 실행용 스킴(nmap://·intent://)으로 넘어가는데 안드 WebView는 http가 아닌 스킴을
        //   못 따라가 흰 화면으로 멈춤. http(s)만 웹뷰에서 로드하고, 앱 스킴은 외부 앱으로 넘긴 뒤 '이 시트를 닫는다'
        //   (앱 실행 후 빈 웹뷰가 흰 화면으로 남던 것 방지 — DM에서 네이버지도가 안 열리던 핵심 원인). iOS는 원래 처리됨.
        onShouldStartLoadWithRequest={(req) => {
          const u = req.url || '';
          if (/^https?:\/\//i.test(u) || u === 'about:blank') return true;
          // intent://…#Intent;scheme=nmap;…;S.browser_fallback_url=…;end (안드 네이버 등)
          //   → scheme://로 변환해 앱 직접 실행. 앱 없으면 폴백 URL(웹/스토어)로.
          if (u.startsWith('intent://')) {
            const scheme = (u.match(/scheme=([^;]+)/) || [])[1];
            const fb = (u.match(/S\.browser_fallback_url=([^;]+)/) || [])[1];
            const appUrl = scheme ? u.replace(/^intent:\/\//, scheme + '://').split('#Intent')[0] : null;
            const openFb = () => { if (fb) Linking.openURL(decodeURIComponent(fb)).catch(() => {}); };
            appUrl ? Linking.openURL(appUrl).catch(openFb) : openFb();
          } else {
            Linking.openURL(u).catch(() => {}); // nmap://·kakaomap://·tel:·mailto: 등 앱 스킴
          }
          onClose && onClose(); // 외부 앱으로 넘겼으니 흰 웹뷰 시트는 닫는다
          return false;
        }}
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
            <ActivityIndicator color={C.burgundy} />
          </View>
        )}
      />
    </View>
  );

  return asOverlay ? body : (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}
