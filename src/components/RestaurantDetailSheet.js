import React, { useRef, useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Linking, BackHandler, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';

// 앱 내 식당 상세 — 카카오 place 페이지 웹뷰(사진·평점·리뷰·메뉴·영업시간). 탭 이탈 없이 앱 안에서 확인.
//   place: { name, type, loc, distance, phone, url(place_url), x, y }. badge: { text, fg } | null.
export function RestaurantDetailSheet({ visible, place, badge, onClose, onDecide, onNav, asOverlay = false }) {
  const insets = useSafeAreaInsets();
  const webRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);   // 웹뷰가 뒤로 갈 수 있나(깊이 들어감)
  useEffect(() => { setCanGoBack(false); }, [place?.kakaoId, visible]);   // 새 식당/재오픈 시 초기화
  // 안드 하드웨어 백 — 웹뷰 뒤로가기 우선(더 못 가면 시트 닫기). iOS는 헤더 '‹' 버튼으로.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { webRef.current?.goBack(); return true; }
      if (asOverlay) { onClose && onClose(); return true; }   // 오버레이엔 onRequestClose가 없어 직접 닫음
      return false;   // 못 가면 Modal onRequestClose가 닫음
    });
    return () => sub.remove();
  }, [visible, canGoBack, asOverlay, onClose]);
  if (!place) return null;
  if (asOverlay && !visible) return null;   // 오버레이는 Modal의 visible prop이 없어 직접 게이트
  // iOS ATS(에러 1022) — WKWebView가 http를 차단한다. 카카오 place_url이 http로 오는 경우가 있어 https로 승격(카카오도 https 지원).
  const url = (place.url || '').replace(/^http:\/\//i, 'https://');
  const distTxt = place.distance ? (place.distance >= 1000 ? `${(place.distance / 1000).toFixed(1)}km` : `${place.distance}m`) : '';
  const body = (
      <View style={asOverlay
        ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000, backgroundColor: 'rgba(0,0,0,0.45)' }
        : { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ height: '86%', backgroundColor: C.bgSecondary, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' }}>
          {/* 헤더 */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, alignSelf: 'center', marginTop: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 11, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            {canGoBack && (
              <TouchableOpacity onPress={() => webRef.current?.goBack()} hitSlop={{ top: 10, bottom: 10, left: 8, right: 6 }} style={{ paddingRight: 2 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(26), color: C.charcoal, lineHeight: fs(26) }}>‹</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }} numberOfLines={1}>{place.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }} numberOfLines={1}>
                  {place.type}{distTxt ? ` · ${distTxt}` : ''}
                </Text>
                {badge && <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: badge.fg }}>· {badge.text}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
              <Text style={{ fontSize: fs(15), color: C.warmGray, fontWeight: '600', lineHeight: 17 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 카카오 place 페이지 — 사진·평점·리뷰·메뉴 (앱 내) */}
          {url ? (
            <WebView ref={webRef} source={{ uri: url }} style={{ flex: 1 }} startInLoadingState
              onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
              originWhitelist={['https://*']} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center' }}>상세 정보를 불러올 수 없어요</Text>
            </View>
          )}

          {/* 하단 액션 — 전화 / 길찾기 / 정하기 */}
          <View style={{ flexDirection: 'row', gap: 9, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
            {!!place.phone && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${place.phone}`).catch(() => {})} activeOpacity={0.85}
                style={{ paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
                <Icon name="phone" size={fs(18)} color={C.charcoal} strokeWidth={1.9} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onNav} activeOpacity={0.85}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgPrimary }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>길찾기</Text>
            </TouchableOpacity>
            {onDecide && (
              <TouchableOpacity onPress={onDecide} activeOpacity={0.85}
                style={{ flex: 1.4, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.burgundy }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>이 식당 정하기</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
  );
  // ★함께 식사(모달 시트) 안에서 열 땐 asOverlay — 네이티브 Modal을 또 띄우면 iOS가 '모달 위 모달'을 안 그려 먹통.
  //   오버레이(절대 위치 View)로 시트 위에 겹쳐 그린다. GuideScreen은 단독이라 그대로 Modal.
  return asOverlay ? body : (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {body}
    </Modal>
  );
}
