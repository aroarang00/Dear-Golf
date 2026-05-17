import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F } from '../constants/colors';

// =============================================================
// 앱 전역 커스텀 Alert — OS 기본 다이얼로그 대신 앱 디자인에 맞춘 모달.
//  사용법은 RN Alert.alert와 동일: showAppAlert(title, message, buttons)
//  buttons: [{ text, onPress, style: 'default'|'cancel'|'destructive' }]
//  AppAlertHost 를 앱 루트에 한 번 렌더해두면 어디서든 showAppAlert 호출 가능.
// =============================================================

let _show = null;

export function showAppAlert(title, message, buttons) {
  if (_show) {
    _show({
      title: title || '',
      message: message || '',
      buttons: buttons && buttons.length ? buttons : [{ text: '확인' }],
    });
  }
}

export function AppAlertHost() {
  const [data, setData] = useState(null);
  useEffect(() => {
    _show = setData;
    return () => { _show = null; };
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
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 18, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 16, width: '100%', maxWidth: 340 }}>
          {!!data.title && (
            <Text style={{ fontFamily: F.sys, fontSize: 16, fontWeight: '700', color: C.charcoal, textAlign: 'center', marginBottom: data.message ? 8 : 18 }}>
              {data.title}
            </Text>
          )}
          {!!data.message && (
            <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
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
                  <Text style={{ fontFamily: F.sys, fontSize: 14, color: s.fg, fontWeight: b.style === 'cancel' ? '400' : '600' }}>
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
