import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';

// =============================================================
// 앱 전역 커스텀 Alert — OS 기본 다이얼로그 대신 앱 디자인에 맞춘 모달.
//  사용법은 RN Alert.alert와 동일: showAppAlert(title, message, buttons)
//  buttons: [{ text, onPress, style: 'default'|'cancel'|'destructive' }]
//  AppAlertHost 를 앱 루트에 한 번 렌더해두면 어디서든 showAppAlert 호출 가능.
// =============================================================

// 호스트 스택 — 기본은 앱 루트 1개. 풀스크린 Modal(예: ScheduleScreen asModal) 안에 호스트를
//  하나 더 두면, 그 모달이 열린 동안엔 가장 최근(=최상위) 호스트가 alert를 그린다.
//  iOS에서 '모달 위 또 다른 풀스크린 모달'일 때 루트 alert가 뒤로 깔리던 이슈 해결.
//  호스트가 1개뿐이면 기존과 동일하게 동작(하위호환).
let _hosts = [];

export function showAppAlert(title, message, buttons) {
  const show = _hosts[_hosts.length - 1];
  if (show) {
    show({
      title: title || '',
      message: message || '',
      buttons: buttons && buttons.length ? buttons : [{ text: '확인' }],
    });
  }
}

export function AppAlertHost() {
  const [data, setData] = useState(null);
  useEffect(() => {
    _hosts.push(setData);
    return () => { _hosts = _hosts.filter((h) => h !== setData); };
  }, []);
  const close = useCallback(() => setData(null), []);

  if (!data) return null;
  const buttons = data.buttons;
  const inRow = buttons.length <= 2;

  const btnStyle = (b) => {
    if (b.style === 'destructive') return { bg: C.burgundy, fg: C.butter, border: false };
    if (b.style === 'cancel') return { bg: C.bgSecondary, fg: C.warmGray, border: true };
    return { bg: C.charcoal, fg: C.butter, border: false };
  };

  return (
    // presentationStyle="overFullScreen" — iOS에서 부모 Modal(MyPageModal·ScheduleSheetModal 등) 위에 표시되게.
    // 없으면 alert가 부모 modal 뒤로 깔리는 RN 알려진 이슈 발생.
    // statusBarTranslucent — Android 상태바 영역까지 덮어서 alert가 상단까지 정상 노출.
    <Modal visible transparent animationType="fade" onRequestClose={close}
      presentationStyle="overFullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 18, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 16, width: '100%', maxWidth: 340 }}>
          {!!data.title && (
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, textAlign: 'center', marginBottom: data.message ? 8 : 18 }}>
              {data.title}
            </Text>
          )}
          {!!data.message && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
              {data.message}
            </Text>
          )}
          <View style={{ flexDirection: inRow ? 'row' : 'column', gap: 8 }}>
            {buttons.map((b, i) => {
              const s = btnStyle(b);
              return (
                <TouchableOpacity key={i} activeOpacity={0.85}
                  onPress={() => { close(); b.onPress && b.onPress(); }}
                  style={{
                    flex: inRow ? 1 : undefined,
                    paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                    backgroundColor: s.bg,
                    borderWidth: s.border ? 0.5 : 0, borderColor: C.hairline,
                  }}>
                  <Text style={{ fontFamily: b.style === 'cancel' ? F.sys : F.sysSb, fontSize: fs(14), color: s.fg }}>
                    {b.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
